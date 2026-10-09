import { describe, expect, it } from 'vitest';
import { assignSpells, classMaxSpell, type CasterPrep } from '../engine/spellPrep';

describe('conjuros preparados en multiclase', () => {
  it('nivel de conjuro por tipo de lanzador (2024)', () => {
    expect([1, 3, 5].map((l) => classMaxSpell('full', l))).toEqual([1, 2, 3]);
    expect([1, 3, 5, 9, 17].map((l) => classMaxSpell('half', l))).toEqual([1, 1, 2, 3, 5]);
    expect(classMaxSpell('pact', 5)).toBe(3);
    expect(classMaxSpell('none', 5)).toBe(0);
  });
  it('reparte por listas: lo exclusivo primero y lo compartido donde quede hueco', () => {
    const prep = (id: string, prepared: number, cantrips: number | null, list: string[], maxLv: number): CasterPrep => ({ id, n: id, level: 5, maxLv, cantrips, prepared, list: new Set(list) });
    const pal = prep('paladin', 1, null, ['bless', 'shared', 'smite'], 1);
    const war = prep('warlock', 2, 2, ['hex', 'shared', 'blast'], 3);
    const lv: Record<string, number> = { bless: 1, shared: 1, smite: 1, hex: 1, blast: 0, odd: 2 };
    const r = assignSpells(['shared', 'bless', 'hex', 'blast', 'smite', 'odd'], [pal, war], (id) => lv[id], new Set(['smite']));
    expect(r.byClass.paladin).toEqual({ cantrips: [], spells: ['bless'] });
    expect(r.byClass.warlock).toEqual({ cantrips: ['blast'], spells: ['hex', 'shared'] });
    expect(r.other).toEqual(['odd']);
  });
});
