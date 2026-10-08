import { useEffect, useState, type ReactNode } from 'react';
import { useStore } from '../store/useStore';

const PHONE = '(max-width: 820px)';
const isPhone = () => typeof window !== 'undefined' && !!window.matchMedia?.(PHONE).matches;

/** ¿Pantalla de móvil o tablet en vertical? (se actualiza al girar o redimensionar) */
function usePhone() {
  const [phone, setPhone] = useState(isPhone);
  useEffect(() => {
    const mq = window.matchMedia?.(PHONE);
    if (!mq) return;
    const on = () => setPhone(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return phone;
}

/**
 * La mesa de dados: en escritorio, en su columna; en el móvil, en una ventana que se abre sola al tirar (encima de lo
 * que estés viendo, con los dados rodando y el resultado) y con un botón flotante para abrirla cuando quieras.
 * Es la misma mesa (una sola escena de dados), solo cambia dónde se ve.
 */
export default function DiceDock({ children }: { children: ReactNode }) {
  const phone = usePhone();
  const open = useStore((s) => s.diceOpen);
  const rolling = useStore((s) => s.rolling);
  const set = useStore.getState().set;
  // al tirar se abre sola
  useEffect(() => { if (phone && rolling) set({ diceOpen: true }); }, [phone, rolling, set]);
  useEffect(() => {
    if (!phone || !open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') set({ diceOpen: false }); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phone, open, set]);
  if (!phone) return <>{children}</>;
  return (
    <>
      <button className="dice-fab" aria-label="Mesa de dados" title="Mesa de dados" onClick={() => set({ diceOpen: true })}>d20</button>
      {/* la ventana está siempre montada (fuera de la vista si está cerrada): así la escena 3D no se rehace en cada tirada */}
      <div className={open ? 'dice-sheet open' : 'dice-sheet'} role="dialog" aria-modal={open} aria-label="Mesa de dados" aria-hidden={!open}>
        <div className="dice-sheet-back" onClick={() => set({ diceOpen: false })} />
        <div className="dice-sheet-body">
          <button className="btn small dice-sheet-close" onClick={() => set({ diceOpen: false })}>Cerrar</button>
          {children}
        </div>
      </div>
    </>
  );
}
