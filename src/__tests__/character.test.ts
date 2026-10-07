import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PlayerData } from '../data/player';
import { blankCharacter, derive, longRest, pactSlots, profBonus, spellSlots, usesMax, weaponFromData, type Character } from '../engine/character';

const data = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/jugador_es.json'), 'utf8')) as PlayerData;
const pj = (o: Partial<Character>): Character => ({ ...blankCharacter(), ...o });

describe('hoja de personaje: cálculos', () => {
  it('competencia por nivel y espacios de conjuro (completo, medio y pacto)', () => {
    expect([1, 4, 5, 9, 13, 17, 20].map(profBonus)).toEqual([2, 2, 3, 4, 5, 6, 6]);
    expect(spellSlots('full', 5)).toEqual([4, 3, 2]);
    expect(spellSlots('half', 1)).toEqual([2]);
    expect(spellSlots('half', 5)).toEqual([4, 2]);
    expect(spellSlots('none', 5)).toEqual([]);
    expect(pactSlots(1)).toEqual({ n: 1, lv: 1 });
    expect(pactSlots(5)).toEqual({ n: 2, lv: 3 });
    expect(pactSlots(11)).toEqual({ n: 3, lv: 5 });
  });

  it('guerrero de nivel 3: salvaciones, habilidades, CA con cota de malla y escudo, PG y ataque con espada larga', () => {
    const fighter = data.classes.find((c) => c.id === 'fighter')!;
    const chain = data.armor.find((a) => a.en === 'Chain Mail')!;
    const sword = data.weapons.find((w) => w.en === 'Longsword')!;
    const c = pj({ classId: 'fighter', speciesId: 'dwarf', level: 3, abil: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 }, skills: ['ath', 'prc'], armorId: chain.id, shield: true, weapons: [weaponFromData(sword, fighter)] });
    const d = derive(c, data);
    expect(d.pb).toBe(2);
    expect(d.saves.str).toEqual({ bonus: 5, prof: true });
    expect(d.saves.dex).toEqual({ bonus: 1, prof: false });
    expect(d.skills.ath.bonus).toBe(5);
    expect(d.pp).toBe(12);
    expect(d.ac).toBe(18); // 16 cota de malla (sin Destreza) + 2 escudo
    expect(d.hpMax).toBe(10 + 2 + 2 * (6 + 2) + 3); // 31 (con la Robustez enana)
    expect(d.speed).toBe(30);
    expect(d.attacks[0].atk).toBe(5);
    expect(d.attacks[0].dmg).toBe('1d8+3');
    expect(d.attacks[0].ver).toBe('1d10+3');
    expect(d.spell).toBeNull();
  });

  it('pícaro: estoque sutil con Destreza, pericia y CA de cuero; mago: CD y ataque de conjuro', () => {
    const rogue = data.classes.find((c) => c.id === 'rogue')!;
    const rapier = data.weapons.find((w) => w.en === 'Rapier')!;
    const leather = data.armor.find((a) => a.en === 'Leather Armor')!;
    const r = derive(pj({ classId: 'rogue', level: 1, abil: { str: 10, dex: 16, con: 12, int: 12, wis: 10, cha: 10 }, skills: ['ste'], expertise: ['ste'], armorId: leather.id, weapons: [weaponFromData(rapier, rogue)] }), data);
    expect(r.attacks[0].abil).toBe('dex');
    expect(r.attacks[0].atk).toBe(5);
    expect(r.skills.ste.bonus).toBe(7);
    expect(r.ac).toBe(14);
    const w = derive(pj({ classId: 'wizard', level: 5, abil: { str: 8, dex: 14, con: 12, int: 18, wis: 10, cha: 10 } }), data);
    expect(w.spell).toEqual({ abil: 'int', dc: 15, atk: 7 });
    expect(w.slots).toEqual([4, 3, 2]);
  });

  it('defensa sin armadura del bárbaro y del monje, y ajustes a mano', () => {
    expect(derive(pj({ classId: 'barbarian', abil: { str: 16, dex: 14, con: 16, int: 8, wis: 10, cha: 8 } }), data).ac).toBe(15);
    expect(derive(pj({ classId: 'monk', abil: { str: 10, dex: 16, con: 12, int: 10, wis: 14, cha: 8 } }), data).ac).toBe(15);
    const d = derive(pj({ classId: 'monk', ov: { ac: 20, hpMax: 50 } }), data);
    expect([d.ac, d.hpMax, d.acNote]).toEqual([20, 50, 'Ajustada a mano']);
  });

  it('usos de rasgos según su fórmula y descanso largo', () => {
    const fighter = data.classes.find((c) => c.id === 'fighter')!;
    const wind = fighter.f.find((f) => f.n === 'Segundo aliento')!;
    expect(usesMax(wind.u, pj({ level: 1 }), fighter)).toBe(2);
    expect(usesMax(wind.u, pj({ level: 4 }), fighter)).toBe(3);
    expect(usesMax({ max: '@prof', per: 'lr' }, pj({ level: 5 }), fighter)).toBe(3);
    expect(usesMax({ max: '@abilities.cha.mod', per: 'lr' }, pj({ abil: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 8 } }), fighter)).toBe(1);
    const c = pj({ classId: 'fighter', level: 3, hp: 4, hdSpent: 2, uses: { 'Segundo aliento': 2 }, exh: 2 });
    const r = longRest(c, derive(c, data));
    expect([r.hp, r.hdSpent, r.uses, r.exh]).toEqual([derive(c, data).hpMax, 0, {}, 1]);
  });
});

