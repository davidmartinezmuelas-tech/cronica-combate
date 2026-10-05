import { describe, expect, it, vi } from 'vitest';

const idb = vi.hoisted(() => ({ fail: 0, saved: [] as unknown[] }));
vi.mock('idb-keyval', () => ({
  createStore: () => ({}),
  get: async () => { if (idb.fail > 0) { idb.fail--; throw new Error('ocupada'); } return { roster: [], custom: [] }; },
  set: async (_k: string, v: unknown) => { idb.saved.push(v); },
}));

import { emptySaved, loadSaved, saveState } from '../store/persist';

describe('cargar lo guardado', () => {
  it('reintenta si la base de datos está ocupada al abrir', async () => {
    idb.fail = 2;
    const r = await loadSaved();
    expect(r.ok).toBe(true);
    expect(await saveState(emptySaved())).toBe(true);
  });

  it('si no se puede leer, no escribe encima (no se pierde el grupo por un fallo pasajero)', async () => {
    idb.fail = 5;
    idb.saved = [];
    const r = await loadSaved();
    expect(r.ok).toBe(false);
    expect(await saveState(emptySaved())).toBe(false);
    expect(idb.saved).toEqual([]);
  });
});
