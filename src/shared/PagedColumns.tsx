import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Lectura a dos columnas por páginas, como un libro abierto: el texto fluye en columnas de una altura fija y se pasa de
 * página con un clic a izquierda o derecha (o con las flechas del teclado), en vez de bajar por una columna y volver a subir.
 * Si algo hace saltar el desplazamiento (por ejemplo, ir a una regla concreta), la página se ajusta sola a la que toca.
 */
export default function PagedColumns({ children, onNearEnd, resetKey }: { children: ReactNode; onNearEnd?: () => void; resetKey?: string }) {
  const view = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const target = useRef<HTMLElement | null>(null); // el elemento al que se ha ido: si el texto se recoloca (fuentes, tamaño), se vuelve a su página
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const cur = Math.min(page, pages - 1); // la página pedida puede llegar antes de que se haya medido el texto
  const step = useCallback(() => {
    const v = view.current, i = inner.current;
    if (!v || !i) return 1;
    return v.clientWidth + (parseFloat(getComputedStyle(i).columnGap) || 0);
  }, []);
  const measure = useCallback(() => {
    const v = view.current, i = inner.current;
    if (!v || !i) return;
    const n = Math.max(1, Math.ceil((i.scrollWidth - 2) / step()));
    setPages(n);
    const t = target.current;
    const rect = t?.isConnected ? t.getClientRects()[0] : undefined;
    if (t && rect) setPage(Math.max(0, Math.min(n - 1, Math.floor((rect.left - v.getBoundingClientRect().left + v.scrollLeft + 24) / step()))));
  }, [step]);
  useLayoutEffect(() => { measure(); });
  useEffect(() => {
    const v = view.current, i = inner.current;
    if (!v || !i || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(v); ro.observe(i);
    void document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [measure]);
  // otro texto: se vuelve a la primera página
  useEffect(() => { setPage(0); }, [resetKey]);
  // la página elegida manda sobre el desplazamiento
  useEffect(() => { const v = view.current; if (v) v.scrollLeft = cur * step(); }, [cur, pages, step]);
  useEffect(() => { if (onNearEnd && cur >= pages - 3) onNearEnd(); }, [cur, pages, onNearEnd]);
  // ir a la página donde empieza un elemento (el evento lo manda bookGoto)
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const r = root.current;
    if (!r) return;
    const on = (e: Event) => {
      const el = (e as CustomEvent<HTMLElement>).detail;
      const v = view.current;
      const rect = el.getClientRects()[0];
      if (!v || !rect) return;
      target.current = el;
      const x = rect.left - v.getBoundingClientRect().left + v.scrollLeft + 24; // margen negativo de las reglas
      setPage(Math.max(0, Math.floor(x / step())));
    };
    r.addEventListener('paged-goto', on);
    return () => r.removeEventListener('paged-goto', on);
  }, [step]);
  const go = useCallback((d: number) => { target.current = null; setPage(Math.max(0, Math.min(pages - 1, cur + d))); }, [pages, cur]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      go(e.key === 'ArrowRight' ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);
  return (
    <div ref={root} className="paged">
      <button className="page-turn prev" aria-label="Página anterior" title="Página anterior (←)" disabled={cur === 0} onClick={() => go(-1)}>‹</button>
      <div ref={view} className="paged-view">
        <div ref={inner} className="paged-inner">{children}</div>
      </div>
      <button className="page-turn next" aria-label="Página siguiente" title="Página siguiente (→)" disabled={cur >= pages - 1} onClick={() => go(1)}>›</button>
      <div className="page-count">
        <button className="rollbtn" disabled={cur === 0} onClick={() => go(-1)}>‹ Anterior</button>
        <span role="status">Página {cur + 1} de {pages}</span>
        <button className="rollbtn" disabled={cur >= pages - 1} onClick={() => go(1)}>Siguiente ›</button>
      </div>
    </div>
  );
}

/** Lleva el libro hasta un elemento: a su página si se lee por páginas, o desplazando si se lee seguido. */
export function bookGoto(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const paged = el.closest('.paged');
  if (paged) { paged.dispatchEvent(new CustomEvent('paged-goto', { detail: el })); paged.scrollIntoView({ block: 'nearest' }); }
  else el.scrollIntoView({ block: 'start' });
}
