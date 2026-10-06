interface PipProps { max: number; used: number; onSet: (v: number) => void; label: string }
/** Casillas de usos: pulsar una disponible la gasta y una gastada la recupera. */
export default function Pips({ max, used, onSet, label }: PipProps) {
  return (
    <span className="pips" role="group" aria-label={label + ': ' + (max - used) + ' de ' + max + ' disponibles'}>
      {Array.from({ length: max }, (_, j) => {
        const avail = j < max - used;
        return <button key={j} className={avail ? 'pip' : 'pip off'} aria-label={avail ? 'Gastar uno' : 'Recuperar uno'} title={avail ? 'Disponible' : 'Gastado'} onClick={() => onSet(avail ? used + 1 : used - 1)} />;
      })}
    </span>
  );
}
