import type { ClassData } from '../../data/player';
import type { SpellEntry } from './spells';

export interface SwapState { cantrip: { out: string; in: string }; spell: { out: string; in: string }; keep: string[] | null; add: string[] }
export const emptySwap = (): SwapState => ({ cantrip: { out: '', in: '' }, spell: { out: '', in: '' }, keep: null, add: [] });

/** Aplica los cambios a la lista de conjuros (`scope`: los conjuros de nivel de esa clase que se pueden quitar). */
export function applySwap(spells: string[], s: SwapState, scope: string[]): string[] {
  let out = spells.slice();
  for (const x of [s.cantrip, s.spell]) if (x.out && x.in) out = [...out.filter((id) => id !== x.out), ...(out.includes(x.in) ? [] : [x.in])];
  if (s.keep) out = out.filter((id) => s.keep!.includes(id) || !scope.includes(id));
  return [...out, ...s.add.filter((id) => !out.includes(id))];
}

interface Props {
  cls: ClassData | undefined;
  known: SpellEntry[]; // conjuros suyos de la lista de esta clase
  pool: SpellEntry[]; // conjuros de su lista que puede lanzar (sin los que ya tiene)
  cantrip: boolean; // puede cambiar un truco
  spells: 'one' | 'all' | null; // puede cambiar un conjuro o todos
  preparedMax: number | null;
  state: SwapState;
  setState: (s: SwapState) => void;
}

/**
 * Cambiar conjuros según su clase: un truco por otro, un conjuro por otro, o rehacer toda la lista de preparados
 * (quitando y añadiendo, con el máximo que le toca).
 */
export default function SpellSwap({ cls, known, pool, cantrip, spells, preparedMax, state, setState }: Props) {
  const knownCantrips = known.filter((x) => !x.l);
  const knownSpells = known.filter((x) => !!x.l);
  const one = (kind: 'cantrip' | 'spell', list: SpellEntry[], to: SpellEntry[]) => {
    const v = state[kind];
    return (
      <div className="row2">
        <select className="input" aria-label={kind === 'cantrip' ? 'Truco que cambias' : 'Conjuro que cambias'} value={v.out} onChange={(e) => setState({ ...state, [kind]: { out: e.target.value, in: '' } })}>
          <option value="">{kind === 'cantrip' ? 'No cambiar ningún truco' : 'No cambiar ningún conjuro'}</option>
          {list.map((x) => <option key={x.id} value={x.id}>{x.n}{x.l ? ' (nivel ' + x.l + ')' : ''}</option>)}
        </select>
        <select className="input" aria-label={kind === 'cantrip' ? 'Truco nuevo' : 'Conjuro nuevo'} value={v.in} disabled={!v.out} onChange={(e) => setState({ ...state, [kind]: { ...v, in: e.target.value } })}>
          <option value="">Por…</option>
          {to.map((x) => <option key={x.id} value={x.id}>{x.n}{x.l ? ' (nivel ' + x.l + ')' : ''}</option>)}
        </select>
      </div>
    );
  };
  const keep = state.keep ?? knownSpells.map((x) => x.id);
  const count = keep.length + state.add.length;
  return (
    <div className="spell-swap">
      {cantrip && knownCantrips.length > 0 && one('cantrip', knownCantrips, pool.filter((x) => !x.l))}
      {spells === 'one' && knownSpells.length > 0 && one('spell', knownSpells, pool.filter((x) => !!x.l))}
      {spells === 'all' && (
        <>
          <p className="small" style={{ margin: 0 }}>Preparados: {count}{preparedMax != null ? ' de ' + preparedMax : ''}{cls ? ' · lista de ' + cls.n.toLowerCase() : ''}. Pulsa para quitar o añadir.</p>
          <div className="chips">
            {knownSpells.map((x) => {
              const on = keep.includes(x.id);
              return <button key={x.id} className={on ? 'chip on' : 'chip'} aria-pressed={on} onClick={() => setState({ ...state, keep: on ? keep.filter((k) => k !== x.id) : [...keep, x.id] })}>{x.n} <span className="chip-tag">{x.l}</span></button>;
            })}
          </div>
          <div className="chips swap-add">
            {pool.filter((x) => !!x.l).map((x) => {
              const on = state.add.includes(x.id);
              return <button key={x.id} className={on ? 'chip on' : 'chip'} aria-pressed={on} onClick={() => setState({ ...state, add: on ? state.add.filter((k) => k !== x.id) : [...state.add, x.id] })}>+ {x.n} <span className="chip-tag">{x.l}</span></button>;
            })}
          </div>
        </>
      )}
    </div>
  );
}
