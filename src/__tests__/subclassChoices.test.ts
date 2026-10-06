import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PlayerData } from '../data/player';
import { blankCharacter, derive, type Character } from '../engine/character';
import { activeChoices, choiceCount, choiceOptions, CHOICES, optionItems, subclassSpellLevel, subclassSpells, subclassText } from '../engine/subclassChoices';

const data = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/jugador_es.json'), 'utf8')) as PlayerData;
const pj = (o: Partial<Character>): Character => ({ ...blankCharacter(), ...o });

// textos inventados con la forma del libro y del SRD
const BOOK_SECTION = 'Las opciones se presentan en orden alfabético.\n\nAlfa. Primera opción.\n\nBeta. Segunda opción.\n\nZeta corta. Sigue explicando la beta.\n\nGamma. Tercera opción.';
const SRD_FEATURE = 'Obtienes una de las siguientes opciones a tu elección.\n\n**Uno.** Texto uno.\n\n**Dos.** Texto dos.\n\nMás texto del dos sin nombre que lo abra, larguísimo y con comas, que no es otra opción.';

describe('elecciones de subclase', () => {
  it('opciones con nombre en los dos formatos; en un apartado alfabético, lo que rompe el orden es continuación', () => {
    expect(optionItems(BOOK_SECTION).map((o) => o.n)).toEqual(['Alfa', 'Beta', 'Gamma']);
    expect(optionItems(BOOK_SECTION)[1].d).toContain('Sigue explicando la beta.');
    const srd = optionItems(SRD_FEATURE);
    expect(srd.map((o) => o.n)).toEqual(['Uno', 'Dos']);
    expect(srd[1].d).toContain('sin nombre');
  });

  it('cuántas tocan por nivel y cuáles tiene según subclase (nombre del SRD, del libro o en inglés)', () => {
    const bm = CHOICES.find((d) => d.id === 'battle-master.maneuvers')!;
    expect([2, 3, 6, 7, 10, 15, 20].map((l) => choiceCount(bm, l))).toEqual([0, 3, 3, 5, 7, 9, 9]);
    expect(activeChoices({ classId: 'fighter', subclass: 'Maestro del Combate', level: 3 }).map((d) => d.id)).toEqual(['battle-master.maneuvers', 'battle-master.skill', 'battle-master.tool']);
    expect(activeChoices({ classId: 'fighter', subclass: 'Battle Master', level: 3 })).toHaveLength(3);
    expect(activeChoices({ classId: 'ranger', subclass: 'Cazador', level: 6 }).map((d) => d.id)).toEqual(['hunter.prey']);
    expect(activeChoices({ classId: 'ranger', subclass: 'Cazador', level: 7 }).map((d) => d.id)).toEqual(['hunter.prey', 'hunter.tactics']);
    expect(activeChoices({ classId: 'wizard', subclass: 'Cazador', level: 7 })).toEqual([]);
  });

  it('las opciones salen del rasgo del SRD (Cazador) o del apartado del libro (maniobras)', () => {
    const ranger = data.classes.find((k) => k.id === 'ranger')!;
    const prey = CHOICES.find((d) => d.id === 'hunter.prey')!;
    const opts = choiceOptions(prey, subclassText({ classId: 'ranger', subclass: ranger.sub!.n }, ranger, []), data, ranger);
    expect(opts.length).toBe(2);
    const fighter = data.classes.find((k) => k.id === 'fighter')!;
    const lib = [{ id: 'x', n: 'Maestro del combate', cls: 'fighter', d: '', f: [{ lv: 3, n: 'Algo', d: 'x' }], x: [{ n: 'Opciones de maniobras', d: BOOK_SECTION }] }];
    const man = choiceOptions(CHOICES[0], subclassText({ classId: 'fighter', subclass: 'Maestro del combate' }, fighter, lib), data, fighter);
    expect(man.map((o) => o.n)).toEqual(['Alfa', 'Beta', 'Gamma']);
  });

  it('las habilidades elegidas por la subclase dan competencia (solo con esa subclase y las que tocan)', () => {
    const base = { classId: 'bard', level: 3, choices: { 'lore.skills': ['arc', 'his', 'nat', 'rel'] } };
    const d = derive(pj({ ...base, subclass: 'Colegio del conocimiento' }), data);
    expect([d.skills.arc.prof, d.skills.his.prof, d.skills.nat.prof, d.skills.rel.prof]).toEqual([true, true, true, false]);
    expect(derive(pj({ ...base, subclass: 'Colegio de la danza' }), data).skills.arc.prof).toBe(false);
  });

  it('conjuros de subclase: nombres de la tabla, nivel según el del conjuro y el tipo de lanzador; terreno elegido', () => {
    expect([0, 1, 2, 3, 4, 5].map((l) => subclassSpellLevel(l, 'full'))).toEqual([3, 3, 3, 5, 7, 9]);
    expect([1, 2, 3, 4, 5].map((l) => subclassSpellLevel(l, 'half'))).toEqual([3, 5, 9, 13, 17]);
    const spells = [{ id: 'luz', n: 'Luz', l: 0 }, { id: 'luzdia', n: 'Luz del día', l: 3 }, { id: 'bola', n: 'Bola de fuego', l: 3 }, { id: 'escudo', n: 'Escudo', l: 1 }, { id: 'bend', n: 'Bendición', l: 1 }];
    const src = { f: [{ n: 'Conjuros del patrón', d: 'Siempre tendrás preparados los conjuros. CONJUROS Nivel de brujo Conjuros E Luz, escudo 5 Luz del día También cuentas con una bendición.' }], x: [] };
    const warlock = data.classes.find((k) => k.id === 'warlock')!;
    const at = (level: number) => subclassSpells({ classId: 'warlock', subclass: 'x', level }, warlock, src, spells).map((s) => s.id).sort();
    expect(at(3)).toEqual(['escudo', 'luz']);
    expect(at(5)).toEqual(['escudo', 'luz', 'luzdia']);
    const land = { f: [{ n: 'Conjuros del círculo', d: 'Tendrás preparados los conjuros. TERRENO ÁRIDO Nivel de druida 3 Escudo 5 Bola de fuego TERRENO POLAR Nivel de druida 3 Luz' }], x: [] };
    const druid = data.classes.find((k) => k.id === 'druid')!;
    const terr = (t: string) => subclassSpells({ classId: 'druid', subclass: 'x', level: 5, choices: { 'land.terrain': [t] } }, druid, land, spells).map((s) => s.id).sort();
    expect(terr('Árido')).toEqual(['bola', 'escudo']);
    expect(terr('Polar')).toEqual(['luz']);
    expect(subclassSpells({ classId: 'druid', subclass: 'x', level: 5 }, druid, land, spells)).toEqual([]);
  });
});

