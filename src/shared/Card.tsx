import { useEffect, useState, type ReactNode } from 'react';

/** Ventana con el texto completo de un conjuro, rasgo o dote: se cierra con Esc, con «Cerrar» o pulsando fuera. */
export function InfoDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="panel dialog" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>{title}</h2>
          <button className="btn small ghost" autoFocus onClick={onClose}>Cerrar</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Tarjeta de la hoja: a la vista el nombre, sus datos, usos y botones (`head`); el texto (`children`) se abre en una
 * ventana al pulsar el nombre, junto a lo mismo que la tarjeta para poder tirar desde ahí. Sin texto, el nombre no abre nada.
 */
export default function Card({ name, head, children, dialog }: { name: string; head?: ReactNode; children?: ReactNode; dialog?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const body = dialog ?? children;
  return (
    <div className="card">
      {body ? (
        <button className="card-title" aria-haspopup="dialog" title="Ver el texto completo" onClick={() => setOpen(true)}><b>{name}</b></button>
      ) : <b className="card-title">{name}</b>}
      {head}
      {open && body && (
        <InfoDialog title={name} onClose={() => setOpen(false)}>
          {dialog ?? <>{head && <div className="card-head-copy">{head}</div>}{children}</>}
        </InfoDialog>
      )}
    </div>
  );
}
