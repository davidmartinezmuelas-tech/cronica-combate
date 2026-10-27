import type { Abil } from '../data/player';
import { concOf } from './concentration';
import { norm } from './util';

/**
 * Lo que hacen al lanzarlos los conjuros que cambian la hoja de quien los recibe (reglas 2024): PG temporales o
 * máximos, CA, velocidad, resistencias, ventajas, estados y Bendición. Se busca por el nombre en inglés del SRD o
 * por el nombre en español (los de la biblioteca no tienen el inglés).
 */
export interface SpellFx {
  self?: boolean; // solo sobre quien lo lanza
  temp?: (lv: number, mods: Record<Abil, number>) => string; // PG temporales al lanzarlo (dados o número)
  hpMax?: (lv: number) => number; // PG máximos (y actuales) mientras dura
  ac?: { add?: number; base13?: boolean; min?: number };
  speed?: { add?: number; mul?: number };
  resist?: string[];
  saveAdv?: Abil[];
  saves?: number; // bonificador fijo a todas las salvaciones
  skills?: Record<string, number>; // bonificador a habilidades (clave de la hoja: ste, prc…)
  bless?: boolean; // +1d4 a ataques y salvaciones
  cond?: string; // estado que pone (de la lista de estados)
  instant?: boolean; // solo el efecto al lanzarlo (no queda activo)
  note: string; // qué hace, en corto
}

