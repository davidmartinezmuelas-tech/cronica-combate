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
