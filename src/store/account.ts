import { create } from 'zustand';
import type { Encounter, Monster, RosterEntry } from '../data/types';
import { applyItems, diffCharacters, diffItems, mergeCharacters, mergeItems, type Synced } from '../engine/sync';
import { cloudError, firebaseAdapter, type CloudAdapter, type CloudUser, type DmKind } from './cloudAdapter';
import { usePlayer } from './player';
import { useStore } from './useStore';

/**
 * Cuenta opcional (Google o correo) y sincronización de los personajes con la nube. Sin cuenta todo sigue en el
 * dispositivo; el SDK de Firebase solo se carga al iniciar sesión (o al volver si ya se había iniciado).
 */
const FLAG = 'cronica-cuenta'; // recuerda que hay sesión para cargar Firebase al abrir la app

export type SyncState = 'idle' | 'syncing' | 'ok' | 'error';

export interface AccountState {
  status: 'off' | 'loading' | 'out' | 'in';
  user: CloudUser | null;
  error: string;
  sync: SyncState;
  syncError: string;
  start: () => Promise<void>;
  google: () => Promise<void>;
  emailIn: (email: string, pass: string) => Promise<void>;
  emailUp: (email: string, pass: string) => Promise<void>;
  reset: (email: string) => Promise<string>;
  out: () => Promise<void>;
  /** Usuario para entrar en una sala: el de la cuenta o, si no hay sesión, uno de invitado (anónimo). */
  ensureUser: () => Promise<CloudUser | null>;
}

/** El adaptador ya cargado (para la sala). */
export const cloud = () => adapter;

/** Espera a que el estado cumpla algo (como mucho `ms`). */
function until(check: () => boolean, ms = 15000): Promise<boolean> {
  if (check()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const t = setTimeout(() => { un(); resolve(false); }, ms);
    const un = useAccount.subscribe(() => { if (check()) { clearTimeout(t); un(); resolve(true); } });
  });
}

let adapter: CloudAdapter | null = null;
let makeAdapter: () => Promise<CloudAdapter> = firebaseAdapter;
let loading: Promise<CloudAdapter> | null = null;
let stopAuth: (() => void) | null = null;
let stopSync: (() => void) | null = null;

/** Dónde vive en el almacén del máster cada cosa que se guarda en la cuenta. */
const DM_KEYS: Record<DmKind, 'custom' | 'encounters' | 'roster'> = { monsters: 'custom', encounters: 'encounters', roster: 'roster' };
type DmItem = Monster | Encounter | RosterEntry;
/** La hoja en PDF de un jugador del grupo se queda en el dispositivo donde se subió: no va a la nube. */
const toCloudItem = (kind: DmKind, x: DmItem) => (kind === 'roster' ? { ...(x as RosterEntry), pdf: null } : x);

/** Espera a que el almacén del máster haya cargado lo guardado en el dispositivo. */
function dmLoaded(): Promise<void> {
  if (useStore.getState().loaded) return Promise.resolve();
  return new Promise((resolve) => { const un = useStore.subscribe((s) => { if (s.loaded) { un(); resolve(); } }); });
}

/**
 * Sincroniza con la cuenta las criaturas propias, los encuentros y el grupo del máster. Cada cambio local se fecha
 * (`at`) y se sube; de la nube solo se aplica lo más reciente, así el eco de lo propio no pisa lo que se está editando.
 */
async function startDmSync(a: CloudAdapter, uid: string, onError: (e: unknown) => void, onOk: () => void): Promise<() => void> {
  await dmLoaded();
  const stops: (() => void)[] = [];
  for (const kind of Object.keys(DM_KEYS) as DmKind[]) {
    const key = DM_KEYS[kind];
    const list = () => useStore.getState()[key] as DmItem[];
    let applying = false;
    let ready = false;
    const pending = new Map<string, ReturnType<typeof setTimeout>>();
    const setList = (next: DmItem[]) => { applying = true; useStore.setState({ [key]: next } as never); applying = false; };
    // al llegar de la nube, el grupo conserva la hoja en PDF que hubiera en este dispositivo
    const keepPdf = (next: DmItem[]) => (kind !== 'roster' ? next : next.map((x) => {
      const r = x as RosterEntry;
      const pdf = (list() as RosterEntry[]).find((l) => l.id === r.id)?.pdf;
      return pdf && !r.pdf ? { ...r, pdf } : r;
    }));
    const push = (x: DmItem) => {
      clearTimeout(pending.get(x.id));
      pending.set(x.id, setTimeout(() => { pending.delete(x.id); a.putItem(uid, kind, toCloudItem(kind, x)).then(onOk, onError); }, 1200));
    };
    stops.push(a.watchItems<DmItem>(uid, kind, (changed, removed, first) => {
      if (first) {
        const { toLocal, toRemote } = mergeItems<Synced>(list(), changed);
        if (toLocal.length) setList(keepPdf(applyItems<Synced>(list(), toLocal.map((x) => ({ ...x, at: x.at || 1 })), []) as DmItem[]));
        toRemote.forEach((x) => a.putItem(uid, kind, toCloudItem(kind, x as DmItem)).catch(onError));
        ready = true;
      } else {
        const next = applyItems<Synced>(list(), changed, removed) as DmItem[];
        if (next.some((x, i) => x !== list()[i]) || next.length !== list().length) setList(keepPdf(next));
      }
      onOk();
    }, onError));
    stops.push(useStore.subscribe((s, prev) => {
      if (applying || !ready || s[key] === prev[key]) return;
      const { changed, removed } = diffItems<Synced>(prev[key] as DmItem[], s[key] as DmItem[]);
      if (changed.length) {
        // se fecha lo que ha cambiado aquí (sin volver a avisar a este mismo observador)
        const now = Date.now();
        const ids = new Set(changed.map((x) => x.id));
        const stamped = (s[key] as DmItem[]).map((x) => (ids.has(x.id) ? { ...x, at: now } : x));
        setList(stamped);
        stamped.filter((x) => ids.has(x.id)).forEach(push);
      }
      removed.forEach((id) => { clearTimeout(pending.get(id)); a.deleteItem(uid, kind, id).catch(onError); });
    }));
    stops.push(() => pending.forEach((t) => clearTimeout(t)));
  }
  return () => stops.forEach((f) => f());
}

