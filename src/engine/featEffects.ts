import { norm } from './util';

/**
 * Dotes que cambian números de la hoja y se aplican solas al elegirlas. Solo la mecánica (+2, +1…); el texto de cada
 * dote sale del SRD o de la biblioteca propia. `n`: nombres (libro, SRD y en inglés).
 */
export interface FeatEffect {
  atkRanged?: number; // ataque con armas a distancia
  dmgOneHand?: number; // daño con arma cuerpo a cuerpo a una mano
  dmgThrown?: number; // daño con armas arrojadizas a distancia
  dmgHeavyProf?: boolean; // + competencia al daño con armas pesadas
  minDie2h?: number; // los dados de daño a dos manos valen como mínimo esto
  acArmor?: number; // CA llevando armadura
  initProf?: boolean; // + competencia a la iniciativa
  hpPerLevel?: number;
  hpFlat?: number;
  speed?: number; // pies
  offAny?: boolean; // ataque extra con cualquier arma cuerpo a cuerpo a una mano, no solo ligera
  offMod?: boolean; // el ataque extra suma el modificador al daño
  offModCrossbow?: boolean; // … si es una ballesta ligera
  pole?: boolean; // ataque con el otro extremo (1d4 contundente)
  savage?: boolean; // tirar dos veces los dados de daño del arma (una vez por turno)
  charge?: string; // daño extra tras cargar (una vez por turno)
  unarmed?: { die: number; free?: number; reroll1?: boolean; grapple?: string }; // ataque sin armas mejorado
  luck?: boolean; // puntos de suerte = competencia
  recovery?: boolean; // reserva de 10d10 y Última defensa
  hdHeal?: boolean; // gastar un dado de golpe como acción adicional
  parryProf?: boolean; // reacción: +competencia a la CA
  armorReduce?: boolean; // reduce el daño contundente, cortante y perforante en competencia
  critScore?: boolean; // con un 20 natural, + la puntuación de característica al daño
}

export const FEAT_EFFECTS: { n: string[]; e: FeatEffect }[] = [
  { n: ['Tiro con arco', 'Archery'], e: { atkRanged: 2 } },
  { n: ['Duelo', 'Dueling'], e: { dmgOneHand: 2 } },
  { n: ['Combate con armas arrojadizas', 'Thrown Weapon Fighting'], e: { dmgThrown: 2 } },
  { n: ['Combate con armas a dos manos', 'Combate con arma a dos manos', 'Great Weapon Fighting'], e: { minDie2h: 3 } },
  { n: ['Maestro en armas pesadas', 'Great Weapon Master'], e: { dmgHeavyProf: true } },
  { n: ['Defensa', 'Defense'], e: { acArmor: 1 } },
  { n: ['Alerta', 'Alert'], e: { initProf: true } },
  { n: ['Duro', 'Tough'], e: { hpPerLevel: 2 } },
  { n: ['Don de la fortaleza', 'Boon of Fortitude'], e: { hpFlat: 40 } },
  { n: ['Veloz', 'Speedy'], e: { speed: 10 } },
  { n: ['Don de la velocidad', 'Boon of Speed'], e: { speed: 30 } },
  { n: ['Combatiente con dos armas', 'Dual Wielder'], e: { offAny: true } },
  { n: ['Combate con dos armas', 'Two-Weapon Fighting'], e: { offMod: true } },
  { n: ['Experto en ballestas', 'Crossbow Expert'], e: { offModCrossbow: true } },
  { n: ['Maestro en armas de asta', 'Polearm Master'], e: { pole: true } },
  { n: ['Atacante salvaje', 'Savage Attacker'], e: { savage: true } },
  { n: ['Atacante a la carga', 'Charger'], e: { charge: '1d8' } },
  { n: ['Matón de taberna', 'Tavern Brawler'], e: { unarmed: { die: 4, reroll1: true } } },
  { n: ['Combate sin armas', 'Unarmed Fighting'], e: { unarmed: { die: 6, free: 8, grapple: '1d4' } } },
  { n: ['Afortunado', 'Lucky'], e: { luck: true } },
  { n: ['Don de la recuperación', 'Boon of Recovery'], e: { recovery: true } },
  { n: ['Resistente', 'Durable'], e: { hdHeal: true } },
  { n: ['Duelista defensivo', 'Defensive Duelist'], e: { parryProf: true } },
  { n: ['Maestro en armaduras pesadas', 'Heavy Armor Master'], e: { armorReduce: true } },
  { n: ['Don del ataque imparable', 'Boon of Irresistible Offense', 'Don de ofensiva irresistible'], e: { critScore: true } },
];

/** Une los efectos de varias dotes (los números se suman; lo demás, el que lo tenga). */
export function mergeEffects(fx: { e: FeatEffect }[]): FeatEffect {
  const out: FeatEffect = {};
  for (const { e } of fx) {
    for (const [k, v] of Object.entries(e) as [keyof FeatEffect, FeatEffect[keyof FeatEffect]][]) {
      const cur = out[k];
      if (typeof v === 'number') (out as Record<string, unknown>)[k] = k === 'minDie2h' ? Math.max((cur as number) || 0, v) : ((cur as number) || 0) + v;
      else if (k === 'unarmed' && v && typeof v === 'object') {
        const u = cur as FeatEffect['unarmed'];
        const n = v as NonNullable<FeatEffect['unarmed']>;
        out.unarmed = { die: Math.max(u?.die || 0, n.die), free: Math.max(u?.free || 0, n.free || 0) || undefined, reroll1: u?.reroll1 || n.reroll1, grapple: u?.grapple || n.grapple };
      } else if (v) (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

/** Efectos de las dotes que tiene (por nombre), cada uno con el nombre de la dote que lo da. */
export function featEffects(names: string[]): { n: string; e: FeatEffect }[] {
  const have = new Set(names.map(norm));
  return FEAT_EFFECTS.filter((f) => f.n.some((x) => have.has(norm(x)))).map((f) => ({ n: names.find((x) => f.n.some((y) => norm(y) === norm(x)))!, e: f.e }));
}
