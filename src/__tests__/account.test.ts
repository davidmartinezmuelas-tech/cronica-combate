import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blankCharacter, type Character } from '../engine/character';
import type { Encounter, Monster, RosterEntry } from '../data/types';
import { applyItems, diffCharacters, mergeCharacters, mergeItems } from '../engine/sync';
import { blankRoster } from '../store/persist';
import { useStore } from '../store/useStore';
import { setCloudAdapter, useAccount } from '../store/account';
import { usePlayer } from '../store/player';
import { fakeCloud } from './fakeCloud';

const pj = (id: string, name: string, updatedAt: number): Character => ({ ...blankCharacter(), id, name, updatedAt });

describe('juntar personajes del dispositivo y de la nube', () => {
  it('gana el que se cambió más tarde; los que solo están en un lado van al otro', () => {
    const { toLocal, toRemote } = mergeCharacters([pj('a', 'A local', 100), pj('b', 'B local', 300), pj('c', 'C', 10)], [pj('a', 'A nube', 200), pj('b', 'B nube', 200), pj('d', 'D', 5)]);
    expect(toLocal.map((c) => c.name)).toEqual(['A nube', 'D']);
    expect(toRemote.map((c) => c.name)).toEqual(['B local', 'C']);
  });
  it('qué cambió entre dos listas', () => {
    const a = pj('a', 'A', 1), b = pj('b', 'B', 1);
    const b2 = { ...b, name: 'B2', updatedAt: 2 };
    expect(diffCharacters([a, b], [a, b2, pj('c', 'C', 1)]).changed.map((c) => c.id)).toEqual(['b', 'c']);
    expect(diffCharacters([a, b], [b]).removed).toEqual(['a']);
  });
});

