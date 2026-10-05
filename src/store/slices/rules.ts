import { findRule, type RulesData } from '../../engine/rules';
import type { GetState, RulesSlice, SetState } from '../state';

let loading: Promise<void> | null = null;

export function createRulesSlice(set: SetState, get: GetState): RulesSlice {
  return {
    rules: null, rulesError: '', rq: '', rcat: '', ruleId: null, ruleBack: [],

    loadRules() {
      if (get().rules) return Promise.resolve();
      // el texto de las reglas va aparte del bestiario: solo se descarga al usarlo
      loading ??= fetch(import.meta.env.BASE_URL + 'data/reglas_es.json')
        .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() as Promise<RulesData>; })
        .then((d) => set({ rules: d.e, rulesError: '' }))
        .catch((e: Error) => { loading = null; set({ rulesError: 'No se pudieron cargar las reglas (' + e.message + ').' }); });
      return loading;
    },

    openRule(id) {
      const s = get();
      set({ tab: 'rules', ruleId: id, ruleBack: s.ruleId && s.ruleId !== id ? [...s.ruleBack, s.ruleId].slice(-30) : s.ruleBack });
    },

    async openRuleByName(name, cat) {
      await get().loadRules();
      const e = findRule(get().rules || [], name, cat);
      if (e) get().openRule(e.id);
      else set({ tab: 'rules', rq: name, rcat: '' });
    },

    ruleGoBack() {
      const back = get().ruleBack.slice();
      const prev = back.pop();
      if (prev) set({ ruleId: prev, ruleBack: back });
    },
  };
}
