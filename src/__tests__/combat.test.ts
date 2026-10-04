import { describe, expect, it } from 'vitest';
import type { Combatant, Monster } from '../data/types';
import { applyDamage, applyHeal, encounterDifficulty, resolveDeathSave, rollModifiers, setExhaustion, sortCombatants, stepTurn, turnStart, uniqueName } from '../engine/combat';
import { useStore } from '../store/useStore';

const base = (o: Partial<Combatant>): Combatant => ({
  id: 'x', kind: 'monster', name: 'X', init: 10, initBonus: 0, hp: 20, maxHp: 20, temp: 0, ac: 12, conds: [], conc: false, exh: 0, react: false,
  lrMax: 0, lrUsed: 0, laMax: 0, laUsed: 0, used: {}, spent: {}, spUsed: {}, ...o,
});
const mon = (o: Partial<Monster> = {}): Monster => ({ id: 'm', n: 'M', sz: 'Mediano', t: 'bestia', al: '', ac: 12, hp: 20, hd: '3d8+6', ini: 0, spd: '30 pies', ab: [10, 10, 14, 10, 10, 10], sv: [0, 0, 2, 0, 0, 0], vul: [], res: [], imm: [], ci: [], pp: 10, cr: '1', xp: 200, pb: 2, ...o });

describe('orden y turnos', () => {
  it('ordena por iniciativa, desempata por bonificador y deja sin iniciativa al final', () => {
    const cs = [base({ id: 'a', name: 'A', init: 12, initBonus: 1 }), base({ id: 'b', name: 'B', init: null }), base({ id: 'c', name: 'C', init: 12, initBonus: 3 }), base({ id: 'd', name: 'D', init: 20 })];
    expect(sortCombatants(cs).map((c) => c.id)).toEqual(['d', 'c', 'a', 'b']);
  });
  it('salta derrotados y combatientes sin iniciativa; suma ronda al dar la vuelta', () => {
    const cs = [base({ id: 'a', init: 20 }), base({ id: 'b', init: 15, hp: 0 }), base({ id: 'c', init: null }), base({ id: 'd', init: 5 })];
    expect(stepTurn(cs, 'a', 1, 1)).toEqual({ id: 'd', round: 1 });
    expect(stepTurn(cs, 'd', 1, 1)).toEqual({ id: 'a', round: 2 });
  });
  it('si el activo fue derrotado, sigue con el siguiente en el orden', () => {
    const cs = [base({ id: 'a', init: 20 }), base({ id: 'b', init: 15, hp: 0 }), base({ id: 'd', init: 5 })];
    expect(stepTurn(cs, 'b', 1, 1)).toEqual({ id: 'd', round: 1 });
  });
  it('nombres únicos que continúan la numeración', () => {
    expect(uniqueName('Goblin', new Set(['Goblin 2', 'Goblin 3']))).toBe('Goblin 4');
    expect(uniqueName('Ogro (variante)', new Set(['Ogro (variante) 1']))).toBe('Ogro (variante) 2');
  });
});

describe('daño', () => {
  it('aplica inmunidad, resistencia y vulnerabilidad por tipo', () => {
    const m = mon({ imm: ['fuego'], res: ['cortante'], vul: ['contundente'] });
    const r = applyDamage(base({}), m, [{ type: 'fuego', amt: 10 }, { type: 'cortante', amt: 7 }, { type: 'contundente', amt: 3 }], 1);
    expect(r.total).toBe(0 + 3 + 6);
    expect(r.c.hp).toBe(11);
  });
  it('los PG temporales absorben primero', () => {
    const r = applyDamage(base({ temp: 5 }), null, [{ type: '', amt: 8 }], 1);
    expect(r.c.temp).toBe(0);
    expect(r.c.hp).toBe(17);
  });
  it('mitad redondea hacia abajo', () => {
    expect(applyDamage(base({}), null, [{ type: '', amt: 9 }], 0.5).c.hp).toBe(16);
  });
  it('pide salvación de concentración con CD máx(10, mitad)', () => {
    expect(applyDamage(base({ conc: true }), mon(), [{ type: '', amt: 30 }], 0.5).conc?.dc).toBe(10);
    expect(applyDamage(base({ conc: true, hp: 100, maxHp: 100 }), mon(), [{ type: '', amt: 46 }], 1).conc?.dc).toBe(23);
  });
  it('jugador: cae inconsciente, falla salvaciones al recibir daño y muere por daño masivo', () => {
    const pc = base({ kind: 'pc', hp: 10, maxHp: 30, death: { s: 0, f: 0 } });
    const down = applyDamage(pc, null, [{ type: '', amt: 12 }], 1).c;
    expect(down.hp).toBe(0);
    expect(down.conds.some((x) => x.k === 'Inconsciente')).toBe(true);
    expect(applyDamage(down, null, [{ type: '', amt: 1 }], 1, true).c.death?.f).toBe(2);
    expect(applyDamage(pc, null, [{ type: '', amt: 40 }], 1).c.dead).toBe(true);
  });
  it('curar a un jugador a 0 PG lo levanta y reinicia las salvaciones', () => {
    const r = applyHeal(base({ kind: 'pc', hp: 0, death: { s: 1, f: 2 }, conds: [{ k: 'Inconsciente', r: null }] }), 5);
    expect('c' in r && r.c.hp).toBe(5);
    expect('c' in r && r.c.conds).toEqual([]);
  });
});

