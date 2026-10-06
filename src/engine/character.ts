import { ABILS, SKILL_ABIL, type Abil, type ArmorData, type ClassData, type PlayerData, type Uses, type WeaponData } from '../data/player';
import { featEffects } from './featEffects';
import { choiceSkills } from './subclassChoices';
import { norm, uid } from './util';

/** Arma (o ataque) del personaje: de la lista del SRD o propia. */
export interface CharWeapon {
  id: string;
  name: string;
  dmg: string; // «1d8»
  type: string; // tipo de daño
  ver?: string; // daño a dos manos (versátil)
  abil: Abil | 'auto'; // auto: Fuerza (cuerpo a cuerpo), Destreza (distancia) o la mejor si es sutil
  kind: 'melee' | 'ranged';
  finesse: boolean;
  prof: boolean;
  bonus: number; // bonificador mágico a ataque y daño
  extra?: { dmg: string; type: string }[]; // daños adicionales (p. ej. +1d6 de fuego de un arma flamígera)
  range?: string;
  props?: string[];
  mastery?: string;
}

/** Categorías de dote (2024) y rasgos propios que el SRD no trae. */
export type FeatCat = 'origin' | 'general' | 'fighting-style' | 'epic-boon' | 'other';

/** Dote o rasgo escrito por el jugador (de un libro que no es el SRD o de la campaña). */
export interface CustomFeat {
  id: string;
  n: string;
  d: string;
  cat: FeatCat;
  max: number | null; // usos (null = sin límite)
  per: '' | 'sr' | 'lr';
}

/** Hoja de personaje (versión 1). Todo lo calculable se calcula; `ov` permite corregir cualquier número a mano. */
export interface Character {
  id: string;
  v: 1;
  updatedAt: number;
  name: string;
  player: string;
  speciesId: string;
  speciesName: string; // si no es del SRD
  classId: string;
  className: string; // si no es del SRD
  level: number;
  subclass: string;
  backgroundId: string;
  backgroundName: string;
  abil: Record<Abil, number>;
  skills: string[]; // con competencia
  expertise: string[];
  saveExtra: Abil[]; // salvaciones con competencia además de las de la clase
  armorId: string; // '' = sin armadura; 'custom' = armadura propia o mágica (armorCustom)
  armorCustom: { name: string; ac: number; dex: number | null };
  armorBonus: number; // bonificador mágico de la armadura
  shield: boolean;
  shieldBonus: number; // bonificador mágico del escudo (además del +2)
  weapons: CharWeapon[];
  spells: string[]; // claves de conjuros del SRD
  hp: number;
  temp: number;
  hdSpent: number;
  slotsUsed: number[]; // gastados por nivel de espacio (1-9)
  pactUsed: number;
  uses: Record<string, number>; // usos gastados de cada rasgo (por nombre)
  conds: string[];
  exh: number;
  death: { s: number; f: number };
  inspiration: boolean;
  feats: string[]; // dotes del SRD (por nombre)
  customFeats: CustomFeat[];
  choices?: Record<string, string[]>; // elecciones de subclase (maniobras, habilidades…) por id de elección
  langs: string;
  tools: string;
  notes: string;
  ov: Partial<Record<'ac' | 'hpMax' | 'init' | 'speed' | 'pp' | 'spellDc' | 'spellAtk', number>>;
}

export const mod = (score: number) => Math.floor(((score || 10) - 10) / 2);
export const profBonus = (level: number) => Math.ceil(Math.max(1, Math.min(20, level || 1)) / 4) + 1;

export function blankCharacter(): Character {
  return {
    id: 'pj-' + uid(), v: 1, updatedAt: Date.now(), name: '', player: '', speciesId: '', speciesName: '', classId: '', className: '', level: 1,
    subclass: '', backgroundId: '', backgroundName: '', abil: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, skills: [], expertise: [],
    saveExtra: [], armorId: '', armorCustom: { name: 'Armadura', ac: 12, dex: null }, armorBonus: 0, shield: false, shieldBonus: 0, weapons: [], spells: [], hp: 0, temp: 0, hdSpent: 0, slotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0], pactUsed: 0,
    uses: {}, conds: [], exh: 0, death: { s: 0, f: 0 }, inspiration: false, feats: [], customFeats: [], choices: {}, langs: '', tools: '', notes: '', ov: {},
  };
}

