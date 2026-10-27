import type { LibItem } from '../engine/magicItems';

/** Traductor del navegador (Chrome 138+ de escritorio): traduce en el propio dispositivo, sin enviar el texto a ningún sitio. */
interface BrowserTranslator { translate(text: string): Promise<string>; destroy?: () => void }
interface TranslatorStatic {
  availability(o: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
  create(o: { sourceLanguage: string; targetLanguage: string; monitor?: (m: EventTarget) => void }): Promise<BrowserTranslator>;
}
const api = () => (globalThis as unknown as { Translator?: TranslatorStatic }).Translator;

export const canTranslate = () => !!api();
export const NO_TRANSLATOR = 'Tu navegador no incluye el traductor. Hace falta Chrome 138 o más nuevo (o Edge) en un ordenador.';

/** Términos del juego que la traducción automática suele dejar mal. */
const FIXES: [RegExp, string][] = [
  [/puntos de impacto/gi, 'puntos de golpe'], [/\bpuntos de vida\b/gi, 'puntos de golpe'], [/clase de armadura/gi, 'Clase de Armadura'],
  [/tirada de ataque/gi, 'tirada de ataque'], [/descanso prolongado/gi, 'descanso largo'], [/descanso breve/gi, 'descanso corto'],
  [/acción de magia/gi, 'acción de Magia'], [/acción de bonificación/gi, 'acción adicional'], [/\bsintonizaci[oó]n\b/gi, 'sintonización'],
];
export const fixTerms = (s: string) => FIXES.reduce((t, [re, to]) => t.replace(re, to), s);

/**
 * Traduce al español el texto de los objetos que aún no lo tienen (el original se guarda en `dEn`). Hay que llamarla desde
 * un clic: crear el traductor lo exige. `onProgress` recibe cuántos lleva y `onBatch` los ya traducidos, para guardarlos por el camino.
 */
export async function translateItems(items: LibItem[], onProgress: (done: number, total: number, pct?: number) => void, onBatch: (done: LibItem[]) => void, signal: { cancelled: boolean }): Promise<number> {
  const T = api();
  if (!T) throw new Error(NO_TRANSLATOR);
  const pair = { sourceLanguage: 'en', targetLanguage: 'es' };
  if ((await T.availability(pair)) === 'unavailable') throw new Error('Tu navegador no tiene el par de idiomas inglés a español.');
  const tr = await T.create({ ...pair, monitor: (m) => m.addEventListener('downloadprogress', (e) => onProgress(0, 1, (e as unknown as { loaded: number }).loaded)) });
  const todo = items.filter((i) => !i.dEn && i.d.trim());
  let batch: LibItem[] = [];
  try {
    for (let k = 0; k < todo.length; k++) {
      if (signal.cancelled) break;
      const it = todo[k];
      const paras = it.d.split('\n');
      const out: string[] = [];
      for (const p of paras) out.push(p.trim() ? fixTerms(await tr.translate(p)) : p);
      batch.push({ ...it, dEn: it.d, d: out.join('\n') });
      onProgress(k + 1, todo.length);
      if (batch.length >= 20) { onBatch(batch); batch = []; }
    }
  } finally {
    if (batch.length) onBatch(batch);
    tr.destroy?.();
  }
  return todo.length;
}
