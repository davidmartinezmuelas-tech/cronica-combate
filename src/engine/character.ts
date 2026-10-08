import { ABILS, SKILL_ABIL, type Abil, type ArmorData, type ClassData, type PlayerData, type Uses, type WeaponData } from '../data/player';
import { classEffects, speciesResist, type ClassFx } from './classEffects';
import { featEffects, mergeEffects, type FeatEffect } from './featEffects';
import { featCatOf, splitFeatText } from './featText';
import { choiceSkills, subclassCaster } from './subclassChoices';
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
  duel?: boolean; // false: no la empuña a una mano sola (no aplica Duelo)
}

/** Categorías de dote (2024) y rasgos propios que el SRD no trae. */
export type FeatCat = 'origin' | 'general' | 'fighting-style' | 'epic-boon' | 'other';

/** Dote o rasgo escrito por el jugador (de un libro que no es el SRD o de la campaña). */
/**
 * Las dotes propias tal como se usan en la hoja: un rasgo que en realidad es una lista («- Duro: … - Protección: …»,
 * típico de una hoja importada) cuenta como varias. Lo guardado no cambia.
 */
export function expandCustomFeats(list: CustomFeat[]): CustomFeat[] {
  return list.flatMap((f) => {
    const parts = splitFeatText(f.n + (f.d ? '\n' + f.d : ''));
    if (!parts) return [f];
    return parts.map((p, i) => ({ ...f, id: f.id + '-' + i, n: p.n, d: p.d, cat: f.cat === 'other' ? featCatOf(p.n) || 'other' : f.cat, max: null, per: '' }));
  });
}

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
  /** Multiclase: las clases además de la primera (classId/level/subclass). Sin esto, una sola clase como siempre. */
  multi?: ClassEntry[];
  /** Multiclase: dados de golpe gastados por tipo de dado («10»: 2). Con una sola clase basta hdSpent. */
  hdUsed?: Record<string, number>;
  /** Solo en memoria: nivel total del personaje cuando se calcula una de sus clases por separado (asClass). */
  lvTotal?: number;
}

/** Una clase del personaje con su nivel y subclase. */
export interface ClassEntry { classId: string; className: string; level: number; subclass: string }

/** Todas las clases del personaje: la primera (la de classId) y las de multiclase. */
export function classEntries(c: Pick<Character, 'classId' | 'className' | 'level' | 'subclass' | 'multi'>): ClassEntry[] {
  return [{ classId: c.classId, className: c.className, level: c.level, subclass: c.subclass }, ...(c.multi || []).filter((e) => (e.classId || e.className) && e.level > 0)];
}

/** Nivel total del personaje (suma de sus clases). */
export const totalLevel = (c: Character): number => Math.max(1, Math.min(20, c.lvTotal ?? classEntries(c).reduce((t, e) => t + Math.max(0, e.level || 0), 0)));

/** Nivel en una clase (0 si no la tiene). */
export const classLevel = (c: Character, classId: string): number => classEntries(c).find((e) => e.classId === classId)?.level || 0;