describe('sincronizar con la cuenta', () => {
  beforeEach(async () => {
    await usePlayer.getState().init();
    usePlayer.setState({ characters: [pj('a', 'A local', 100), pj('c', 'Solo aquí', 10)], activeId: 'a' });
    useAccount.setState({ status: 'off', user: null, error: '', sync: 'idle', syncError: '' });
  });
  afterEach(() => { vi.useRealTimers(); });

  it('al iniciar sesión junta, sube lo que falta, aplica los cambios remotos y sube los locales', async () => {
    const cloud = fakeCloud({ uid: 'u1', email: 'a@b.c', name: null, anon: false });
    cloud.remote.set('a', pj('a', 'A nube', 200));
    cloud.remote.set('d', pj('d', 'De otro dispositivo', 50));
    setCloudAdapter(async () => cloud.adapter);
    await useAccount.getState().start();
    await vi.waitFor(() => expect(useAccount.getState().sync).toBe('ok'));
    expect(usePlayer.getState().characters.map((c) => c.name).sort()).toEqual(['A nube', 'De otro dispositivo', 'Solo aquí']);
    expect(cloud.calls.put).toEqual(['c']);

    // cambio que llega de otro dispositivo
    cloud.emit([pj('d', 'D cambiado', 60)], []);
    expect(usePlayer.getState().characters.find((c) => c.id === 'd')!.name).toBe('D cambiado');
    expect(cloud.calls.put).toEqual(['c']); // no se vuelve a subir lo que acaba de llegar

    // cambio local: se sube (agrupado tras una pausa)
    vi.useFakeTimers();
    usePlayer.getState().update('a', { name: 'A editado' });
    usePlayer.getState().update('a', { level: 2 });
    await vi.advanceTimersByTimeAsync(1500);
    expect(cloud.calls.put).toEqual(['c', 'a']);
    expect(cloud.remote.get('a')!.level).toBe(2);
    // borrado local: se borra en la nube
    usePlayer.getState().remove('c');
    expect(cloud.calls.del).toEqual(['c']);
    // borrado en otro dispositivo
    cloud.emit([], ['d']);
    expect(usePlayer.getState().characters.some((c) => c.id === 'd')).toBe(false);
  });

  it('sin sesión no sincroniza nada', async () => {
    const cloud = fakeCloud(null);
    setCloudAdapter(async () => cloud.adapter);
    await useAccount.getState().start();
    await vi.waitFor(() => expect(useAccount.getState().status).toBe('out'));
    usePlayer.getState().update('a', { name: 'X' });
    expect(cloud.calls.put).toEqual([]);
  });

  it('el máster: criaturas, encuentros y grupo se juntan con la cuenta, se fechan al cambiar y el PDF no sube', async () => {
    const mon = (id: string, n: string, at?: number) => ({ id, n, custom: 1, ab: [10, 10, 10, 10, 10, 10], ...(at ? { at } : {}) }) as unknown as Monster;
    const enc: Encounter = { id: 'e1', name: 'Emboscada', items: [{ monsterId: 'm1', qty: 2, inLair: false }], lair: false };
    const pc: RosterEntry = { ...blankRoster(), id: 'r1', name: 'Jimena', pdf: { id: 'p1', name: 'hoja.pdf', size: 10 } };
    useStore.setState({ loaded: true, custom: [mon('m1', 'Lobo local', 100), mon('m2', 'Solo aquí')], encounters: [enc], roster: [pc] });
    const cloud = fakeCloud({ uid: 'u1', email: 'a@b.c', name: null, anon: false });
    cloud.items.monsters.set('m1', mon('m1', 'Lobo nube', 200));
    cloud.items.monsters.set('m3', mon('m3', 'De otro dispositivo', 50));
    setCloudAdapter(async () => cloud.adapter);
    await useAccount.getState().start();
    await vi.waitFor(() => expect(cloud.items.encounters.has('e1')).toBe(true));
    expect(useStore.getState().custom.map((m) => m.n).sort()).toEqual(['De otro dispositivo', 'Lobo nube', 'Solo aquí']);
    expect([...cloud.items.monsters.keys()].sort()).toEqual(['m1', 'm2', 'm3']);
    // la hoja en PDF se queda en el dispositivo
    expect((cloud.items.roster.get('r1') as RosterEntry).pdf).toBeNull();
    expect(useStore.getState().roster[0].pdf?.id).toBe('p1');

    // cambio local: se fecha y se sube; el eco de la nube no lo pisa
    vi.useFakeTimers();
    useStore.setState({ custom: useStore.getState().custom.map((m) => (m.id === 'm2' ? { ...m, n: 'Editado' } : m)) });
    const stamped = useStore.getState().custom.find((m) => m.id === 'm2')!;
    expect(stamped.at).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(1500);
    expect((cloud.items.monsters.get('m2') as Monster).n).toBe('Editado');
    expect(useStore.getState().custom.find((m) => m.id === 'm2')!.n).toBe('Editado');

    // cambio de otro dispositivo (más reciente): llega, y el grupo conserva su PDF
    cloud.emitItems('roster', [{ ...pc, name: 'Jimena (nivel 5)', pdf: null, at: Date.now() + 1000 } as RosterEntry], []);
    expect(useStore.getState().roster[0].name).toBe('Jimena (nivel 5)');
    expect(useStore.getState().roster[0].pdf?.id).toBe('p1');
    // borrado local y remoto
    useStore.setState({ encounters: [] });
    expect(cloud.items.encounters.has('e1')).toBe(false);
    cloud.emitItems('monsters', [], ['m3']);
    expect(useStore.getState().custom.some((m) => m.id === 'm3')).toBe(false);
  });
});

describe('juntar listas con fecha', () => {
  it('gana la más reciente y lo de la nube que no es más nuevo no pisa lo local', () => {
    const { toLocal, toRemote } = mergeItems([{ id: 'a', at: 1 }, { id: 'b', at: 5 }, { id: 'c' }], [{ id: 'a', at: 3 }, { id: 'b', at: 2 }, { id: 'd', at: 1 }]);
    expect(toLocal.map((x) => x.id)).toEqual(['a', 'd']);
    expect(toRemote.map((x) => x.id)).toEqual(['b', 'c']);
    const list = [{ id: 'a', at: 5, v: 1 }];
    expect(applyItems(list, [{ id: 'a', at: 5, v: 2 }], [])).toEqual(list);
    expect(applyItems(list, [{ id: 'a', at: 6, v: 2 }], [])[0].v).toBe(2);
  });
});
