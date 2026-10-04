import type { RosterEntry } from '../../data/types';
import { uid } from '../../engine/util';
import { blankRoster, buildExport, mergeImport } from '../persist';
import { savedSlice } from '../saved';
import type { GetState, GroupSlice, SetState } from '../state';

export function createGroupSlice(set: SetState, get: GetState): GroupSlice {
  return {
    roster: [], pcForm: blankRoster(), editingPcId: null, pcMsg: '', ioMsg: '',

    savePc() {
      const p = get().pcForm;
      if (!p.name.trim()) { set({ pcMsg: 'Ponle nombre al personaje.' }); return; }
      const rec: RosterEntry = { ...p, name: p.name.trim(), id: get().editingPcId || 'r-' + uid() };
      get().snap('guardar ' + rec.name);
      const s = get();
      set({ roster: s.editingPcId ? s.roster.map((x) => (x.id === rec.id ? rec : x)) : s.roster.concat([rec]), pcForm: blankRoster(), editingPcId: null, pcMsg: '' });
      get().showToast(rec.name + ' guardado en tu grupo');
    },
    deletePc(id) {
      const r = get().roster.find((x) => x.id === id);
      if (!r) return;
      get().confirm('pc-' + id, () => { get().snap('quitar ' + r.name); set({ roster: get().roster.filter((x) => x.id !== id) }); });
    },

    exportData() {
      return JSON.stringify(buildExport(savedSlice(get())), null, 1);
    },
    importText(text) {
      const r = mergeImport(text, savedSlice(get()));
      if (!r.ok) { set({ ioMsg: r.message }); return; }
      get().snap('importar');
      set({ roster: r.roster!, custom: r.custom!, encounters: r.encounters!, ...(r.combat || {}), ioMsg: r.message });
    },
  };
}