/** El personaje visto como si solo tuviera esa clase (para sus rasgos y tablas), sin perder su nivel total. */
export const asClass = (c: Character, e: ClassEntry): Character => ({ ...c, classId: e.classId, className: e.className, level: e.level, subclass: e.subclass, multi: undefined, lvTotal: totalLevel(c) });

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
export function spellSlots(caster: ClassData['caster'] | 'third' | undefined, level: number): number[] {
  const l = Math.max(1, Math.min(20, level || 1));
  if (caster === 'full') return FULL_SLOTS[l - 1].slice();
  if (caster === 'half') return FULL_SLOTS[Math.ceil(l / 2) - 1].slice();
  // un tercio de lanzador (Caballero arcano, Embaucador arcano) desde el nivel 3: la tabla completa a un tercio del nivel
  if (caster === 'third') return l >= 3 ? FULL_SLOTS[Math.ceil(l / 3) - 1].slice() : [];
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
  abil: Record<Abil, number>; // puntuaciones con los aumentos de clase (Campeón primordial, Cuerpo y mente)
  mods: Record<Abil, number>;
  saves: Record<Abil, { bonus: number; prof: boolean; adv?: string; why?: string }>;
  checks: Record<Abil, { bonus: number; adv?: string }>; // pruebas de característica (Aprendiz de todo, ventajas)
  skills: Record<string, { bonus: number; prof: boolean; exp: boolean; abil: Abil; adv?: string; min10?: boolean }>;
  initAdv: string; // ventaja en iniciativa (motivo)
  resist: { type: string; why: string }[]; // resistencias al daño de los rasgos (Furia, Resiliencia infernal…)
  cfx: ClassFx; // efectos de los rasgos de clase
  ac: number;
  acNote: string;
  init: number;
  speed: number;
  pp: number;
  hpMax: number;
  hdDie: number;
  level: number; // nivel total
  hitDice: { die: number; n: number }[]; // dados de golpe por tipo (multiclase: varios)
  spell: { abil: Abil; dc: number; atk: number } | null;
  casters: { classId: string; n: string; abil: Abil; dc: number; atk: number }[]; // multiclase: CD y ataque de cada clase lanzadora
  critOn: number; // el ataque es crítico con este número o más en el d20 (Campeón: 19, luego 18)
  scale: (key: string) => string | number | null; // valor de una tabla de la clase a su nivel («rogue.sneak-attack»)
  slots: number[];
  pact: { n: number; lv: number } | null;
  attacks: { w: CharWeapon; atk: number; dmg: string; ver: string; abil: Abil; parts: { expr: string; type: string; min?: number }[]; verParts: { expr: string; type: string; min?: number }[]; throwParts: { expr: string; type: string }[]; offParts: Part[]; poleParts: Part[]; notes: string[] }[];
  unarmed: { atk: number; parts: Part[]; free: Part[]; grapple: string; notes: string[] } | null; // ataque sin armas mejorado por dotes
  feats: string[]; // dotes que se están aplicando a los números de la hoja
  fx: FeatEffect; // efectos de las dotes juntos (para los botones de la hoja)
}

