import type { Combatant, ConcPrompt, TurnEvent } from '../../data/types';
import {
  addCondition, applyDamage, applyHeal, makeLair, makeMonsterCombatant, makePcCombatant, resolveDeathSave, rollModifiers, setExhaustion, sortCombatants,
  stepTurn, tickConditions, turnStart, uniqueName, type LogDraft, type RechargeCheck,
} from '../../engine/combat';
import { combineAdv, rollDie, sgn, type PhysicalDie } from '../../engine/dice';
import { uid } from '../../engine/util';
import type { Kit } from '../kit';
import type { CombatSlice, GetState, SetState } from '../state';

export function createCombatSlice(set: SetState, get: GetState, { pushLog, guard, animate }: Kit): CombatSlice {
  const rollRecharge = (id: string, list: RechargeCheck[]) => {
    if (guard(() => rollRecharge(id, list))) return;
    const rolls = list.map((x) => ({ ...x, v: rollDie(6) }));
    const c = get().combatants.find((x) => x.id === id);
    const detail = rolls.map((x) => x.name + ': ' + x.v + (x.v >= x.min ? ' (recargada)' : ' (sigue gastada)')).join(' · ');
    animate(rolls.map((x) => ({ sides: 6, final: x.v })), () => {
      const s = get();
      const combatants = s.combatants.map((cc) => {
        if (cc.id !== id) return cc;
        const sp = { ...cc.spent };
        rolls.forEach((x) => { if (x.v >= x.min) sp[x.key] = false; });
        return { ...cc, spent: sp };
      });
      const turnEvents = s.turnEvents.concat(rolls.map((x) => ({ text: 'Recarga de ' + x.name + ': ' + x.v + (x.v >= x.min ? ' → disponible.' : ' → sigue gastada.') })));
      const label = 'Recarga · ' + (c ? c.name : '');
      return {
        combatants, turnEvents,
        result: { label, total: rolls.map((x) => x.v).join(' · '), detail, cls: '', note: '', isDmg: false, parts: [], half: false, by: null },
        logEntry: { label, total: rolls.map((x) => x.v).join('/'), detail },
      };
    });
  };

  /**
   * Termina el turno de `prevId` (si lo hay) y empieza el de `nx.id`: estados que caducan,
   * efectos de inicio de turno, nueva ronda y recargas.
   */
  const beginTurn = (nx: { id: string; round: number }, prevId: string | null) => {
    const s = get();
    let cs = s.combatants;
    const ticked: TurnEvent[] = [];
    if (prevId) { const t = tickConditions(cs, prevId, 'end'); cs = t.cs; ticked.push(...t.events); }
    const t = tickConditions(cs, nx.id, 'start');
    cs = t.cs;
    ticked.push(...t.events);
    const next = cs.find((c) => c.id === nx.id);
    if (!next) return;
    const r = turnStart(next, get().monById(next.monsterId) || null);
    const waiting = cs.filter((c) => c.init == null);
    const events = ticked.concat(r.events, waiting.length ? [{ text: 'Sin iniciativa (no actúan hasta que la pongas): ' + waiting.map((c) => c.name).join(', ') + '.' }] : []);
    set({
      activeId: next.id, selId: next.id, round: nx.round, tab: 'combat', spellOpen: null, turnEvents: events,
      combatants: cs.map((c) => (c.id === next.id ? r.c : c)),
      log: nx.round !== s.round ? pushLog([{ label: 'Ronda ' + nx.round, detail: 'Empieza una nueva ronda', total: 'R' + nx.round }]) : s.log,
    });
    if (r.recharge.length) rollRecharge(next.id, r.recharge);
  };

  return {
    combatants: [], round: 1, activeId: null, started: false, turnEvents: [],
    selId: null, concPrompts: [], surprised: false, amount: '', dmgType: 'cortante', condRounds: '', condAt: 'start', condBy: '', saveDc: '', initDraft: null,

    patchC(id, patch, label) {
      get().snap(label || 'cambio en combatiente');
      set({ combatants: get().combatants.map((c) => (c.id === id ? { ...c, ...(typeof patch === 'function' ? patch(c) : patch) } : c)) });
    },

    rollInit() {
      if (guard(() => get().rollInit())) return;
      const s = get();
      let targets = s.combatants.filter((c) => c.kind === 'monster' && c.init == null);
      if (!targets.length) targets = s.combatants.filter((c) => c.kind === 'monster');
      if (!targets.length) { get().showToast('No hay monstruos en el encuentro'); return; }
      const groups = new Map<string, Combatant[]>();
      targets.forEach((c) => { const g = s.shareInit && c.grp ? c.grp : c.id; groups.set(g, [...(groups.get(g) || []), c]); });
      const dice: PhysicalDie[] = [];
      const res: Record<string, number> = {};
      const det: string[] = [];
      groups.forEach((list) => {
        const c0 = list[0];
        const mods = rollModifiers(c0, 'init');
        const mode = combineAdv(s.surprised ? 'dis' : 'normal', mods.adv, mods.dis);
        let v: number;
        if (mode !== 'normal') {
          const a = rollDie(20); const b = rollDie(20);
          const keepA = mode === 'adv' ? a >= b : a <= b;
          v = keepA ? a : b;
          dice.push({ sides: 20, final: a, dim: !keepA }, { sides: 20, final: b, dim: keepA });
        } else { v = rollDie(20); dice.push({ sides: 20, final: v }); }
        const init = v + (c0.initBonus || 0) + mods.flat;
        list.forEach((c) => { res[c.id] = init; });
        det.push((list.length > 1 ? c0.name.replace(/ \d+$/, '') + ' ×' + list.length : c0.name) + ' ' + init);
      });
      const detail = det.join(' · ') + (s.surprised ? ' · sorprendidos (desventaja)' : '');
      get().snap('tirada de iniciativa');
      animate(dice, () => {
        const combatants = get().combatants.map((c) => (res[c.id] != null ? { ...c, init: res[c.id] } : c));
        const best = Math.max(...Object.values(res));
        return {
          combatants,
          result: { label: 'Iniciativa de monstruos', total: String(best), detail, cls: '', note: 'Ya está ordenada. Ahora añade a los jugadores con su tirada.', isDmg: false, parts: [], half: false, by: null },
          logEntry: { label: 'Iniciativa', total: String(best), detail },
        };
      });
    },

    addMonster(m, qty, opts = {}) {
      if (!opts.silent) get().snap('añadir ' + m.n);
      const s = get();
      const inLair = opts.inLair ?? s.addLair;
      const n = Math.max(1, Math.min(20, qty || 1));
      let cs = s.combatants;
      const taken = new Set(cs.map((c) => c.name));
      const plain = cs.find((c) => c.name === m.n);
      if (plain) {
        taken.delete(m.n);
        const nn = uniqueName(m.n, taken);
        taken.add(nn);
        cs = cs.map((c) => (c.id === plain.id ? { ...c, name: nn } : c));
      }
      const numbered = n > 1 || !!plain || Array.from(taken).some((t) => t.startsWith(m.n + ' '));
      const grp = 'g' + uid();
      const add: Combatant[] = [];
      for (let i = 0; i < n; i++) {
        const name = numbered ? uniqueName(m.n, taken) : m.n;
        taken.add(name);
        add.push(makeMonsterCombatant(m, { name, inLair, rollHp: s.hpMode === 'roll', grp }));
      }
      set({ combatants: cs.concat(add) });
      if (!opts.silent) get().showToast(n + ' × ' + m.n + (inLair && m.lair ? ' (en su guarida)' : '') + ' al combate' + (s.started ? '. Tira o escribe su iniciativa: hasta entonces no actúa.' : ''));
    },

    addPc(r) {
      const s = get();
      if (s.combatants.some((c) => c.rosterId === r.id)) return;
      get().snap('añadir ' + r.name);
      const taken = new Set(s.combatants.map((x) => x.name));
      const c = makePcCombatant(r, taken.has(r.name) ? uniqueName(r.name, taken) : r.name);
      set({ combatants: get().combatants.concat([c]) });
      if (s.started) get().showToast(c.name + ' entra en el combate: escribe su iniciativa.');
    },

    addAllPcs() {
      const s = get();
      const inC = new Set(s.combatants.map((c) => c.rosterId).filter(Boolean));
      const rs = s.roster.filter((r) => !inC.has(r.id));
      if (!rs.length) { get().showToast(s.roster.length ? 'Todo el grupo ya está en el combate' : 'Primero guarda a tus jugadores en Grupo'); return; }
      get().snap('añadir el grupo');
      const taken = new Set(s.combatants.map((x) => x.name));
      const add = rs.map((r) => { const name = taken.has(r.name) ? uniqueName(r.name, taken) : r.name; taken.add(name); return makePcCombatant(r, name); });
      set({ combatants: get().combatants.concat(add), tab: 'combat' });
      get().showToast(add.length + ' jugadores añadidos. Escribe su iniciativa.');
    },

    addLairCombatant() {
      get().snap('añadir guarida');
      set({ combatants: get().combatants.concat([makeLair()]) });
    },

    removeCombatant(id) {
      const c = get().combatants.find((x) => x.id === id);
      if (!c) return;
      get().snap('quitar a ' + c.name);
      const s = get();
      // si se quita a quien está en turno, el turno pasa al siguiente en la iniciativa (no vuelve al primero)
      const nx = s.started && s.activeId === id ? stepTurn(s.combatants, id, s.round, 1) : null;
      const moved = !!nx && nx.id !== id;
      if (moved) beginTurn(nx!, id);
      const s2 = get();
      // los estados que dependían de su turno pasan a contar con el turno de quien los tiene
      const combatants = s2.combatants.filter((x) => x.id !== id)
        .map((x) => (x.conds.some((cd) => cd.by === id) ? { ...x, conds: x.conds.map((cd) => (cd.by === id ? { k: cd.k, r: cd.r, ...(cd.at ? { at: cd.at } : {}) } : cd)) } : x));
      set({ combatants, selId: moved ? s2.selId : null, activeId: s2.activeId === id ? null : s2.activeId, concPrompts: s2.concPrompts.filter((p) => p.id !== id) });
    },

    startCombat() {
      if (guard(() => get().startCombat())) return;
      const s = get();
      if (!s.combatants.length) { get().showToast('Añade combatientes primero'); return; }
      const missing = s.combatants.filter((c) => c.init == null).map((c) => c.name);
      if (missing.length) { get().showToast('Falta la iniciativa de: ' + missing.slice(0, 4).join(', ') + (missing.length > 4 ? '…' : '')); return; }
      const order = sortCombatants(s.combatants);
      const first = order[0];
      const t = tickConditions(s.combatants, first.id, 'start');
      const r = turnStart(t.cs.find((c) => c.id === first.id)!, get().monById(first.monsterId) || null);
      get().snap('empezar combate');
      set({
        started: true, round: 1, activeId: first.id, selId: first.id, tab: 'combat', turnEvents: t.events.concat(r.events),
        combatants: t.cs.map((c) => (c.id === first.id ? r.c : c)),
        log: pushLog([{ label: '¡Comienza el combate!', detail: 'Orden: ' + order.map((c) => c.name + ' ' + c.init).join(' · '), total: 'R1' }]),
      });
    },

    step(dir) {
      if (guard(() => get().step(dir))) return;
      const s = get();
      if (!s.started) { get().startCombat(); return; }
      if (dir < 0) {
        const top = s.undoStack[s.undoStack.length - 1];
        if (top && top.label.startsWith('turno de')) {
          set({ ...top.data, undoStack: s.undoStack.slice(0, -1), log: pushLog([{ label: 'Vuelta al turno anterior', detail: 'Se deshacen los efectos del inicio de turno', total: '↶' }]) });
          return;
        }
      }
      const nx = stepTurn(s.combatants, s.activeId, s.round, dir);
      if (!nx) { get().showToast('Nadie puede actuar: revisa iniciativas y PG'); return; }
      const next = s.combatants.find((c) => c.id === nx.id)!;
      if (dir > 0) {
        get().snap('turno de ' + next.name);
        beginTurn(nx, s.activeId);
      } else {
        get().snap('volver a ' + next.name);
        set({ activeId: next.id, selId: next.id, round: nx.round, turnEvents: [{ text: 'Has vuelto a este turno. Como ya hubo acciones después, los efectos de inicio de turno no se han deshecho: usa Deshacer si necesitas revertirlos.' }] });
      }
    },

    endCombat() {
      const s = get();
      get().snap('terminar combate');
      set({
        combatants: s.combatants.filter((c) => c.kind === 'pc').map((c) => ({ ...c, init: null, conds: [], conc: false, react: false })),
        round: 1, activeId: null, selId: null, started: false, turnEvents: [], concPrompts: [], critFor: null,
        log: pushLog([{ label: 'Fin del combate', detail: 'Ronda ' + s.round, total: '—' }]),
      });
    },

    clearAll() {
      get().snap('vaciar encuentro');
      set({ combatants: [], started: false, round: 1, activeId: null, selId: null, turnEvents: [], concPrompts: [], critFor: null });
    },

    applyParts(map, parts, crit = false) {
      get().snap('aplicar daño');
      const s = get();
      const logs: LogDraft[] = [];
      const prompts: ConcPrompt[] = [];
      const combatants = s.combatants.map((c) => {
        const f = map[c.id];
        if (!f) return c;
        const r = applyDamage(c, get().monById(c.monsterId) || null, parts, f === 'half' ? 0.5 : 1, crit);
        logs.push(...r.logs);
        if (r.conc) prompts.push(r.conc);
        return r.c;
      });
      set({ combatants, log: pushLog(logs), concPrompts: s.concPrompts.concat(prompts), amount: '' });
    },

    heal(id, amt, src) {
      const c = get().combatants.find((x) => x.id === id);
      if (!c || !(amt > 0)) return;
      const r = applyHeal(c, amt);
      if ('error' in r) { get().showToast(r.error); return; }
      get().snap('curar a ' + c.name);
      set({ combatants: get().combatants.map((x) => (x.id === id ? r.c : x)), amount: '', log: pushLog([{ ...r.log, label: r.log.label + (src ? ' (' + src + ')' : '') }]) });
    },

    giveTemp(id, amt) {
      const c = get().combatants.find((x) => x.id === id);
      if (!c || !(amt > 0)) return;
      get().patchC(id, (x) => ({ temp: Math.max(x.temp || 0, amt) }), 'PG temporales');
      set({ amount: '', log: pushLog([{ label: c.name + ' gana PG temporales', detail: 'No se acumulan: se queda con el mayor', total: '+' + Math.max(c.temp || 0, amt) }]) });
    },

    toggleCond(id, k) {
      const s = get();
      const r = parseInt(s.condRounds, 10);
      const by = s.condBy && s.combatants.some((x) => x.id === s.condBy) ? s.condBy : id;
      get().patchC(id, (c) => {
        const has = c.conds.some((x) => x.k === k);
        return { conds: has ? c.conds.filter((x) => x.k !== k) : addCondition(c.conds, k, isNaN(r) || r <= 0 ? null : r, { at: s.condAt, by, activeId: s.started ? s.activeId : null, holderId: id }) };
      }, 'estado ' + k);
    },
    setExh(id, n) {
      const c = get().combatants.find((x) => x.id === id);
      if (!c) return;
      const r = setExhaustion(c, n);
      get().patchC(id, r.patch, 'agotamiento');
      if (r.log) set({ log: pushLog([r.log]) });
    },
    setUsed: (id, key, v, max) => get().patchC(id, (c) => ({ used: { ...c.used, [key]: Math.max(0, Math.min(max, v)) } }), 'usos'),
    setSpUsed: (id, key, v, max) => get().patchC(id, (c) => ({ spUsed: { ...c.spUsed, [key]: Math.max(0, Math.min(max, v)) } }), 'usos de conjuro'),
    setSpent: (id, key, v) => get().patchC(id, (c) => ({ spent: { ...c.spent, [key]: v } }), 'recarga'),

    useLeg(id, cost, name) {
      const c = get().combatants.find((x) => x.id === id);
      if (!c) return;
      if (c.laMax - c.laUsed < cost) { get().showToast(c.name + ' no tiene usos legendarios suficientes'); return; }
      get().snap('acción legendaria');
      set({ combatants: get().combatants.map((x) => (x.id === id ? { ...x, laUsed: x.laUsed + cost } : x)), log: pushLog([{ label: c.name + ' · acción legendaria', detail: name + (cost > 1 ? ' (cuesta ' + cost + ')' : ''), total: c.laMax - c.laUsed - cost + '/' + c.laMax }]) });
    },

    useLR(id) {
      const c = get().combatants.find((x) => x.id === id);
      if (!c) return;
      if (c.lrUsed >= c.lrMax) { get().showToast(c.name + ' ha gastado todas sus resistencias legendarias'); return; }
      get().snap('resistencia legendaria');
      set({ combatants: get().combatants.map((x) => (x.id === id ? { ...x, lrUsed: x.lrUsed + 1 } : x)), log: pushLog([{ label: c.name + ' · resistencia legendaria', detail: 'Convierte un fallo en éxito', total: c.lrMax - c.lrUsed - 1 + '/' + c.lrMax }]) });
    },

    deathMark(id, k) {
      get().patchC(id, (c) => {
        const d = { s: 0, f: 0, ...(c.death || {}) };
        d[k] = Math.min(3, d[k] + 1);
        const p: Partial<Combatant> = { death: d };
        if (d.s >= 3) p.stable = true;
        if (d.f >= 3) p.dead = true;
        return p;
      }, 'salvación de muerte');
    },

    rollDeath(id) {
      if (guard(() => get().rollDeath(id))) return;
      const c = get().combatants.find((x) => x.id === id);
      if (!c) return;
      get().snap('salvación de muerte');
      get().roll({
        label: 'Salvación de muerte · ' + c.name, kind: 'death', cid: id, noAdv: true, parts: [{ expr: '1d20' }],
        after: (total, nat) => {
          const cc = get().combatants.find((x) => x.id === id);
          if (!cc) return {};
          const r = resolveDeathSave(cc, total, nat);
          return { combatants: get().combatants.map((x) => (x.id === id ? { ...x, ...r.patch } : x)), resultNote: r.msg };
        },
      });
    },

    rollConc(p) {
      if (guard(() => get().rollConc(p))) return;
      get().snap('concentración');
      get().roll({
        label: 'Concentración · ' + p.name + ' (CD ' + p.dc + ')', kind: 'save', ability: 2, cid: p.id, parts: [{ expr: '1d20' + sgn(p.save || 0) }],
        after: (total) => {
          const ok = total >= p.dc;
          return {
            concPrompts: get().concPrompts.filter((x) => x.pid !== p.pid),
            combatants: ok ? get().combatants : get().combatants.map((x) => (x.id === p.id ? { ...x, conc: false } : x)),
            resultNote: ok ? 'Mantiene la concentración.' : 'Pierde la concentración.',
          };
        },
      });
    },

    resolveConc(p, keep) {
      get().snap('concentración');
      const s = get();
      set({
        concPrompts: s.concPrompts.filter((x) => x.pid !== p.pid),
        combatants: keep ? s.combatants : s.combatants.map((x) => (x.id === p.id ? { ...x, conc: false } : x)),
        log: pushLog([{ label: p.name + (keep ? ' mantiene' : ' pierde') + ' la concentración', detail: 'CD ' + p.dc, total: keep ? '✓' : '✗' }]),
      });
    },
  };
}
