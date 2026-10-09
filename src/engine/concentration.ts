/**
 * Concentración del personaje: se guarda como un estado más («Concentración: Marca del cazador»), así va con sus
 * estados a la sala del máster. Al recibir daño se hace una salvación de Constitución con CD la mitad del daño
 * (mínimo 10, máximo 30).
 */
export const CONC = 'Concentración: ';

/** Conjuro en el que se concentra (o null). */
export const concOf = (conds: string[]): string | null => conds.find((k) => k.startsWith(CONC))?.slice(CONC.length) || null;

/** Estados con la concentración en ese conjuro (lanzar otro conjuro de concentración termina el anterior). */
export const withConc = (conds: string[], spell: string): string[] => [...conds.filter((k) => !k.startsWith(CONC)), CONC + spell];

export const withoutConc = (conds: string[]): string[] => conds.filter((k) => !k.startsWith(CONC));

/** CD de la salvación de concentración por un daño. */
export const concDc = (dmg: number): number => Math.min(30, Math.max(10, Math.floor(dmg / 2)));
