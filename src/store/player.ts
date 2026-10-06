import { createStore, del, entries, set as idbSet } from 'idb-keyval';
import { create } from 'zustand';
import type { PlayerData } from '../data/player';
import { blankCharacter, type Character } from '../engine/character';

/**
 * Estado del modo jugador, separado del de la mesa del máster: sus personajes (cada uno guardado aparte en
 * IndexedDB, listo para sincronizarse uno a uno más adelante) y los datos del SRD para crearlos.
 */
let idb: ReturnType<typeof createStore> | null = null;
const store = () => (idb ??= createStore('cronica-personajes', 'pj'));
const ACTIVE_KEY = 'cronica-pj-activo';

export interface PlayerState {
  data: PlayerData | null;
  dataError: string;
  loaded: boolean;
  characters: Character[];
  activeId: string | null;
  editing: boolean; // creando o editando la hoja activa
  init: () => Promise<void>;
  loadData: () => Promise<void>;
  select: (id: string | null) => void;
  create: () => Character;
  update: (id: string, patch: Partial<Character> | ((c: Character) => Partial<Character>)) => void;
  replace: (c: Character) => void;
  remove: (id: string) => void;
  setEditing: (v: boolean) => void;
}

function rememberActive(id: string | null) {
  try { if (id) localStorage.setItem(ACTIVE_KEY, id); else localStorage.removeItem(ACTIVE_KEY); } catch { /* sin almacenamiento */ }
}

function save(c: Character) {
  void idbSet(c.id, c, store()).catch(() => { /* sin IndexedDB: el personaje dura esta visita */ });
}

let dataLoading: Promise<void> | null = null;

export const usePlayer = create<PlayerState>()((set, get) => ({
  data: null, dataError: '', loaded: false, characters: [], activeId: null, editing: false,

  async init() {
    if (get().loaded) return;
    let chars: Character[] = [];
    try {
      chars = (await entries<string, Character>(store())).map(([, c]) => ({ ...blankCharacter(), ...c, id: c.id }));
    } catch { /* sin IndexedDB */ }
    chars.sort((a, b) => b.updatedAt - a.updatedAt);
    let active: string | null = null;
    try { active = localStorage.getItem(ACTIVE_KEY); } catch { /* nada */ }
    if (!chars.some((c) => c.id === active)) active = chars[0]?.id ?? null;
    set({ characters: chars, activeId: active, loaded: true });
  },

  loadData() {
    if (get().data) return Promise.resolve();
    dataLoading ??= fetch(import.meta.env.BASE_URL + 'data/jugador_es.json')
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() as Promise<PlayerData>; })
      .then((d) => set({ data: d, dataError: '' }))
      .catch((e: Error) => { dataLoading = null; set({ dataError: 'No se pudieron cargar las clases y especies (' + e.message + ').' }); });
    return dataLoading;
  },

  select(id) {
    rememberActive(id);
    set({ activeId: id, editing: false });
  },

  create() {
    const c = blankCharacter();
    set({ characters: [c, ...get().characters], activeId: c.id, editing: true });
    rememberActive(c.id);
    save(c);
    return c;
  },

  update(id, patch) {
    const chars = get().characters.map((c) => {
      if (c.id !== id) return c;
      const p = typeof patch === 'function' ? patch(c) : patch;
      const next = { ...c, ...p, updatedAt: Date.now() };
      save(next);
      return next;
    });
    set({ characters: chars });
  },

  replace(c) {
    const next = { ...c, updatedAt: Date.now() };
    save(next);
    set({ characters: get().characters.map((x) => (x.id === c.id ? next : x)) });
  },

  remove(id) {
    void del(id, store()).catch(() => { /* nada */ });
    const chars = get().characters.filter((c) => c.id !== id);
    const active = get().activeId === id ? chars[0]?.id ?? null : get().activeId;
    rememberActive(active);
    set({ characters: chars, activeId: active, editing: false });
  },

  setEditing(v) {
    set({ editing: v });
  },
}));

export const activeCharacter = (s: PlayerState) => s.characters.find((c) => c.id === s.activeId) || null;