const FX: { keys: string[]; fx: SpellFx }[] = [
  { keys: ['False Life', 'falsa vida'], fx: { self: true, instant: true, temp: (lv) => '2d4+' + (4 + 5 * Math.max(0, lv - 1)), note: 'PG temporales' } },
  { keys: ['Armor of Agathys', 'armadura de agathys'], fx: { self: true, temp: (lv) => String(5 * lv), note: 'quien te golpee cuerpo a cuerpo recibe daño de frío igual a estos PG temporales mientras te queden' } },
  { keys: ['Heroism', 'heroismo'], fx: { note: 'inmune a asustado; al empezar cada turno, PG temporales igual a tu modificador de lanzamiento' } },
  { keys: ['Aid', 'auxilio'], fx: { hpMax: (lv) => 5 * Math.max(1, lv - 1), note: 'PG máximos y actuales' } },
  { keys: ['Shield', 'escudo'], fx: { self: true, ac: { add: 5 }, note: '+5 a la CA hasta el principio de tu siguiente turno; sin daño de Proyectil mágico' } },
  { keys: ['Shield of Faith', 'escudo de fe'], fx: { ac: { add: 2 }, note: '+2 a la CA' } },
  { keys: ['Mage Armor', 'armadura de mago'], fx: { ac: { base13: true }, note: 'CA 13 + Destreza sin armadura' } },
  { keys: ['Barkskin', 'piel robliza'], fx: { ac: { min: 17 }, note: 'CA mínima 17' } },
  { keys: ['Haste', 'acelerar'], fx: { ac: { add: 2 }, speed: { mul: 2 }, saveAdv: ['dex'], note: '+2 a la CA, velocidad doble, ventaja en salvaciones de Destreza y una acción más (limitada)' } },
  { keys: ['Bless', 'bendicion'], fx: { bless: true, note: '+1d4 a las tiradas de ataque y de salvación' } },
  { keys: ['Longstrider', 'zancada prodigiosa'], fx: { speed: { add: 10 }, note: '+10 pies de velocidad' } },
  { keys: ['Invisibility', 'invisibilidad'], fx: { cond: 'Invisible', note: 'invisible hasta que ataques, hagas daño o lances un conjuro' } },
  { keys: ['Greater Invisibility', 'invisibilidad mejorada'], fx: { cond: 'Invisible', note: 'invisible aunque ataques o lances conjuros' } },
  { keys: ['Fly', 'volar'], fx: { note: 'velocidad de vuelo de 60 pies' } },
  { keys: ['Blur', 'contorno borroso'], fx: { self: true, note: 'los ataques contra ti tienen desventaja' } },
  { keys: ['Mirror Image', 'imagen multiple'], fx: { self: true, note: 'tres duplicados ilusorios: cada ataque que te impacte puede destruir uno en su lugar' } },
  { keys: ['Expeditious Retreat', 'retirada expeditiva'], fx: { self: true, note: 'Correr como acción adicional' } },
  { keys: ['Stoneskin', 'piel petrea'], fx: { resist: ['contundente', 'cortante', 'perforante'], note: 'resistencia a daño contundente, cortante y perforante' } },
  { keys: ['Fire Shield', 'escudo de fuego'], fx: { self: true, note: 'resistencia al frío (escudo cálido) o al fuego (frío); daño a quien te golpee cuerpo a cuerpo' } },
  { keys: ['Death Ward', 'guarda contra la muerte'], fx: { note: 'la primera vez que caerías a 0 PG, te quedas a 1' } },
  { keys: ['Freedom of Movement', 'libertad de movimiento'], fx: { note: 'el terreno difícil no te frena; no te pueden paralizar ni apresar con magia' } },
  { keys: ['Protection from Evil and Good', 'proteccion contra el bien y el mal'], fx: { note: 'aberraciones, celestiales, elementales, feéricos, infernales y muertos vivientes tienen desventaja al atacarte' } },
  { keys: ['Sanctuary', 'santuario'], fx: { note: 'quien quiera atacarte o afectarte debe superar una salvación de Sabiduría' } },
  { keys: ['Darkvision', 'vision en la oscuridad'], fx: { note: 'visión en la oscuridad de 150 pies' } },
  { keys: ['See Invisibility', 'ver invisibilidad'], fx: { note: 'ves criaturas y objetos invisibles' } },
  { keys: ['Spider Climb', 'trepar cual aracnido'], fx: { note: 'velocidad de trepar igual a tu velocidad, también boca abajo' } },
  { keys: ['Water Walk', 'caminar sobre el agua'], fx: { note: 'caminas sobre líquidos' } },
  { keys: ['Jump', 'salto'], fx: { note: 'tus saltos llegan el triple de lejos' } },
  { keys: ['Aura of Life', 'aura de vida'], fx: { resist: ['necrótico'], note: 'tú y tus aliados en el aura (30 pies) tenéis resistencia al daño necrótico y vuestros PG máximos no bajan; quien tenga 0 PG recupera 1 al empezar su turno' } },
  { keys: ['Holy Aura', 'aura sagrada'], fx: { saveAdv: ['str', 'dex', 'con', 'int', 'wis', 'cha'], note: 'ventaja en todas las salvaciones; los ataques contra ti tienen desventaja; los infernales y muertos vivientes que te golpeen quedan cegados' } },
  { keys: ['Beacon of Hope', 'senal de esperanza'], fx: { saveAdv: ['wis'], note: 'ventaja en salvaciones de Sabiduría y contra la muerte; las curaciones que recibas dan el máximo posible' } },
  { keys: ['Gaseous Form', 'forma gaseosa'], fx: { resist: ['contundente', 'cortante', 'perforante'], note: 'te vuelves gas: resistencia al daño físico no mágico, vuelo de 10 pies y puedes pasar por rendijas; no puedes hablar ni lanzar conjuros con componentes' } },
  { keys: ['Mind Blank', 'mente en blanco'], fx: { resist: ['psíquico'], note: 'inmune al daño psíquico, a la adivinación y a que lean tu mente; dura 24 horas' } },
  { keys: ['Protection from Poison', 'proteccion contra veneno'], fx: { resist: ['veneno'], note: 'resistencia al daño de veneno y ventaja en salvaciones contra ser envenenado; se acaba el veneno que sufrieras' } },
  { keys: ['Warding Bond', 'vinculo protector'], fx: { ac: { add: 1 }, saves: 1, note: '+1 a la CA y a las salvaciones y resistencia a todo el daño mientras estés a 60 pies de quien lo lanzó, que sufre el mismo daño que tú' } },
  { keys: ['Pass without Trace', 'pasar sin rastro'], fx: { skills: { ste: 10 }, note: '+10 a las pruebas de Sigilo para ti y los que estén a 30 pies; no os pueden rastrear sin magia' } },
  { keys: ['Foresight', 'presciencia'], fx: { saveAdv: ['str', 'dex', 'con', 'int', 'wis', 'cha'], note: 'ventaja en ataques, pruebas y salvaciones; los ataques contra ti tienen desventaja; dura 8 horas' } },
  { keys: ['Enhance Ability', 'potenciar caracteristica'], fx: { note: 'ventaja en las pruebas de una característica a elegir al lanzarlo, con un extra según la elegida' } },
  { keys: ['Enlarge/Reduce', 'agrandar/reducir'], fx: { note: 'Agrandar: tamaño superior, ventaja en pruebas y salvaciones de Fuerza y +1d4 al daño con armas; Reducir: lo contrario, −1d4 al daño' } },
  { keys: ['Alter Self', 'alterar el propio aspecto'], fx: { self: true, note: 'una de tres: respirar bajo el agua y nadar, cambiar tu aspecto o armas naturales (1d6, mágicas)' } },
  { keys: ['Protection from Energy', 'proteccion contra energia'], fx: { note: 'resistencia a un tipo de daño a elegir: ácido, frío, fuego, relámpago o trueno' } },
  { keys: ['Antilife Shell', 'caparazon antivida'], fx: { self: true, note: 'barrera de 10 pies: las criaturas (salvo constructos y muertos vivientes) no pueden atravesarla' } },
  { keys: ['Globe of Invulnerability', 'globo de invulnerabilidad'], fx: { self: true, note: 'los conjuros de nivel 5 o menos no afectan a nadie dentro de la esfera de 10 pies' } },
  { keys: ['Antimagic Field', 'campo antimagia'], fx: { self: true, note: 'emanación de 10 pies: sin conjuros ni objetos mágicos ni efectos mágicos dentro' } },
  { keys: ['Spirit Guardians', 'espiritus guardianes'], fx: { self: true, note: 'emanación de 15 pies: tu terreno difícil para los enemigos, que sufren daño al entrar o empezar el turno ahí (salvación de Sabiduría)' } },
  { keys: ['Blink', 'desplazamiento'], fx: { self: true, note: 'al final de cada uno de tus turnos tiras 1d6: con 4 o más desapareces al Plano Etéreo y vuelves al empezar tu siguiente turno' } },
  { keys: ['Guidance', 'guia'], fx: { note: '+1d4 a una prueba de característica que haga durante el conjuro (una vez)' } },
  { keys: ['Resistance', 'resistencia'], fx: { note: '+1d4 a una tirada de salvación que haga durante el conjuro (una vez)' } },
  { keys: ['Magic Weapon', 'arma magica'], fx: { note: 'el arma tocada es mágica y da +1 al ataque y al daño (+2 con espacio de nivel 4, +3 con nivel 6)' } },
  { keys: ['Regenerate', 'regenerar'], fx: { note: 'curación inmediata 4d8+15 y +1 PG al empezar cada turno; recupera miembros perdidos' } },
  { keys: ['Disguise Self', 'disfrazarse'], fx: { self: true, note: 'cambias tu aspecto durante 1 hora; una inspección física o una prueba de Investigación lo descubre' } },
  { keys: ['Etherealness', 'excursion etérea'], fx: { self: true, note: 'estás en el Plano Etéreo hasta 8 horas; no ves ni te ven desde el Plano Material' } },
  { keys: ['Glibness', 'labia'], fx: { self: true, note: 'mínimo 15 en las pruebas de Carisma; la magia no detecta que mientes' } },
];

