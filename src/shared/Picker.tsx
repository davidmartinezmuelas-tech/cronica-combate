import type { ReactNode } from 'react';

/** Desplegable para listas largas de opciones: plegado muestra solo lo elegido. */
export default function Picker({ title, summary, empty = 'ninguna', open, children }: { title: string; summary: string; empty?: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="picker" open={open}>
      <summary>
        <span className="picker-title">{title}</span>
        <span className={summary ? 'picker-sum' : 'picker-sum muted'}>{summary || empty}</span>
      </summary>
      <div className="picker-body">{children}</div>
    </details>
  );
}