type Part = { expr: string; type: string; min?: number; reroll1?: boolean };

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
  const entries = classEntries(c);
  const clsOf = (id: string) => data?.classes.find((x) => x.id === id);
  const lvOf = (id: string) => entries.find((e) => e.classId === id)?.level || 0;
  const subOf = (id: string) => norm(entries.find((e) => e.classId === id)?.subclass || '');
  const level = totalLevel(c);
  const pb = profBonus(level);
  // rasgos de clase con efecto en los números (Aura de protección, Aprendiz de todo, Furia…)
  const cfx = classEffects({ entries, choices: c.choices, conds: c.conds, cha: mod(c.abil.cha) });
  // aumentos de clase: +N hasta un máximo de 25 (no bajan una puntuación que ya pase de 25)
  const abil = Object.fromEntries(ABILS.map((a) => { const b = cfx.abil[a] || 0; const v = c.abil[a]; return [a, b ? Math.max(v, Math.min(25, v + b)) : v]; })) as Record<Abil, number>;
  const mods = Object.fromEntries(ABILS.map((a) => [a, mod(abil[a])])) as Record<Abil, number>;
  // dotes con efecto en los números (Tiro con arco, Duelo, Defensa, Alerta, Duro…)
  const fx = featEffects([...c.feats, ...expandCustomFeats(c.customFeats).map((f) => f.n)]);
  const sum = (k: 'atkRanged' | 'dmgOneHand' | 'dmgThrown' | 'acArmor' | 'hpPerLevel' | 'hpFlat' | 'speed') => fx.reduce((t, f) => t + (f.e[k] || 0), 0);
  const featOf = (k: keyof (typeof fx)[number]['e']) => fx.filter((f) => f.e[k]).map((f) => f.n);
  const all = mergeEffects(fx);
  // ataque extra de la propiedad «ligera»: hace falta otra arma ligera para el primer ataque
  const lightCount = c.weapons.filter((w) => (w.props || []).some((x) => norm(x) === 'ligera')).length;
  // tablas de la clase a su nivel
  const scale = (key: string): string | number | null => {
    const id = key.split('.')[0];
    const own = lvOf(id) ? clsOf(id) : undefined;
    const table = (own || cls)?.sc[key] || {};
    const at = own ? lvOf(id) : c.level;
    let v: string | number | null = null;
    for (const [lv, x] of Object.entries(table)) if (parseInt(lv, 10) <= at) v = x;
    return v;
  };
  const draconic = lvOf('sorcerer') >= 3 && ['hechiceria draconica', 'draconic sorcery'].includes(subOf('sorcerer'));
  const saveProf = new Set<Abil>([...(cls?.saves || []), ...c.saveExtra, ...(cfx.saveProfAll ? ABILS : []), ...cfx.saveProf.map((x) => x.abil)]);
  const saveFlat = cfx.saveBonus?.n || 0;
  const saves = Object.fromEntries(ABILS.map((a) => [a, {
    bonus: mods[a] + (saveProf.has(a) ? pb : 0) + saveFlat, prof: saveProf.has(a),
    ...(cfx.saveAdv[a] ? { adv: cfx.saveAdv[a] } : {}), ...(saveFlat ? { why: cfx.saveBonus!.why + ' ' + (saveFlat > 0 ? '+' : '') + saveFlat } : {}),
  }])) as Derived['saves'];
  // Aprendiz de todo: la mitad de la competencia (hacia abajo) en las pruebas sin competencia
  const half = cfx.halfProf ? Math.floor(pb / 2) : 0;
  const checks = Object.fromEntries(ABILS.map((a) => [a, { bonus: mods[a] + half, ...(cfx.checkAdv[a] ? { adv: cfx.checkAdv[a] } : {}) }])) as Derived['checks'];
  // habilidades de las elecciones de subclase de cada clase (multiclase: todas)
  const subSkills = new Set(entries.flatMap((e, i) => choiceSkills(i === 0 ? c : asClass(c, e))));
  const skills = Object.fromEntries(Object.entries(SKILL_ABIL).map(([k, ab]) => {
    const prof = c.skills.includes(k) || subSkills.has(k);
    const exp = prof && c.expertise.includes(k);
    const adv = cfx.skillAdv[k] || cfx.checkAdv[ab as Abil];
    return [k, { bonus: mods[ab] + (prof ? pb * (exp ? 2 : 1) : half), prof, exp, abil: ab, ...(adv ? { adv } : {}), ...(prof && cfx.reliable ? { min10: true } : {}) }];
  })) as Derived['skills'];

  // CA: armadura (con el límite de Destreza), defensa sin armadura del bárbaro o del monje, o 10 + Destreza
  let ac = 10 + mods.dex;
  let acNote = 'Sin armadura';
  const worn = c.armorId === 'custom' ? { n: c.armorCustom.name || 'Armadura', ac: c.armorCustom.ac, dex: c.armorCustom.dex } : armor && armor.type !== 'shl' ? armor : null;
  if (worn) {
    ac = worn.ac + (worn.dex == null ? mods.dex : Math.min(worn.dex, mods.dex)) + (c.armorBonus || 0);
    acNote = worn.n + (c.armorBonus ? ' ' + (c.armorBonus > 0 ? '+' : '') + c.armorBonus : '');
    if (sum('acArmor')) { ac += sum('acArmor'); acNote += ' + ' + featOf('acArmor').join(', '); }
  } else if (lvOf('barbarian')) {
    ac = 10 + mods.dex + mods.con;
    acNote = 'Defensa sin armadura';
  } else if (lvOf('monk') && !c.shield) {
    ac = 10 + mods.dex + mods.wis;
    acNote = 'Defensa sin armadura';
  } else if (draconic) {
    // Resiliencia dracónica: escamas
    ac = 10 + mods.dex + mods.cha;
    acNote = 'Resiliencia dracónica';
  }
  if (c.shield) { ac += 2 + (c.shieldBonus || 0); acNote += ' y escudo' + (c.shieldBonus ? ' +' + c.shieldBonus : ''); }

  const hdDie = cls?.hd || 8;
  const lvl = level;
  const avg = (die: number) => Math.floor(die / 2) + 1 + mods.con;
  const classHp = entries.reduce((t, e, i) => {
    const die = clsOf(e.classId)?.hd || 8;
    const n = Math.max(i === 0 ? 1 : 0, e.level || 0);
    return t + (i === 0 ? die + mods.con + (n - 1) * avg(die) : n * avg(die));
  }, 0);
  const hitDice = Object.entries(entries.reduce<Record<number, number>>((m, e, i) => {
    const die = clsOf(e.classId)?.hd || 8;
    m[die] = (m[die] || 0) + Math.max(i === 0 ? 1 : 0, e.level || 0);
    return m;
  }, {})).map(([die, n]) => ({ die: Number(die), n })).sort((a, b) => b.die - a.die);
  // Robustez enana: +1 PG por nivel; Resiliencia dracónica: +1 por nivel de hechicero
  const hpMax = Math.max(1, classHp + (c.speciesId === 'dwarf' ? lvl : 0) + sum('hpPerLevel') * lvl + sum('hpFlat') + (draconic ? lvOf('sorcerer') : 0));

  // lanzadores: cada clase con su característica (y el Caballero arcano / Embaucador arcano, con Inteligencia)
  const casterOf = (e: ClassEntry) => {
    const cd = clsOf(e.classId);
    const sc = subclassCaster(e);
    const kind: ClassData['caster'] | 'third' | undefined = cd?.caster && cd.caster !== 'none' ? cd.caster : sc ? 'third' : undefined;
    const abil = (cd?.spellAb || sc?.abil || '') as Abil | '';
    return { e, cd, kind, abil };
  };
  const castersAll = entries.map(casterOf).filter((x) => x.kind && x.abil);
  const casters = castersAll.map(({ e, cd, abil }) => ({ classId: e.classId, n: cd?.n || e.className, abil: abil as Abil, dc: 8 + pb + mods[abil as Abil], atk: pb + mods[abil as Abil] }));
  const spell = casters.length ? { abil: casters[0].abil, dc: casters[0].dc, atk: casters[0].atk } : null;
  if (spell && c.ov.spellDc != null) spell.dc = c.ov.spellDc;
  if (spell && c.ov.spellAtk != null) spell.atk = c.ov.spellAtk;
  if (casters.length && c.ov.spellDc != null) casters[0].dc = c.ov.spellDc;
  if (casters.length && c.ov.spellAtk != null) casters[0].atk = c.ov.spellAtk;
  // espacios: con una clase lanzadora, su tabla; con varias, la tabla de multiclase (nivel de lanzador combinado). El pacto va aparte.
  const slotCasters = castersAll.filter((x) => x.kind !== 'pact');
  const casterLevel = slotCasters.reduce((t, { e, kind }) => t + (kind === 'full' ? e.level : kind === 'half' ? Math.ceil(e.level / 2) : kind === 'third' ? Math.floor(e.level / 3) : 0), 0);
  const slots = slotCasters.length > 1 ? (casterLevel > 0 ? FULL_SLOTS[Math.min(20, casterLevel) - 1].slice() : []) : slotCasters.length === 1 ? spellSlots(slotCasters[0].kind as ClassData['caster'] | 'third', slotCasters[0].e.level) : [];

  const radiant = lvOf('paladin') >= 11;
  const attacks = c.weapons.map((w) => {
    const ab = weaponAbil(w, mods);
    const props = w.props || [];
    const has = (p: string) => props.some((x) => norm(x) === p);
    const twoHanded = has('a dos manos');
    const notes: string[] = [];
    const add = (k: Parameters<typeof featOf>[0], v: number, what: string) => { if (v) notes.push(featOf(k).join(', ') + ' ' + (v > 0 ? '+' : '') + v + ' ' + what); return v; };
    const atkFeat = w.kind === 'ranged' ? add('atkRanged', sum('atkRanged'), 'al ataque') : 0;
    // a una mano (Duelo): cuerpo a cuerpo sin la propiedad «a dos manos»; el daño a dos manos de las versátiles no lo lleva
    const oneHand = w.kind === 'melee' && !twoHanded && w.duel !== false ? add('dmgOneHand', sum('dmgOneHand'), 'al daño a una mano') : 0;
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
    // Golpes radiantes (paladín 11): +1d8 radiante con armas cuerpo a cuerpo
    if (radiant && w.kind === 'melee') { extra.push({ expr: '1d8', type: 'radiante' }); notes.push('Golpes radiantes +1d8 radiante'); }
    // ataque extra (acción adicional): sin el modificador al daño salvo que sea negativo o lo dé una dote
    const light = has('ligera');
    const crossbow = /ballesta/.test(norm(w.name));
    const offOk = (light || (all.offAny && w.kind === 'melee' && !twoHanded)) && lightCount - (light ? 1 : 0) >= 1;
    const offMod = all.offMod || (all.offModCrossbow && crossbow && light) ? mods[ab] : Math.min(0, mods[ab]);
    // Maestro en armas de asta: bastón, lanza o arma con «gran alcance» y «pesada»
    const poleOk = all.pole && w.kind === 'melee' && (/^(baston|lanza)( |$)/.test(norm(w.name)) || ((has('gran alcance') || has('alcance')) && has('pesada')));
    return {
      w, abil: ab, atk: mods[ab] + (w.prof ? pb : 0) + (w.bonus || 0) + atkFeat, dmg, ver, notes,
      offParts: offOk ? [{ expr: withBonus(w.dmg, offMod + (w.bonus || 0)), type: w.type }, ...extra] : [],
      poleParts: poleOk ? [{ expr: withBonus('1d4', mods[ab] + (w.bonus || 0)), type: 'contundente' }] : [],
      parts: [main(dmg, twoHanded), ...extra], verParts: ver ? [main(ver, true), ...extra] : [],
      throwParts: thrownMelee ? [{ expr: withBonus(w.dmg, base + thrownMelee), type: w.type }, ...extra] : [],
    };
  });

  // Movimiento sin armadura (monje, sin armadura ni escudo) y Movimiento rápido (bárbaro 5, sin armadura pesada)
  const heavyArmor = !!armor && armor.type === 'hvy';
  const speedBonus = (lvOf('monk') && !worn && !c.shield ? Number(scale('monk.unarmored-movement')) || 0 : 0) + (lvOf('barbarian') >= 5 && !heavyArmor ? 10 : 0);
  // golpe sin armas: el de las dotes o el dado de Artes marciales del monje (con Fuerza o Destreza, la mejor)
  const monkDie = lvOf('monk') ? parseInt(String(scale('monk.die') || '').replace(/^1d/, ''), 10) || 0 : 0;
  const ua = all.unarmed || (monkDie ? { die: monkDie } : null);
  const uaDie = Math.max(ua?.die || 0, monkDie);
  const uaAb = monkDie && mods.dex > mods.str ? mods.dex : mods.str;
  const uaNotes = [...featOf('unarmed'), ...(monkDie ? ['Artes marciales'] : [])];
  return {
    cls, pb, mods, saves, skills,
    critOn: ['campeon', 'champion'].includes(subOf('fighter')) ? (lvOf('fighter') >= 15 ? 18 : lvOf('fighter') >= 3 ? 19 : 20) : 20,
    scale,
    ac: c.ov.ac ?? ac, acNote: c.ov.ac != null ? 'Ajustada a mano' : acNote,
    init: c.ov.init ?? mods.dex + (featOf('initProf').length ? pb : half),
    initAdv: cfx.initAdv,
    speed: c.ov.speed ?? (species?.speed ?? 30) + sum('speed') + speedBonus + cfx.speed.reduce((t, x) => t + (x.noHeavy && heavyArmor ? 0 : x.n), 0),
    resist: [...speciesResist(c.speciesId, c.choices), ...cfx.resist],
    cfx,
    abil,
    checks,
    pp: c.ov.pp ?? 10 + skills.prc.bonus,
    hpMax: c.ov.hpMax ?? hpMax,
    hdDie,
    level,
    hitDice,
    spell,
    casters,
    slots,
    pact: lvOf('warlock') && clsOf('warlock')?.caster === 'pact' ? pactSlots(lvOf('warlock')) : null,
    attacks,
    unarmed: ua ? {
      atk: uaAb + pb,
      parts: [{ expr: withBonus('1d' + uaDie, uaAb), type: 'contundente', reroll1: all.unarmed?.reroll1 }, ...(radiant ? [{ expr: '1d8', type: 'radiante' }] : [])],
      free: all.unarmed?.free && all.unarmed.free > uaDie ? [{ expr: withBonus('1d' + all.unarmed.free, uaAb), type: 'contundente', reroll1: all.unarmed.reroll1 }] : [],
      grapple: all.unarmed?.grapple || '',
      notes: uaNotes,
    } : null,
    feats: fx.map((f) => f.n),
    fx: all,
  };
}

