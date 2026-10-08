import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PlayerData } from '../data/player';
import { derive } from '../engine/character';
import { offListSpells, sheetToCharacter } from '../engine/characterImport';
import { readSheet, splitClasses, type SheetField } from '../engine/sheetImport';

const data = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/jugador_es.json'), 'utf8')) as PlayerData;
const spells = (JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/reglas_es.json'), 'utf8')).e as { id: string; n: string; en: string; cat: string }[])
  .filter((e) => e.cat === 'Conjuros').map((e) => ({ id: e.id, n: e.n, en: e.en }));
const F = (o: Record<string, string>): SheetField[] => Object.entries(o).map(([name, value]) => ({ name, value }));

describe('importar la hoja PDF a un personaje', () => {
  // datos inventados con los mismos nombres de campo que una hoja FIFTHEDITION en inglés
  const fields = F({
    Name: 'Draxx', Background: 'Soldier', Class: 'Paladin', Species: 'Dragonborn', Subclass: 'Oath of Devotion', Level: '3', AC: '18', 'Max HP': '32',
    'STR SORE': '16', 'DEX SCORE': '14', 'CON SCORE': '14', 'INT SCORE': '11', 'WIS SCORE': '12', 'CHA SCORE': '17',
    'STR SAVE': '+3', 'CHA SAVE': '+5', 'WIS SAVE1': '+3', ATHLETICS: '+5', INSIGHT: '+3', INTIMIDATION: '+5', PERSUASION: '+5', STEALTH: '+2',
    'WEAPON NAME 1': 'Shortsword', 'Armor Worn1': 'Chain mail', 'CB-Shield': 'Yes',
    FEATS: 'Protection (Fighting Style)\nWhen a creature you can see attacks a target other than you…', FEATS0: 'Savage Attacker (soldier)\nYou have trained…',
    'Text Field2': 'Divine Smite S/P', 'Text Field10': 'Bless', 'Text Field11': 'Shield',
    'CLASS FEATURES 1': 'Level 1: Lay On Hands\nYour blessed touch can heal wounds.',
  });

  it('reconoce clase, subclase, especie, trasfondo y características', () => {
    const c = sheetToCharacter(fields, readSheet(fields)!, data, spells);
    expect([c.name, c.classId, c.level, c.subclass, c.speciesId, c.backgroundId]).toEqual(['Draxx', 'paladin', 3, 'Juramento de devoción', 'dragonborn', 'soldier']);
    expect(c.abil).toEqual({ str: 16, dex: 14, con: 14, int: 11, wis: 12, cha: 17 });
  });

  it('deduce las competencias de los bonificadores y respeta lo que no se puede calcular', () => {
    const c = sheetToCharacter(fields, readSheet(fields)!, data, spells);
    expect([...c.skills].sort()).toEqual(['ath', 'ins', 'itm', 'per']);
    expect(c.saveExtra).toEqual([]); // SAB y CAR ya son del paladín
    const d = derive(c, data);
    expect(d.ac).toBe(18); // cota de malla + escudo, como en la hoja
    expect(c.ov.ac).toBeUndefined();
    expect(d.hpMax).toBe(32);
  });

  it('armas, armadura, conjuros de su lista (no el conjuro Escudo) y dotes', () => {
    const c = sheetToCharacter(fields, readSheet(fields)!, data, spells);
    expect(c.weapons.map((w) => w.name)).toEqual(['Espada corta']);
    expect(c.armorId).toBe('phbarmChainMail0');
    expect(c.shield).toBe(true);
    expect(c.spells.map((id) => spells.find((s) => s.id === id)!.n).sort()).toEqual(['Bendición', 'Castigo Divino']);
    expect(c.feats).toContain('Atacante salvaje');
    expect(c.customFeats.map((f) => [f.cat, f.n])).toEqual([['fighting-style', 'Protection']]);
  });
});

describe('importar una hoja con multiclase', () => {
  it('separa las clases del campo de clase en varios formatos', () => {
    expect(splitClasses('Paladin 3 / Warlock 5')).toEqual([{ cls: 'Paladín', level: 3, sub: '' }, { cls: 'Brujo', level: 5, sub: '' }]);
    expect(splitClasses('Guerrero 2, Pícaro 3 (Ladrón)')).toEqual([{ cls: 'Guerrero', level: 2, sub: '' }, { cls: 'Pícaro', level: 3, sub: 'Ladrón' }]);
    expect(splitClasses('Fighter 3')).toEqual([]);
    expect(splitClasses('Paladín / Brujo')).toEqual([]);
  });
  it('la primera clase es la principal, las demás van a multiclase y la competencia es por nivel total', () => {
    const f = F({ Name: 'Vex', Class: 'Paladin 3 / Warlock 5', AC: '16', 'Max HP': '60', 'STR SORE': '14', 'CHA SCORE': '16', 'CHA SAVE': '+6', ATHLETICS: '+5' });
    const sheet = readSheet(f)!;
    expect(sheet.cls).toBe('Paladín 3 / Brujo 5');
    expect(sheet.level).toBe('8');
    const c = sheetToCharacter(f, sheet, data, spells);
    expect([c.classId, c.level]).toEqual(['paladin', 3]);
    expect(c.multi).toEqual([{ classId: 'warlock', className: '', level: 5, subclass: 'Patrón infernal' }]);
    expect(c.skills).toContain('ath'); // +5 = FUE +2 y competencia +3 (nivel total 8)
    expect(derive(c, data).pb).toBe(3);
  });
});

describe('conjuros al importar', () => {
  const f = F({ Name: 'Vex', Class: 'Paladin', Level: '5', 'Text Field10': 'Bless, Fire Bolt, Rayo inventado', 'Armor Worn1': 'Shield' });
  const lib = [...spells, { id: 'lib-rayo', n: 'Rayo inventado', en: '', classes: ['paladin'] }];
  it('reconoce los de la biblioteca de su clase y deja aparte los de fuera de su lista', () => {
    const sheet = readSheet(f)!;
    const c = sheetToCharacter(f, sheet, data, lib);
    const names = c.spells.map((id) => lib.find((s) => s.id === id)!.n);
    expect(names).toContain('Bendición');
    expect(names).toContain('Rayo inventado');
    expect(names).not.toContain('Descarga de fuego');
    expect(offListSpells(f, sheet, data, lib).map((s) => s.n)).toEqual(['Descarga de fuego']); // el escudo del equipo no se propone
  });
});
