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
  };
}
