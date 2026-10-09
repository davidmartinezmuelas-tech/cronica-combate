import { createStore, get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import type { Monster } from '../data/types';

/**
 * Criaturas del Manual de Monstruos del usuario, leídas de su propio PDF. Se guardan solo en este dispositivo:
 * no van con las criaturas propias, ni a la cuenta, ni a las copias de seguridad.
 */
let idb: ReturnType<typeof createStore> | null = null;
const store = () => (idb ??= createStore('cronica-bestiario-libro', 'libro'));
const KEY = 'v1';

interface Saved { v: 1; monsters: Monster[] }

export async function loadBookMonsters(): Promise<Monster[]> {
  try {
    const d = await idbGet<Saved>(KEY, store());
    return Array.isArray(d?.monsters) ? d.monsters : [];
  } catch {
    return [];
  }
}

export async function saveBookMonsters(monsters: Monster[]): Promise<void> {
  try { await idbSet(KEY, { v: 1, monsters } satisfies Saved, store()); } catch { /* sin IndexedDB: dura esta visita */ }
}

export async function clearBookMonsters(): Promise<void> {
  try { await idbDel(KEY, store()); } catch { /* nada */ }
}
