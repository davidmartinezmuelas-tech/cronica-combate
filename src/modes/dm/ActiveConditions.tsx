import { durationText } from '../../engine/combat';
import { useStore } from '../../store/useStore';

/** Todos los estados activos del combate en una lista, los que caducan antes primero. */
export default function ActiveConditions() {
  const combatants = useStore((s) => s.combatants);
  const { set } = useStore.getState();
  const rows = combatants
    .flatMap((c) => c.conds.map((cd) => ({ c, cd })))
    .sort((a, b) => (a.cd.r ?? 999) - (b.cd.r ?? 999) || a.c.name.localeCompare(b.c.name, 'es'));
  if (!rows.length) return <p className="muted small" style={{ margin: 0 }}>Ningún estado activo.</p>;
  return (
    <ul className="rem cond-list" aria-label="Estados activos">
      {rows.map(({ c, cd }) => (
        <li key={c.id + cd.k}>
          <button className="cond-row" onClick={() => set({ selId: c.id })} aria-label={'Ver a ' + c.name}>
            <strong>{cd.k}</strong>
            <span>{c.name}</span>
            <span className="muted small">
              {cd.r == null ? 'hasta que se quite' : durationText(cd, c, combatants)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
