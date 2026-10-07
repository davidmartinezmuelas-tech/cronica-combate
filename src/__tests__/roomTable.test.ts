import { beforeEach, describe, expect, it } from 'vitest';
import type { RoomMember, SheetSummary } from '../store/cloudAdapter';
import { applyInitiativeRolls, resetRoomTable, syncMembersToTable, watchTableForPlayers } from '../store/roomTable';
import { useStore } from '../store/useStore';

const sheet = (o: Partial<SheetSummary>): SheetSummary => ({ name: 'Ana', cls: 'Guerrero', level: 3, ac: 16, hp: 28, hpMax: 28, temp: 0, pp: 12, init: 2, conds: [], ...o });
const member = (uid: string, name: string, s: SheetSummary | null): RoomMember => ({ uid, name, role: 'player', sheet: s, at: 1 });

describe('jugadores de la sala en la mesa del máster', () => {
  beforeEach(() => {
    resetRoomTable();
    useStore.setState({ roster: [{ id: 'r-jim', name: 'Jimena', player: '', cls: '', level: '1', ac: '10', hp: '10', initb: '0', pp: '10', res: [] }], combatants: [] });
  });

  it('crea o enlaza su entrada del Grupo y los añade al combate una sola vez', () => {
    syncMembersToTable([member('u1', 'Laura', sheet({ name: 'Jimena', ac: 15, hpMax: 43, hp: 40 })), member('u2', 'Pablo', sheet({ name: 'Korvak', ac: 18, hpMax: 32, hp: 32 })), member('u3', 'Sin hoja', null)]);
    const s = useStore.getState();
    expect(s.roster.map((r) => [r.name, r.player, r.ac, r.hp, r.roomUid])).toEqual([['Jimena', 'Laura', '15', '43', 'u1'], ['Korvak', 'Pablo', '18', '32', 'u2']]);
    expect(s.combatants.map((c) => [c.name, c.hp, c.maxHp, c.ac, c.initBonus])).toEqual([['Jimena', 40, 43, 15, 2], ['Korvak', 32, 32, 18, 2]]);
    // si el máster quita a uno del combate, no vuelve solo
    useStore.setState({ combatants: s.combatants.filter((c) => c.name !== 'Korvak') });
    syncMembersToTable([member('u2', 'Pablo', sheet({ name: 'Korvak', ac: 18, hpMax: 32, hp: 30 }))]);
    expect(useStore.getState().combatants.map((c) => c.name)).toEqual(['Jimena']);
  });

  it('solo aplica lo que cambia el jugador: el daño que pone el máster no se pisa', () => {
    syncMembersToTable([member('u1', 'Laura', sheet({ hp: 28 }))]);
    const id = useStore.getState().combatants[0].id;
    // el máster le hace 10 de daño en la mesa
    useStore.setState({ combatants: useStore.getState().combatants.map((c) => (c.id === id ? { ...c, hp: 18 } : c)) });
    // el jugador cambia otra cosa (estados): los PG del máster se quedan
    syncMembersToTable([member('u1', 'Laura', sheet({ hp: 28, conds: ['Envenenado'] }))]);
    expect(useStore.getState().combatants[0].hp).toBe(18);
    // el jugador se cura en su hoja: llega
    syncMembersToTable([member('u1', 'Laura', sheet({ hp: 25, temp: 5 }))]);
    expect([useStore.getState().combatants[0].hp, useStore.getState().combatants[0].temp]).toEqual([25, 5]);
  });

  it('su tirada de iniciativa rellena la suya si no la tiene', () => {
    const ms = [member('u1', 'Laura', sheet({}))];
    syncMembersToTable(ms);
    applyInitiativeRolls([{ id: 'x1', uid: 'u1', who: 'Laura', label: 'Ana · Espada: ataque', total: '17', detail: '', cls: '', at: 1 }, { id: 'x2', uid: 'u1', who: 'Laura', label: 'Ana · iniciativa', total: '14', detail: '', cls: '', at: 2 }], ms);
    expect(useStore.getState().combatants[0].init).toBe(14);
    applyInitiativeRolls([{ id: 'x3', uid: 'u1', who: 'Laura', label: 'Ana · iniciativa', total: '3', detail: '', cls: '', at: 3 }], ms);
    expect(useStore.getState().combatants[0].init).toBe(14); // ya la tenía
  });
});

