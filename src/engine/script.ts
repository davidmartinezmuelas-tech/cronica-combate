import type { Encounter } from '../data/types';

export type ScriptPart = { t: 'text'; text: string } | { t: 'enc'; text: string; id: string };

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MIN_NAME = 3;

/**
 * Parte el texto del guion en trozos: los que nombran un encuentro guardado (sin importar mayúsculas) salen aparte
 * para poder ser un enlace al combate. Gana el nombre más largo si uno contiene a otro.
 */
export function linkEncounters(text: string, encounters: Pick<Encounter, 'id' | 'name'>[]): ScriptPart[] {
  const names = encounters.filter((e) => e.name.trim().length >= MIN_NAME).sort((a, b) => b.name.length - a.name.length);
  if (!names.length || !text) return [{ t: 'text', text }];
  const re = new RegExp('(?<![\\p{L}\\p{N}])(' + names.map((e) => esc(e.name.trim())).join('|') + ')(?![\\p{L}\\p{N}])', 'giu');
  const out: ScriptPart[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const enc = names.find((e) => e.name.trim().toLowerCase() === m[0].toLowerCase());
    if (!enc) continue;
    if (m.index! > last) out.push({ t: 'text', text: text.slice(last, m.index) });
    out.push({ t: 'enc', text: m[0], id: enc.id });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ t: 'text', text: text.slice(last) });
  return out;
}

export const MAX_SCRIPT_BYTES = 1_000_000;

/** Lee un archivo de texto (.txt o .md) y devuelve su título y contenido. */
export async function readScriptFile(file: File): Promise<{ ok: true; title: string; text: string } | { ok: false; message: string }> {
  if (!/\.(txt|md|markdown|text)$/i.test(file.name) && !file.type.startsWith('text/')) return { ok: false, message: 'Solo se pueden subir archivos de texto (.txt o .md). Si es un Word, copia el texto y pégalo en un guion nuevo.' };
  if (file.size > MAX_SCRIPT_BYTES) return { ok: false, message: 'El archivo pesa demasiado para un guion (máximo 1 MB).' };
  const text = (await file.text()).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  return { ok: true, title: file.name.replace(/\.[^.]+$/, ''), text };
}
