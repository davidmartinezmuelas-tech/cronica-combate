import type { Character } from './character';

/**
 * Juntar los personajes del dispositivo con los de la nube: de cada uno gana el que se cambió más tarde.
 * `toLocal`: los que hay que guardar en el dispositivo; `toRemote`: los que hay que subir.
 */
export function mergeCharacters(local: Character[], remote: Character[]): { toLocal: Character[]; toRemote: Character[] } {
  const toLocal: Character[] = [];
  const toRemote: Character[] = [];
  const byId = new Map(remote.map((c) => [c.id, c]));
  for (const l of local) {
    const r = byId.get(l.id);
    if (!r || l.updatedAt > r.updatedAt) toRemote.push(l);
    else if (r.updatedAt > l.updatedAt) toLocal.push(r);
  }
  for (const r of remote) if (!local.some((l) => l.id === r.id)) toLocal.push(r);
  return { toLocal, toRemote };
}

/** Qué cambió entre dos listas de personajes (para subirlo): los nuevos o modificados y los borrados. */
export function diffCharacters(prev: Character[], next: Character[]): { changed: Character[]; removed: string[] } {
  const before = new Map(prev.map((c) => [c.id, c]));
  // el almacén crea un objeto nuevo con cada cambio (dos cambios en el mismo milisegundo tienen la misma fecha)
  const changed = next.filter((c) => before.get(c.id) !== c);
  const removed = prev.filter((c) => !next.some((n) => n.id === c.id)).map((c) => c.id);
  return { changed, removed };
}

/** Firestore no admite `undefined`: copia limpia para subir. */
export const toCloud = (c: Character): Character => JSON.parse(JSON.stringify(c));

/** Algo que se sincroniza por id y fecha de último cambio (criaturas propias, encuentros, grupo). */
export interface Synced { id: string; at?: number }

/** Como `mergeCharacters`, para listas con `at` (sin fecha cuenta como la más antigua). */
export function mergeItems<T extends Synced>(local: T[], remote: T[]): { toLocal: T[]; toRemote: T[] } {
  const toLocal: T[] = [];
  const toRemote: T[] = [];
  const byId = new Map(remote.map((x) => [x.id, x]));
  for (const l of local) {
    const r = byId.get(l.id);
    if (!r || (l.at || 0) > (r.at || 0)) toRemote.push(l);
    else if ((r.at || 0) > (l.at || 0)) toLocal.push(r);
  }
  for (const r of remote) if (!local.some((l) => l.id === r.id)) toLocal.push(r);
  return { toLocal, toRemote };
}

/** Qué cambió entre dos listas (por identidad del objeto, como `diffCharacters`). */
export function diffItems<T extends Synced>(prev: T[], next: T[]): { changed: T[]; removed: string[] } {
  const before = new Map(prev.map((x) => [x.id, x]));
  const changed = next.filter((x) => before.get(x.id) !== x);
  const removed = prev.filter((x) => !next.some((n) => n.id === x.id)).map((x) => x.id);
  return { changed, removed };
}

/** Aplica a una lista lo que llega de la nube: solo si es más reciente que lo que hay (el eco de lo propio no pisa nada). */
export function applyItems<T extends Synced>(list: T[], changed: T[], removed: string[]): T[] {
  let out = list.filter((x) => !removed.includes(x.id));
  for (const r of changed) {
    const cur = out.find((x) => x.id === r.id);
    if (!cur) out = [...out, r];
    else if ((r.at || 0) > (cur.at || 0)) out = out.map((x) => (x.id === r.id ? r : x));
  }
  return out;
}
