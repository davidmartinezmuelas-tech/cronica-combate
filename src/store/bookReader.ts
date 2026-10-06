import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { classifyPage, fillClassGaps, pageLines, parseBackgrounds, parseFeats, parseSpells, parseSubclasses, type Line, type LibBackground, type LibFeat, type LibSpell, type LibSubclass } from '../engine/bookImport';

export interface BookResult {
  feats: LibFeat[];
  backgrounds: LibBackground[];
  spells: LibSpell[];
  subclasses: LibSubclass[];
  pages: number;
}

/**
 * Lee el PDF del Manual del Jugador del usuario en su navegador (no se envía a ningún sitio) y extrae dotes,
 * trasfondos y conjuros. `onProgress` recibe la página por la que va.
 */
export async function readBook(file: Blob, onProgress: (page: number, total: number) => void, signal?: { cancelled: boolean }): Promise<BookResult> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const L: Record<'feats' | 'backgrounds' | 'spells' | 'classes', Line[]> = { feats: [], backgrounds: [], spells: [], classes: [] };
    const pages: { kinds: ReturnType<typeof classifyPage>; lines: Line[] }[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      if (signal?.cancelled) throw new Error('cancelado');
      onProgress(i, doc.numPages);
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const items = (tc.items as { str?: string; transform?: number[] }[])
        .filter((it) => typeof it.str === 'string' && it.transform)
        .map((it) => ({ str: it.str as string, x: it.transform![4], y: it.transform![5], w: (it as { width?: number }).width }));
      pages.push({ kinds: classifyPage(items.map((x) => x.str).join(' ')), lines: pageLines(items, page.getViewport({ scale: 1 }).width) });
      page.cleanup();
    }
    const kinds = fillClassGaps(pages.map((p) => p.kinds));
    pages.forEach((p, i) => { for (const k of kinds[i]) L[k].push(...p.lines); });
    return { feats: parseFeats(L.feats), backgrounds: parseBackgrounds(L.backgrounds), spells: parseSpells(L.spells), subclasses: parseSubclasses(L.classes), pages: doc.numPages };
  } finally {
    void doc.loadingTask.destroy();
  }
}