/** Para las pruebas: otro adaptador en lugar de Firebase. */
export function setCloudAdapter(make: () => Promise<CloudAdapter>) {
  makeAdapter = make;
  adapter = null;
  loading = null;
  stopAuth?.(); stopAuth = null;
  stopSync?.(); stopSync = null;
}

const remember = (on: boolean) => { try { if (on) localStorage.setItem(FLAG, '1'); else localStorage.removeItem(FLAG); } catch { /* nada */ } };
export const hadSession = () => { try { return localStorage.getItem(FLAG) === '1'; } catch { return false; } };

export const useAccount = create<AccountState>()((set, get) => {
  const fail = (e: unknown) => set({ error: cloudError(e) });

  /** Sincroniza los personajes de una cuenta: junta lo que hay y luego sube y baja cada cambio. */
  async function startSync(a: CloudAdapter, uid: string) {
    stopSync?.();
    await usePlayer.getState().init();
    set({ sync: 'syncing', syncError: '' });
    let applying = false;
    let ready = false;
    const pending = new Map<string, ReturnType<typeof setTimeout>>();
    const push = (c: Parameters<CloudAdapter['putCharacter']>[1]) => {
      clearTimeout(pending.get(c.id));
      // se agrupan los cambios seguidos (cada tecla del editor) en una sola escritura
      pending.set(c.id, setTimeout(() => {
        pending.delete(c.id);
        a.putCharacter(uid, c).then(() => set({ sync: 'ok' }), (e) => set({ sync: 'error', syncError: cloudError(e) }));
      }, 1200));
    };
    const unwatch = a.watchCharacters(uid, (changed, removed, first) => {
      applying = true;
      if (first) {
        const { toLocal, toRemote } = mergeCharacters(usePlayer.getState().characters, changed);
        usePlayer.getState().applyRemote(toLocal, []);
        toRemote.forEach((c) => a.putCharacter(uid, c).catch((e) => set({ sync: 'error', syncError: cloudError(e) })));
        ready = true;
      } else {
        usePlayer.getState().applyRemote(changed, removed);
      }
      applying = false;
      set({ sync: 'ok' });
    }, (e) => set({ sync: 'error', syncError: cloudError(e) }));
    const unsub = usePlayer.subscribe((s, prev) => {
      if (applying || !ready || s.characters === prev.characters) return;
      const { changed, removed } = diffCharacters(prev.characters, s.characters);
      changed.forEach(push);
      removed.forEach((id) => { clearTimeout(pending.get(id)); a.deleteCharacter(uid, id).catch((e) => set({ sync: 'error', syncError: cloudError(e) })); });
    });
    let stopDm: (() => void) | null = null;
    let stopped = false;
    void startDmSync(a, uid, (e) => set({ sync: 'error', syncError: cloudError(e) }), () => { if (get().sync !== 'error') set({ sync: 'ok' }); })
      .then((f) => { if (stopped) f(); else stopDm = f; });
    stopSync = () => { stopped = true; unwatch(); unsub(); stopDm?.(); pending.forEach((t) => clearTimeout(t)); stopSync = null; };
  }

  return {
    status: 'off', user: null, error: '', sync: 'idle', syncError: '',

    async start() {
      if (adapter || get().status === 'loading') return;
      set({ status: 'loading', error: '' });
      try {
        loading ??= makeAdapter();
        adapter = await loading;
      } catch (e) {
        loading = null;
        set({ status: 'off', error: 'No se pudo cargar el inicio de sesión (' + ((e as Error)?.message || 'sin conexión') + ').' });
        return;
      }
      const a = adapter;
      stopAuth = a.onAuth((u) => {
        set({ user: u, status: u ? 'in' : 'out', error: '' });
        remember(!!u);
        if (u && !u.anon) void startSync(a, u.uid);
        else { stopSync?.(); set({ sync: 'idle' }); }
      });
    },

    async google() { await get().start(); try { await adapter!.google(); } catch (e) { fail(e); } },
    async emailIn(email, pass) { await get().start(); try { await adapter!.emailIn(email.trim(), pass); } catch (e) { fail(e); } },
    async emailUp(email, pass) { await get().start(); try { await adapter!.emailUp(email.trim(), pass); } catch (e) { fail(e); } },
    async reset(email) {
      await get().start();
      try { await adapter!.reset(email.trim()); return 'Te hemos enviado un correo para cambiar la contraseña.'; } catch (e) { fail(e); return ''; }
    },
    async ensureUser() {
      await get().start();
      if (!adapter) return null;
      await until(() => get().status !== 'loading');
      if (get().user) return get().user;
      try { await adapter.anon(); } catch (e) { fail(e); return null; }
      await until(() => !!get().user);
      return get().user;
    },

    async out() {
      stopSync?.();
      try { await adapter?.out(); } catch (e) { fail(e); }
      remember(false);
      set({ sync: 'idle' });
    },
  };
});
