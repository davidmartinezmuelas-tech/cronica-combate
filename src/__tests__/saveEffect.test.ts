import { describe, expect, it } from 'vitest';
import { abilIndex, conditionsIn, durationIn, saveEffectOf } from '../engine/saveEffect';
import { makeMonsterCombatant } from '../engine/combat';
import { useStore } from '../store/useStore';
import type { Monster } from '../data/types';

describe('efectos con salvación', () => {
  it('lee estados, duración y característica de textos (inventados)', () => {
    expect(conditionsIn('Fallo: el objetivo tiene la condición Derribado.')).toEqual(['Derribado']);
    expect(conditionsIn('tendrá los estados de cegado y ensordecido')).toEqual(['Cegado', 'Ensordecido']);
    expect(conditionsIn('Recibe 2d6 de daño de fuego.')).toEqual([]);
    expect(durationIn('queda asustado hasta el final de tu siguiente turno')).toEqual({ rounds: 1, until: 'caster', repeat: false });
    expect(durationIn('durante 1 minuto. Repite la salvación al final de cada uno de sus turnos')).toEqual({ rounds: 10, until: 'target', repeat: true });
    expect(['DES', 'Sabiduría', 'con', 'wis'].map(abilIndex)).toEqual([1, 4, 2, 4]);
    expect(saveEffectOf(14, 'FUE', false, 'Impacto: el objetivo queda agarrado (CD de escape 14).')).toBeNull(); // no es una salvación
    expect(saveEffectOf(15, 'DES', true, 'Tirada de salvación de Destreza: CD 15. Fallo: 6d6 de daño de fuego. Éxito: la mitad.', 'm1')).toMatchObject({ dc: 15, abil: 1, half: true, conds: [], by: 'm1' });
  });

  it('al aplicar: daño completo a quien falla, mitad a quien supera y estados solo a quien falla', () => {
    const mon = { id: 'x', n: 'Bicho', ac: 12, hp: 40, hd: '', sv: [0, 0, 0, 0, 0, 0] } as unknown as Monster;
    const a = { ...makeMonsterCombatant(mon, { name: 'A', inLair: false, rollHp: false, grp: 'g' }), hp: 40, maxHp: 40 };
    const b = { ...makeMonsterCombatant(mon, { name: 'B', inLair: false, rollHp: false, grp: 'g' }), hp: 40, maxHp: 40 };
    useStore.setState({ combatants: [a, b], started: false, activeId: null, result: null });
    const effect = { dc: 15, abil: 1, half: true, conds: ['Derribado'], rounds: null, until: null, repeat: false };
    useStore.getState().applyEffect([{ id: a.id, total: 9, fail: true }, { id: b.id, total: 18, fail: false }], effect, ['Derribado'], [{ type: 'fuego', amt: 20 }]);
    const [ra, rb] = useStore.getState().combatants;
    expect([ra.hp, rb.hp]).toEqual([20, 30]);
    expect([ra.conds.map((c) => c.k), rb.conds.map((c) => c.k)]).toEqual([['Derribado'], []]);
    expect(useStore.getState().log[0].label).toMatch(/salvación de Destreza CD 15/);
  });
});
