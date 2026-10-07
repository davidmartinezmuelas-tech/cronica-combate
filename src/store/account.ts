import { create } from 'zustand';
import { diffCharacters, mergeCharacters } from '../engine/sync';
import { cloudError, firebaseAdapter, type CloudAdapter, type CloudUser } from './cloudAdapter';
import { usePlayer } from './player';

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
}

let adapter: CloudAdapter | null = null;
let makeAdapter: () => Promise<CloudAdapter> = firebaseAdapter;
let loading: Promise<CloudAdapter> | null = null;
let stopAuth: (() => void) | null = null;
let stopSync: (() => void) | null = null;

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
    stopSync = () => { unwatch(); unsub(); pending.forEach((t) => clearTimeout(t)); stopSync = null; };
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
    async out() {
      stopSync?.();
      try { await adapter?.out(); } catch (e) { fail(e); }
      remember(false);
      set({ sync: 'idle' });
    },
  };
});