/** Máximo de usos de un rasgo: número, @prof, @abilities.X.mod (mínimo 1) o @scale.clase.rasgo por nivel. */
export function usesMax(u: Uses | undefined, c: Character, cls: ClassData | undefined): number | null {
  if (!u) return null;
  // «(max(1, …))» con paréntesis de más
  const f = u.max.trim().replace(/^\((.*)\)$/, '$1').trim();
  // «max(1, @abilities.cha.mod)» (Inspiración bárdica)
  const mx = /^max\(\s*(\d+)\s*,\s*(.+)\)$/.exec(f);
  if (mx) { const v = usesMax({ max: mx[2], per: u.per }, c, cls); return v == null ? null : Math.max(parseInt(mx[1], 10), v); }
  // un número fijo; 20 o más son restos de otros datos (CD de Furia implacable, Sobrecargar), no usos
  if (/^\d+$/.test(f)) { const n = parseInt(f, 10); return n > 10 ? null : n; }
  if (f === '@prof') return profBonus(totalLevel(c));
  const ab = /^@abilities\.(\w+)\.mod$/.exec(f);
  if (ab) return Math.max(1, mod(c.abil[ab[1] as Abil]));
  const sc = /^@scale\.([\w-]+)\.([\w-]+)$/.exec(f);
  if (sc && cls) {
    const table = cls.sc[sc[1] + '.' + sc[2]];
    if (!table) return null;
    let v: number | string | null = null;
    const at = classLevel(c, cls.id) || c.level;
    for (const [lv, val] of Object.entries(table)) if (parseInt(lv, 10) <= at) v = val;
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
    ...c, hp: d.hpMax, temp: 0, slotsUsed: c.slotsUsed.map(() => 0), pactUsed: 0, uses: {}, hdSpent: 0, hdUsed: {},
    exh: Math.max(0, c.exh - 1), death: { s: 0, f: 0 }, updatedAt: Date.now(),
  };
}

/** Descanso corto: recupera los usos «por descanso corto» y los espacios de pacto. Los dados de golpe se tiran aparte. */
export function shortRest(c: Character, shortUses: string[]): Character {
  const uses = { ...c.uses };
  shortUses.forEach((n) => { delete uses[n]; });
  return { ...c, uses, pactUsed: 0, updatedAt: Date.now() };
}
