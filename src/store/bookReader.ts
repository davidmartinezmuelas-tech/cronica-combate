import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { classifyPage, pageLines, parseBackgrounds, parseFeats, parseSpells, type Line, type LibBackground, type LibFeat, type LibSpell } from '../engine/bookImport';

export interface BookResult {
  feats: LibFeat[];
  backgrounds: LibBackground[];
  spells: LibSpell[];
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
    const L: Record<'feats' | 'backgrounds' | 'spells', Line[]> = { feats: [], backgrounds: [], spells: [] };
    for (let i = 1; i <= doc.numPages; i++) {
      if (signal?.cancelled) throw new Error('cancelado');
      onProgress(i, doc.numPages);
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const items = (tc.items as { str?: string; transform?: number[] }[])
        .filter((it) => typeof it.str === 'string' && it.transform)
        .map((it) => ({ str: it.str as string, x: it.transform![4], y: it.transform![5] }));
      const kinds = classifyPage(items.map((x) => x.str).join(' '));
      if (kinds.length) {
        const lines = pageLines(items, page.getViewport({ scale: 1 }).width);
        for (const k of kinds) L[k].push(...lines);
      }
      page.cleanup();
    }
    return { feats: parseFeats(L.feats), backgrounds: parseBackgrounds(L.backgrounds), spells: parseSpells(L.spells), pages: doc.numPages };
  } finally {
    void doc.loadingTask.destroy();
  }
}
