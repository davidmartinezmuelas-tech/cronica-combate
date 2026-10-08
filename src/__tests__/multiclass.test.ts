import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PlayerData } from '../data/player';
import { blankCharacter, classEntries, derive, longRest, totalLevel, type Character } from '../engine/character';

const data = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/jugador_es.json'), 'utf8')) as PlayerData;
const pj = (p: Partial<Character>): Character => ({ ...blankCharacter(), abil: { str: 14, dex: 12, con: 14, int: 13, wis: 13, cha: 16 }, ...p });

describe('multiclase', () => {
  it('nivel total, competencia, PG con el dado de cada clase y dados de golpe por tipo', () => {
    const c = pj({ classId: 'paladin', level: 5, multi: [{ classId: 'warlock', className: '', level: 3, subclass: '' }] });
    const d = derive(c, data);
    expect(totalLevel(c)).toBe(8);
    expect(d.level).toBe(8);
    expect(d.pb).toBe(3);
    // paladín d10: 10+2 y 4×(6+2); brujo d8: 3×(5+2)
    expect(d.hpMax).toBe(12 + 32 + 21);
    expect(d.hitDice).toEqual([{ die: 10, n: 5 }, { die: 8, n: 3 }]);
    // salvaciones solo de la primera clase (paladín: Sabiduría y Carisma)
    expect(d.saves.wis.prof && d.saves.cha.prof && !d.saves.int.prof).toBe(true);
    // un solo lanzador de espacios (paladín 5) más el pacto del brujo 3
    expect(d.slots).toEqual([4, 2]);
    expect(d.pact).toEqual({ n: 2, lv: 2 });
    expect(d.casters.map((x) => x.classId)).toEqual(['paladin', 'warlock']);
    expect(classEntries(c).map((e) => e.classId)).toEqual(['paladin', 'warlock']);
  });
  it('espacios combinados: completos + mitad (arriba) + tercio (abajo)', () => {
    expect(derive(pj({ classId: 'wizard', level: 5, multi: [{ classId: 'cleric', className: '', level: 3, subclass: '' }] }), data).slots).toEqual([4, 3, 3, 2]); // nivel 8
    expect(derive(pj({ classId: 'fighter', level: 6, subclass: 'Caballero arcano', multi: [{ classId: 'wizard', className: '', level: 2, subclass: '' }] }), data).slots).toEqual([4, 3]); // 2 + 2
    expect(derive(pj({ classId: 'paladin', level: 3, multi: [{ classId: 'sorcerer', className: '', level: 1, subclass: '' }] }), data).slots).toEqual([4, 2]); // 2 + 1 = nivel 3
  });
  it('las tablas de cada clase van con su nivel y la defensa sin armadura no se suma', () => {
    const d = derive(pj({ classId: 'fighter', level: 2, multi: [{ classId: 'rogue', className: '', level: 3, subclass: '' }, { classId: 'barbarian', className: '', level: 1, subclass: '' }] }), data);
    expect(String(d.scale('rogue.sneak-attack'))).toMatch(/2d6/);
    expect(d.acNote).toBe('Defensa sin armadura');
    expect(d.ac).toBe(10 + 1 + 2);
  });
  it('el descanso largo recupera también los dados de golpe por tipo', () => {
    const c = pj({ classId: 'paladin', level: 5, multi: [{ classId: 'warlock', className: '', level: 3, subclass: '' }], hdSpent: 3, hdUsed: { 10: 2, 8: 1 } });
    const r = longRest(c, derive(c, data));
    expect(r.hdSpent).toBe(0);
    expect(r.hdUsed).toEqual({});
  });
});

describe('PG tirados al subir de nivel', () => {
  it('sustituyen a la media en ese nivel (con la Constitución) y sin tiradas todo sigue igual', () => {
    const base = pj({ classId: 'fighter', level: 3 }); // d10, CON 14 (+2): 12 + 2×8
    expect(derive(base, data).hpMax).toBe(28);
    expect(derive({ ...base, hpRolls: { 'fighter:2': 10, 'fighter:3': 1 } }, data).hpMax).toBe(12 + 12 + 3);
  });
});
