import { modeFromLocation } from '../../app/mode';
import type { Combatant, RollResult } from '../../data/types';
import { addCondition, rollModifiers, type LogDraft } from '../../engine/combat';
import { combineAdv, rollParts, type AdvMode, type RollOutcome } from '../../engine/dice';
import type { Kit } from '../kit';
import type { DiceSlice, GetState, SetState, State } from '../state';

export function createDiceSlice(set: SetState, get: GetState, { guard, animate }: Kit): DiceSlice {
  return {
    dice: [], rolling: false, diceOpen: false, result: null, adv: 'normal', critFor: null, dmgTargets: {}, effectSel: null, dieSize: 64, moreDice: 0, expr: '', exprError: false,
    diceTheme: 'ruby', dice3d: null,

    roll(spec) {
      if (guard(() => get().roll(spec))) return;
      const s = get();
      // estados de quien tira: el combatiente de la mesa o, desde la hoja del jugador, sus propios estados
      const c = spec.cid ? s.combatants.find((x) => x.id === spec.cid) || null : spec.self ? ({ kind: 'pc', conds: spec.self.conds.map((k) => ({ k, r: null })), exh: spec.self.exh } as unknown as Combatant) : null;
      const mods = rollModifiers(c, spec.kind, spec.ability);
      const manual: AdvMode = spec.noAdv ? 'normal' : s.adv;
      const adv = combineAdv(manual, mods.adv || !!spec.adv, mods.dis);
      const cf = spec.kind === 'damage' && !!spec.who && s.critFor?.who === spec.who ? s.critFor : null;
      // con varios disparos el crítico es de cada uno: sus partes llevan su propia marca (crit) y no se dobla todo
      const crit = !!cf && !cf.shots;
      const parts = crit && spec.critBonus?.length ? [...spec.parts, ...spec.critBonus] : spec.parts;
      const opts = { kind: spec.kind, adv, doubleDice: crit, flat: mods.flat || undefined };
      // conjuros con varios disparos (Descarga sobrenatural…): un ataque, con su propio d20, por cada uno
      const shots = spec.kind === 'attack' ? Math.max(1, spec.shots || 1) : 1;
      const all = Array.from({ length: shots }, () => rollParts(parts, opts));
      if (all.some((x) => !x)) { set({ exprError: true }); return; }
      const outs = all as RollOutcome[];
      const out = outs[0];
      let cls: RollResult['cls'] = '';
      let note = '';
      const d20kind = spec.kind !== 'damage' && spec.kind !== 'death' && spec.kind !== 'free';
      const critOf = (o: RollOutcome) => (o.nat != null && spec.kind === 'attack' ? o.nat >= (spec.critOn || 20) : o.nat === 20);
      const critHit = outs.some(critOf);
      if (critHit && d20kind) { cls = 'crit'; note = spec.kind === 'attack' ? (spec.who ? '¡Crítico! El próximo daño de ' + spec.who + ' dobla los dados.' : '¡Crítico!') : '¡20 natural!'; }
      else if (outs.every((o) => o.nat === 1) && d20kind) { cls = 'fumble'; note = '1 natural.'; }
      if (mods.autoFail) note = (note ? note + ' ' : '') + 'Falla automáticamente.';
      if (mods.reasons.length) note = (note ? note + ' · ' : '') + mods.reasons.join(' · ');
      if (spec.adv) note = (note ? note + ' · ' : '') + 'ventaja: ' + spec.adv;
      const after: Partial<State> = {};
      if (spec.kind === 'attack' && spec.who) after.critFor = critHit ? { who: spec.who, ...(shots > 1 ? { shots: outs.map(critOf) } : {}) } : s.critFor?.who === spec.who ? null : s.critFor;
      if (cf) after.critFor = null;
      // en la mesa del máster la ventaja vale para una tirada; en la hoja del jugador se queda puesta hasta quitarla
      // (Voto de enemistad, estar oculto…)
      if (out.usedAdv && manual !== 'normal' && modeFromLocation(window.location.hash) !== 'player') after.adv = 'normal';
      set({ exprError: false });
      const totalStr = mods.autoFail ? 'Falla' : outs.map((o) => String(o.total)).join(' · ');
      const detailStr = shots > 1 ? outs.map((o, i) => 'Disparo ' + (i + 1) + ': ' + o.detail + (critOf(o) ? ' (crítico)' : '')).join('  |  ') : out.detail;
      animate(outs.flatMap((o) => o.dice), () => {
        const patch: Partial<State> & { logEntry?: LogDraft; extraLog?: LogDraft[] } = {
          result: { label: spec.label, total: totalStr, detail: detailStr, cls, note, isDmg: spec.kind === 'damage', parts: out.byType, half: !!spec.half, by: spec.by || null, crit, ...(spec.effect ? { effect: spec.effect } : {}), ...(spec.onHit ? { onHit: spec.onHit } : {}), ...(spec.heal ? { heal: true } : {}),
            ...(spec.kind === 'damage' && out.rows.length > 1 ? { rows: out.rows } : {}), ...(spec.tags?.length ? { tags: spec.tags } : {}) },
          // en el historial, los extras entre paréntesis
          logEntry: { label: spec.label + (spec.tags?.length ? ' (' + spec.tags.join(', ') + ')' : ''), total: totalStr, detail: detailStr },
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
      // el ataque pone además estados al impactar (Agarrado, Derribado…): a los mismos objetivos, con su duración
      const fx = r.onHit;
      if (fx?.conds.length) {
        const st = get();
        const ids = new Set(Object.keys(s.dmgTargets));
        set({ combatants: st.combatants.map((c) => {
          if (!ids.has(c.id)) return c;
          let next = c.conds;
          for (const k of fx.conds) next = addCondition(next, k, fx.rounds, { at: fx.until ? 'end' : st.condAt, by: fx.until === 'caster' && fx.by ? fx.by : c.id, activeId: st.started ? st.activeId : null, holderId: c.id });
          return next === c.conds ? c : { ...c, conds: next };
        }) });
      }
      set({ dmgTargets: {}, result: { ...r, isDmg: false, applied: true, note: 'Daño aplicado' + (fx?.conds.length ? ' y ' + fx.conds.join(', ').toLowerCase() : '') + '.' } });
    },
  };
}
