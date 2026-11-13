import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PlayerData } from '../data/player';
import { blankCharacter, derive, type Character } from '../engine/character';
import { hitOptions } from '../modes/player/KitPanel';

const data = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/jugador_es.json'), 'utf8')) as PlayerData;
const lib = { subclasses: [] } as never;
const opts = (over: Partial<Character>, rage = false) => {
  const c = { ...blankCharacter(), level: 5, ...over } as Character;
  return hitOptions(c, derive(c, data), lib, rage);
};

describe('extras al impactar de las subclases (casillas en la ventana de daño del arma)', () => {
  it('Mano de aflicción: solo sin armas, con el dado de Artes marciales y gasta concentración', () => {
    const [o] = opts({ classId: 'monk', subclass: 'Guerrero de la misericordia' });
    expect([o.unarmed, o.type, o.expr.startsWith('1d8')]).toEqual([true, 'necrótico', true]);
    expect(o.pay({})).toEqual({ 'Concentración del monje': 1 });
    const [none] = opts({ classId: 'monk', subclass: 'Guerrero de la misericordia', uses: { 'Concentración del monje': 5 } });
    expect(none.why).toMatch(/sin/);
  });
  it('Furia divina y Strike piden Furia', () => {
    const [z] = opts({ classId: 'barbarian', subclass: 'Senda del fanático' });
    expect(z.why).toBe('requiere Furia');
    expect(opts({ classId: 'barbarian', subclass: 'Senda del fanático' }, true)[0].why).toBe('');
    expect(opts({ classId: 'barbarian', subclass: 'Path of the Spiritual Guardian' }, true)[0]).toMatchObject({ expr: '1d4', type: 'frío', why: '' });
  });
  it('Golpe psiónico: un dado del recurso más Inteligencia, y gasta uno', () => {
    const [o] = opts({ classId: 'fighter', subclass: 'Guerrero psiónico', abil: { ...blankCharacter().abil, int: 14 } });
    expect(o.expr).toBe('1d8+2');
    expect(o.pay({ 'Dados de energía psiónica': 1 })).toEqual({ 'Dados de energía psiónica': 2 });
  });
  it('Emboscador pavoroso: 2d6 y gasta un uso propio', () => {
    const [o] = opts({ classId: 'ranger', subclass: 'Acechador en la penumbra', abil: { ...blankCharacter().abil, wis: 14 } });
    expect([o.expr, o.type]).toEqual(['2d6', 'psíquico']);
    expect(Object.values(o.pay({})).reduce((a, b) => a + b, 0)).toBe(1);
  });
  it('Torment del Cazador de demonios: Chaos Strike 1d8 de fuego desde el nivel 7', () => {
    expect(opts({ classId: 'ranger', subclass: 'Demon Hunter', level: 6 })).toEqual([]);
    expect(opts({ classId: 'ranger', subclass: 'Demon Hunter', level: 7 })[0]).toMatchObject({ src: 'Chaos Strike', expr: '1d8', type: 'fuego' });
  });
});
