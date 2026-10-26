import { createStore, get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import { create } from 'zustand';
import type { LibBackground, LibFeat, LibSpell, LibSubclass } from '../engine/bookImport';
import type { LibItem } from '../engine/magicItems';
import { setOwnSubclasses } from '../engine/homebrew';
import { ownSelfFx, setOwnSpellFx } from '../engine/spellEffects';

/**
 * Biblioteca propia: dotes, trasfondos y conjuros que el usuario añade desde su propio libro (importando su PDF o
 * a mano). Se guarda solo en este dispositivo y nunca forma parte de la app publicada.
 */
let idb: ReturnType<typeof createStore> | null = null;
const store = () => (idb ??= createStore('cronica-biblioteca', 'lib'));
const KEY = 'v1';

export interface LibraryData {
  v: 1;
  source: string;
  feats: LibFeat[];
  backgrounds: LibBackground[];
  spells: LibSpell[];
  subclasses: LibSubclass[];
  items: LibItem[]; // objetos mágicos de la Guía del Dungeon Master del usuario
}

export interface LibraryState extends LibraryData {
  loaded: boolean;
  init: () => Promise<void>;
  save: (d: Partial<LibraryData>) => Promise<void>;
  clear: () => Promise<void>;
  exportText: () => string;
  importText: (text: string) => Promise<string>; // mensaje para el usuario
  /** El máster: lo que necesita la hoja de un jugador de la sala (de paso: ni se guarda ni se exporta). null: quitarlo. */
  setGuest: (uid: string, pack: GuestLib | null) => void;
}

export interface GuestLib { subs: LibSubclass[]; spells: LibSpell[]; bgs: LibBackground[]; feats: LibFeat[] }

// lo de los jugadores de la sala, por jugador: se añade a las listas marcado como «guest» y nunca se guarda
const guests = new Map<string, GuestLib>();
function withGuests(d: LibraryData): LibraryData {
  if (!guests.size) return d;
  const add = <T extends { id: string; guest?: boolean }>(base: T[], extra: T[]) => [...base, ...extra.filter((x, i) => !base.some((b) => b.id === x.id) && extra.findIndex((y) => y.id === x.id) === i).map((x) => ({ ...x, guest: true }))];
  const all = [...guests.values()];
  return { ...d, subclasses: add(d.subclasses, all.flatMap((g) => g.subs)), spells: add(d.spells, all.flatMap((g) => g.spells)), backgrounds: add(d.backgrounds, all.flatMap((g) => g.bgs)), feats: add(d.feats, all.flatMap((g) => g.feats)) };
}

// lectura inicial única: guardar o importar la esperan, para no pisar lo que ya había en el dispositivo
let loading: Promise<void> | null = null;

const empty = (): LibraryData => ({ v: 1, source: '', feats: [], backgrounds: [], spells: [], subclasses: [], items: [] });

function persist(d: LibraryData) {
  void idbSet(KEY, d, store()).catch(() => { /* sin IndexedDB: dura esta visita */ });
}

export const useLibrary = create<LibraryState>()((set, get) => ({
  ...empty(), loaded: false,

  init() {
    loading ??= (async () => {
      let d: LibraryData | undefined;
      try { d = await idbGet<LibraryData>(KEY, store()); } catch { /* nada */ }
      set({ ...withGuests({ ...empty(), ...(d || {}) }), loaded: true });
    })();
    return loading;
  },

  async save(patch) {
    await get().init();
    // lo que llega de la sala no se guarda nunca
    const clean = <T extends { guest?: boolean }>(l: T[] | undefined) => l?.filter((x) => !x.guest);
    const p = { ...patch, ...(patch.feats ? { feats: clean(patch.feats) } : {}), ...(patch.backgrounds ? { backgrounds: clean(patch.backgrounds) } : {}), ...(patch.spells ? { spells: clean(patch.spells) } : {}), ...(patch.subclasses ? { subclasses: clean(patch.subclasses) } : {}) };
    const d = { ...pick(get()), ...p, v: 1 as const };
    persist(d);
    set(withGuests(d));
  },

  async clear() {
    await get().init();
    // lo importado del libro se va; las creaciones propias se quedan
    const own = get().subclasses.filter((s) => s.own);
    const ownSp = get().spells.filter((s) => s.own);
    if (own.length || ownSp.length) { const d = { ...empty(), subclasses: own, spells: ownSp }; persist(d); set(withGuests(d)); return; }
    void idbDel(KEY, store()).catch(() => { /* nada */ });
    set(withGuests(empty()));
  },

  setGuest(uid, pack) {
    if (pack) guests.set(uid, pack); else guests.delete(uid);
    set(withGuests(pick(get())));
  },

  exportText() {
    return JSON.stringify({ app: 'cronica-combate', tipo: 'biblioteca', ...pick(get()) });
  },

  async importText(text) {
    await get().init();
    let d: Partial<LibraryData> & { tipo?: string };
    try { d = JSON.parse(text); } catch { return 'Ese archivo no es una biblioteca de Crónica de Combate.'; }
    if (d.tipo !== 'biblioteca' || !Array.isArray(d.spells) || !Array.isArray(d.feats) || !Array.isArray(d.backgrounds)) return 'Ese archivo no es una biblioteca de Crónica de Combate.';
    // se fusiona por id: lo que llega sustituye a lo que había con el mismo id
    const merge = <T extends { id: string }>(a: T[], b: T[]) => [...a.filter((x) => !b.some((y) => y.id === x.id)), ...b];
    const cur = pick(get());
    const subs = Array.isArray(d.subclasses) ? d.subclasses : [];
    const items = Array.isArray(d.items) ? d.items : [];
    await get().save({ source: d.source || cur.source, feats: merge(cur.feats, d.feats), backgrounds: merge(cur.backgrounds, d.backgrounds), spells: merge(cur.spells, d.spells), subclasses: merge(cur.subclasses, subs), items: merge(cur.items, items) });
    return 'Biblioteca cargada: ' + (items.length ? items.length + ' objetos, ' : '') + subs.length + ' subclases, ' + d.feats.length + ' dotes, ' + d.backgrounds.length + ' trasfondos y ' + d.spells.length + ' conjuros.';
  },
}));

// lo propio del dispositivo (sin lo que llega de paso de la sala)
const pick = (s: LibraryData): LibraryData => ({ v: 1, source: s.source, feats: s.feats.filter((x) => !x.guest), backgrounds: s.backgrounds.filter((x) => !x.guest), spells: s.spells.filter((x) => !x.guest), subclasses: (s.subclasses || []).filter((x) => !x.guest), items: s.items || [] });

// los rasgos propios con bonificadores fijos entran en el cálculo de la hoja
useLibrary.subscribe((s, prev) => {
  if (s.subclasses !== prev.subclasses) setOwnSubclasses(s.subclasses);
  // y los conjuros propios con efecto sobre quien lo recibe
  if (s.spells !== prev.spells) setOwnSpellFx(s.spells.filter((x) => x.own && x.self).map((x) => ({ id: x.id, n: x.n, fx: ownSelfFx(x.self!) })));
});
