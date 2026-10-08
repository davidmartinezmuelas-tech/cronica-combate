import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Un paso de la visita: el elemento que señala (selector CSS; si no está en pantalla, el texto sale centrado). */
export interface TourStep {
  target?: string;
  title: string;
  text: string;
  before?: () => void; // p. ej. abrir la pestaña donde está lo que se señala
}

const SEEN = 'cronica-visita-';

/** ¿Hay que enseñar la visita la primera vez? (no en las pruebas automáticas) */
export function tourPending(key: string): boolean {
  if (import.meta.env.MODE === 'test' || (typeof navigator !== 'undefined' && navigator.webdriver)) return false;
  try { return !localStorage.getItem(SEEN + key); } catch { return false; }
}
const markSeen = (key: string) => { try { localStorage.setItem(SEEN + key, '1'); } catch { /* nada */ } };

/**
 * Visita guiada: oscurece la pantalla salvo el elemento del paso y pone al lado un globo con su explicación,
 * «Anterior / Siguiente» y «Saltar visita». Esc la cierra; las flechas pasan de paso.
 */
export default function Tour({ steps, storeKey, onClose }: { steps: TourStep[]; storeKey: string; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipPos, setTipPos] = useState<{ top: number; left: number } | null>(null);
  const step = steps[i];
  const close = () => { markSeen(storeKey); onClose(); };

  // al cambiar de paso: abre lo que haga falta, lleva el elemento a la vista y mide dónde está
  useEffect(() => {
    step.before?.();
    let alive = true;
    const measure = () => {
      if (!alive) return;
      const el = step.target ? document.querySelector(step.target) : null;
      setRect(el ? el.getBoundingClientRect() : null);
    };
    const t = setTimeout(() => {
      const el = step.target ? document.querySelector(step.target) : null;
      el?.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
      measure();
    }, 60);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { alive = false; clearTimeout(t); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  // el globo: debajo del elemento si cabe; si no, encima; sin elemento, en el centro
  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!tip) return;
    const w = tip.offsetWidth, h = tip.offsetHeight, vw = window.innerWidth, vh = window.innerHeight, m = 12;
    if (!rect) { setTipPos({ top: Math.max(m, (vh - h) / 2), left: Math.max(m, (vw - w) / 2) }); return; }
    // móvil: el globo siempre abajo (lo señalado suele ocupar casi toda la pantalla y se taparía)
    if (vw <= 560) { setTipPos({ top: vh - h - m, left: Math.max(m, (vw - w) / 2) }); return; }
    const clampL = (x: number) => Math.min(Math.max(m, x), vw - w - m);
    const clampT = (y: number) => Math.min(Math.max(m, y), vh - h - m);
    // debajo, encima, a la derecha o a la izquierda (lo primero que quepa sin tapar el elemento)
    if (rect.bottom + m + h <= vh) setTipPos({ top: rect.bottom + m, left: clampL(rect.left + rect.width / 2 - w / 2) });
    else if (rect.top - m - h >= 0) setTipPos({ top: rect.top - m - h, left: clampL(rect.left + rect.width / 2 - w / 2) });
    else if (rect.right + m + w <= vw) setTipPos({ top: clampT(rect.top + 40), left: rect.right + m });
    else if (rect.left - m - w >= 0) setTipPos({ top: clampT(rect.top + 40), left: rect.left - m - w });
    else setTipPos({ top: clampT(rect.top + 40), left: clampL(rect.left + rect.width / 2 - w / 2) });
  }, [rect, i]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      else if (e.key === 'ArrowRight') setI((x) => Math.min(steps.length - 1, x + 1));
      else if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const pad = 6;
  const last = i === steps.length - 1;
  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Visita guiada">
      {rect ? (
        <div className="tour-spot" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      ) : <div className="tour-dim" />}
      <div ref={tipRef} className="panel tour-tip" style={tipPos ? { top: tipPos.top, left: tipPos.left } : { visibility: 'hidden' }}>
        <span className="eyebrow">Paso {i + 1} de {steps.length}</span>
        <h2>{step.title}</h2>
        <p className="tour-text">{step.text}</p>
        <div className="tour-actions">
          <button className="btn small ghost" onClick={close}>Saltar visita</button>
          <span style={{ flex: 1 }} />
          {i > 0 && <button className="btn small" onClick={() => setI(i - 1)}>Anterior</button>}
          <button className="btn small primary" autoFocus onClick={() => (last ? close() : setI(i + 1))}>{last ? 'Terminar' : 'Siguiente'}</button>
        </div>
      </div>
    </div>
  );
}