describe('inicio de turno', () => {
  it('reinicia legendarias y reacción, descuenta estados y lista recargas gastadas', () => {
    const m = mon({ ac_: [{ n: 'Aliento', d: '', rc: 5 }] });
    const r = turnStart(base({ laMax: 3, laUsed: 2, react: true, conds: [{ k: 'Aturdido', r: 1 }, { k: 'Derribado', r: null }], spent: { ac_0: true } }), m);
    expect(r.c.laUsed).toBe(0);
    expect(r.c.react).toBe(false);
    expect(r.c.conds).toEqual([{ k: 'Derribado', r: null }]);
    expect(r.recharge).toEqual([{ key: 'ac_0', name: 'Aliento', min: 5 }]);
  });
});

describe('estados en las tiradas', () => {
  it('envenenado da desventaja en ataques y pruebas', () => {
    const c = base({ conds: [{ k: 'Envenenado', r: null }] });
    expect(rollModifiers(c, 'attack').dis).toBe(true);
    expect(rollModifiers(c, 'check').dis).toBe(true);
    expect(rollModifiers(c, 'save', 2).dis).toBe(false);
  });
  it('paralizado falla salvaciones de FUE y DES', () => {
    const c = base({ conds: [{ k: 'Paralizado', r: null }] });
    expect(rollModifiers(c, 'save', 1).autoFail).toBe(true);
    expect(rollModifiers(c, 'save', 4).autoFail).toBe(false);
  });
  it('agotamiento resta 2 por nivel a las tiradas d20', () => {
    expect(rollModifiers(base({ exh: 3 }), 'save', 0).flat).toBe(-6);
    expect(rollModifiers(base({ exh: 3 }), 'damage').flat).toBe(0);
  });
});

describe('salvaciones de muerte', () => {
  it('20 natural recupera 1 PG; 1 natural son dos fallos; tres éxitos estabilizan', () => {
    const pc = base({ kind: 'pc', hp: 0, death: { s: 2, f: 0 } });
    expect(resolveDeathSave(pc, 20, 20).patch.hp).toBe(1);
    expect(resolveDeathSave(pc, 1, 1).patch.death?.f).toBe(2);
    expect(resolveDeathSave(pc, 12, 12).patch.stable).toBe(true);
  });
});

describe('dificultad 2024', () => {
  it('usa el presupuesto de PX por nivel', () => {
    const m = mon({ xp: 1100 });
    const cs = [base({ kind: 'pc', level: 5 }), base({ kind: 'pc', id: 'p2', level: 5 }), base({ monsterId: 'm' })];
    const d = encounterDifficulty(cs, () => m);
    expect(d.budget).toEqual([1000, 1500, 2200]);
    expect(d.label).toBe('Baja');
  });
});

describe('correcciones de la auditoría', () => {
  it('Petrificado resiste el veneno en vez de ser inmune', () => {
    const r = applyDamage(base({ conds: [{ k: 'Petrificado', r: null }] }), null, [{ type: 'veneno', amt: 10 }], 1);
    expect(r.total).toBe(5);
  });
  it('resistencia y vulnerabilidad al mismo tipo se aplican las dos', () => {
    expect(applyDamage(base({}), mon({ res: ['fuego'], vul: ['fuego'] }), [{ type: 'fuego', amt: 7 }], 1).total).toBe(6);
  });
  it('jugador a 0 PG muere si recibe daño igual o mayor que sus PG máximos', () => {
    const pc = base({ kind: 'pc', hp: 0, maxHp: 20, death: { s: 0, f: 0 } });
    expect(applyDamage(pc, null, [{ type: '', amt: 20 }], 1).c.dead).toBe(true);
    expect(applyDamage(pc, null, [{ type: '', amt: 19 }], 1).c.dead).toBeFalsy();
  });
  it('el agotamiento también resta a las salvaciones de muerte', () => {
    expect(rollModifiers(base({ kind: 'pc', exh: 2 }), 'death').flat).toBe(-4);
  });
  it('agotamiento 6 mata', () => {
    expect(setExhaustion(base({ kind: 'pc' }), 6).patch.dead).toBe(true);
    expect(setExhaustion(base({}), 7).patch).toEqual({ exh: 6, hp: 0 });
    expect(setExhaustion(base({ kind: 'pc' }), 5).log).toBeNull();
  });
  it('quitar a quien está en turno pasa al siguiente, no vuelve al primero', () => {
    const cs = [base({ id: 'a', name: 'A', init: 20 }), base({ id: 'b', name: 'B', init: 15 }), base({ id: 'c', name: 'C', init: 10 })];
    useStore.setState({ combatants: cs, started: true, activeId: 'b', round: 2, undoStack: [] });
    useStore.getState().removeCombatant('b');
    const s = useStore.getState();
    expect(s.activeId).toBe('c');
    expect(s.round).toBe(2);
    expect(s.combatants.map((c) => c.id)).toEqual(['a', 'c']);
    s.undo();
    expect(useStore.getState().activeId).toBe('b');
  });
  it('quitar al último de la ronda empieza la siguiente', () => {
    const cs = [base({ id: 'a', name: 'A', init: 20 }), base({ id: 'c', name: 'C', init: 10 })];
    useStore.setState({ combatants: cs, started: true, activeId: 'c', round: 1, undoStack: [] });
    useStore.getState().removeCombatant('c');
    expect(useStore.getState().activeId).toBe('a');
    expect(useStore.getState().round).toBe(2);
  });
});
