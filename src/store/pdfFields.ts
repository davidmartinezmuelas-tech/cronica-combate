import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { SheetField } from '../engine/sheetImport';

/**
 * Campos rellenables de un PDF (nombre y valor). Se leen de las anotaciones de cada página porque
 * algunas hojas (la oficial de 2024, por ejemplo) no los exponen en el formulario global.
 */
export async function readPdfFields(blob: Blob): Promise<SheetField[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  try {
    const out: SheetField[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      for (const a of (await page.getAnnotations()) as { subtype?: string; fieldName?: string; fieldValue?: unknown }[]) {
        if (a.subtype !== 'Widget' || !a.fieldName) continue;
        const v = Array.isArray(a.fieldValue) ? a.fieldValue.join(', ') : a.fieldValue;
        out.push({ name: a.fieldName, value: typeof v === 'string' || typeof v === 'number' ? String(v) : '' });
      }
    }
    return out;
  } finally {
    void doc.loadingTask.destroy();
  }
}
