import { useState } from 'react';
import { ABILS, type Abil, type ClassData } from '../../data/player';
import { mod, type Character } from '../../engine/character';
import { fmt } from '../../engine/dice';
import { useStore } from '../../store/useStore';

const ABIL_N: Record<Abil, string> = { str: 'Fuerza', dex: 'Destreza', con: 'Constitución', int: 'Inteligencia', wis: 'Sabiduría', cha: 'Carisma' };
const SHORT = (a: Abil) => ABIL_N[a].slice(0, 3).toUpperCase();
export const STANDARD = [15, 14, 13, 12, 10, 8];
/** Coste de la compra de puntos (2024: 27 puntos, puntuaciones de 8 a 15). */
export const POINT_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

type Method = 'standard' | 'points' | 'roll' | 'manual';

/** Orden de reparto propuesto: las características principales de la clase, luego Constitución y el resto. */
const suggested = (cls: ClassData | undefined) => [...(cls?.primary || []), ...(['con', 'dex', 'wis', 'cha', 'int', 'str'] as Abil[])].filter((a, i, arr) => arr.indexOf(a) === i) as Abil[];

/**
 * Las tres formas de generar características (más a mano): matriz estándar y tiradas se reparten eligiendo qué valor
 * va a cada característica (al elegir uno ya usado, se intercambian); la compra de puntos cuenta los 27 puntos.
 */
export default function AbilityMethods({ c, cls, set }: { c: Character; cls: ClassData | undefined; set: (p: Partial<Character>) => void }) {
  const [method, setMethod] = useState<Method>('manual');
  const [rolls, setRolls] = useState<number[]>([]);
  const points = ABILS.reduce((t, a) => t + (POINT_COST[c.abil[a]] ?? NaN), 0);
  const setAbil = (a: Abil, v: number) => set({ abil: { ...c.abil, [a]: Math.max(1, Math.min(30, v || 1)) } });

  // repartir valores de un conjunto (matriz o tiradas): cada característica elige uno; si ya lo tenía otra, se cambian
  const pool = method === 'standard' ? STANDARD : rolls;
  const assign = (a: Abil, v: number) => {
    const other = ABILS.find((x) => x !== a && c.abil[x] === v);
    set({ abil: { ...c.abil, [a]: v, ...(other ? { [other]: c.abil[a] } : {}) } });
  };
  const fill = (vals: number[]) => {
    const order = suggested(cls);
    const sorted = [...vals].sort((x, y) => y - x);
    set({ abil: Object.fromEntries(order.map((a, i) => [a, sorted[i] ?? 10])) as Record<Abil, number> });
  };
  const choose = (m: Method) => {
    setMethod(m);
    if (m === 'standard') fill(STANDARD);
    if (m === 'points') set({ abil: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 } });
  };
  // 4d6 descartando el menor, en el tapete; cuando están las seis, se reparten solas (y se pueden cambiar)
  const rollOne = () => {
    if (rolls.length >= 6) return;
    useStore.getState().roll({
      label: (c.name || 'Personaje') + ' · característica ' + (rolls.length + 1) + ' de 6 (4d6, sin el menor)', kind: 'free', parts: [{ expr: '4d6', dropLowest: 1 }],
      after: (total) => {
        setRolls((r) => { const next = [...r, total].slice(0, 6); if (next.length === 6) fill(next); return next; });
        return {};
      },
    });
  };
  const total = rolls.reduce((t, v) => t + v, 0);

  return (
    <div className="abil-methods">
      <div className="segbox abil-tabs" role="group" aria-label="Cómo generar las características">
        {([['standard', 'Matriz estándar'], ['points', 'Compra de puntos'], ['roll', 'Tirar 4d6'], ['manual', 'A mano']] as [Method, string][]).map(([k, l]) => (
          <button key={k} className={method === k ? 'seg on' : 'seg'} aria-pressed={method === k} onClick={() => choose(k)}>{l}</button>
        ))}
      </div>
      {method === 'roll' && (
        <div className="abil-rolls">
          <button className="btn small gold" disabled={rolls.length >= 6} onClick={rollOne}>{rolls.length >= 6 ? 'Seis tiradas hechas' : 'Tirar 4d6 (' + (rolls.length + 1) + ' de 6)'}</button>
          <span className="abil-roll-vals" aria-label="Tiradas">{rolls.length ? rolls.join(' · ') : 'Se tiran 4d6 y se descarta el menor, seis veces.'}</span>
          {rolls.length > 0 && <span className="muted small">Total {total}</span>}
          {rolls.length > 0 && <button className="btn small ghost" onClick={() => setRolls([])}>Volver a empezar</button>}
        </div>
      )}
      {method === 'points' && <p className={points > 27 || Number.isNaN(points) ? 'warn small' : 'muted small'} style={{ margin: 0 }}>{Number.isNaN(points) ? 'La compra de puntos va de 8 a 15.' : 'Puntos: ' + points + ' de 27' + (points > 27 ? ' (te pasas)' : points < 27 ? ' · te quedan ' + (27 - points) : '')}</p>}
      <div className="row3 abil-grid">
        {ABILS.map((a) => (
          <div key={a} className="abil-edit">
            <label htmlFor={'ce-ab-' + a}>{SHORT(a)}</label>
            {method === 'points' ? (
              <span className="stepper abil-step">
                <button className="step" aria-label={'Bajar ' + ABIL_N[a]} disabled={c.abil[a] <= 8} onClick={() => setAbil(a, c.abil[a] - 1)}>−</button>
                <span className="qty" id={'ce-ab-' + a}>{c.abil[a]}</span>
                <button className="step" aria-label={'Subir ' + ABIL_N[a]} disabled={c.abil[a] >= 15 || points + ((POINT_COST[c.abil[a] + 1] ?? 99) - (POINT_COST[c.abil[a]] ?? 0)) > 27} onClick={() => setAbil(a, c.abil[a] + 1)}>+</button>
              </span>
            ) : (method === 'standard' || (method === 'roll' && rolls.length === 6)) ? (
              <select id={'ce-ab-' + a} className="input" value={c.abil[a]} onChange={(e) => assign(a, parseInt(e.target.value, 10))}>
                {[...new Set([c.abil[a], ...pool])].sort((x, y) => y - x).map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            ) : (
              <input id={'ce-ab-' + a} type="number" min={1} max={30} className="input" value={c.abil[a]} onChange={(e) => setAbil(a, parseInt(e.target.value, 10))} />
            )}
            <span className="muted small">{fmt(mod(c.abil[a]))}</span>
          </div>
        ))}
      </div>
      <span className="muted small">{method === 'standard' || method === 'roll' ? 'Elige qué valor va a cada característica: al escoger uno que ya tiene otra, se intercambian. ' : ''}Suma aquí los bonificadores del trasfondo y las mejoras de característica.</span>
    </div>
  );
}
