import { useEffect, useRef, useState } from 'react';
import { useAccount } from '../store/account';
import AccountBox from './AccountBox';

/**
 * Cuenta en la esquina del encabezado: un botón con el correo (o «Iniciar sesión») que abre el recuadro de la cuenta.
 * Se cierra con Esc o pulsando fuera.
 */
export default function AccountMenu() {
  const { status, user, sync } = useAccount();
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
  const signed = status === 'in' && !!user && !user.anon;
  const label = signed ? user!.email || user!.name || 'Cuenta' : status === 'loading' ? 'Comprobando…' : 'Iniciar sesión';
  const dot = sync === 'error' ? 'bad' : sync === 'syncing' ? 'busy' : 'ok';
  return (
    <div className="acct" ref={ref}>
      <button className="btn small acct-btn" aria-expanded={open} aria-haspopup="dialog" title={signed ? 'Tu cuenta' : 'Guarda tus personajes en la nube'} onClick={() => setOpen(!open)}>
        {signed && <span className={'acct-dot ' + dot} aria-hidden="true" />}
        <span className="acct-name">{label}</span>
      </button>
      {open && <div className="panel acct-pop" role="dialog" aria-label="Cuenta"><AccountBox start /></div>}
    </div>
  );
}
