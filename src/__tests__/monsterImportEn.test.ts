import { describe, expect, it } from 'vitest';
import type { Line, TextItem } from '../engine/bookImport';
import { foldAbilityTable, parseMonstersEn, parseTypeLineEn } from '../engine/monsterImportEn';

const L = (...t: string[]): Line[] => t.map((s, i) => ({ t: s, col: 0, y: 1000 - i * 20 }));

describe('fichas de monstruo en inglés', () => {
  it('traduce tipo, tamaño y alineamiento', () => {
    expect(parseTypeLineEn('Large Undead (Elf, Vampire), Lawful Evil')).toEqual({ t: 'muerto viviente (Elf, Vampire)', sz: 'Grande', al: 'legal malvado' });
    expect(parseTypeLineEn('Gargantuan Or Huge Dragon, Neutral Evil')?.sz).toBe('Gargantuesco o Enorme');
    expect(parseTypeLineEn('Medium Swarm of Tiny Beasts, Unaligned')).toEqual({ t: 'enjambre de bestias diminutas', sz: 'Mediano', al: 'sin alineamiento' });
    expect(parseTypeLineEn('Some random sentence, with a comma')).toBeNull();
  });

  it('junta las filas sueltas de la tabla de características', () => {
    const it = (str: string, x: number, y: number): TextItem => ({ str, x, y });
    const out = foldAbilityTable([it('Str', 94, 745), it('22', 208, 750), it('+6', 326, 750), it('+13', 479, 750), it('Dex', 92, 713), it('18', 208, 718), it('+4', 326, 718), it('+4', 482, 718), it('Con', 91, 680), it('20', 207, 685), it('+5', 325, 685), it('+5', 480, 685), it('otro', 50, 400)]);
    expect(out.map((x) => x.str).sort()).toEqual(['STATS Con 20 +5 +5', 'STATS Dex 18 +4 +4', 'STATS Str 22 +6 +13', 'otro']);
  });

  it('lee una ficha completa', () => {
    const ms = parseMonstersEn(L(
      'Una historia sobre el vampiro.',
      'Blood-Queen Lana’thel',
      'Large Undead (Elf, Vampire), Lawful Evil',
      'AC 16 Initiative +18 (28)',
      'HP 315 (30d10 + 150)',
      'Speed 40 ft., Climb 40 ft., Fly 40 ft. hover',
      'STATS Str 22 +6 +13 STATS Dex 18 +4 +4 STATS Con 20 +5 +5',
      'STATS Int 19 +4 +4 STATS Wis 16 +3 +10 STATS Cha 23 +6 +13',
      'Skills Arcana +11, Perception +17',
      'Resistances Cold; Fire',
      'Immunities Necrotic; Charmed , Exhaustion',
      'Senses Blindsight 120 ft.; Passive Perception 27',
      'Languages Common, Orcish',
      'CR 23 (XP 50,000, or 62,000 in lair; PB +7)',
      'Traits',
      'Legendary Resistance (4/Day). If she fails a saving throw, she can choose to succeed instead.',
      'Actions',
      'Bloodthirsty Bite. Melee Attack Roll: +13, reach 10 ft. Hit: 15 (2d8 + 6) Slashing damage plus 9 (2d8) Necrotic damage. The',
      'target regains Hit Points.',
      'Terrify (Recharge 5–6). Wisdom Saving Throw: DC 21, each creature within 30 feet. Failure: 22 (4d10) Psychic damage. Success: Half damage.',
      'Spellcasting. She casts spells, using Charisma (spell save DC 21). At Will: Fear',
      'Legendary Actions',
      'Legendary Action Uses: 3. Immediately after another creature’s turn, she can take',
      'one of the following actions.',
      'Dominate Prey (Costs 2 Legendary Actions). She casts Dominate Monster.',
      'Darkfallen Blood Prince',
      'Otro texto.',
    ));
    expect(ms).toHaveLength(1);
    const m = ms[0];
    expect([m.n, m.sz, m.t, m.al, m.ac, m.hp, m.hd, m.ini, m.cr, m.xp, m.pb, m.lair, m.xpl]).toEqual(['Blood-Queen Lana’thel', 'Grande', 'muerto viviente (Elf, Vampire)', 'legal malvado', 16, 315, '30d10+150', 18, '23', 50000, 7, 1, 62000]);
    expect(m.spd).toBe('40 pies, trepar 40 pies, volar 40 pies (flotar)');
    expect(m.ab).toEqual([22, 18, 20, 19, 16, 23]);
    expect(m.sv).toEqual([13, 4, 5, 4, 10, 13]);
    expect(m.sk).toBe('Arcanos +11, Percepción +17');
    expect([m.res, m.imm, m.ci, m.sen, m.pp]).toEqual([['frío', 'fuego'], ['necrótico'], ['hechizado', 'agotamiento'], 'vista ciega 120 pies', 27]);
    expect(m.lr).toBe(4);
    expect(m.tr?.[0]).toMatchObject({ n: 'Legendary Resistance', day: 4, isLR: 1, en: 1 });
    expect(m.ac_?.[0]).toMatchObject({ n: 'Bloodthirsty Bite', atk: 13, dmg: [['2d8+6', 'cortante'], ['2d8', 'necrótico']] });
    expect(m.ac_?.[1]).toMatchObject({ n: 'Terrify', rc: 5, dc: [21, 'SAB'], half: 1 });
    expect(m.ac_?.[2].sp?.[0][1]).toBe('a voluntad');
    expect(m.lg?.map((f) => [f.n, f.cost])).toEqual([['Dominate Prey', 2]]);
    expect(m.la).toBe(3);
  });
});
