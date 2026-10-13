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
];

/** Efecto del conjuro (por su nombre en inglés o en español), o null si no cambia la hoja. */
export function spellFx(s: { en?: string; n: string }): { key: string; fx: SpellFx } | null {
  const en = (s.en || '').toLowerCase();
  const n = norm(s.n);
  const hit = FX.find((x) => (en && x.keys[0].toLowerCase() === en) || x.keys.some((k) => norm(k) === n));
  return hit ? { key: hit.keys[0], fx: hit.fx } : null;
}

/** Efecto activo en la hoja (conjuro lanzado sobre el personaje). */
export interface ActiveEffect { k: string; n: string; lv: number; conc?: boolean; at: number; by?: string }

/** Los que siguen en vigor: los de concentración solo mientras se concentra en ese conjuro. */
export function liveEffects(active: ActiveEffect[] | undefined, conds: string[]): (ActiveEffect & { fx: SpellFx })[] {
  const conc = concOf(conds);
  return (active || []).flatMap((e) => {
    if (e.conc && conc !== e.n) return [];
    const hit = FX.find((x) => x.keys[0] === e.k);
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
  const hit = FX.find((x) => x.keys[0] === key);
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
export const fxCond = (k: string): string | undefined => FX.find((x) => x.keys[0] === k)?.fx.cond;
