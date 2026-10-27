import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PlayerData } from '../data/player';
import { offListSpells, sheetToCharacter, unknownSpells } from '../engine/characterImport';
import { readSheet, type SheetField } from '../engine/sheetImport';

const data = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/jugador_es.json'), 'utf8')) as PlayerData;
const spells = (JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/reglas_es.json'), 'utf8')).e as { id: string; n: string; en: string; cat: string }[])
  .filter((e) => e.cat === 'Conjuros').map((e) => ({ id: e.id, n: e.n, en: e.en }));
const F = (o: Record<string, string>): SheetField[] => Object.entries(o).map(([name, value]) => ({ name, value }));
const names = (ids: string[]) => ids.map((id) => spells.find((s) => s.id === id)!.n).sort();

describe('hoja exportada de D&D Beyond (campos details_*)', () => {
  // datos inventados con los nombres de campo de ese formato
  const fields = F({
    details_build: 'Level 5 High Elf Druid, Circle of the Moon', details_character_name: 'Lira', details_background: 'Hermit', details_armor_class: '15',
    details_equipped_armor: 'Leather', details_equipped_shield: 'Shield', details_hp_max: '38', details_initiative: '+2', details_passive_perception_total: '15',
    details_str_score: '10', details_dex_score: '14', details_con_score: '14', details_int_score: '12', details_wis_score: '17', details_cha_score: '8',
    details_wis_save_total: '+6', details_int_save_total: '+4', details_dex_save_total: '+2', details_perception_total: '+6', details_arcana_total: '+4',
    details_attack1_weapon: 'Spear',
    'spells_0:0_:Druid:1': 'Guidance', 'spells_1:0_:Druid:1': 'Cure Wounds', 'spells_1:1_:Druid:1': 'Faerie Fire', 'spells_1:2_:Druid:1': 'Entangle',
    'prepare_1:0_:Druid:1': 'Yes', 'prepare_1:1_:Druid:1': 'Yes', 'prepare_1:2_:Druid:1': 'Off',
    'spells_0:0_:Other Spells:2': 'Toll the Dead (High Elf)',
  });
  const sheet = readSheet(fields)!;
  const c = sheetToCharacter(fields, sheet, data, spells, 'lira.pdf');

  it('detecta la plantilla y lee clase, nivel, especie, subclase y características', () => {
    expect(sheet.template).toBe('ddb');
    expect([c.name, c.classId, c.level, c.subclass, c.speciesId]).toEqual(['Lira', 'druid', 5, 'Circle of the Moon', 'elf-high']);
    expect(c.abil.wis).toBe(17);
  });
  it('deduce competencias de los totales «details_*_total»', () => {
    expect(c.skills).toEqual(expect.arrayContaining(['prc', 'arc']));
    expect(c.saveExtra).toEqual([]);
  });
  it('arma, armadura y escudo salen de los campos de equipo', () => {
    expect(c.weapons.map((w) => w.name)).toEqual(['Lanza']);
    expect(c.armorId).toBe('phbarmLeatherArm');
    expect(c.shield).toBe(true);
  });
  it('solo los conjuros preparados y los trucos, no toda la lista de la clase', () => {
    expect(names(c.spells)).toEqual(['Curar heridas', 'Fuego feérico', 'Guía']);
    expect(unknownSpells(sheet, spells)).toEqual(['Toll the Dead']);
    expect(offListSpells(fields, sheet, data, spells)).toEqual([]);
  });
});

describe('hoja con casillas de competencia (campos en italiano)', () => {
  const fields = F({
    Nome: 'Aurelia', 'Classe e livello': 'Paladina la Redención 7', Razza: 'Aasimar',
    'Forza 1': '16', Destrezza: '10', Costituzione: '14', Intelligenza: '10', Saggezza: '12', Carisma: '18',
    'Forza atletica': 'On', 'Saggezza ts': 'On', 'Carisma ts': 'On', 'Carisma persuadere': 'On', 'Carisma intimidire': 'On', 'Destrezza furtività': 'On', 'Intelligenza storia': 'Off',
    'Classe armatura': '18', 'PUNTI FERITA TOTALI': '70', Percezione: '11', 'Movimento base': '30',
  });
  const sheet = readSheet(fields)!;
  const c = sheetToCharacter(fields, sheet, data, spells);

  it('separa clase y nivel de «Paladina la Redención 7»', () => {
    expect(sheet.template).toBe('italiana');
    expect([c.classId, c.level, c.subclass]).toEqual(['paladin', 7, 'Redención']);
    expect(sheet.hp).toBe('70');
    expect(sheet.pp).toBe('11');
  });
  it('toma las competencias de las casillas marcadas', () => {
    expect([...c.skills].sort()).toEqual(['ath', 'itm', 'per', 'ste']);
    expect(c.saveExtra).toEqual([]); // SAB y CAR ya son del paladín
  });
});

describe('hoja genérica en español', () => {
  const fields = F({
    NOMBRE: 'Fausto', CLASE: 'Paladín', ESPECIE: 'Mediano', NIVEL: '3', CA: '18', 'CA ESCUDO': 'Sí', ESCUDO: 'Sí', LIGERA: 'Sí', 'PG MAX': '35',
    STRscore: '18', DEXscore: '8', CONscore: '18', INTscore: '7', WISscore: '10', CHAscore: '15',
    'NOMBRE CONJURO.0': 'Castigo abrasador', 'NOMBRE CONJURO.1': 'Heroísmo', 'NOMBRE CONJURO.2': 'Conjuro Inventado',
    'ARMA.0': '- Martillo de guerra', DOTES: '- Duro: +2 PG por cada nivel',
  });
  const sheet = readSheet(fields)!;
  const c = sheetToCharacter(fields, sheet, data, spells);
  it('lee los nombres de conjuro y avisa de los que no reconoce', () => {
    expect(sheet.template).toBe('generica');
    expect(sheet.spellNames).toEqual(['Castigo abrasador', 'Heroísmo', 'Conjuro Inventado']);
    expect(unknownSpells(sheet, spells)).toEqual(['Conjuro Inventado']);
  });
  it('«Sí» en CA ESCUDO cuenta como escudo; las casillas de competencia con armaduras no', () => {
    expect(c.shield).toBe(true);
    const sin = F({ NOMBRE: 'X', CLASE: 'Paladín', NIVEL: '3', ESCUDO: 'Sí', LIGERA: 'Sí', MEDIA: 'Sí' });
    expect(sheetToCharacter(sin, readSheet(sin)!, data, spells).shield).toBe(false);
  });
});

describe('nombres de conjuro con marcas de la hoja', () => {
  it('quita « D», «/ On-Off» y separa los que comparten línea', () => {
    const fields = F({ Text1: 'x', Text13: '1', Text26: '0', Text29: '10', Text106: 'Searing Smite D', 'Text106.1': 'Mending / On-Off', 'Text106.2': 'Detect Magic / Identify D', 'Text106.3': 'Word of Radiance' });
    const sheet = readSheet(fields)!;
    expect(unknownSpells(sheet, [{ id: 'a', n: 'Detectar magia', en: 'Detect Magic' }]).sort()).toEqual(['Identify', 'Mending', 'Searing Smite', 'Word of Radiance']);
  });
});
