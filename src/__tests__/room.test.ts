import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setCloudAdapter, useAccount } from '../store/account';
import { cleanCode, newCode, useRoom } from '../store/room';
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
});
