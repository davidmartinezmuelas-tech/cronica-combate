import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { classifyPage, fillClassGaps, pageLines, parseBackgrounds, parseFeats, parseSpells, parseSubclasses, type Line, type LibBackground, type LibFeat, type LibSpell, type LibSubclass, type TextItem } from '../engine/bookImport';
import { parseMonsters } from '../engine/monsterImport';
import type { Monster, Spell } from '../data/types';

export interface BookResult {
  feats: LibFeat[];
  backgrounds: LibBackground[];
  spells: LibSpell[];
  subclasses: LibSubclass[];
  pages: number;
}

/** Error de un PDF escaneado sin capa de texto (solo imágenes). */
export const NO_TEXT = 'sin-texto';
/** Qué hacer con un PDF sin texto. */
export const NO_TEXT_HELP = 'Este PDF son imágenes escaneadas y no tiene texto que leer. Pásalo una vez por un programa de OCR (reconocimiento de texto) con el idioma español, como PDF24 Creator (gratuito) o «Escanear y OCR» de Adobe Acrobat, e importa el PDF que te genere. Solo hay que hacerlo una vez.';

/**
 * Lee las páginas de un PDF en el navegador (no se envía a ningún sitio). `onPage` recibe los ítems de texto de
 * cada página. Si las primeras páginas no tienen texto, es un escaneo sin OCR: se para con el error `NO_TEXT`.
 */
async function readPages(file: Blob, onPage: (items: TextItem[], width: number, page: number) => void, onProgress: (page: number, total: number) => void, signal?: { cancelled: boolean }): Promise<number> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    let chars = 0;
    for (let i = 1; i <= doc.numPages; i++) {
      if (signal?.cancelled) throw new Error('cancelado');
      onProgress(i, doc.numPages);
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const items = (tc.items as { str?: string; transform?: number[] }[])
        .filter((it) => typeof it.str === 'string' && it.transform)
        .map((it) => ({ str: it.str as string, x: it.transform![4], y: it.transform![5], w: (it as { width?: number }).width }));
      chars += items.reduce((a, it) => a + it.str.trim().length, 0);
      // un libro con texto tiene miles de letras en sus primeras páginas; uno escaneado, ninguna
      if (i === Math.min(12, doc.numPages) && chars < 200) throw new Error(NO_TEXT);
      onPage(items, page.getViewport({ scale: 1 }).width, i);
      page.cleanup();
    }
    return doc.numPages;
  } finally {
    void doc.loadingTask.destroy();
  }
}

/**
 * Lee el PDF del Manual del Jugador del usuario en su navegador (no se envía a ningún sitio) y extrae dotes,
 * trasfondos y conjuros. `onProgress` recibe la página por la que va.
 */
export async function readBook(file: Blob, onProgress: (page: number, total: number) => void, signal?: { cancelled: boolean }): Promise<BookResult> {
  const L: Record<'feats' | 'backgrounds' | 'spells' | 'classes', Line[]> = { feats: [], backgrounds: [], spells: [], classes: [] };
  const pages: { kinds: ReturnType<typeof classifyPage>; lines: Line[] }[] = [];
  const n = await readPages(file, (items, width) => {
    pages.push({ kinds: classifyPage(items.map((x) => x.str).join(' ')), lines: pageLines(items, width) });
  }, onProgress, signal);
  const kinds = fillClassGaps(pages.map((p) => p.kinds));
  pages.forEach((p, i) => { for (const k of kinds[i]) L[k].push(...p.lines); });
  return { feats: parseFeats(L.feats), backgrounds: parseBackgrounds(L.backgrounds), spells: parseSpells(L.spells), subclasses: parseSubclasses(L.classes), pages: n };
}

/** Lee el PDF del Manual de Monstruos del usuario en su navegador y extrae las fichas de monstruo. */
export async function readMonsterBook(file: Blob, spells: Record<string, Spell>, onProgress: (page: number, total: number) => void, signal?: { cancelled: boolean }): Promise<{ monsters: Monster[]; pages: number }> {
  const lines: Line[] = [];
  const n = await readPages(file, (items, width, p) => { lines.push(...pageLines(items, width).map((l) => ({ ...l, p }))); }, onProgress, signal);
  return { monsters: parseMonsters(lines, spells), pages: n };
}
