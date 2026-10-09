import { blankForge, forgeToMonster, monsterToForge } from '../../engine/forge';
import { uid } from '../../engine/util';
import { clearBookMonsters, saveBookMonsters } from '../bookMonsters';
import { typesOf } from './core';
import type { BestiarySlice, GetState, SetState } from '../state';

export function createBestiarySlice(set: SetState, get: GetState): BestiarySlice {
  return {
    custom: [], search: '', fType: '', fCr: 'all', fLeg: false, fMine: false, book: [], fBook: false, viewId: null, qty: {}, hpMode: 'avg', shareInit: true, addLair: true, bLimit: 50,
    forge: blankForge(), editingId: null, forgeMsg: '',

    setBook(list) {
      set({ book: list, types: typesOf([...get().srd, ...list]), fBook: list.length ? get().fBook : false });
      void (list.length ? saveBookMonsters(list) : clearBookMonsters());
    },
    setForge: (patch) => set({ forge: { ...get().forge, ...patch }, forgeMsg: '' }),
    setFeat(i, key, val) {
      const feats = get().forge.feats.map((x, j) => (j === i ? { ...x, [key]: val } : x));
      get().setForge({ feats });
    },
    saveForge(addToo) {
      const s = get();
      if (!s.forge.name.trim()) { set({ forgeMsg: 'Dale un nombre a la criatura antes de guardarla.' }); return; }
      const id = s.editingId || 'c-' + uid();
      const m = forgeToMonster(s.forge, id, s.spells);
      get().snap('guardar ' + m.n);
      const exists = s.custom.some((x) => x.id === id);
      set({ custom: exists ? s.custom.map((x) => (x.id === id ? m : x)) : [m, ...s.custom], editingId: id, viewId: id, forgeMsg: '' });
      if (addToo) get().addMonster(m, 1);
      else get().showToast('«' + m.n + '» guardado en el bestiario');
    },
    editMonster(m, keepId) {
      const f = monsterToForge(m, get().spells);
      if (!keepId) f.name = m.n + ' (variante)';
      set({ tab: 'forge', forge: f, editingId: keepId ? m.id : null, forgeMsg: '' });
    },
    newForge: () => set({ tab: 'forge', forge: blankForge(), editingId: null, forgeMsg: '' }),
    deleteCustom(id) {
      const s = get();
      const m = s.custom.find((x) => x.id === id);
      if (!m) return;
      if (s.combatants.some((c) => c.monsterId === id)) { get().showToast('«' + m.n + '» está en el combate: quítalo antes de borrarlo'); return; }
      get().confirm('del-' + id, () => {
        get().snap('borrar ' + m.n);
        set({ custom: get().custom.filter((x) => x.id !== id), viewId: null });
      });
    },
  };
}