/**
 * Conjuros que perjudican a quien falla la salvación con algo que no es un estado del juego: en la mesa del máster
 * quedan como un estado con su efecto en corto (Perdición: −1d4 a ataques y salvaciones…).
 */
const DEBUFFS: [string, string, string][] = [
  ['Bane', 'perdicion', 'Perdición (−1d4 a ataques y salvaciones)'],
  ['Slow', 'ralentizar', 'Ralentizar (−2 a la CA y a salvaciones de Destreza, velocidad a la mitad, sin reacciones)'],
  ['Faerie Fire', 'fuego feerico', 'Fuego feérico (los ataques contra él tienen ventaja; no puede ser invisible)'],
  ['Ray of Enfeeblement', 'rayo debilitador', 'Rayo debilitador (desventaja en tiradas de Fuerza; −1d8 al daño con armas)'],
  ['Bestow Curse', 'imponer maldicion', 'Maldición (según la elegida al lanzarla)'],
  ['Mind Spike', 'clavo mental', 'Clavo mental (no puede volverse invisible para quien lo lanzó)'],
];

/** Estado de la mesa para quien falla la salvación de un conjuro que perjudica (o null). */
export function debuffOf(s: { en?: string; n: string }): string | null {
  const en = (s.en || '').toLowerCase();
  const n = norm(s.n);
  return DEBUFFS.find(([e, es]) => (en && e.toLowerCase() === en) || es === n)?.[2] || null;
}

/** Efecto del conjuro (por su nombre en inglés o en español), o null si no cambia la hoja. */
/**
 * Efecto sobre quien lo recibe de un conjuro propio («Mis creaciones»): lo que se escribe en su ficha. La biblioteca
 * los registra aquí con su clave («own:» + id) y su nombre, y se usan igual que los de la tabla.
 */
