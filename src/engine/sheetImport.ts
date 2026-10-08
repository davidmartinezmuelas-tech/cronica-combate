import { DMG_TYPES } from '../data/constants';
import { norm } from './util';

/** Un campo de formulario de la hoja: nombre y valor (las casillas marcadas valen «Yes»/«On»). */
export interface SheetField {
  name: string;
  value: string;
}

export type SheetTemplate = 'oficial-2024' | 'fifthedition' | 'generica';

export interface SheetData {
  template: SheetTemplate;
  name: string;
  cls: string; // «Paladín 3» o, con multiclase, «Paladín 3 / Brujo 5»
  level: string; // nivel total
  classes?: { cls: string; level: number; sub: string }[]; // multiclase: cada clase con su nivel (y subclase si la escribe)
  ac: string;
  hp: string;
  initb: string; // sin signo «+»: «2», «-1»
  pp: string;
  res: string[]; // tipos de daño en español
  extras: { label: string; value: string }[]; // especie, subclase, trasfondo… (para las notas)
  abil: Partial<Record<AbilKey, number>>; // puntuaciones de característica
  saveBonus: Partial<Record<AbilKey, number>>; // bonificadores de salvación escritos en la hoja
  skillBonus: Record<string, number>; // bonificadores de habilidad (claves acr, ath…)
}

type AbilKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
const ABIL_KEYS: AbilKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

/** Hoja oficial de 2024: puntuaciones, salvaciones y habilidades (comprobado por la posición de cada campo). */
const OFICIAL_ABIL: Record<AbilKey, string> = { str: 'Text64', dex: 'Text66', con: 'Text67', int: 'Text63', wis: 'Text65', cha: 'Text68' };
const OFICIAL_SAVE: Record<AbilKey, string> = { str: 'Text91', dex: 'Text87', con: 'Text86', int: 'Text69', wis: 'Text75', cha: 'Text81' };
const OFICIAL_SKILL: Record<string, string> = {
  ath: 'Text92', acr: 'Text88', slt: 'Text89', ste: 'Text90', arc: 'Text70', his: 'Text71', inv: 'Text72', nat: 'Text73', rel: 'Text74',
  ani: 'Text76', ins: 'Text77', med: 'Text78', prc: 'Text79', sur: 'Text80', dec: 'Text82', itm: 'Text83', prf: 'Text84', per: 'Text85',
};
/** Otras hojas: nombres de campo en inglés o en español (normalizados, sin espacios). */
const ABIL_SYN: Record<AbilKey, string[]> = {
  str: ['strscore', 'strsore', 'strength', 'strengthscore', 'str', 'fuerza', 'fue'],
  dex: ['dexscore', 'dexterity', 'dexterityscore', 'dex', 'destreza', 'des'],
  con: ['conscore', 'constitution', 'constitutionscore', 'con', 'constitucion'],
  int: ['intscore', 'intelligence', 'intelligencescore', 'int', 'inteligencia'],
  wis: ['wisscore', 'wisdom', 'wisdomscore', 'wis', 'sabiduria', 'sab'],
  cha: ['chascore', 'charisma', 'charismascore', 'cha', 'carisma', 'car'],
};
const SAVE_SYN: Record<AbilKey, string[]> = {
  str: ['strsave', 'stsstrength', 'strsavingthrow', 'salvacionfuerza'], dex: ['dexsave', 'stdexterity', 'dexsavingthrow', 'salvaciondestreza'],
  con: ['consave', 'stconstitution', 'consavingthrow', 'salvacionconstitucion'], int: ['intsave', 'stintelligence', 'intsavingthrow', 'salvacioninteligencia'],
  wis: ['wissave', 'wissave1', 'stwisdom', 'wissavingthrow', 'salvacionsabiduria'], cha: ['chasave', 'stcharisma', 'chasavingthrow', 'salvacioncarisma'],
};
const SKILL_SYN: Record<string, string[]> = {
  acr: ['acrobatics', 'acrobacias'], ani: ['animalhandling', 'tratoconanimales'], arc: ['arcana', 'conocimientoarcano'], ath: ['athletics', 'atletismo'],
  dec: ['deception', 'engano'], his: ['history', 'historia'], ins: ['insight', 'perspicacia'], itm: ['intimidation', 'intimidacion'],
  inv: ['investigation', 'investigacion'], med: ['medicine', 'medicina'], nat: ['nature', 'naturaleza'], prc: ['perception', 'percepcion'],
  prf: ['performance', 'interpretacion'], per: ['persuasion'], rel: ['religion'], slt: ['sleightofhand', 'juegodemanos'],
  ste: ['stealth', 'sigilo'], sur: ['survival', 'supervivencia'],
};

/**
 * Hoja oficial rellenable de 2024 (D&D Beyond, código 670D3898000001): sus campos se llaman Text1, Text13…
 * La correspondencia se ha comprobado con la posición de cada campo en la hoja.
 */
