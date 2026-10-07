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
