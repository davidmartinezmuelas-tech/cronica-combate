import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blankCharacter, type Character } from '../engine/character';
import { diffCharacters, mergeCharacters } from '../engine/sync';
import { setCloudAdapter, useAccount } from '../store/account';
import type { CloudAdapter, CloudUser } from '../store/cloudAdapter';
import { usePlayer } from '../store/player';

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

/** Nube falsa en memoria con la misma forma que Firebase. */
function fakeCloud(user: CloudUser | null) {
  const remote = new Map<string, Character>();
  let watcher: ((changed: Character[], removed: string[], first: boolean) => void) | null = null;
  const calls = { put: [] as string[], del: [] as string[] };
  const adapter: CloudAdapter = {
    onAuth: (cb) => { setTimeout(() => cb(user), 0); return () => {}; },
    google: async () => {}, emailIn: async () => {}, emailUp: async () => {}, reset: async () => {}, out: async () => {},
    watchCharacters: (_uid, cb) => { watcher = cb; setTimeout(() => cb([...remote.values()], [], true), 0); return () => { watcher = null; }; },
    putCharacter: async (_uid, c) => { calls.put.push(c.id); remote.set(c.id, c); },
    deleteCharacter: async (_uid, id) => { calls.del.push(id); remote.delete(id); },
  };
  return { adapter, remote, calls, emit: (changed: Character[], removed: string[]) => watcher?.(changed, removed, false) };
}

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
});
