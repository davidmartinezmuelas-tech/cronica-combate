import { describe, expect, it } from 'vitest';
import { unknownSpells, type SpellRef } from '../engine/characterImport';
import { libSpellEn } from '../engine/spellNames';
import { norm } from '../engine/util';
import type { SheetData } from '../engine/sheetImport';

describe('nombres en inglés de los conjuros del libro', () => {
  const srdEn = new Set([norm('Bless')]);
  it('los del Manual se reconocen con el nombre inglés de la hoja', () => {
    const lib: SpellRef[] = ['Palabra de resplandor', 'Tañido por los muertos', 'Arma elemental', 'Propio'].map((n, i) => ({ id: 'x' + i, n, en: libSpellEn(n, srdEn) }));
    const sheet = { spellNames: ['Word of Radiance', 'Toll the Dead', 'Elemental Weapon', 'Haywire'] } as SheetData;
    expect(unknownSpells(sheet, lib)).toEqual(['Haywire']);
  });
  it('no repite un conjuro que el SRD ya reconoce en inglés', () => {
    expect(libSpellEn('Perdición', new Set([norm('Bane')]))).toBe('');
    expect(libSpellEn('Perdición', srdEn)).toBe('Bane');
    expect(libSpellEn('Algo propio', srdEn)).toBe('');
  });
});

import { isSrdTwin } from '../engine/spellNames';
describe('conjuros del libro que son el mismo que uno del SRD', () => {
  const srdEn = new Set(['Acid Arrow', 'Arcane Hand', 'Faithful Hound'].map(norm));
  it('con el nombre de mago de por medio o con el nombre cambiado', () => {
    expect(isSrdTwin('Flecha ácida de Melf', srdEn)).toBe(true);
    expect(isSrdTwin('Mano de Bigby', srdEn)).toBe(true);
    expect(isSrdTwin('Mastín fiel de Mordenkainen', srdEn)).toBe(true);
  });
  it('no confunde un conjuro que el SRD no tiene', () => {
    expect(isSrdTwin('Palabra de resplandor', srdEn)).toBe(false);
    expect(isSrdTwin('Algo propio', srdEn)).toBe(false);
  });
});
