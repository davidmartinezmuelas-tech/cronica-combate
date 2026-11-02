interface PipProps { max: number; used: number; onSet: (v: number) => void; label: string; noTotal?: boolean }
/** Usos, como en la hoja oficial: el total y una fila de rombos; los gastados van rellenos. Pulsar uno vacío gasta un uso y uno relleno lo recupera. */
export default function Pips({ max, used, onSet, label, noTotal }: PipProps) {
  const spent = Math.min(max, Math.max(0, used));
  return (
    <span className={max > 6 ? 'uses-marks many' : 'uses-marks'} role="group" aria-label={label + ': ' + (max - spent) + ' de ' + max + ' disponibles'}>
      {!noTotal && <b className="uses-total" title="Total" aria-hidden="true">{max}</b>}
      {Array.from({ length: max }, (_, j) => {
        const gone = j < spent;
        return (
          <button key={j} className={gone ? 'mark on' : 'mark'} aria-label={gone ? 'Recuperar uno' : 'Gastar uno'} title={gone ? 'Gastado' : 'Disponible'} onClick={() => onSet(gone ? spent - 1 : spent + 1)}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.5 12.6 7.4 18.5 10 12.6 12.6 10 18.5 7.4 12.6 1.5 10 7.4 7.4Z" /></svg>
          </button>
        );
      })}
    </span>
  );
}
