import { useEffect, useRef, useState } from 'react';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { getPdf } from '../store/pdfs';

type PdfDoc = Awaited<ReturnType<typeof import('pdfjs-dist')['getDocument']>['promise']>;

/**
 * Hoja de personaje en PDF dibujada con PDF.js (se carga solo al abrir una hoja), para que se vea
 * igual en PC, tablets Android e iPad. Ajusta las páginas al ancho disponible; el zoom las agranda.
 */
export default function PdfViewer({ pdfId, tall = false }: { pdfId: string; tall?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const pages = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);

  // cargar el documento
  useEffect(() => {
    let alive = true;
    let loaded: PdfDoc | null = null;
    setDoc(null);
    setError('');
    (async () => {
      const blob = await getPdf(pdfId);
      if (!blob) throw new Error('La hoja no está en este dispositivo.');
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      loaded = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
      if (alive) setDoc(loaded); else void loaded.loadingTask.destroy();
    })().catch((e: Error) => { if (alive) setError(e.message || 'No se pudo abrir el PDF.'); });
    return () => { alive = false; if (loaded) void loaded.loadingTask.destroy(); };
  }, [pdfId]);

  // ancho disponible
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // dibujar las páginas
  useEffect(() => {
    const host = pages.current;
    if (!doc || !host || !width) return;
    let cancelled = false;
    const tasks: { cancel: () => void }[] = [];
    host.replaceChildren();
    (async () => {
      const pdfjs = await import('pdfjs-dist');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (let n = 1; n <= doc.numPages && !cancelled; n++) {
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const scale = ((width - 2) * zoom) / base.width;
        const view = page.getViewport({ scale: scale * dpr });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(view.width);
        canvas.height = Math.floor(view.height);
        canvas.style.width = Math.floor(view.width / dpr) + 'px';
        canvas.style.height = Math.floor(view.height / dpr) + 'px';
        canvas.className = 'pdf-page';
        canvas.setAttribute('aria-label', 'Página ' + n + ' de ' + doc.numPages);
        host.appendChild(canvas);
        // los valores de las hojas rellenables también se dibujan
        const task = page.render({ canvas, viewport: view, annotationMode: pdfjs.AnnotationMode.ENABLE_STORAGE });
        tasks.push(task);
        try { await task.promise; } catch { /* cancelada al cambiar el zoom o el tamaño */ }
      }
    })().catch(() => { if (!cancelled) setError('No se pudo dibujar el PDF.'); });
    return () => { cancelled = true; tasks.forEach((t) => t.cancel()); };
  }, [doc, width, zoom]);

  return (
    <div className={tall ? 'pdf-viewer tall' : 'pdf-viewer'}>
      <div className="pdf-tools">
        <span className="muted small">{doc ? doc.numPages + (doc.numPages === 1 ? ' página' : ' páginas') : error ? '' : 'Abriendo la hoja…'}</span>
        <span style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <button className="btn small ghost" aria-label="Reducir" disabled={zoom <= 0.5} onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}>−</button>
          <span className="small" style={{ minWidth: 44, textAlign: 'center', alignSelf: 'center' }}>{Math.round(zoom * 100)} %</span>
          <button className="btn small ghost" aria-label="Ampliar" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}>+</button>
        </span>
      </div>
      {error && <p className="warn" role="alert" style={{ margin: 0 }}>{error}</p>}
      <div ref={box} className="pdf-scroll"><div ref={pages} className="pdf-pages" /></div>
    </div>
  );
}
