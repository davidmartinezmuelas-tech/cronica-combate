import { describe, expect, it } from 'vitest';
import { classToEs, extrasLine, findResistances, readSheet, type SheetField } from '../engine/sheetImport';

// Datos inventados con la misma estructura de campos que las hojas reales
const F = (o: Record<string, string>): SheetField[] => Object.entries(o).map(([name, value]) => ({ name, value }));

describe('leer la hoja de personaje', () => {
  it('hoja oficial rellenable de 2024 (campos Text1, Text13…)', () => {
    const d = readSheet(F({
      Text1: 'Aria Velo', 'Check Box3': 'Yes', Text6: 'Acólita', Text7: 'Clérigo', Text8: 'Elfa', Text9: 'Dominio de la Vida', Text11: '4',
      Text12: '0', Text13: '18', Text14: '25', Text16: '31', Text26: '+1', Text27: '9 m', Text28: 'M', Text29: '14', Text98: 'Común, Élfico',
      Text57: 'Linaje élfico', Text58: 'Iniciado en la magia',
    }))!;
    expect(d.template).toBe('oficial-2024');
    expect([d.name, d.cls, d.level, d.ac, d.hp, d.initb, d.pp]).toEqual(['Aria Velo', 'Clérigo 4', '4', '18', '31', '1', '14']);
    expect(extrasLine(d)).toBe('Especie: Elfa · Subclase: Dominio de la Vida · Trasfondo: Acólita · Velocidad: 9 m · Tamaño: M · Idiomas: Común, Élfico');
  });

  it('hoja FIFTHEDITION: nombres en inglés, clase traducida, pasiva calculada y resistencias de los rasgos', () => {
    const d = readSheet(F({
      Name: 'Draxx', Background: 'Soldier', Class: 'Paladin', Species: 'Dragonborn', Subclass: 'Oath of Devotion', Level: '3', AC: '18',
      'Current HP': '', 'Max HP': '32', INIT: '+2', PERCEPTION: '+1', SPEED: '30', LANGUAGES: 'Common, Draconic', Size: 'medium', Darkvision: '60ft',
      TRAITS: 'Damage Resistance. You have resistance to acid damage.\r\nBreath Weapon.',
    }))!;
    expect(d.template).toBe('fifthedition');
    expect([d.name, d.cls, d.ac, d.hp, d.initb, d.pp]).toEqual(['Draxx', 'Paladín 3', '18', '32', '2', '11']);
    expect(d.res).toEqual(['ácido']);
    expect(d.extras.find((e) => e.label === 'Velocidad')?.value).toBe('30 pies');
  });

  it('hoja de 2014 con «clase y nivel» en un solo campo', () => {
    const d = readSheet(F({ CharacterName: 'Bim', ClassLevel: 'Rogue 5', AC: '15', HPMax: '33', Initiative: '+4', Passive: '15' }))!;
    expect([d.template, d.cls, d.level, d.initb, d.pp]).toEqual(['generica', 'Pícaro 5', '5', '4', '15']);
  });

  it('una hoja sin datos no devuelve nada', () => {
    expect(readSheet(F({ Text1: '', Text13: '', Text26: '', Text29: '' }))).toBeNull();
    expect(readSheet([])).toBeNull();
  });

  it('clases y resistencias', () => {
    expect(classToEs('Fighter / Wizard')).toBe('Guerrero / Mago');
    expect(findResistances('Tienes resistencia al daño de fuego y frío.')).toEqual(['fuego', 'frío']);
    expect(findResistances('Resistance to cold, lightning, and poison damage')).toEqual(['frío', 'relámpago', 'veneno']);
    expect(findResistances('No resistances here')).toEqual([]);
  });
});