/** Espacios de conjuro de un lanzador completo por nivel de personaje (reglas 2024). */
const FULL_SLOTS: number[][] = [
  [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/** Espacios por nivel de conjuro (índice 0 = nivel 1). Los semilanzadores usan la tabla completa a la mitad de nivel, redondeando hacia arriba. */
export function spellSlots(caster: ClassData['caster'] | undefined, level: number): number[] {
  const l = Math.max(1, Math.min(20, level || 1));
  if (caster === 'full') return FULL_SLOTS[l - 1].slice();
  if (caster === 'half') return FULL_SLOTS[Math.ceil(l / 2) - 1].slice();
  return [];
}

/** Magia de pacto (brujo): número de espacios y su nivel. */
export function pactSlots(level: number): { n: number; lv: number } {
  const l = Math.max(1, Math.min(20, level || 1));
  const n = l === 1 ? 1 : l <= 10 ? 2 : l <= 16 ? 3 : 4;
  const lv = Math.min(5, Math.ceil(l / 2));
  return { n, lv };
}

export interface Derived {
  cls?: ClassData;
  pb: number;
  mods: Record<Abil, number>;
  saves: Record<Abil, { bonus: number; prof: boolean }>;
  skills: Record<string, { bonus: number; prof: boolean; exp: boolean; abil: Abil }>;
  ac: number;
  acNote: string;
  init: number;
  speed: number;
  pp: number;
  hpMax: number;
  hdDie: number;
  spell: { abil: Abil; dc: number; atk: number } | null;
  slots: number[];
  pact: { n: number; lv: number } | null;
  attacks: { w: CharWeapon; atk: number; dmg: string; ver: string; abil: Abil; parts: { expr: string; type: string; min?: number }[]; verParts: { expr: string; type: string; min?: number }[]; throwParts: { expr: string; type: string }[]; notes: string[] }[];
  feats: string[]; // dotes que se están aplicando a los números de la hoja
}

/** Texto de un daño con varias partes: «1d8+3 cortante + 1d6 fuego». */
export const partsLabel = (parts: { expr: string; type: string }[]) => parts.map((p) => p.expr + (p.type ? ' ' + p.type : '')).join(' + ');

/** Bonificador de una fórmula de daño: «1d8» + 3 -> «1d8+3». */
const withBonus = (dice: string, b: number) => (b ? dice + (b > 0 ? '+' + b : String(b)) : dice);

export function weaponAbil(w: CharWeapon, mods: Record<Abil, number>): Abil {
  if (w.abil !== 'auto') return w.abil;
  if (w.finesse) return mods.dex > mods.str ? 'dex' : 'str';
  return w.kind === 'ranged' ? 'dex' : 'str';
}

export function derive(c: Character, data: PlayerData | null): Derived {
  const cls = data?.classes.find((x) => x.id === c.classId);
  const species = data?.species.find((x) => x.id === c.speciesId);
  const armor: ArmorData | undefined = data?.armor.find((x) => x.id === c.armorId);
  const pb = profBonus(c.level);
  const mods = Object.fromEntries(ABILS.map((a) => [a, mod(c.abil[a])])) as Record<Abil, number>;
  // dotes con efecto en los números (Tiro con arco, Duelo, Defensa, Alerta, Duro…)
  const fx = featEffects([...c.feats, ...c.customFeats.map((f) => f.n)]);
  const sum = (k: 'atkRanged' | 'dmgOneHand' | 'dmgThrown' | 'acArmor' | 'hpPerLevel' | 'hpFlat' | 'speed') => fx.reduce((t, f) => t + (f.e[k] || 0), 0);
  const featOf = (k: keyof (typeof fx)[number]['e']) => fx.filter((f) => f.e[k]).map((f) => f.n);
  const saveProf = new Set<Abil>([...(cls?.saves || []), ...c.saveExtra]);
  const saves = Object.fromEntries(ABILS.map((a) => [a, { bonus: mods[a] + (saveProf.has(a) ? pb : 0), prof: saveProf.has(a) }])) as Derived['saves'];
  const subSkills = new Set(choiceSkills(c));
  const skills = Object.fromEntries(Object.entries(SKILL_ABIL).map(([k, ab]) => {
    const prof = c.skills.includes(k) || subSkills.has(k);
    const exp = prof && c.expertise.includes(k);
    return [k, { bonus: mods[ab] + (prof ? pb * (exp ? 2 : 1) : 0), prof, exp, abil: ab }];
  })) as Derived['skills'];

  // CA: armadura (con el límite de Destreza), defensa sin armadura del bárbaro o del monje, o 10 + Destreza
  let ac = 10 + mods.dex;
  let acNote = 'Sin armadura';
  const worn = c.armorId === 'custom' ? { n: c.armorCustom.name || 'Armadura', ac: c.armorCustom.ac, dex: c.armorCustom.dex } : armor && armor.type !== 'shl' ? armor : null;
  if (worn) {
    ac = worn.ac + (worn.dex == null ? mods.dex : Math.min(worn.dex, mods.dex)) + (c.armorBonus || 0);
    acNote = worn.n + (c.armorBonus ? ' ' + (c.armorBonus > 0 ? '+' : '') + c.armorBonus : '');
    if (sum('acArmor')) { ac += sum('acArmor'); acNote += ' + ' + featOf('acArmor').join(', '); }
  } else if (c.classId === 'barbarian') {
    ac = 10 + mods.dex + mods.con;
    acNote = 'Defensa sin armadura';
  } else if (c.classId === 'monk' && !c.shield) {
    ac = 10 + mods.dex + mods.wis;
    acNote = 'Defensa sin armadura';
  }
  if (c.shield) { ac += 2 + (c.shieldBonus || 0); acNote += ' y escudo' + (c.shieldBonus ? ' +' + c.shieldBonus : ''); }

  const hdDie = cls?.hd || 8;
  const lvl = Math.max(1, c.level || 1);
  // Robustez enana: +1 PG por nivel
  const hpMax = Math.max(1, hdDie + mods.con + (lvl - 1) * (Math.floor(hdDie / 2) + 1 + mods.con) + (c.speciesId === 'dwarf' ? lvl : 0) + sum('hpPerLevel') * lvl + sum('hpFlat'));

  const spellAb = cls?.spellAb || '';
  const spell = spellAb ? { abil: spellAb, dc: 8 + pb + mods[spellAb], atk: pb + mods[spellAb] } : null;
  if (spell && c.ov.spellDc != null) spell.dc = c.ov.spellDc;
  if (spell && c.ov.spellAtk != null) spell.atk = c.ov.spellAtk;

  const attacks = c.weapons.map((w) => {
    const ab = weaponAbil(w, mods);
    const props = w.props || [];
    const has = (p: string) => props.some((x) => norm(x) === p);
    const twoHanded = has('a dos manos');
    const notes: string[] = [];
    const add = (k: Parameters<typeof featOf>[0], v: number, what: string) => { if (v) notes.push(featOf(k).join(', ') + ' ' + (v > 0 ? '+' : '') + v + ' ' + what); return v; };
    const atkFeat = w.kind === 'ranged' ? add('atkRanged', sum('atkRanged'), 'al ataque') : 0;
    // a una mano (Duelo): cuerpo a cuerpo sin la propiedad «a dos manos»; el daño a dos manos de las versátiles no lo lleva
    const oneHand = w.kind === 'melee' && !twoHanded ? add('dmgOneHand', sum('dmgOneHand'), 'al daño a una mano') : 0;
    const thrown = w.kind === 'ranged' && has('arrojadiza') ? add('dmgThrown', sum('dmgThrown'), 'al daño') : 0;
    // arma cuerpo a cuerpo arrojadiza (daga, jabalina): el bonificador solo cuando se lanza
    const thrownMelee = w.kind === 'melee' && has('arrojadiza') ? add('dmgThrown', sum('dmgThrown'), 'al daño si la lanzas') : 0;
    const heavy = has('pesada') && featOf('dmgHeavyProf').length ? add('dmgHeavyProf', pb, 'al daño') : 0;
    const base = mods[ab] + (w.bonus || 0) + thrown + heavy;
    const dmg = withBonus(w.dmg, base + oneHand);
    const ver = w.ver ? withBonus(w.ver, base) : '';
    // Combate con armas a dos manos: los 1 y 2 de los dados del arma cuentan como 3 al empuñarla con las dos manos
    const min2h = fx.reduce((t, f) => Math.max(t, f.e.minDie2h || 0), 0);
    if (min2h && w.kind === 'melee' && (twoHanded || w.ver)) notes.push(featOf('minDie2h').join(', ') + ': los 1 y 2 cuentan como 3 a dos manos');
    const extra = (w.extra || []).filter((e) => e.dmg.trim()).map((e) => ({ expr: e.dmg.trim(), type: e.type }));
    const main = (expr: string, two: boolean) => ({ expr, type: w.type, ...(min2h && two && w.kind === 'melee' ? { min: min2h } : {}) });
    return {
      w, abil: ab, atk: mods[ab] + (w.prof ? pb : 0) + (w.bonus || 0) + atkFeat, dmg, ver, notes,
      parts: [main(dmg, twoHanded), ...extra], verParts: ver ? [main(ver, true), ...extra] : [],
      throwParts: thrownMelee ? [{ expr: withBonus(w.dmg, base + thrownMelee), type: w.type }, ...extra] : [],
    };
  });

  return {
    cls, pb, mods, saves, skills,
    ac: c.ov.ac ?? ac, acNote: c.ov.ac != null ? 'Ajustada a mano' : acNote,
    init: c.ov.init ?? mods.dex + (featOf('initProf').length ? pb : 0),
    speed: c.ov.speed ?? (species?.speed ?? 30) + sum('speed'),
    pp: c.ov.pp ?? 10 + skills.prc.bonus,
    hpMax: c.ov.hpMax ?? hpMax,
    hdDie,
    spell,
    slots: spellSlots(cls?.caster, c.level),
    pact: cls?.caster === 'pact' ? pactSlots(c.level) : null,
    attacks,
    feats: fx.map((f) => f.n),
  };
}

/** Máximo de usos de un rasgo: número, @prof, @abilities.X.mod (mínimo 1) o @scale.clase.rasgo por nivel. */
export function usesMax(u: Uses | undefined, c: Character, cls: ClassData | undefined): number | null {
  if (!u) return null;
  const f = u.max.trim();
  if (/^\d+$/.test(f)) return parseInt(f, 10);
  if (f === '@prof') return profBonus(c.level);
  const ab = /^@abilities\.(\w+)\.mod$/.exec(f);
  if (ab) return Math.max(1, mod(c.abil[ab[1] as Abil]));
  const sc = /^@scale\.([\w-]+)\.([\w-]+)$/.exec(f);
  if (sc && cls) {
    const table = cls.sc[sc[1] + '.' + sc[2]];
    if (!table) return null;
    let v: number | string | null = null;
    for (const [lv, val] of Object.entries(table)) if (parseInt(lv, 10) <= c.level) v = val;
    return typeof v === 'number' ? v : v == null ? 0 : parseInt(String(v), 10) || null;
  }
  return null;
}

/** Arma del SRD convertida en ataque del personaje (competente si su clase sabe usarla). */
export function weaponFromData(w: WeaponData, cls: ClassData | undefined): CharWeapon {
  const prof = !!cls && (cls.weapons.includes(w.cat) || cls.weapons.includes(w.base));
  return {
    id: 'w-' + uid(), name: w.n, dmg: w.dmg, type: w.type, ver: w.ver || undefined, abil: 'auto', kind: w.kind,
    finesse: w.props.includes('Sutil'), prof, bonus: 0, range: w.range || undefined, props: w.props, mastery: w.mastery || undefined,
  };
}

/** Descanso largo (2024): PG al máximo, recupera espacios, usos y todos los dados de golpe; reduce el agotamiento en 1. */
export function longRest(c: Character, d: Derived): Character {
  return {
    ...c, hp: d.hpMax, temp: 0, slotsUsed: c.slotsUsed.map(() => 0), pactUsed: 0, uses: {}, hdSpent: 0,
    exh: Math.max(0, c.exh - 1), death: { s: 0, f: 0 }, updatedAt: Date.now(),
  };
}

/** Descanso corto: recupera los usos «por descanso corto» y los espacios de pacto. Los dados de golpe se tiran aparte. */
export function shortRest(c: Character, shortUses: string[]): Character {
  const uses = { ...c.uses };
  shortUses.forEach((n) => { delete uses[n]; });
  return { ...c, uses, pactUsed: 0, updatedAt: Date.now() };
}