describe('dotes que se aplican solas', () => {
  const fighter = data.classes.find((c) => c.id === 'fighter')!;
  const W = (en: string) => weaponFromData(data.weapons.find((w) => w.en === en)!, fighter);
  const base = { classId: 'fighter', level: 5, abil: { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 10 } };

  it('Duelo +2 al daño a una mano (no a dos manos); Tiro con arco +2 al ataque a distancia; Arrojadizas al lanzar', () => {
    const d = derive(pj({ ...base, feats: ['Duelo', 'Tiro con arco', 'Combate con armas arrojadizas'], weapons: [W('Longsword'), W('Longbow'), W('Javelin')] }), data);
    const [sword, bow, jav] = d.attacks;
    expect([sword.dmg, sword.ver]).toEqual(['1d8+5', '1d10+3']);
    expect(sword.notes.join()).toContain('Duelo +2');
    expect([bow.atk, bow.dmg]).toEqual([2 + 3 + 2, '1d8+2']);
    expect(jav.throwParts[0].expr).toBe('1d6+5');
  });

  it('Combate con armas a dos manos (dados mínimo 3), Maestro en armas pesadas (+competencia), Defensa, Alerta, Duro y Veloz', async () => {
    const chain = data.armor.find((a) => a.en === 'Chain Mail')!;
    const plain = derive(pj({ ...base, armorId: chain.id, weapons: [W('Greatsword')] }), data);
    const d = derive(pj({ ...base, armorId: chain.id, weapons: [W('Greatsword'), W('Longsword')], feats: ['Combate con arma a dos manos', 'Maestro en armas pesadas', 'Defensa', 'Alerta', 'Duro', 'Veloz'] }), data);
    expect(d.attacks[0].dmg).toBe('2d6+6'); // +3 Fuerza +3 competencia
    expect(d.attacks[0].parts[0].min).toBe(3);
    expect(d.attacks[1].parts[0].min).toBeUndefined(); // a una mano no
    expect(d.attacks[1].verParts[0].min).toBe(3);
    expect(d.ac).toBe(plain.ac + 1);
    expect(d.init).toBe(plain.init + 3);
    expect(d.hpMax).toBe(plain.hpMax + 10);
    expect(d.speed).toBe(plain.speed + 10);
    const { rollParts } = await import('../engine/dice');
    const ones = rollParts([{ expr: '2d6', min: 3 }], { kind: 'damage', rng: () => 0 });
    expect(ones!.total).toBe(6);
  });
});

