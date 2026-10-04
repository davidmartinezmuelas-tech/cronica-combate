import { describe, expect, it } from 'vitest';
import { avgOf, combineAdv, parseExpr, rollParts } from '../engine/dice';

const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('parseExpr', () => {
  it('lee fórmulas válidas', () => {
    expect(parseExpr('2d6+3')).toEqual({ groups: [{ n: 2, sides: 6, sign: 1 }], mod: 3 });
    expect(parseExpr('1d20 − 1')).toEqual({ groups: [{ n: 1, sides: 20, sign: 1 }], mod: -1 });
    expect(parseExpr('d8+1d4')).toEqual({ groups: [{ n: 1, sides: 8, sign: 1 }, { n: 1, sides: 4, sign: 1 }], mod: 0 });
  });
  it('rechaza basura', () => {
    ['', 'hola', '2d', '3+4', '1d1', '100d6', '2d6x'].forEach((x) => expect(parseExpr(x)).toBeNull());
  });
  it('calcula la media como el SRD', () => {
    expect(avgOf('2d6+3')).toBe(10);
    expect(avgOf('19d12+133')).toBe(256);
    expect(avgOf('17d6')).toBe(59);
  });
});

describe('rollParts', () => {
  it('ventaja se queda con el mayor y atenúa el otro', () => {
    const r = rollParts([{ expr: '1d20+5' }], { kind: 'attack', adv: 'adv', rng: seq([0.1, 0.9]) })!;
    expect(r.nat).toBe(19);
    expect(r.total).toBe(24);
    expect(r.dice.filter((d) => d.dim)).toHaveLength(1);
    expect(r.usedAdv).toBe(true);
  });
  it('el crítico duplica los dados, no el modificador', () => {
    const r = rollParts([{ expr: '2d6+4', type: 'cortante' }], { kind: 'damage', doubleDice: true, rng: seq([0]) })!;
    expect(r.dice).toHaveLength(4);
    expect(r.total).toBe(8);
  });
  it('agrupa el daño por tipo', () => {
    const r = rollParts([{ expr: '1d10+8', type: 'cortante' }, { expr: '2d4', type: 'fuego' }], { kind: 'damage', rng: seq([0.5]) })!;
    expect(r.byType.map((x) => x.type)).toEqual(['cortante', 'fuego']);
  });
  it('la ventaja nunca afecta al daño', () => {
    const r = rollParts([{ expr: '1d20' }], { kind: 'damage', adv: 'adv' })!;
    expect(r.dice).toHaveLength(1);
  });
  it('ventaja y desventaja se anulan', () => {
    expect(combineAdv('adv', false, true)).toBe('normal');
    expect(combineAdv('normal', false, true)).toBe('dis');
  });
});
