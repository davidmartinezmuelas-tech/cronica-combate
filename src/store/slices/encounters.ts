import type { Encounter } from '../../data/types';
import { makeLair } from '../../engine/combat';
import { uid } from '../../engine/util';
import type { EncounterSlice, GetState, SetState } from '../state';

export function createEncounterSlice(set: SetState, get: GetState): EncounterSlice {
  return {
    encounters: [],

    saveEncounter(name) {
      const s = get();
      const nm = name.trim();
      const items: Encounter['items'] = [];
      s.combatants.filter((c) => c.kind === 'monster' && c.monsterId).forEach((c) => {
        const it = items.find((x) => x.monsterId === c.monsterId && x.inLair === !!c.inLair);
        if (it) it.qty++;
        else items.push({ monsterId: c.monsterId!, qty: 1, inLair: !!c.inLair });
      });
      if (!nm || !items.length) { get().showToast(!items.length ? 'Añade monstruos antes de guardar el encuentro' : 'Ponle nombre al encuentro'); return false; }
      get().snap('guardar encuentro');
      const same = s.encounters.find((e) => e.name.toLowerCase() === nm.toLowerCase());
      const enc: Encounter = { id: same?.id || 'e-' + uid(), name: nm, items, lair: s.combatants.some((c) => c.kind === 'lair') };
      set({ encounters: same ? s.encounters.map((e) => (e.id === same.id ? enc : e)) : s.encounters.concat([enc]) });
      get().showToast('Encuentro «' + nm + '» ' + (same ? 'actualizado' : 'guardado'));
      return true;
    },

    loadEncounter(id) {
      const s = get();
      const e = s.encounters.find((x) => x.id === id);
      if (!e) return;
      get().snap('cargar ' + e.name);
      const missing: string[] = [];
      let n = 0;
      e.items.forEach((it) => {
        const m = get().monById(it.monsterId);
        if (!m) { missing.push(it.monsterId); return; }
        get().addMonster(m, it.qty, { inLair: it.inLair, silent: true });
        n += it.qty;
      });
      if (e.lair && !get().combatants.some((c) => c.kind === 'lair')) set({ combatants: get().combatants.concat([makeLair()]) });
      set({ tab: 'combat' });
      get().showToast(n + ' monstruos de «' + e.name + '» al combate' + (missing.length ? '. No encontrados: ' + missing.join(', ') : '') + (s.started ? '. Tira su iniciativa.' : ''));
    },

    deleteEncounter(id) {
      const e = get().encounters.find((x) => x.id === id);
      if (!e) return;
      get().confirm('enc-' + id, () => { get().snap('borrar ' + e.name); set({ encounters: get().encounters.filter((x) => x.id !== id) }); });
    },
  };
}