describe('dotes con botones propios', () => {
  const fighter = data.classes.find((c) => c.id === 'fighter')!;
  const W = (en: string) => weaponFromData(data.weapons.find((w) => w.en === en)!, fighter);
  const base = { classId: 'fighter', level: 5, abil: { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 10 } };

  it('ataque extra con arma ligera: sin modificador salvo Combate con dos armas; Combatiente con dos armas admite otras', () => {
    const two = [W('Shortsword'), W('Dagger')];
    expect(derive(pj({ ...base, weapons: two }), data).attacks.map((a) => a.offParts[0]?.expr)).toEqual(['1d6', '1d4']);
    expect(derive(pj({ ...base, weapons: two, feats: ['Combate con dos armas'] }), data).attacks[0].offParts[0].expr).toBe('1d6+3');
    expect(derive(pj({ ...base, weapons: [W('Shortsword')] }), data).attacks[0].offParts).toEqual([]); // hace falta otra
    const ls = [W('Dagger'), W('Longsword')];
    expect(derive(pj({ ...base, weapons: ls }), data).attacks[1].offParts).toEqual([]);
    expect(derive(pj({ ...base, weapons: ls, feats: ['Combatiente con dos armas'] }), data).attacks[1].offParts[0].expr).toBe('1d8');
  });

  it('otro extremo del arma de asta, ataque sin armas mejorado y tiradas especiales del dado', async () => {
    const d = derive(pj({ ...base, weapons: [W('Quarterstaff'), W('Halberd'), W('Longsword')], feats: ['Maestro en armas de asta', 'Matón de taberna', 'Combate sin armas'] }), data);
    expect(d.attacks.map((a) => a.poleParts[0]?.expr)).toEqual(['1d4+3', '1d4+3', undefined]);
    expect(d.unarmed!.parts[0]).toMatchObject({ expr: '1d6+3', reroll1: true });
    expect(d.unarmed!.free[0].expr).toBe('1d8+3');
    expect(derive(pj(base), data).unarmed).toBeNull();
    const { rollParts } = await import('../engine/dice');
    const seq = (xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };
    // d6: 0 -> 1, 0.99 -> 6. Repite el 1 una vez
    expect(rollParts([{ expr: '1d6', reroll1: true }], { kind: 'damage', rng: seq([0, 0.99]) })!.total).toBe(6);
    // dos veces y la mejor: [1,1] frente a [6,6]
    expect(rollParts([{ expr: '2d6+1', best2: true }], { kind: 'damage', rng: seq([0, 0, 0.99, 0.99]) })!.total).toBe(13);
  });
});

describe('Perforador, críticos y Duelo a una mano', () => {
  it('repite el dado más bajo si no llega a la mitad; el daño extra del crítico no se duplica', async () => {
    const { rollParts } = await import('../engine/dice');
    const seq = (xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };
    // 1d8: 0 -> 1, luego 0.99 -> 8
    expect(rollParts([{ expr: '1d8+2', rerollLow: true }], { kind: 'damage', rng: seq([0, 0.99]) })!.total).toBe(10);
    // un 8 no se repite
    expect(rollParts([{ expr: '1d8', rerollLow: true }], { kind: 'damage', rng: seq([0.99, 0]) })!.total).toBe(8);
    // crítico: 1d8 se duplica (2 dados), el 1d8 extra no (1 dado) -> 3 dados en total
    expect(rollParts([{ expr: '1d8', type: 'perforante' }, { expr: '1d8', type: 'perforante', noDouble: true }], { kind: 'damage', doubleDice: true, rng: () => 0 })!.dice).toHaveLength(3);
    // una parte solo numérica (Don del ataque imparable) se suma tal cual
    expect(rollParts([{ expr: '1d8' }, { expr: '15', noDouble: true }], { kind: 'damage', doubleDice: true, rng: () => 0.999 })!.total).toBe(31);
  });

  it('Duelo se puede quitar en un arma (no la usa a una mano sola)', () => {
    const fighter = data.classes.find((c) => c.id === 'fighter')!;
    const sword = weaponFromData(data.weapons.find((w) => w.en === 'Longsword')!, fighter);
    const base = { classId: 'fighter', level: 3, abil: { str: 16, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, feats: ['Duelo'] };
    expect(derive(pj({ ...base, weapons: [sword] }), data).attacks[0].dmg).toBe('1d8+5');
    expect(derive(pj({ ...base, weapons: [{ ...sword, duel: false }] }), data).attacks[0].dmg).toBe('1d8+3');
  });
});
