import { planBlocks } from '../../engine/scriptBlocks';
import { uid } from '../../engine/util';
import type { GetState, ScriptSlice, SetState } from '../state';

export function createScriptSlice(set: SetState, get: GetState): ScriptSlice {
  return {
    scripts: [],
    scriptId: null,

    addScript(title, text) {
      const id = 's-' + uid();
      set({ scripts: get().scripts.concat([{ id, title: title.trim() || 'Guion sin título', text, at: Date.now() }]), scriptId: id });
      return id;
    },

    patchScript(id, patch) {
      set({ scripts: get().scripts.map((s) => (s.id === id ? { ...s, ...patch, at: Date.now() } : s)) });
    },

    deleteScript(id) {
      const s = get().scripts.find((x) => x.id === id);
      if (!s) return;
      get().confirm('script-' + id, () => {
        const rest = get().scripts.filter((x) => x.id !== id);
        set({ scripts: rest, scriptId: get().scriptId === id ? rest[0]?.id || null : get().scriptId });
        get().showToast('Guion «' + s.title + '» borrado');
      });
    },

    openScriptEncounter(id) {
      get().loadEncounter(id); // carga los monstruos y salta a Combate
    },

    planScriptBlocks(text) {
      const s = get();
      return planBlocks(text, { spells: s.spells, custom: s.custom, all: [...s.custom, ...s.book, ...s.srd], encounters: s.encounters });
    },

    applyScriptBlocks(plan) {
      const s = get();
      if (!plan.creatures.length && !plan.encounters.length) return;
      get().snap('cargar combates del guion');
      const at = Date.now();
      const mons = plan.creatures.map((c) => ({ ...c.monster, at }));
      const ids = new Set(mons.map((m) => m.id));
      const encs = plan.encounters.map((e) => ({ ...e.enc, at }));
      const eids = new Set(encs.map((e) => e.id));
      set({ custom: [...mons, ...s.custom.filter((m) => !ids.has(m.id))], encounters: [...s.encounters.filter((e) => !eids.has(e.id)), ...encs] });
      get().showToast(mons.length + ' criaturas y ' + encs.length + ' encuentros cargados del guion');
    },
  };
}
