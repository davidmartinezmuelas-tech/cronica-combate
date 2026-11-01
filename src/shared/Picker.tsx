import { useEffect, useRef, type ReactNode } from 'react';

/** Desplegable para listas largas de opciones: plegado muestra solo lo elegido. Con `pop` el cuerpo se abre flotando debajo (sin empujar lo de abajo) y se cierra al pulsar fuera. */
export default function Picker({ title, summary, empty = 'ninguna', open, pop, children }: { title: string; summary: string; empty?: string; open?: boolean; pop?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!pop) return;
    const away = (e: Event) => { const d = ref.current; if (d?.open && !d.contains(e.target as Node)) d.open = false; };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && ref.current?.open) ref.current.open = false; };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [pop]);
  return (
    <details ref={ref} className={pop ? 'picker pop' : 'picker'} open={open}>
      <summary>
        <span className="picker-title">{title}</span>
        <span className={summary ? 'picker-sum' : 'picker-sum muted'}>{summary || empty}</span>
      </summary>
      <div className="picker-body">{children}</div>
    </details>
  );
}
