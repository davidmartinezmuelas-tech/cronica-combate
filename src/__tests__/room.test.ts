import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setCloudAdapter, useAccount } from '../store/account';
import { cleanCode, newCode, useRoom } from '../store/room';
import { resetRoomTable, syncMembersToTable, watchTableToPublish } from '../store/roomTable';
import { useStore } from '../store/useStore';
import { fakeCloud } from './fakeCloud';

const result = (label: string, total: string) => ({ label, total, detail: '[' + total + ']', cls: '' as const, note: '', isDmg: false, parts: [], half: false, by: null });

describe('salas', () => {
  beforeEach(() => {
    useAccount.setState({ status: 'off', user: null, error: '', sync: 'idle', syncError: '' });
    useRoom.setState({ code: null, role: null, name: '', room: null, members: [], rolls: [], share: true, busy: false, error: '' });
    try { localStorage.clear(); } catch { /* nada */ }
  });

  it('códigos de 6 caracteres sin letras que se confunden', () => {
    expect(newCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(cleanCode('ab-c 12x9')).toBe('ABC12X');
  });

  it('el máster crea la sala; un invitado entra con el código; las tiradas compartidas llegan a todos; cerrar echa a todos', async () => {
    const cloud = fakeCloud({ uid: 'dm1', email: 'dm@x.test', name: null, anon: false });
    setCloudAdapter(async () => cloud.adapter);

    // máster
    expect(await useRoom.getState().create('Laura')).toBe(true);
    const code = useRoom.getState().code!;
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(useRoom.getState().role).toBe('dm');
    expect(useRoom.getState().share).toBe(false); // el máster no comparte por defecto
    await vi.waitFor(() => expect(useRoom.getState().members.map((m) => m.role)).toEqual(['dm']));
    useStore.setState({ result: result('Ogro · ataque', '17') });
    expect(cloud.rooms.get(code)!.rolls).toHaveLength(0);

    // ahora entra un jugador sin cuenta (invitado)
    await useRoom.getState().leave();
    await cloud.setUser(null);
    await vi.waitFor(() => expect(useAccount.getState().user).toBeNull());
    expect(await useRoom.getState().join('nope12', 'Ana')).toBe(false);
    expect(useRoom.getState().error).toBe('No hay ninguna sala con ese código.');
    expect(await useRoom.getState().join(code.toLowerCase(), 'Ana')).toBe(true);
    expect(cloud.calls.anon).toBe(1);
    expect(useRoom.getState().role).toBe('player');
    useStore.setState({ result: result('Ana · Espada larga: ataque', '19') });
    await vi.waitFor(() => expect(useRoom.getState().rolls.map((r) => [r.who, r.total])).toEqual([['Ana', '19']]));

    // la hoja resumida se publica (agrupada)
    vi.useFakeTimers();
    useRoom.getState().publishSheet({ name: 'Ana', cls: 'Guerrero', level: 3, ac: 16, hp: 20, hpMax: 28, temp: 0, pp: 12, conds: [] });
    await vi.advanceTimersByTimeAsync(1000);
    vi.useRealTimers();
    expect(cloud.rooms.get(code)!.members.get('anon-1')!.sheet!.ac).toBe(16);

    // el máster cierra la sala: el jugador se queda fuera con aviso
    await cloud.adapter.closeRoom(code);
    await vi.waitFor(() => expect(useRoom.getState().code).toBeNull());
    expect(useRoom.getState().error).toMatch(/se ha cerrado/);
  });
});

describe('avisos del máster al jugador', () => {
  it('el jugador aplica los PG que le envía el máster y ve el aviso', async () => {
    const { usePlayer } = await import('../store/player');
    const { blankCharacter } = await import('../engine/character');
    await usePlayer.getState().init();
    usePlayer.setState({ characters: [{ ...blankCharacter(), id: 'pj-ana', name: 'Ana', hp: 28 }], activeId: 'pj-ana' });
    useAccount.setState({ status: 'off', user: null, error: '', sync: 'idle', syncError: '' });
    useRoom.setState({ code: null, role: null, name: '', room: null, members: [], rolls: [], share: true, busy: false, error: '', notice: '' });
    const cloud = fakeCloud({ uid: 'dm1', email: null, name: null, anon: false });
    setCloudAdapter(async () => cloud.adapter);
    await useRoom.getState().create('Laura');
    const code = useRoom.getState().code!;
    await useRoom.getState().leave();
    await cloud.setUser({ uid: 'p1', email: null, name: null, anon: true });
    await vi.waitFor(() => expect(useAccount.getState().user?.uid).toBe('p1'));
    await useRoom.getState().join(code, 'Ana');
    await cloud.adapter.sendEvent(code, { to: 'p1', from: 'dm1', charId: 'pj-ana', hp: 17, temp: 0, note: '', at: 1 });
    await vi.waitFor(() => expect(usePlayer.getState().characters[0].hp).toBe(17));
    expect(useRoom.getState().notice).toBe('El máster ha cambiado los PG de Ana: 17.');
    expect(cloud.rooms.get(code)!.events).toHaveLength(0); // se borra al aplicarlo
  });

  it('un golpe a 0 PG en la mesa suma los fallos en su hoja', async () => {
    const { usePlayer } = await import('../store/player');
    const { blankCharacter } = await import('../engine/character');
    await usePlayer.getState().init();
    usePlayer.setState({ characters: [{ ...blankCharacter(), id: 'pj-ana', name: 'Ana', hp: 0 }], activeId: 'pj-ana' });
    useAccount.setState({ status: 'off', user: null, error: '', sync: 'idle', syncError: '' });
    useRoom.setState({ code: null, role: null, name: '', room: null, members: [], rolls: [], share: true, busy: false, error: '', notice: '' });
    const cloud = fakeCloud({ uid: 'dm1', email: null, name: null, anon: false });
    setCloudAdapter(async () => cloud.adapter);
    await useRoom.getState().create('Laura');
    const code = useRoom.getState().code!;
    await useRoom.getState().leave();
    await cloud.setUser({ uid: 'p1', email: null, name: null, anon: true });
    await vi.waitFor(() => expect(useAccount.getState().user?.uid).toBe('p1'));
    await useRoom.getState().join(code, 'Ana');
    await cloud.adapter.sendEvent(code, { to: 'p1', from: 'dm1', charId: 'pj-ana', hp: 0, temp: 0, note: '', at: 1, fails: 2 });
    await vi.waitFor(() => expect(usePlayer.getState().characters[0].death.f).toBe(2));
    expect(useRoom.getState().notice).toBe('Te golpean a 0 PG: 2 de 3 fallos de salvación contra la muerte.');
  });

  it('el conjuro que un compañero le lanza (Escudo de fe) llega a su hoja con quién lo lanzó', async () => {
    const { usePlayer } = await import('../store/player');
    const { blankCharacter, derive } = await import('../engine/character');
    await usePlayer.getState().init();
    usePlayer.setState({ characters: [{ ...blankCharacter(), id: 'pj-ana', name: 'Ana', hp: 20 }], activeId: 'pj-ana' });
    useAccount.setState({ status: 'off', user: null, error: '', sync: 'idle', syncError: '' });
    useRoom.setState({ code: null, role: null, name: '', room: null, members: [], rolls: [], share: true, busy: false, error: '', notice: '' });
    const cloud = fakeCloud({ uid: 'dm1', email: null, name: null, anon: false });
    setCloudAdapter(async () => cloud.adapter);
    await useRoom.getState().create('Laura');
    const code = useRoom.getState().code!;
    await useRoom.getState().leave();
    await cloud.setUser({ uid: 'p1', email: null, name: null, anon: true });
    await vi.waitFor(() => expect(useAccount.getState().user?.uid).toBe('p1'));
    await useRoom.getState().join(code, 'Ana');
    const ac0 = derive(usePlayer.getState().characters[0], null).ac;
    await cloud.adapter.sendEvent(code, { to: 'p1', from: 'dm1', charId: 'pj-ana', hp: 0, temp: 0, note: '', at: 1, kind: 'buff', by: 'Ilsa', buff: { k: 'Shield of Faith', n: 'Escudo de fe', lv: 1, conc: true, note: '+2 a la CA' } });
    await vi.waitFor(() => expect(usePlayer.getState().characters[0].active).toHaveLength(1));
    const c = usePlayer.getState().characters[0];
    expect(c.hp).toBe(20); // no toca los PG
    expect(c.active![0].by).toBe('Ilsa');
    expect(derive(c, null).ac).toBe(ac0 + 2); // en otra hoja no depende de su concentración
    expect(useRoom.getState().notice).toContain('Ilsa te ha lanzado Escudo de fe');
  });
});

describe('lanzamientos y peticiones de salvación por la sala', () => {
  it('el jugador manda un lanzamiento y responde a una salvación; al máster le llegan', async () => {
    useAccount.setState({ status: 'off', user: null, error: '', sync: 'idle', syncError: '' });
    useRoom.setState({ code: null, role: null, name: '', room: null, members: [], rolls: [], share: true, busy: false, error: '', notice: '', table: [], casts: [], replies: [], saveRequests: [] });
    const cloud = fakeCloud({ uid: 'dm1', email: null, name: null, anon: false });
    setCloudAdapter(async () => cloud.adapter);
    await useRoom.getState().create('Máster');
    const code = useRoom.getState().code!;
    useRoom.getState().publishTable([{ id: 'm1', name: 'Ogro', kind: 'monster' }]);
    await useRoom.getState().leave();
    await cloud.setUser({ uid: 'p1', email: null, name: null, anon: true });
    await vi.waitFor(() => expect(useAccount.getState().user?.uid).toBe('p1'));
    await useRoom.getState().join(code, 'Ana');
    await vi.waitFor(() => expect(useRoom.getState().table.map((t) => t.name)).toEqual(['Ogro']));
    // su último ataque se recuerda para mandarlo con el daño
    useStore.setState({ result: result('Ana · Rayo de fuego: ataque', '17') });
    expect(useRoom.getState().lastAttack?.total).toBe(17);
    expect(await useRoom.getState().sendCast({ label: 'Rayo de fuego: daño', targets: ['m1'], parts: [{ type: 'fuego', amt: 9 }], crit: false, attack: 17, heal: null, effect: null })).toBe(true);
    expect(cloud.rooms.get(code)!.casts.map((c) => [c.who, c.attack])).toEqual([['Ana', 17]]);
    // el máster le pide una salvación: le aparece y responde
    await cloud.adapter.sendEvent(code, { to: 'p1', from: 'dm1', charId: '', hp: 0, temp: 0, note: '', at: 1, kind: 'save', dc: 15, abil: 1, label: 'Ogro · Pisotón', reqId: 'q1' });
    await vi.waitFor(() => expect(useRoom.getState().saveRequests.map((q) => q.reqId)).toEqual(['q1']));
    useRoom.getState().answerSave('q1', 12);
    await vi.waitFor(() => expect(cloud.rooms.get(code)!.replies.map((r) => [r.reqId, r.total])).toEqual([['q1', 12]]));
    expect(useRoom.getState().saveRequests).toEqual([]);
  });
});

describe('el máster aplica un conjuro sobre otros', () => {
  it('estado en cada objetivo de la mesa y el efecto en la hoja del otro jugador (no en la de quien lo lanzó)', async () => {
    const { applyBuff } = await import('../shared/RoomPanel');
    const { useStore } = await import('../store/useStore');
    const sent: string[] = [];
    useRoom.setState({ members: [{ uid: 'p2', name: 'Bruno', role: 'player', sheet: { name: 'Bruno', cls: '', level: 1, ac: 12, hp: 10, hpMax: 10, temp: 0, pp: 10, conds: [], charId: 'pj-bruno' }, at: 1 }], sendBuff: (to, charId) => { sent.push(to + ':' + charId); } });
    useStore.setState({
      roster: [{ id: 'r2', name: 'Bruno', roomUid: 'p2' } as never, { id: 'r1', name: 'Ilsa', roomUid: 'p1' } as never],
      combatants: [
        { id: 'c1', name: 'Bruno', kind: 'pc', rosterId: 'r2', conds: [] } as never,
        { id: 'c2', name: 'Ilsa', kind: 'pc', rosterId: 'r1', conds: [] } as never,
        { id: 'c3', name: 'Goblin', kind: 'monster', conds: [] } as never,
      ],
    });
    applyBuff({ id: 'x', uid: 'p1', who: 'Ilsa', label: '', targets: ['c1', 'c2', 'c3'], at: 1, parts: [], crit: false, attack: null, heal: null, effect: null, buff: { k: 'Bless', n: 'Bendición', lv: 1, conc: true, note: '+1d4' } });
    const conds = useStore.getState().combatants.map((c) => c.conds.map((k) => k.k));
    expect(conds).toEqual([['Bendición (de Ilsa)'], ['Bendición (de Ilsa)'], ['Bendición (de Ilsa)']]);
    expect(sent).toEqual(['p2:pj-bruno']); // a Ilsa no: ya lo tiene si se lo lanzó a sí misma
  });
});

describe('fin de la concentración de un conjuro lanzado sobre otros', () => {
  it('quien lo lanzó avisa; el máster quita el estado de la mesa y avisa a los demás; al otro jugador se le quita de la hoja', async () => {
    const { usePlayer } = await import('../store/player');
    const { blankCharacter } = await import('../engine/character');
    const { useStore } = await import('../store/useStore');
    const buff = { k: 'Bless', n: 'Bendición', lv: 1, conc: true, note: '+1d4' };
    useAccount.setState({ status: 'off', user: null, error: '', sync: 'idle', syncError: '' });
    useRoom.setState({ code: null, role: null, name: '', room: null, members: [], rolls: [], share: true, busy: false, error: '', notice: '', sentBuffs: {} });
    const cloud = fakeCloud({ uid: 'dm1', email: null, name: null, anon: false });
    setCloudAdapter(async () => cloud.adapter);
    await useRoom.getState().create('Laura');
    const code = useRoom.getState().code!;
    // en la mesa del máster: Bruno con la Bendición de Ilsa; Bruno está en la sala
    await cloud.adapter.setMember(code, { uid: 'p2', name: 'Bruno', role: 'player', sheet: { name: 'Bruno', cls: '', level: 1, ac: 12, hp: 10, hpMax: 10, temp: 0, pp: 10, conds: [], charId: 'pj-bruno' }, at: 1 });
    useStore.setState({ combatants: [{ id: 'c1', name: 'Bruno', kind: 'pc', conds: [{ k: 'Bendición (de Ilsa)', r: null }] } as never] });
    await cloud.adapter.sendCast(code, { uid: 'p1', who: 'Ilsa', label: 'Bendición: termina', targets: [], crit: false, parts: [], attack: null, heal: null, effect: null, buff, end: true, at: 1 });
    await vi.waitFor(() => expect(useStore.getState().combatants[0].conds).toHaveLength(0));
    expect(cloud.rooms.get(code)!.events.map((e) => e.to + ':' + e.kind)).toEqual(['p2:unbuff']);
    expect(useRoom.getState().casts).toHaveLength(0); // no queda para revisar
    await useRoom.getState().leave();

    // Bruno recibe el aviso y se le quita de la hoja
    await usePlayer.getState().init();
    usePlayer.setState({ characters: [{ ...blankCharacter(), id: 'pj-bruno', name: 'Bruno', active: [{ k: 'Bless', n: 'Bendición', lv: 1, at: 1, by: 'Ilsa' }] }], activeId: 'pj-bruno' });
    await cloud.setUser({ uid: 'p2', email: null, name: null, anon: true });
    await vi.waitFor(() => expect(useAccount.getState().user?.uid).toBe('p2'));
    await useRoom.getState().join(code, 'Bruno');
    await vi.waitFor(() => expect(usePlayer.getState().characters[0].active).toHaveLength(0));
    expect(useRoom.getState().notice).toContain('Bendición de Ilsa se ha acabado');

    // quien lo lanzó: al acabarse su concentración manda el aviso (solo de lo que mandó a la mesa)
    useRoom.setState({ sentBuffs: { Bendición: buff } });
    useRoom.getState().endBuff('Bendición');
    await vi.waitFor(() => expect(cloud.rooms.get(code)!.casts.some((x) => x.end && x.buff?.n === 'Bendición')).toBe(true));
    expect(useRoom.getState().sentBuffs).toEqual({});
  });
});

describe('conjuros mandados a la mesa: se recuerdan al recargar', () => {
  it('al volver a entrar en la sala sigue sabiendo qué mandó (y lo olvida al acabarse)', async () => {
    useAccount.setState({ status: 'off', user: null, error: '', sync: 'idle', syncError: '' });
    useRoom.setState({ code: null, role: null, name: '', room: null, members: [], rolls: [], share: true, busy: false, error: '', notice: '', sentBuffs: {} });
    const cloud = fakeCloud({ uid: 'dm1', email: null, name: null, anon: false });
    setCloudAdapter(async () => cloud.adapter);
    await useRoom.getState().create('Laura');
    const code = useRoom.getState().code!;
    await useRoom.getState().leave();
    await cloud.setUser({ uid: 'p1', email: null, name: null, anon: true });
    await vi.waitFor(() => expect(useAccount.getState().user?.uid).toBe('p1'));
    await useRoom.getState().join(code, 'Ilsa');
    const buff = { k: 'Bless', n: 'Bendición', lv: 1, conc: true, note: '+1d4' };
    await useRoom.getState().sendCast({ label: 'x', targets: ['c1'], crit: false, parts: [], attack: null, heal: null, effect: null, buff });
    // «recarga»: se pierde la memoria y se vuelve a entrar
    useRoom.setState({ sentBuffs: {} });
    await useRoom.getState().leave();
    await useRoom.getState().join(code, 'Ilsa');
    expect(useRoom.getState().sentBuffs).toEqual({ Bendición: buff });
    useRoom.getState().endBuff('Bendición');
    await useRoom.getState().leave();
    await useRoom.getState().join(code, 'Ilsa');
    expect(useRoom.getState().sentBuffs).toEqual({});
  });
});

describe('avisos de turno (opcionales)', () => {
  beforeEach(() => {
    resetRoomTable();
    useAccount.setState({ status: 'off', user: null, error: '', sync: 'idle', syncError: '' });
    useRoom.setState({ code: null, role: null, name: '', room: null, members: [], rolls: [], share: true, busy: false, error: '', turnsOn: false, askAt: 0, turn: null });
    useStore.setState({ roster: [], combatants: [], started: false, activeId: null, round: 0, undoStack: [] });
  });

  const twoPlayers = () => {
    const sh = (name: string, init: number) => ({ name, cls: 'Guerrero', level: 3, ac: 16, hp: 20, hpMax: 20, temp: 0, pp: 12, init: 0, conds: [], charId: 'c-' + name, _i: init });
    syncMembersToTable([{ uid: 'p1', name: 'Laura', role: 'player', sheet: sh('Ana', 18), at: 1 }, { uid: 'p2', name: 'Pablo', role: 'player', sheet: sh('Bruno', 9), at: 1 }]);
    useStore.setState({ combatants: useStore.getState().combatants.map((c) => ({ ...c, init: c.name === 'Ana' ? 18 : 9 })) });
    useStore.getState().startCombat();
  };

  it('lo que se publica: apagado, nada de turnos; encendido, a qué jugador le toca y la lista por orden alfabético', () => {
    twoPlayers();
    const got: [string[], { on: boolean; started: boolean; round: number; uid: string | null; ask: number }][] = [];
    let stop = watchTableToPublish((list, turn) => got.push([list.map((x) => x.name), turn]));
    expect(got.at(-1)![1]).toEqual({ on: false, started: false, round: 0, uid: null, ask: 0 });
    stop();
    stop = watchTableToPublish((list, turn) => got.push([list.map((x) => x.name), turn]), { on: true, ask: 5 });
    expect(got.at(-1)).toEqual([['Ana', 'Bruno'], { on: true, started: true, round: 1, uid: 'p1', ask: 5 }]);
    stop();
  });

  it('el jugador termina su turno: al máster le pasa al siguiente (solo si era el suyo)', async () => {
    const cloud = fakeCloud({ uid: 'dm1', email: 'dm@x.test', name: null, anon: false });
    setCloudAdapter(async () => cloud.adapter);
    expect(await useRoom.getState().create('Máster')).toBe(true);
    const code = useRoom.getState().code!;
    twoPlayers();
    const first = useStore.getState().activeId;
    const base = { who: 'Pablo', label: 'termina su turno', targets: [], crit: false, parts: [], attack: null, heal: null, effect: null, endTurn: true, at: Date.now() };
    // no es el turno de Pablo: no pasa nada
    await cloud.adapter.sendCast(code, { ...base, uid: 'p2' });
    await vi.waitFor(() => expect(cloud.rooms.get(code)!.casts).toHaveLength(0));
    expect(useStore.getState().activeId).toBe(first);
    // Laura (Ana) sí: pasa a Bruno
    await cloud.adapter.sendCast(code, { ...base, who: 'Laura', uid: 'p1' });
    await vi.waitFor(() => expect(useStore.getState().combatants.find((c) => c.id === useStore.getState().activeId)!.name).toBe('Bruno'));
    expect(useRoom.getState().casts).toHaveLength(0);
  });
});
