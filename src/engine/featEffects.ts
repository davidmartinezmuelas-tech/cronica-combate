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
];

/** Efectos de las dotes que tiene (por nombre), cada uno con el nombre de la dote que lo da. */
export function featEffects(names: string[]): { n: string; e: FeatEffect }[] {
  const have = new Set(names.map(norm));
  return FEAT_EFFECTS.filter((f) => f.n.some((x) => have.has(norm(x)))).map((f) => ({ n: names.find((x) => f.n.some((y) => norm(y) === norm(x)))!, e: f.e }));
}
