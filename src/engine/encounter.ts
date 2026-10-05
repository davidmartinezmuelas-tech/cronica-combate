import { XP_BUDGET } from '../data/constants';
import type { Monster } from '../data/types';

/** 0 baja, 1 moderada, 2 alta (reglas 2024). */
export type DiffLevel = 0 | 1 | 2;
export const DIFF_NAMES = ['Baja', 'Moderada', 'Alta'] as const;

export interface Pick {
  m: Monster;
  n: number;
}

export interface Proposal {
  picks: Pick[];
  xp: number;
  style: string;
}

/** Presupuesto de PX del grupo: [baja, moderada, alta]. */
export function partyBudget(levels: number[]): [number, number, number] {
  const b: [number, number, number] = [0, 0, 0];
  for (const l of levels) {
    const r = XP_BUDGET[Math.max(1, Math.min(20, Math.round(l) || 1)) - 1];
    b[0] += r[0]; b[1] += r[1]; b[2] += r[2];
  }
  return b;
}

/**
 * PX que debe sumar el encuentro para quedar en esa dificultad: desde el umbral elegido hasta justo antes del
 * siguiente (en Alta, hasta un 25 % por encima, para no proponer matanzas).
 */
export function targetRange(b: [number, number, number], d: DiffLevel): [number, number] {
  const lo = b[d];
  const hi = d < 2 ? b[d + 1] - 1 : Math.round(b[2] * 1.25);
  return [lo, Math.max(lo, hi)];
}

const pick = <T,>(arr: T[], rng: () => number): T => arr[Math.floor(rng() * arr.length)];

/**
 * Propone monstruos cuyos PX sumen dentro del rango. Prueba tres estilos al azar: una sola criatura, un grupo
 * de la misma criatura o un jefe con secuaces. Devuelve null si nada del bestiario filtrado encaja.
 */
export function proposeEncounter(pool: Monster[], range: [number, number], rng: () => number = Math.random): Proposal | null {
  const [lo, hi] = range;
  const ok = pool.filter((m) => (m.xp || 0) > 0 && m.xp <= hi);
  if (!ok.length || hi <= 0) return null;
  const fits = (x: number) => x >= lo && x <= hi;
  const styles = ['solo', 'grupo', 'jefe'].sort(() => rng() - 0.5);
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const style of styles) {
      if (style === 'solo') {
        const c = ok.filter((m) => fits(m.xp));
        if (c.length) { const m = pick(c, rng); return { picks: [{ m, n: 1 }], xp: m.xp, style: 'Una criatura' }; }
      } else if (style === 'grupo') {
        const opts: Pick[] = [];
        for (const m of ok) for (let n = 2; n <= 6; n++) if (fits(m.xp * n)) opts.push({ m, n });
        if (opts.length) { const p = pick(opts, rng); return { picks: [p], xp: p.m.xp * p.n, style: 'Un grupo' }; }
      } else {
        const leaders = ok.filter((m) => m.xp >= lo * 0.35 && m.xp <= hi * 0.75);
        for (let t = 0; t < 40 && leaders.length; t++) {
          const boss = pick(leaders, rng);
          const rest = [lo - boss.xp, hi - boss.xp];
          const minions: Pick[] = [];
          for (const m of ok) {
            if (m.id === boss.id || m.xp > boss.xp / 2) continue;
            for (let n = 2; n <= 6; n++) if (m.xp * n >= rest[0] && m.xp * n <= rest[1]) minions.push({ m, n });
          }
          if (minions.length) {
            const mi = pick(minions, rng);
            return { picks: [{ m: boss, n: 1 }, mi], xp: boss.xp + mi.m.xp * mi.n, style: 'Un jefe con secuaces' };
          }
        }
      }
    }
  }
  return null;
}
