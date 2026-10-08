import { useEffect, useRef, useState } from 'react';

/** Botón «?» del encabezado: repetir la visita guiada y, en el máster, ver los atajos de teclado. */
export default function HelpMenu({ onTour, onKeys }: { onTour: () => void; onKeys?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); window.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className="acct" ref={ref}>
      <button className="btn icon" aria-label="Ayuda" aria-expanded={open} aria-haspopup="menu" title="Ayuda" onClick={() => setOpen(!open)}>?</button>
      {open && (
        <div className="panel acct-pop help-pop" role="menu" aria-label="Ayuda">
          <button className="btn small" role="menuitem" onClick={() => { setOpen(false); onTour(); }}>Repetir la visita guiada</button>
          {onKeys && <button className="btn small" role="menuitem" onClick={() => { setOpen(false); onKeys(); }}>Atajos de teclado</button>}
        </div>
      )}
    </div>
  );
}