const OFICIAL_2024: Record<string, string> = {
  name: 'Text1', background: 'Text6', cls: 'Text7', species: 'Text8', subclass: 'Text9', level: 'Text11', ac: 'Text13',
  hp: 'Text16', init: 'Text26', speed: 'Text27', size: 'Text28', pp: 'Text29', languages: 'Text98',
};
const OFICIAL_2024_TRAITS = ['Text54', 'Text55', 'Text57', 'Text58'];

/** Nombres de campo habituales en otras hojas (FIFTHEDITION, la oficial de 2014, exportaciones…). */
const SYNONYMS: Record<string, string[]> = {
  name: ['name', 'charactername', 'charname', 'nombre', 'nombredelpersonaje', 'personaje'],
  cls: ['class', 'classlevel', 'clase', 'claseynivel'],
  level: ['level', 'nivel', 'characterlevel'],
  subclass: ['subclass', 'subclase', 'archetype'],
  species: ['species', 'race', 'especie', 'raza'],
  background: ['background', 'trasfondo'],
  ac: ['ac', 'armorclass', 'ca', 'clasedearmadura'],
  hp: ['maxhp', 'hpmax', 'hitpointmaximum', 'pgmax', 'puntosdegolpemaximos', 'hpmaximum'],
  init: ['init', 'initiative', 'iniciativa'],
  pp: ['passive', 'passiveperception', 'passivewisdom', 'percepcionpasiva', 'passiveperceptionwisdom'],
  perception: ['perception', 'percepcion'],
  speed: ['speed', 'velocidad'],
  size: ['size', 'tamano'],
  darkvision: ['darkvision', 'visionenlaoscuridad'],
  senses: ['senses', 'sentidos'],
  languages: ['languages', 'idiomas', 'proficiencieslang', 'languagesandproficiencies'],
};
const TRAIT_FIELDS = /trait|feature|feat|rasgo|dote/i;

const CLASSES: Record<string, string> = {
  barbarian: 'Bárbaro', bard: 'Bardo', cleric: 'Clérigo', druid: 'Druida', fighter: 'Guerrero', monk: 'Monje', paladin: 'Paladín',
  ranger: 'Explorador', rogue: 'Pícaro', sorcerer: 'Hechicero', warlock: 'Brujo', wizard: 'Mago', artificer: 'Artífice',
};

const DMG_EN: Record<string, string> = {
  acid: 'ácido', bludgeoning: 'contundente', slashing: 'cortante', cold: 'frío', fire: 'fuego', force: 'fuerza', necrotic: 'necrótico',
  piercing: 'perforante', psychic: 'psíquico', radiant: 'radiante', lightning: 'relámpago', thunder: 'trueno', poison: 'veneno',
};

const key = (s: string) => norm(s).replace(/[^a-z0-9]/g, '');
const clean = (s: string | undefined) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** «+2» -> «2», «−1» -> «-1», «2» -> «2»; si no es un número, vacío. */
function bonus(s: string): string {
  const m = /([+−-]?)\s*(\d+)/.exec(s.replace('−', '-'));
  return m ? (m[1] === '-' ? '-' : '') + m[2] : '';
}
const number = (s: string) => (/\d+/.exec(s) || [''])[0];

/**
 * Varias clases con su nivel en el mismo campo (multiclase): «Paladín 3 / Brujo 5», «Fighter 2, Rogue 3»,
 * «Paladín 3 (Devoción) + Brujo 2». Con menos de dos, o si alguna no lleva nivel, devuelve [].
 */
export function splitClasses(s: string): { cls: string; level: number; sub: string }[] {
  const parts = s.split(/\s*(?:\/|,|;|\+|&|\s+y\s+|\s+and\s+)\s*/i).map((p) => p.trim()).filter(Boolean);
  const out = parts.map((p) => /^(.*?[^\d\s])\s*(\d{1,2})\s*(?:\((.*)\))?$/.exec(p) || /^(.*?[^\d\s])\s*(?:\((.*?)\))\s*(\d{1,2})$/.exec(p));
  if (parts.length < 2 || out.some((m) => !m)) return [];
  return out.map((m) => {
    const lvFirst = /^\d+$/.test(m![2]);
    return { cls: classToEs(m![1].trim()), level: parseInt(lvFirst ? m![2] : m![3], 10), sub: ((lvFirst ? m![3] : m![2]) || '').trim() };
  });
}

/** Pasa al español los nombres de clase en inglés: «Paladin» -> «Paladín». */
export function classToEs(s: string): string {
  return s.replace(/[A-Za-z]+/g, (w) => CLASSES[w.toLowerCase()] || w);
}

