import { describe, expect, it } from 'vitest';
import type { Monster } from '../data/types';
import { partyBudget, proposeEncounter, targetRange } from '../engine/encounter';

const mon = (id: string, xp: number): Monster => ({ id, n: id, sz: 'Mediano', t: 'humanoide', al: '', ac: 12, hp: 10, hd: '2d8', ini: 0, spd: '30 pies', ab: [10, 10, 10, 10, 10, 10], sv: [0, 0, 0, 0, 0, 0], vul: [], res: [], imm: [], ci: [], pp: 10, cr: '1', xp, pb: 2 });
const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('generador de encuentros', () => {
  it('presupuesto del grupo y rango de cada dificultad (2024)', () => {
    const b = partyBudget([1, 3]);
    expect(b).toEqual([200, 300, 500]);
    expect(targetRange(b, 0)).toEqual([200, 299]);
    expect(targetRange(b, 1)).toEqual([300, 499]);
    expect(targetRange(b, 2)).toEqual([500, 625]);
  });

  it('las propuestas siempre suman PX dentro del rango', () => {
    const pool = [mon('rata', 10), mon('goblin', 50), mon('orco', 100), mon('ogro', 450), mon('troll', 1800)];
    for (let s = 0; s < 50; s++) {
      let x = s * 7919;
      const rng = () => ((x = (x * 16807 + 11) % 2147483647) / 2147483647);
      const p = proposeEncounter(pool, [300, 499], rng)!;
      expect(p).not.toBeNull();
      expect(p.xp).toBe(p.picks.reduce((t, k) => t + k.m.xp * k.n, 0));
      expect(p.xp).toBeGreaterThanOrEqual(300);
      expect(p.xp).toBeLessThanOrEqual(499);
      expect(p.picks.some((k) => k.m.id === 'troll')).toBe(false);
    }
  });

  it('jefe con secuaces: el jefe da más PX que cada secuaz', () => {
    const pool = [mon('goblin', 50), mon('capitán', 200)];
    const p = proposeEncounter(pool, [300, 400], seq([0.9, 0.1, 0.5, 0.5, 0.5]))!;
    if (p.picks.length === 2) expect(p.picks[0].m.xp).toBeGreaterThan(p.picks[1].m.xp);
    expect(p.xp).toBeGreaterThanOrEqual(300);
  });

  it('sin nada que encaje no propone nada', () => {
    expect(proposeEncounter([mon('dragón', 10000)], [300, 499])).toBeNull();
    expect(proposeEncounter([], [300, 499])).toBeNull();
  });
});
