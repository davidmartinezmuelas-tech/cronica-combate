import type { RollResult } from '../../data/types';
import { rollModifiers, type LogDraft } from '../../engine/combat';
import { combineAdv, rollParts, type AdvMode } from '../../engine/dice';
import type { Kit } from '../kit';
import type { DiceSlice, GetState, SetState, State } from '../state';

export function createDiceSlice(set: SetState, get: GetState, { guard, animate }: Kit): DiceSlice {
  return {
    dice: [], rolling: false, result: null, adv: 'normal', critFor: null, dmgTargets: {}, dieSize: 64, moreDice: 0, expr: '', exprError: false,
    diceTheme: 'ruby', dice3d: null,

    roll(spec) {
      if (guard(() => get().roll(spec))) return;
      const s = get();
      const c = spec.cid ? s.combatants.find((x) => x.id === spec.cid) || null : null;
      const mods = rollModifiers(c, spec.kind, spec.ability);
      const manual: AdvMode = spec.noAdv ? 'normal' : s.adv;
      const adv = combineAdv(manual, mods.adv, mods.dis);
      const crit = spec.kind === 'damage' && !!spec.who && s.critFor?.who === spec.who;
      const parts = crit && spec.critBonus?.length ? [...spec.parts, ...spec.critBonus] : spec.parts;
      const out = rollParts(parts, { kind: spec.kind, adv, doubleDice: crit, flat: mods.flat || undefined });
      if (!out) { set({ exprError: true }); return; }
      let cls: RollResult['cls'] = '';
      let note = '';
      const d20kind = spec.kind !== 'damage' && spec.kind !== 'death' && spec.kind !== 'free';
      const critHit = out.nat != null && spec.kind === 'attack' ? out.nat >= (spec.critOn || 20) : out.nat === 20;
      if (critHit && d20kind) { cls = 'crit'; note = spec.kind === 'attack' ? (spec.who ? '¡Crítico! El próximo daño de ' + spec.who + ' dobla los dados.' : '¡Crítico!') : '¡20 natural!'; }
      else if (out.nat === 1 && d20kind) { cls = 'fumble'; note = '1 natural.'; }
      if (mods.autoFail) note = (note ? note + ' ' : '') + 'Falla automáticamente.';
      if (mods.reasons.length) note = (note ? note + ' · ' : '') + mods.reasons.join(' · ');
      const after: Partial<State> = {};
      if (spec.kind === 'attack' && spec.who) after.critFor = critHit ? { who: spec.who } : s.critFor?.who === spec.who ? null : s.critFor;
      if (spec.kind === 'damage' && crit) after.critFor = null;
      if (out.usedAdv && manual !== 'normal') after.adv = 'normal';
      set({ exprError: false });
      const totalStr = mods.autoFail ? 'Falla' : String(out.total);
      animate(out.dice, () => {
        const patch: Partial<State> & { logEntry?: LogDraft; extraLog?: LogDraft[] } = {
          result: { label: spec.label, total: totalStr, detail: out.detail, cls, note, isDmg: spec.kind === 'damage', parts: out.byType, half: !!spec.half, by: spec.by || null, crit, ...(spec.effect ? { effect: spec.effect } : {}) },
          logEntry: { label: spec.label, total: totalStr, detail: out.detail },
          ...after,
        };
        if (spec.kind === 'damage') patch.dmgTargets = {};
        if (spec.after) {
          const extra = spec.after(mods.autoFail ? -99 : out.total, out.nat) || {};
          if (extra.resultNote && patch.result) { patch.result = { ...patch.result, note: extra.resultNote + (note ? ' · ' + note : '') }; }
          delete extra.resultNote;
          Object.assign(patch, extra);
        }
        return patch;
      });
    },

    startEffect(label, effect) {
      set({ result: { label, total: 'CD ' + effect.dc, detail: '', cls: '', note: 'Elige los objetivos y tira sus salvaciones.', isDmg: false, parts: [], half: effect.half, by: effect.by || null, effect }, dmgTargets: {} });
    },

    applyRolled() {
      const s = get();
      const r = s.result;
      if (!r || !Object.keys(s.dmgTargets).length) { get().showToast('Elige al menos un objetivo'); return; }
      get().applyParts(s.dmgTargets, r.parts, !!r.crit);
      set({ dmgTargets: {}, result: { ...r, isDmg: false, applied: true, note: 'Daño aplicado.' } });
    },
  };
}
