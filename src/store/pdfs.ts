import { createStore, del, get, keys, set } from 'idb-keyval';

/**
 * Hojas de personaje en PDF. Se guardan aparte del estado (IndexedDB, en este dispositivo) para que
 * el guardado automático del grupo siga siendo ligero; el jugador solo guarda la referencia.
 */
let pdfStore: ReturnType<typeof createStore> | null = null;
const store = () => (pdfStore ??= createStore('cronica-combate-hojas', 'pdf'));

export const MAX_PDF_BYTES = 30 * 1024 * 1024;

export async function putPdf(id: string, data: Blob): Promise<void> {
  await set(id, data, store());
}

export async function getPdf(id: string): Promise<Blob | undefined> {
  try { return await get<Blob>(id, store()); } catch { return undefined; }
}

/** Borra las hojas que ya no usa ningún jugador (al cambiar o quitar una hoja, o al borrar un jugador). */
export async function prunePdfs(keep: Set<string>): Promise<void> {
  try {
    for (const k of await keys(store())) if (!keep.has(String(k))) await del(k, store());
  } catch { /* sin IndexedDB */ }
}

/** ¿Es de verdad un PDF? (cabecera %PDF-, no solo la extensión) */
export async function looksLikePdf(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return String.fromCharCode(...head) === '%PDF-';
}

export async function blobToBase64(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function base64ToBlob(data: string): Blob {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'application/pdf' });
}
