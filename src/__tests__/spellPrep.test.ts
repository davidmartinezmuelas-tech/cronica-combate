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

describe('efectos de conjuros activos en la hoja', () => {
  it('Escudo de fe y Armadura de mago cambian la CA; Auxilio los PG máximos; Acelerar la velocidad; con concentración solo mientras dura', async () => {
    const { spellFx, liveEffects } = await import('../engine/spellEffects');
    expect(spellFx({ en: 'Shield of Faith', n: 'Escudo de fe' })?.fx.ac?.add).toBe(2);
    expect(spellFx({ n: 'Armadura de Agathys' })?.fx.temp?.(2, { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 })).toBe('10');
    expect(spellFx({ en: 'False Life', n: 'Falsa vida' })?.fx.temp?.(3, { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 })).toBe('2d4+14');
    expect(spellFx({ en: 'Aid', n: 'Auxilio' })?.fx.hpMax?.(3)).toBe(10);
    expect(spellFx({ en: 'Fireball', n: 'Bola de fuego' })).toBeNull();
    const act = [{ k: 'Shield of Faith', n: 'Escudo de fe', lv: 1, conc: true, at: 1 }, { k: 'Aid', n: 'Auxilio', lv: 2, at: 2 }];
    expect(liveEffects(act, ['Concentración: Escudo de fe']).map((e) => e.k)).toEqual(['Shield of Faith', 'Aid']);
    expect(liveEffects(act, ['Concentración: Bendición']).map((e) => e.k)).toEqual(['Aid']);
  });
});

describe('conjuros de especie: característica para lanzarlos', () => {
  it('la elegida; sin elegir, la más alta entre Inteligencia, Sabiduría y Carisma', async () => {
    const { grantedSpells } = await import('../engine/grantedSpells');
    const { blankCharacter } = await import('../engine/character');
    const list = [{ id: 'fb', en: 'Fire Bolt' }, { id: 'th', en: 'Thaumaturgy' }];
    const mods = { str: 0, dex: 0, con: 0, int: -1, wis: 3, cha: 2 };
    const c = { ...blankCharacter(), speciesId: 'tiefling-infernal', level: 1 };
    expect(grantedSpells(c, list, mods).map((g) => g.abil)).toEqual(['wis', 'wis']);
    const chose = { ...c, choices: { 'species.abil': ['cha'] } };
    expect(grantedSpells(chose, list, mods).map((g) => g.abil)).toEqual(['cha', 'cha']);
  });
});
