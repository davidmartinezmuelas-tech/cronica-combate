import { useEffect, useMemo, useState } from 'react';
import { parseMarkup, searchRules, type Inline, type RuleEntry } from '../engine/rules';
import { useStore } from '../store/useStore';

const CATS = ['Estados', 'Glosario', 'Acciones', 'Combate', 'Pruebas de d20', 'Daño y curación', 'Exploración', 'Interacción social', 'Lanzar conjuros', 'Conjuros', 'Equipo', 'Monturas y vehículos', 'Objetos mágicos', 'Dirigir el combate', 'Caja de herramientas del DM'];
const PAGE = 80;

/** Buscador de reglas (columna izquierda). */
export default function RulesPanel() {
  const rules = useStore((s) => s.rules);
  const rulesError = useStore((s) => s.rulesError);
  const rq = useStore((s) => s.rq);
  const rcat = useStore((s) => s.rcat);
  const ruleId = useStore((s) => s.ruleId);
  const { set, loadRules, openRule } = useStore.getState();
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => { void loadRules(); }, [loadRules]);
  useEffect(() => setLimit(PAGE), [rq, rcat]);
  const found = useMemo(() => (rules ? searchRules(rules, rq, rcat) : []), [rules, rq, rcat]);
  const cats = useMemo(() => CATS.filter((c) => rules?.some((e) => e.cat === c)), [rules]);
  return (
    <div className="panel">
      <div className="panel-head"><h2>Reglas</h2>{rules && <span className="muted small">{rules.length} entradas</span>}</div>
      <div className="field"><label htmlFor="rules-search">Buscar (español o inglés)</label>
        <input id="rules-search" className="input" type="search" value={rq} placeholder="derribado, prone, cobertura, bola de fuego…" onChange={(e) => set({ rq: e.target.value })} /></div>
      <div className="field"><label htmlFor="rules-cat">Tipo</label>
        <select id="rules-cat" className="input" value={rcat} onChange={(e) => set({ rcat: e.target.value })}>
          <option value="">Todo</option>
          {cats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select></div>
      {!rules && !rulesError && <p className="muted" style={{ margin: 0 }}>Cargando las reglas…</p>}
      {rulesError && <p className="warn">{rulesError} <button className="btn small" onClick={() => void loadRules()}>Reintentar</button></p>}
      {rules && (
        <>
          <span className="muted small" role="status">{found.length ? found.length + (found.length === 1 ? ' resultado' : ' resultados') : 'Nada coincide con la búsqueda.'}</span>
          <ul className="rule-list">
            {found.slice(0, limit).map((e) => (
              <li key={e.id}>
                <button className={e.id === ruleId ? 'rule-item on' : 'rule-item'} aria-pressed={e.id === ruleId} onClick={() => openRule(e.id)}>
                  <span className="rule-name">{e.n}</span>
                  <span className="rule-meta">{e.cat === 'Conjuros' ? (e.l ? 'Conjuro de nivel ' + e.l : 'Truco') : e.cat}{e.en && e.en !== e.n ? ' · ' + e.en : ''}</span>
                </button>
              </li>
            ))}
          </ul>
          {found.length > limit && <button className="btn" onClick={() => setLimit(limit + PAGE)}>Mostrar más ({found.length - limit} restantes)</button>}
        </>
      )}
      <p className="muted small" style={{ margin: 0 }}>Reglas del SRD 5.2.1 (2024). Los enlaces del texto abren la regla citada.</p>
    </div>
  );
}

function Inl({ c }: { c: Inline[] }) {
  const { openRule } = useStore.getState();
  const exists = useStore((s) => s.rules);
  return (
    <>
      {c.map((x, i) => {
        if (x.k === 't') return <span key={i}>{x.s}</span>;
        if (x.k === 'b') return <strong key={i}><Inl c={x.c} /></strong>;
        if (x.k === 'i') return <em key={i}><Inl c={x.c} /></em>;
        return exists?.some((e) => e.id === x.id)
          ? <button key={i} className="rule-link" onClick={() => openRule(x.id)}>{x.s}</button>
          : <span key={i}>{x.s}</span>;
      })}
    </>
  );
}

function SpellHead({ e }: { e: RuleEntry }) {
  const rows: [string, string | undefined][] = [['Tiempo de lanzamiento', e.ct], ['Alcance', e.r], ['Componentes', e.cmp], ['Duración', e.du]];
  return (
    <>
      <p className="sb-meta">{e.l ? 'Conjuro de nivel ' + e.l + ' de ' + (e.esc || '').toLowerCase() : 'Truco de ' + (e.esc || '').toLowerCase()}{e.rit ? ' (ritual)' : ''}</p>
      <div className="sb-rule" />
      {rows.filter(([, v]) => v).map(([k, v]) => <p key={k}><span className="sb-label">{k}</span> {v}</p>)}
      <div className="sb-rule" />
    </>
  );
}

/** Ficha de una regla (columna central). */
export function RuleView() {
  const e = useStore((s) => (s.rules && s.ruleId ? s.rules.find((x) => x.id === s.ruleId) : undefined));
  const canBack = useStore((s) => s.ruleBack.length > 0);
  const { ruleGoBack } = useStore.getState();
  const blocks = useMemo(() => (e ? parseMarkup(e.t) : []), [e]);
  if (!e) return null;
  return (
    <article className="statblock rule-view" aria-label={'Regla: ' + e.n}>
      {canBack && <button className="rollbtn dmg" style={{ float: 'right' }} onClick={ruleGoBack}>← Atrás</button>}
      <h2 className="sb-name">{e.n}</h2>
      {e.cat === 'Conjuros' ? <SpellHead e={e} /> : <p className="sb-meta">{e.cat}{e.en && e.en !== e.n ? ' · ' + e.en : ''}</p>}
      {e.cat !== 'Conjuros' && <div className="sb-rule" />}
      {blocks.map((b, i) => {
        if (b.k === 'h') return <h3 key={i} className="sb-section">{b.s}</h3>;
        if (b.k === 'p') return <p key={i} className="sb-desc"><Inl c={b.c} /></p>;
        if (b.k === 'ul') return <ul key={i} className="rule-ul">{b.items.map((it, j) => <li key={j}><Inl c={it} /></li>)}</ul>;
        return (
          <div key={i} className="rule-table-wrap">
            <table className="rule-table">
              {b.head && <thead><tr>{b.head.map((h, j) => <th key={j}><Inl c={h} /></th>)}</tr></thead>}
              <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((cl, k) => <td key={k}><Inl c={cl} /></td>)}</tr>)}</tbody>
            </table>
          </div>
        );
      })}
    </article>
  );
}