describe('el daño del máster llega a la hoja del jugador', () => {
  beforeEach(() => {
    resetRoomTable();
    useStore.setState({ roster: [], combatants: [] });
  });

  it('se envía lo que cambia el máster (agrupado), no lo que llegó del jugador', async () => {
    const { vi } = await import('vitest');
    vi.useFakeTimers();
    const sent: [string, string, number, number][] = [];
    const stop = watchTableForPlayers((to, charId, hp, temp) => sent.push([to, charId, hp, temp]));
    syncMembersToTable([member('u1', 'Laura', sheet({ hp: 28, charId: 'pj-ana' }))]);
    await vi.advanceTimersByTimeAsync(600);
    expect(sent).toEqual([]); // vino del jugador
    const id = useStore.getState().combatants[0].id;
    const hit = (hp: number, temp = 0) => useStore.setState({ combatants: useStore.getState().combatants.map((c) => (c.id === id ? { ...c, hp, temp } : c)) });
    hit(20); hit(14, 3);
    await vi.advanceTimersByTimeAsync(600);
    expect(sent).toEqual([['u1', 'pj-ana', 14, 3]]);
    // el jugador publica esos mismos PG: no se vuelven a aplicar ni a enviar
    syncMembersToTable([member('u1', 'Laura', sheet({ hp: 14, temp: 3, charId: 'pj-ana' }))]);
    await vi.advanceTimersByTimeAsync(600);
    expect(sent).toHaveLength(1);
    expect(useStore.getState().combatants[0].hp).toBe(14);
    stop();
    vi.useRealTimers();
  });
});

describe('lanzamientos de los jugadores y lista de iniciativa', () => {
  beforeEach(() => { resetRoomTable(); useStore.setState({ roster: [], combatants: [], result: null, dmgTargets: {}, effectSel: null }); });

  it('la lista para los jugadores no lleva números de los monstruos', async () => {
    const { tableOf } = await import('../store/roomTable');
    syncMembersToTable([member('u1', 'Laura', sheet({ name: 'Ana' }))]);
    const s = useStore.getState();
    const ogre = { ...s.combatants[0], id: 'm1', kind: 'monster' as const, name: 'Ogro', rosterId: undefined, ac: 11, hp: 59 };
    useStore.setState({ combatants: [...s.combatants, ogre] });
    const list = tableOf(useStore.getState().combatants, useStore.getState().roster);
    expect(list).toEqual([{ id: s.combatants[0].id, name: 'Ana', kind: 'pc', roomUid: 'u1' }, { id: 'm1', name: 'Ogro', kind: 'monster' }]);
  });

  it('revisar: con ataque marca a quién acierta según su CA; con salvación pasa al paso de objetivos', async () => {
    const { reviewCast } = await import('../store/roomTable');
    syncMembersToTable([member('u1', 'Laura', sheet({ name: 'Ana' }))]);
    const base = useStore.getState().combatants[0];
    useStore.setState({ combatants: [{ ...base, id: 'a', name: 'Ogro', kind: 'monster', ac: 11 }, { ...base, id: 'b', name: 'Dragón', kind: 'monster', ac: 19 }] });
    const notes = reviewCast({ id: 'c1', uid: 'u1', who: 'Ana', label: 'Rayo de fuego: daño', targets: ['a', 'b'], at: 1, parts: [{ type: 'fuego', amt: 9 }], crit: false, attack: 15, heal: null, effect: null });
    expect(notes).toBe('Ogro acierta (CA 11), Dragón falla (CA 19)');
    expect(useStore.getState().dmgTargets).toEqual({ a: 'full' });
    const effect = { dc: 14, abil: 1, half: true, conds: [], rounds: null, until: null, repeat: false };
    reviewCast({ id: 'c2', uid: 'u1', who: 'Ana', label: 'Bola de fuego: daño', targets: ['a', 'b', 'gone'], at: 2, parts: [{ type: 'fuego', amt: 28 }], crit: false, attack: null, heal: null, effect });
    expect([useStore.getState().result!.effect?.dc, useStore.getState().effectSel]).toEqual([14, ['a', 'b']]);
  });
});