export interface OwnSelfFx { on: 'self' | 'any'; ac?: number; temp?: string; tempMod?: boolean; hpMax?: number; speed?: number; resist?: string }
let OWN: { keys: string[]; fx: SpellFx }[] = [];
const all = () => (OWN.length ? [...OWN, ...FX] : FX);
export function ownSelfFx(o: OwnSelfFx): SpellFx {
  const note = [o.ac && (o.ac > 0 ? '+' : '') + o.ac + ' a la CA', o.temp && o.temp + (o.tempMod ? ' + modificador' : '') + ' PG temporales', o.hpMax && '+' + o.hpMax + ' PG máximos',
    o.speed && (o.speed > 0 ? '+' : '') + o.speed + ' pies de velocidad', o.resist && 'resistencia a ' + o.resist].filter(Boolean).join(', ');
  return {
    ...(o.on === 'self' ? { self: true } : {}),
    ...(o.ac ? { ac: { add: o.ac } } : {}),
    // + modificador: el de lanzar conjuros (el mayor de Inteligencia, Sabiduría y Carisma)
    ...(o.temp ? { temp: (_lv: number, mods: Record<Abil, number>) => { const m = Math.max(mods.int, mods.wis, mods.cha); return o.temp! + (o.tempMod ? (m >= 0 ? '+' : '') + m : ''); } } : {}),
    ...(o.hpMax ? { hpMax: () => o.hpMax! } : {}),
    ...(o.speed ? { speed: { add: o.speed } } : {}),
    ...(o.resist ? { resist: [o.resist] } : {}),
    // solo PG temporales: se aplica al lanzarlo y no queda activo
    ...(o.temp && !o.ac && !o.hpMax && !o.speed && !o.resist ? { instant: true } : {}),
    note: note || 'efecto propio',
  };
}
export function setOwnSpellFx(list: { id: string; n: string; fx: SpellFx }[]) { OWN = list.map((x) => ({ keys: ['own:' + x.id, x.n], fx: x.fx })); }

export function spellFx(s: { en?: string; n: string }): { key: string; fx: SpellFx } | null {
  const en = (s.en || '').toLowerCase();
  const n = norm(s.n);
  const hit = all().find((x) => (en && x.keys[0].toLowerCase() === en) || x.keys.some((k) => norm(k) === n));
  return hit ? { key: hit.keys[0], fx: hit.fx } : null;
}

/** Efecto activo en la hoja (conjuro lanzado sobre el personaje). */
export interface ActiveEffect { k: string; n: string; lv: number; conc?: boolean; at: number; by?: string }

/** Los que siguen en vigor: los de concentración solo mientras se concentra en ese conjuro. */
export function liveEffects(active: ActiveEffect[] | undefined, conds: string[]): (ActiveEffect & { fx: SpellFx })[] {
  const conc = concOf(conds);
  return (active || []).flatMap((e) => {
    if (e.conc && conc !== e.n) return [];
    const hit = all().find((x) => x.keys[0] === e.k);
    return hit ? [{ ...e, fx: hit.fx }] : [];
  });
}

/** Los activos que ya no valen (perdió la concentración): para quitarlos y quitar su estado. */
export function staleEffects(active: ActiveEffect[] | undefined, conds: string[]): ActiveEffect[] {
  const conc = concOf(conds);
  return (active || []).filter((e) => e.conc && conc !== e.n);
}

/** Conjuro sobre otro que se manda a la mesa (por la sala): el máster lo aplica a sus objetivos. */
export interface SpellBuff { k: string; n: string; lv: number; conc: boolean; note: string }

/**
 * Lo que cambia en la hoja al recibir el conjuro: el efecto activo, su estado, los PG de Auxilio y los PG temporales
 * (fijos; si son de dados, se devuelven para tirarlos). `by`: quien lo lanzó, si es otro.
 */
export function castOnPatch(c: { active?: ActiveEffect[]; conds: string[]; hp: number; temp: number }, key: string, n: string, lv: number, conc: boolean, mods: Record<Abil, number>, by?: string):
  { patch: { active?: ActiveEffect[]; conds?: string[]; hp?: number; temp?: number }; tempDice: string | null } {
  const hit = all().find((x) => x.keys[0] === key);
  if (!hit) return { patch: {}, tempDice: null };
  const f = hit.fx;
  const patch: { active?: ActiveEffect[]; conds?: string[]; hp?: number; temp?: number } = {};
  if (!f.instant) patch.active = [...(c.active || []).filter((e) => e.k !== key), { k: key, n, lv, conc, at: Date.now(), ...(by ? { by } : {}) }];
  if (f.cond && !c.conds.includes(f.cond)) patch.conds = [...c.conds, f.cond];
  // Auxilio: los PG actuales suben lo mismo que los máximos
  if (f.hpMax) { const prev = (c.active || []).find((e) => e.k === key); patch.hp = c.hp + f.hpMax(lv) - (prev ? f.hpMax(prev.lv) : 0); }
  let tempDice: string | null = null;
  if (f.temp) {
    const expr = f.temp(lv, mods);
    if (/d/.test(expr)) tempDice = expr;
    else patch.temp = Math.max(c.temp, Number(expr) || 0); // PG temporales: no se suman, se queda el mayor
  }
  return { patch, tempDice };
}

/** Estado que pone un efecto (si pone alguno). */
export const fxCond = (k: string): string | undefined => all().find((x) => x.keys[0] === k)?.fx.cond;