/** Resistencias mencionadas en los rasgos: «resistance to acid», «resistencia al daño de fuego». */
export function findResistances(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/resistan(?:ce|t) (?:to )?([a-z ,]+?)(?: damage|\.|;|$)/gim)) {
    for (const w of m[1].toLowerCase().split(/[\s,]+|\band\b|\bor\b/)) if (DMG_EN[w]) out.add(DMG_EN[w]);
  }
  for (const m of text.matchAll(/resistencia (?:al daño |a daño |al )?(?:de |por )?([a-záéíóú ,]+?)(?:\.|;|$)/gim)) {
    for (const w of norm(m[1]).split(/[\s,]+|\by\b|\bo\b/)) {
      const t = DMG_TYPES.find((d) => norm(d) === w);
      if (t) out.add(t);
    }
  }
  return [...out];
}

/** Interpreta los campos de una hoja de personaje. Devuelve null si no hay nada aprovechable. */
export function readSheet(fields: SheetField[]): SheetData | null {
  const byName = new Map<string, string>();
  const byKey = new Map<string, string>();
  for (const f of fields) {
    const v = clean(f.value);
    if (!v || v === 'Off') continue;
    if (!byName.has(f.name)) byName.set(f.name, v);
    if (!byKey.has(key(f.name))) byKey.set(key(f.name), v);
  }
  const official = ['Text1', 'Text13', 'Text26', 'Text29'].every((n) => fields.some((f) => f.name === n));
  const get = (k: string): string => {
    if (official && OFICIAL_2024[k]) return byName.get(OFICIAL_2024[k]) || '';
    for (const s of SYNONYMS[k] || []) { const v = byKey.get(s); if (v) return v; }
    return '';
  };
  const template: SheetTemplate = official ? 'oficial-2024' : fields.some((f) => f.name === 'Max HP' && fields.some((g) => g.name === 'Subclass')) ? 'fifthedition' : 'generica';

  let cls = get('cls');
  let level = number(get('level'));
  // multiclase en el campo de clase: «Paladín 3 / Brujo 5»
  const classes = splitClasses(cls);
  if (classes.length) {
    level = String(Math.min(20, classes.reduce((t, x) => t + x.level, 0)));
    cls = classes.map((x) => x.cls + ' ' + x.level).join(' / ');
  } else {
    // hojas con «Clase y nivel» juntos: «Fighter 3»
    if (!level && /\d/.test(cls)) level = number(cls);
    cls = classToEs(cls.replace(/\s*\d+\s*$/, '').trim());
  }
  const init = bonus(get('init'));
  let pp = number(get('pp'));
  if (!pp && get('perception')) pp = String(10 + Number(bonus(get('perception')) || 0));
  const traitText = official
    ? OFICIAL_2024_TRAITS.map((n) => byName.get(n) || '').join('\n')
    : fields.filter((f) => TRAIT_FIELDS.test(f.name)).map((f) => f.value).join('\n');

  const speed = get('speed');
  const extras = [
    ['Especie', get('species')], ['Subclase', get('subclass')], ['Trasfondo', get('background')],
    ['Velocidad', /^\d+$/.test(speed) ? speed + ' pies' : speed], ['Tamaño', get('size')], ['Visión en la oscuridad', get('darkvision')], ['Sentidos', get('senses')], ['Idiomas', get('languages')],
  ].filter(([, v]) => v).map(([label, value]) => ({ label, value }));

  const pick = (official_: string | undefined, syn: string[]) => {
    const v = official && official_ ? byName.get(official_) : syn.map((k) => byKey.get(k)).find((x) => x != null);
    return v == null ? '' : v;
  };
  const abil: SheetData['abil'] = {};
  const saveBonus: SheetData['saveBonus'] = {};
  for (const a of ABIL_KEYS) {
    const sc = parseInt(number(pick(OFICIAL_ABIL[a], ABIL_SYN[a])), 10);
    if (sc >= 1 && sc <= 30) abil[a] = sc;
    const sv = bonus(pick(OFICIAL_SAVE[a], SAVE_SYN[a]));
    if (sv !== '') saveBonus[a] = parseInt(sv, 10);
  }
  const skillBonus: Record<string, number> = {};
  for (const [k, syn] of Object.entries(SKILL_SYN)) {
    const v = bonus(pick(OFICIAL_SKILL[k], syn));
    if (v !== '') skillBonus[k] = parseInt(v, 10);
  }

  const data: SheetData = {
    template, name: get('name'), cls: cls && level && !classes.length ? cls + ' ' + level : cls, level, ...(classes.length ? { classes } : {}), ac: number(get('ac')), hp: number(get('hp')),
    initb: init, pp, res: findResistances(traitText), extras, abil, saveBonus, skillBonus,
  };
  const useful = [data.name, data.cls, data.ac, data.hp, data.initb, data.pp].filter(Boolean).length + data.extras.length;
  return useful ? data : null;
}

/** Línea para las notas con lo que la ficha de la app no tiene campo propio. */
export const extrasLine = (d: SheetData) => d.extras.map((e) => e.label + ': ' + e.value).join(' · ');