describe('opciones que se tiran en la mesa', () => {
  it('lo que hace cada opción sale de su texto (textos inventados)', async () => {
    const { optionAction, atLevel } = await import('../engine/subclassActions');
    const sk = data.skills;
    const a = optionAction('Cuando aciertes, gastas un dado. Suma el dado de supremacía a la tirada de daño del ataque. El objetivo deberá superar una tirada de salvación de Fuerza.', sk);
    expect([a.damage, a.save, a.checks]).toEqual([true, 'str', []]);
    // el daño lo suma otra criatura: solo se tira el dado
    expect(optionAction('Elige a un aliado. Esa criatura podrá atacar y sumar el dado a la tirada de daño del ataque.', sk).damage).toBe(false);
    const b = optionAction('Cuando hagas una prueba de Inteligencia (Historia o Investigación) o de Sabiduría (Perspicacia) o una tirada de iniciativa, súmalo.', sk);
    expect([b.checks, b.init]).toEqual([['his', 'inv', 'ins'], true]);
    expect(optionAction('Reduce el daño en el resultado más tu modificador por Fuerza o Destreza.', sk).plus).toBe('str-dex');
    expect([2, 3, 7, 10, 15, 18].map((l) => atLevel({ 3: 8, 10: 10, 18: 12 }, l))).toEqual([0, 8, 8, 10, 10, 12]);
  });
});
