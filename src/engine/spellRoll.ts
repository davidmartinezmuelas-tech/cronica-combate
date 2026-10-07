import { DMG_TYPES } from '../data/constants';
import type { Abil } from '../data/player';
import { norm } from './util';

/**
 * Qué tira un conjuro, leído de su texto (SRD o libro del usuario): ataque de conjuro, salvación, daño o curación,
 * cómo mejora un truco con el nivel y cómo sube con un espacio de nivel superior.
 */
export interface SpellRoll {
  attack: 'cuerpo a cuerpo' | 'a distancia' | null;
  save: Abil | null;
  half: boolean; // mitad del daño si supera la salvación
  damage: { dice: string; flat: number; type: string; mod: boolean } | null;
  heal: { dice: string; mod: boolean } | null;
  count: number; // rayos o dardos (cada uno con su daño)
  cantrip: 'dice' | 'count' | null; // el truco mejora en los niveles 5, 11 y 17: más dados o más rayos
  upDice: string; // dados que suma cada nivel de espacio por encima del suyo
  upCount: boolean; // un rayo o dardo más por cada nivel de espacio por encima
}

const ABIL: Record<string, Abil> = { fuerza: 'str', destreza: 'dex', constitucion: 'con', inteligencia: 'int', sabiduria: 'wis', carisma: 'cha' };
const NUM: Record<string, number> = { dos: 2, tres: 3, cuatro: 4, cinco: 5 };

/** Texto sin marcas y con los dados que el OCR estropea («148» -> «1d8», «144 +1» -> «1d4 +1»). */
function clean(t: string): string {
  return t
    .replace(/\*\*|\*|\[\[[^|\]]+\|([^\]]+)\]\]/g, (_m, a) => a || '')
    .replace(/\b14(4|6|8|10|12)\b(?=\s*(?:\+|más|de daño|de dano))/g, '1d$1')
    .replace(/\s+/g, ' ');
}

const typeOf = (w: string) => DMG_TYPES.find((t) => norm(t) === norm(w)) || '';

export function spellRoll(text: string): SpellRoll | null {
  const t = clean(text || '');
  const n = norm(t);
  const r: SpellRoll = { attack: null, save: null, half: false, damage: null, heal: null, count: 1, cantrip: null, upDice: '', upCount: false };
  const atk = /ataque de conjuro (cuerpo a cuerpo|a distancia)/.exec(n);
  if (atk) r.attack = atk[1] as SpellRoll['attack'];
  const sv = /tirada de salvacion de (fuerza|destreza|constitucion|inteligencia|sabiduria|carisma)/.exec(n);
  if (sv) r.save = ABIL[sv[1]];
  r.half = /mitad del dano|la mitad si (tiene exito|la supera|supera)/.test(n);
  // daño: «8d6 de daño de fuego», «1d4 + 1 de daño de fuerza» o «daño de fuerza igual a 1d8 + tu modificador»
  const d1 = /(\d+d\d+)(?:\s*\+\s*(\d+))?\s+(?:adicional )?(?:de )?dano(?: de)? (\p{L}+)/u.exec(n);
  const d2 = /dano de (\p{L}+) igual a (\d+d\d+)\s*(?:\+|mas) tu modificador/u.exec(n);
  if (d2 && (!d1 || d2.index < d1.index)) r.damage = { dice: d2[2], flat: 0, type: typeOf(d2[1]), mod: true };
  else if (d1) r.damage = { dice: d1[1], flat: d1[2] ? parseInt(d1[2], 10) : 0, type: typeOf(d1[3]), mod: false };
  // curación: «recupera … 2d8 más tu modificador»
  const h = /(recupera|restablece|recuperan|restaurar|restaura)[^.]{0,90}?(\d+d\d+)(?:\s*\+\s*(\d+)(?!d))?( (?:\+|mas) tu modificador)?/.exec(n);
  if (h && (!r.damage || h.index < (n.indexOf(r.damage.dice)))) r.heal = { dice: h[2] + (h[3] ? '+' + h[3] : ''), mod: !!h[4] };
  if (r.heal && r.damage && n.indexOf(r.heal.dice) < n.indexOf(r.damage.dice)) r.damage = null;
  if (!r.damage && !r.heal && !r.attack && !r.save) return null;
  // rayos o dardos
  // (solo si cada uno impacta por su cuenta: con ataque, o dardos que siempre aciertan; en un área el daño es uno)
  const cnt = /\b(dos|tres|cuatro|cinco) (rayos|dardos|haces)\b/.exec(n);
  if (cnt && (r.attack || cnt[2] === 'dardos')) r.count = NUM[cnt[1]];
  // truco: «aumenta en 1d8 cuando alcanzas los niveles 5» o «crea dos rayos a nivel 5»
  if (/aumenta en \d+d\d+ cuando alcanzas los niveles 5/.test(n)) r.cantrip = 'dice';
  else if (/(dos|2) (rayos|haces) a nivel 5/.test(n)) r.cantrip = 'count';
  // espacio de nivel superior
  const up = /aumenta en (\d+d\d+) por cada nivel/.exec(n);
  if (up) r.upDice = up[1];
  r.upCount = /(rayo|dardo|haz) (adicional|mas) por cada nivel/.test(n);
  return r;
}

/** Multiplica los dados de una fórmula («2d6» x 3 -> «6d6»). */
const times = (dice: string, k: number) => dice.replace(/(\d+)d(\d+)/, (_, a, b) => parseInt(a, 10) * k + 'd' + b);
/** Suma dados del mismo tamaño («8d6» + 2 x «1d6» -> «10d6»). */
function addDice(dice: string, extra: string, k: number): string {
  const a = /(\d+)d(\d+)/.exec(dice), b = /(\d+)d(\d+)/.exec(extra);
  if (!a || !b || k <= 0) return dice;
  if (a[2] === b[2]) return parseInt(a[1], 10) + parseInt(b[1], 10) * k + 'd' + a[2];
  return dice + '+' + times(extra, k);
}

export interface SpellCast {
  dmg: { expr: string; type: string } | null; // daño de cada impacto
  heal: string;
  count: number; // impactos (rayos, dardos)
}

/**
 * Las fórmulas al lanzarlo: con el nivel del personaje (trucos) y el nivel del espacio (por encima del suyo).
 * `mod`: modificador de la característica de lanzar conjuros (también si una dote o rasgo lo suma).
 */
export function spellCast(r: SpellRoll, spellLevel: number, slot: number, charLevel: number, mod: number, plusMod = false): SpellCast {
  const tier = charLevel >= 17 ? 4 : charLevel >= 11 ? 3 : charLevel >= 5 ? 2 : 1;
  const above = Math.max(0, slot - spellLevel);
  let count = r.count;
  if (spellLevel === 0 && r.cantrip === 'count') count = tier;
  if (r.upCount) count += above;
  const withMod = (expr: string, add: boolean, flat = 0) => {
    const b = (add ? mod : 0) + flat;
    return b ? expr + (b > 0 ? '+' : '') + b : expr;
  };
  let dmg: SpellCast['dmg'] = null;
  if (r.damage) {
    let dice = r.damage.dice;
    if (spellLevel === 0 && r.cantrip === 'dice') dice = times(dice, tier);
    if (r.upDice) dice = addDice(dice, r.upDice, above);
    dmg = { expr: withMod(dice, r.damage.mod || plusMod, r.damage.flat), type: r.damage.type };
  }
  let heal = '';
  if (r.heal) heal = withMod(r.upDice ? addDice(r.heal.dice, r.upDice, above) : r.heal.dice, r.heal.mod);
  return { dmg, heal, count };
}
