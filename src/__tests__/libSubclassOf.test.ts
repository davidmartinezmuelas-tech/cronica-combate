import { describe, expect, it } from 'vitest';
import { libSubclassOf } from '../engine/characterImport';

const lib = [{ n: 'Ebon Blade', cls: 'paladin' }, { n: 'Path of the Berserker', cls: 'barbarian' }, { n: 'Fury', cls: 'warrior' }];

describe('subclase de la biblioteca que dice la hoja', () => {
  it('la reconoce por nombre, sin prefijo o con palabras de más', () => {
    expect(libSubclassOf('ebon blade', 'paladin', lib)).toBe('Ebon Blade');
    expect(libSubclassOf('Berserker', 'barbarian', lib)).toBe('Path of the Berserker');
    expect(libSubclassOf('Camino del Berserker', 'barbarian', lib)).toBe('Path of the Berserker');
    expect(libSubclassOf('Fury Warrior', 'warrior', lib)).toBe('Fury');
  });
  it('solo de la clase indicada y nada si no existe', () => {
    expect(libSubclassOf('Ebon Blade', 'fighter', lib)).toBe('');
    expect(libSubclassOf('Ebon Blade', '', lib)).toBe('Ebon Blade');
    expect(libSubclassOf('Otra cosa', 'paladin', lib)).toBe('');
  });
});

import { sameFeat } from '../engine/util';
describe('nombres de dote', () => {
  it('no distinguen plurales: la dote del libro no duplica la del SRD', () => {
    expect(sameFeat('Combate con armas a dos manos', 'Combate con arma a dos manos')).toBe(true);
    expect(sameFeat('Combate con dos armas', 'Combate con arma a dos manos')).toBe(false);
    expect(sameFeat('Duro', 'Duro')).toBe(true);
  });
});
