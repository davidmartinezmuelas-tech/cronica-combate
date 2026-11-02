import { useState, type ReactNode } from 'react';
import { InfoDialog } from './Card';

/** Botón pequeño que abre la ventana de información (la misma que la de un conjuro) en mitad de la pantalla. */
export default function InfoPop({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="info-pop-btn" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>{label}</button>
      {open && <InfoDialog title={title} onClose={() => setOpen(false)}><div className="info-pop-body">{children}</div></InfoDialog>}
    </>
  );
}
