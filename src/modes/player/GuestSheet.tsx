import { useEffect, useRef } from 'react';
import type { Character } from '../../engine/character';
import { usePlayer } from '../../store/player';
import CharacterSheet from './CharacterSheet';

/**
 * La hoja de un jugador de la sala en la mesa del máster: la misma que ve él, más pequeña y solo para mirar (no se
 * puede pulsar nada: lo que aplica el máster va por su tarjeta y ya llega a la hoja del jugador).
 */
export default function GuestSheet({ c }: { c: Character }) {
  const data = usePlayer((s) => s.data);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { void usePlayer.getState().loadData(); }, []);
  // inert: ni clics ni foco dentro (React 18 aún no lo conoce como propiedad)
  useEffect(() => { ref.current?.setAttribute('inert', ''); }, [data]);
  if (!data) return <p className="muted small" style={{ margin: 0 }}>Cargando la hoja…</p>;
  return (
    <div className="guest-sheet paper" ref={ref}>
      <CharacterSheet c={c} readOnly />
    </div>
  );
}
