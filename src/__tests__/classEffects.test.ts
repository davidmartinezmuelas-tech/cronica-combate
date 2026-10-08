import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PlayerData } from '../data/player';
import { applyDamage } from '../engine/combat';
import { blankCharacter, derive, type Character } from '../engine/character';
import { rollParts } from '../engine/dice';
import type { Combatant } from '../data/types';

const data = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/jugador_es.json'), 'utf8')) as PlayerData;
const pj = (p: Partial<Character>): Character => ({ ...blankCharacter(), abil: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 16 }, ...p });

describe('rasgos de clase que cambian la hoja', () => {
  it('bárbaro: Sentir el peligro, Instinto feroz, Campeón primordial y Furia', () => {
    expect(derive(pj({ classId: 'barbarian', level: 1 }), data).saves.dex.adv).toBeUndefined();
    expect(derive(pj({ classId: 'barbarian', level: 2 }), data).saves.dex.adv).toBe('Sentir el peligro');
    expect(derive(pj({ classId: 'barbarian', level: 7 }), data).initAdv).toBe('Instinto feroz');
    const d20 = derive(pj({ classId: 'barbarian', level: 20 }), data);
    expect([d20.abil.str, d20.abil.con, d20.mods.str]).toEqual([20, 18, 5]);
    const raging = derive(pj({ classId: 'barbarian', level: 5, conds: ['Furia'] }), data);
    expect(raging.resist.map((x) => x.type)).toEqual(['contundente', 'cortante', 'perforante']);
    expect([raging.saves.str.adv, raging.checks.str.adv, raging.skills.ath.adv]).toEqual(['Furia', 'Furia', 'Furia']);
    expect(derive(pj({ classId: 'fighter', level: 5, conds: ['Furia'] }), data).resist).toEqual([]); // sin ser bárbaro no hay Furia
  });
  it('bardo: Aprendiz de todo suma la mitad de la competencia sin competencia (también a la iniciativa)', () => {
    const d = derive(pj({ classId: 'bard', level: 5, skills: ['prf'] }), data); // competencia +3 → +1
    expect(d.skills.ath.bonus).toBe(3 + 1);
    expect(d.skills.prf.bonus).toBe(3 + 3);
    expect(d.checks.int.bonus).toBe(0 + 1);
    expect(d.init).toBe(2 + 1);
  });
  it('paladín: Aura de protección suma el Carisma a todas las salvaciones', () => {
    const d = derive(pj({ classId: 'paladin', level: 6 }), data);
    expect(d.saves.dex.bonus).toBe(2 + 3);
    expect(d.saves.cha.bonus).toBe(3 + 3 + 3);
  });
  it('monje, pícaro, explorador y campeón', () => {
    expect(Object.values(derive(pj({ classId: 'monk', level: 14 }), data).saves).every((x) => x.prof)).toBe(true);
    const r = derive(pj({ classId: 'rogue', level: 15, skills: ['ste'] }), data);
    expect([r.skills.ste.min10, r.skills.ath.min10, r.saves.wis.prof, r.saves.cha.prof]).toEqual([true, undefined, true, true]);
    expect(derive(pj({ classId: 'ranger', level: 6 }), data).speed).toBe(40);
    const ch = derive(pj({ classId: 'fighter', level: 3, subclass: 'Campeón' }), data);
    expect([ch.initAdv, ch.skills.ath.adv]).toEqual(['Atleta notable', 'Atleta notable']);
  });
  it('resistencias elegidas: Resiliencia infernal', () => {
    const d = derive(pj({ classId: 'warlock', level: 10, subclass: 'Patrón infernal', choices: { 'fiend.resistance': ['fuego'] } }), data);
    expect(d.resist).toEqual([{ type: 'fuego', why: 'Resiliencia infernal' }]);
  });
  it('Talento fiable: un d20 bajo cuenta como 10', () => {
    const out = rollParts([{ expr: '1d20+5', minD20: 10 }], { kind: 'check', rng: () => 0 })!;
    expect([out.nat, out.total]).toEqual([1, 15]);
  });
  it('el máster aplica la resistencia de la Furia a un jugador', () => {
    const c = { id: 'p', kind: 'pc', name: 'Grosh', hp: 40, maxHp: 40, temp: 0, ac: 14, conds: [{ k: 'Furia', r: null }], res: [] } as unknown as Combatant;
    expect(applyDamage(c, null, [{ type: 'cortante', amt: 10 }], 1).total).toBe(5);
  });
});

describe('resistencias de especie', () => {
  it('enano, tiefling según su legado y dracónido según su ascendencia', () => {
    expect(derive(pj({ speciesId: 'dwarf' }), data).resist).toEqual([{ type: 'veneno', why: 'Resistencia enana' }]);
    expect(derive(pj({ speciesId: 'tiefling-chthonic' }), data).resist[0].type).toBe('necrótico');
    expect(derive(pj({ speciesId: 'dragonborn' }), data).resist).toEqual([]);
    expect(derive(pj({ speciesId: 'dragonborn', choices: { 'species.ancestry': ['Plata'] } }), data).resist).toEqual([{ type: 'frío', why: 'Resistencia dracónica' }]);
  });
});
