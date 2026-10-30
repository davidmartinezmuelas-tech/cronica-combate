import { beforeEach, describe, expect, it } from 'vitest';
import type { Combatant } from '../data/types';
import { useStore } from '../store/useStore';

const base = (o: Partial<Combatant>): Combatant => ({
  id: 'x', kind: 'monster', name: 'X', init: 10, initBonus: 0, hp: 20, maxHp: 20, temp: 0, ac: 12, conds: [], conc: false, exh: 0, react: false,
  lrMax: 0, lrUsed: 0, laMax: 0, laUsed: 0, used: {}, spent: {}, spUsed: {}, ...o,
});
const texts = () => useStore.getState().history.map((e) => e.text);

describe('historial del combate en el store', () => {
  beforeEach(() => {
    useStore.setState({ combatants: [base({ id: 'a', name: 'Ana', kind: 'pc', init: 18 }), base({ id: 'b', name: 'Goblin', init: 12 })], history: [], undoStack: [], started: false, round: 1, activeId: null });
  });

  it('anota el comienzo, el daño, la curación, los estados y los turnos, y la ronda nueva', () => {
    const s = useStore.getState();
    s.startCombat();
    expect(texts()[0]).toMatch(/^Comienza el combate/);
    expect(texts()[1]).toBe('Turno de Ana');
    useStore.getState().applyParts({ b: 'full' }, [{ amt: 7, type: 'cortante' }]);
    expect(texts().some((t) => /^Goblin recibe 7 de daño/.test(t))).toBe(true);
    useStore.getState().heal('b', 3);
    expect(texts().some((t) => /^Goblin se cura/.test(t))).toBe(true);
    useStore.getState().toggleCond('b', 'Aturdido');
    expect(texts().at(-1)).toBe('Goblin pasa a estar Aturdido');
    useStore.getState().toggleCond('b', 'Aturdido');
    expect(texts().at(-1)).toBe('Goblin deja de tener Aturdido');
    useStore.getState().step(1);
    useStore.getState().step(1);
    const h = useStore.getState().history;
    expect(h.at(-2)).toMatchObject({ k: 'turno', text: 'Empieza la ronda 2', r: 2 });
    expect(h.at(-1)).toMatchObject({ k: 'turno', text: 'Turno de Ana' });
  });

  it('deshacer quita también la anotación de la acción', () => {
    useStore.getState().startCombat();
    const before = useStore.getState().history.length;
    useStore.getState().applyParts({ b: 'full' }, [{ amt: 5, type: '' }]);
    expect(useStore.getState().history.length).toBeGreaterThan(before);
    useStore.getState().undo();
    expect(useStore.getState().history).toHaveLength(before);
  });

  it('vaciar el historial se puede deshacer, y empezar otro combate parte de cero', () => {
    useStore.getState().startCombat();
    useStore.getState().clearHistory();
    expect(useStore.getState().history).toHaveLength(0);
    useStore.getState().undo();
    expect(useStore.getState().history.length).toBeGreaterThan(0);
    useStore.getState().endCombat();
    expect(texts().at(-1)).toMatch(/^Fin del combate/);
    useStore.setState({ combatants: useStore.getState().combatants.map((c) => ({ ...c, init: c.kind === 'pc' ? 10 : 12 })) });
    useStore.getState().startCombat();
    expect(texts()[0]).toMatch(/^Comienza el combate/);
    expect(useStore.getState().history.some((e) => /Fin del combate/.test(e.text))).toBe(false);
  });
});
