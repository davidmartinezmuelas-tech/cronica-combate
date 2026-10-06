import { createStore, get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import { create } from 'zustand';
import type { LibBackground, LibFeat, LibSpell, LibSubclass } from '../engine/bookImport';

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
}

export interface LibraryState extends LibraryData {
  loaded: boolean;
  init: () => Promise<void>;
  save: (d: Partial<LibraryData>) => Promise<void>;
  clear: () => Promise<void>;
  exportText: () => string;
  importText: (text: string) => Promise<string>; // mensaje para el usuario
}

// lectura inicial única: guardar o importar la esperan, para no pisar lo que ya había en el dispositivo
let loading: Promise<void> | null = null;

const empty = (): LibraryData => ({ v: 1, source: '', feats: [], backgrounds: [], spells: [], subclasses: [] });

function persist(d: LibraryData) {
  void idbSet(KEY, d, store()).catch(() => { /* sin IndexedDB: dura esta visita */ });
}

export const useLibrary = create<LibraryState>()((set, get) => ({
  ...empty(), loaded: false,

  init() {
    loading ??= (async () => {
      let d: LibraryData | undefined;
      try { d = await idbGet<LibraryData>(KEY, store()); } catch { /* nada */ }
      set({ ...empty(), ...(d || {}), loaded: true });
    })();
    return loading;
  },

  async save(patch) {
    await get().init();
    const d = { ...pick(get()), ...patch, v: 1 as const };
    persist(d);
    set(d);
  },

  async clear() {
    await get().init();
    void idbDel(KEY, store()).catch(() => { /* nada */ });
    set({ ...empty() });
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
    await get().save({ source: d.source || cur.source, feats: merge(cur.feats, d.feats), backgrounds: merge(cur.backgrounds, d.backgrounds), spells: merge(cur.spells, d.spells), subclasses: merge(cur.subclasses, subs) });
    return 'Biblioteca cargada: ' + subs.length + ' subclases, ' + d.feats.length + ' dotes, ' + d.backgrounds.length + ' trasfondos y ' + d.spells.length + ' conjuros.';
  },
}));

const pick = (s: LibraryData): LibraryData => ({ v: 1, source: s.source, feats: s.feats, backgrounds: s.backgrounds, spells: s.spells, subclasses: s.subclasses || [] });
