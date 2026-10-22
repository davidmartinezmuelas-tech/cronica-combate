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

/** Aumento de características del trasfondo (2024): +2 a una y +1 a otra, o +1 a las tres. Se guarda como «str:2». */
export const BG_ASI_KEY = 'bg.asi';
export function bgBonus(c: Pick<Character, 'choices'>): Record<Abil, number> {
  const out = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 } as Record<Abil, number>;
  for (const x of c.choices?.[BG_ASI_KEY] || []) {
    const [a, n] = x.split(':');
    if (a in out) out[a as Abil] += parseInt(n, 10) || 0;
  }
  return out;
}

/** Orden de reparto propuesto: las características principales de la clase, luego Constitución y el resto. */
const suggested = (cls: ClassData | undefined) => [...(cls?.primary || []), ...(['con', 'dex', 'wis', 'cha', 'int', 'str'] as Abil[])].filter((a, i, arr) => arr.indexOf(a) === i) as Abil[];

/**
 * Las tres formas de generar características (más a mano): matriz estándar y tiradas se reparten eligiendo qué valor
 * va a cada característica (al elegir uno ya usado, se intercambian); la compra de puntos cuenta los 27 puntos.
 */
export default function AbilityMethods({ c, cls, set, bgAbil, bgName }: { c: Character; cls: ClassData | undefined; set: (p: Partial<Character>) => void; bgAbil?: Abil[]; bgName?: string }) {
  const [method, setMethod] = useState<Method>('manual');
  const [rolls, setRolls] = useState<number[]>([]);
  // los métodos trabajan con la puntuación base (sin el trasfondo); al guardar se le vuelve a sumar
  const bonus = bgBonus(c);
  const base = Object.fromEntries(ABILS.map((a) => [a, c.abil[a] - bonus[a]])) as Record<Abil, number>;
  const setBase = (b: Record<Abil, number>) => set({ abil: Object.fromEntries(ABILS.map((a) => [a, b[a] + bonus[a]])) as Record<Abil, number> });
  const points = ABILS.reduce((t, a) => t + (POINT_COST[base[a]] ?? NaN), 0);
  const setAbil = (a: Abil, v: number) => setBase({ ...base, [a]: Math.max(1, Math.min(30, v || 1)) });
  // el aumento del trasfondo: cambiarlo quita el anterior y suma el nuevo
  const asi = c.choices?.[BG_ASI_KEY] || [];
  const asiMode: 'two' | 'three' = asi.length === 3 ? 'three' : 'two';
  const plus2 = asi.find((x) => x.endsWith(':2'))?.split(':')[0] as Abil | undefined;
  const plus1 = asiMode === 'two' ? (asi.find((x) => x.endsWith(':1'))?.split(':')[0] as Abil | undefined) : undefined;
  const setAsi = (next: string[]) => {
    const nb = bgBonus({ choices: { [BG_ASI_KEY]: next } });
    set({ abil: Object.fromEntries(ABILS.map((a) => [a, base[a] + nb[a]])) as Record<Abil, number>, choices: { ...(c.choices || {}), [BG_ASI_KEY]: next } });
  };
  const pickTwo = (two: Abil | '', one: Abil | '') => setAsi([...(two ? [two + ':2'] : []), ...(one && one !== two ? [one + ':1'] : [])]);

  // repartir valores de un conjunto (matriz o tiradas): cada característica elige uno; si ya lo tenía otra, se cambian
  const pool = method === 'standard' ? STANDARD : rolls;
  const assign = (a: Abil, v: number) => {
    const other = ABILS.find((x) => x !== a && base[x] === v);
    setBase({ ...base, [a]: v, ...(other ? { [other]: base[a] } : {}) });
  };
  const fill = (vals: number[]) => {
    const order = suggested(cls);
    const sorted = [...vals].sort((x, y) => y - x);
    setBase(Object.fromEntries(order.map((a, i) => [a, sorted[i] ?? 10])) as Record<Abil, number>);
  };
  const choose = (m: Method) => {
    setMethod(m);
    if (m === 'standard') fill(STANDARD);
    if (m === 'points') setBase({ str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 });
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
                <button className="step" aria-label={'Bajar ' + ABIL_N[a]} disabled={base[a] <= 8} onClick={() => setAbil(a, base[a] - 1)}>−</button>
                <span className="qty" id={'ce-ab-' + a}>{base[a]}</span>
                <button className="step" aria-label={'Subir ' + ABIL_N[a]} disabled={base[a] >= 15 || points + ((POINT_COST[base[a] + 1] ?? 99) - (POINT_COST[base[a]] ?? 0)) > 27} onClick={() => setAbil(a, base[a] + 1)}>+</button>
              </span>
            ) : (method === 'standard' || (method === 'roll' && rolls.length === 6)) ? (
              <select id={'ce-ab-' + a} className="input" value={base[a]} onChange={(e) => assign(a, parseInt(e.target.value, 10))}>
                {[...new Set([base[a], ...pool])].sort((x, y) => y - x).map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            ) : (
              <input id={'ce-ab-' + a} type="number" min={1} max={30} className="input" value={base[a]} onChange={(e) => setAbil(a, parseInt(e.target.value, 10))} />
            )}
            <span className="muted small">{bonus[a] ? <b className="abil-bg">+{bonus[a]} = {c.abil[a]} · </b> : null}{fmt(mod(c.abil[a]))}</span>
          </div>
        ))}
      </div>
      {bgAbil && bgAbil.length > 0 && (
        <div className="abil-bgasi" role="group" aria-label="Aumento del trasfondo">
          <span className="eyebrow">Trasfondo{bgName ? ' (' + bgName + ')' : ''}</span>
          <div className="segbox">
            <button className={asiMode === 'two' ? 'seg on' : 'seg'} aria-pressed={asiMode === 'two'} onClick={() => asiMode !== 'two' && setAsi([])}>+2 a una y +1 a otra</button>
            <button className={asiMode === 'three' ? 'seg on' : 'seg'} aria-pressed={asiMode === 'three'} onClick={() => asiMode !== 'three' && setAsi(bgAbil.map((a) => a + ':1'))}>+1 a las tres</button>
          </div>
          {asiMode === 'two' && (
            <div className="row2">
              <div className="field"><label htmlFor="ce-bg2">+2 a</label>
                <select id="ce-bg2" className="input" value={plus2 || ''} onChange={(e) => pickTwo(e.target.value as Abil, plus1 || '')}>
                  <option value="">Elige</option>{bgAbil.map((a) => <option key={a} value={a}>{ABIL_N[a]}</option>)}
                </select></div>
              <div className="field"><label htmlFor="ce-bg1">+1 a</label>
                <select id="ce-bg1" className="input" value={plus1 || ''} onChange={(e) => pickTwo(plus2 || '', e.target.value as Abil)}>
                  <option value="">Elige</option>{bgAbil.filter((a) => a !== plus2).map((a) => <option key={a} value={a}>{ABIL_N[a]}</option>)}
                </select></div>
            </div>
          )}
          {asiMode === 'three' && <span className="muted small">{bgAbil.map((a) => ABIL_N[a]).join(', ')}: +1 cada una.</span>}
        </div>
      )}
      <span className="muted small">{method === 'standard' || method === 'roll' ? 'Elige qué valor va a cada característica: al escoger uno que ya tiene otra, se intercambian. ' : ''}{bgAbil?.length ? 'El aumento del trasfondo se suma solo (arriba, la puntuación base). Las mejoras de nivel llegan al «Subir de nivel» o súmalas aquí.' : 'Suma aquí los bonificadores del trasfondo y las mejoras de característica.'}</span>
    </div>
  );
}
