import { describe, expect, it } from 'vitest';
import { conditionsIn } from '../engine/saveEffect';
import { useStore } from '../store/useStore';

describe('estados al impactar', () => {
  it('se reconocen en el texto de un ataque y se aplican con su daño a los objetivos elegidos', () => {
    expect(conditionsIn('Impacto: 6 (1d6 + 3) de daño perforante. Además, el objetivo tiene la condición Agarrado (CD de escape 13).')).toEqual(['Agarrado']);
    const base = { init: 10, initBonus: 0, hp: 20, maxHp: 20, temp: 0, ac: 12, conds: [], conc: false, exh: 0, react: false };
    useStore.setState({
      combatants: [{ ...base, id: 'a', name: 'Ana', kind: 'pc' }, { ...base, id: 'b', name: 'Bo', kind: 'pc' }] as never,
      started: false, dmgTargets: { a: 'full' },
      result: { label: 'Lobo · Mordisco: daño', total: '7', detail: '', cls: '', note: '', isDmg: true, parts: [{ type: 'perforante', amt: 7 }], half: false, by: null, onHit: { dc: 0, abil: 0, half: false, conds: ['Derribado'], rounds: null, until: null, repeat: false } } as never,
    });
    useStore.getState().applyRolled();
    const [a, b] = useStore.getState().combatants;
    expect(a.hp).toBe(13);
    expect(a.conds.map((x) => x.k)).toEqual(['Derribado']);
    expect(b.conds).toEqual([]);
    expect(useStore.getState().result?.note).toBe('Daño aplicado y derribado.');
  });
});

describe('varios rayos a objetivos distintos', () => {
  it('cada rayo aplica su daño a su objetivo; sin objetivo no hace daño', () => {
    const base = { init: 10, initBonus: 0, hp: 30, maxHp: 30, temp: 0, ac: 12, conds: [], conc: false, exh: 0, react: false };
    useStore.setState({
      combatants: [{ ...base, id: 'a', name: 'Ana', kind: 'pc' }, { ...base, id: 'b', name: 'Bo', kind: 'pc' }] as never,
      started: false, dmgTargets: {},
      dmgShots: [{ a: 'full' }, { b: 'full' }, {}],
      result: { label: 'Descarga', total: '', detail: '', cls: '', note: '', isDmg: true, parts: [{ type: 'fuerza', amt: 18 }], half: false, by: null,
        shots: [{ parts: [{ type: 'fuerza', amt: 5 }], total: 5, crit: false }, { parts: [{ type: 'fuerza', amt: 9 }], total: 9, crit: true }, { parts: [{ type: 'fuerza', amt: 4 }], total: 4, crit: false }] },
    });
    useStore.getState().applyRolled();
    const [a, b] = useStore.getState().combatants;
    expect(a.hp).toBe(25);
    expect(b.hp).toBe(21);
  });
});
