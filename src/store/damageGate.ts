import type { RollSpec } from './state';

/**
 * Filtro previo a toda tirada de daño de la hoja del jugador: si devuelve true, la tirada queda en espera (la hoja
 * pregunta algo, como el Toque de la tumba) y la hoja la lanzará después con `noGate`.
 */
type Gate = (spec: RollSpec) => boolean;
let gate: Gate | null = null;
export const setDamageGate = (g: Gate | null): void => { gate = g; };
export const holdDamage = (spec: RollSpec): boolean => !!gate && gate(spec);
