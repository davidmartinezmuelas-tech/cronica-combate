import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildBook, chapterId } from '../engine/ruleBook';
import PagedColumns, { bookGoto } from './PagedColumns';
import { findRule, parseMarkup, searchRules, type Inline, type RuleEntry } from '../engine/rules';
import { useStore } from '../store/useStore';

const PAGE = 80;

/** Lo que más se consulta en mesa, a un toque (sin tener que escribir). */
const QUICK: [string, string[]][] = [
  ['Acciones', ['Ataque', 'Correr', 'Retirarse', 'Esquivar', 'Ayudar', 'Ocultarse', 'Preparar', 'Buscar', 'Estudiar', 'Influir', 'Magia', 'Utilizar']],
  ['En combate', ['Ataques de oportunidad', 'Cobertura', 'Sorpresa', 'Golpe crítico', 'Golpe sin armas', 'Agarrar', 'Concentración', 'Tirada de salvación contra la muerte', 'Puntos de golpe temporales', 'Ensangrentado', 'Terreno difícil', 'Caída', 'Descanso corto', 'Descanso largo']],
];

/** Consulta rápida: acciones, estados y reglas de combate habituales (portada del libro de reglas). */
export function RuleQuick() {
  const rules = useStore((s) => s.rules);
  const { openRule } = useStore.getState();
  if (!rules) return null;
  const groups: [string, RuleEntry[]][] = [
    ...QUICK.map(([t, names]): [string, RuleEntry[]] => [t, names.map((n) => findRule(rules, n, 'Glosario') || findRule(rules, n)).filter((e): e is RuleEntry => !!e)]),
    ['Estados', rules.filter((e) => e.cat === 'Estados').sort((a, b) => a.n.localeCompare(b.n, 'es'))],
  ];
  return (
    <div className="rule-quick">
      {groups.filter(([, list]) => list.length).map(([t, list]) => (
        <section key={t}>
          <h3 className="eyebrow">{t}</h3>
          <div className="rule-tiles">{list.map((e) => <button key={e.id} className="rule-tile" onClick={() => openRule(e.id)}>{e.n}</button>)}</div>
        </section>
      ))}
    </div>
  );
}

/** Buscador de reglas (columna izquierda): marcapáginas por capítulo; al abrir uno salen sus reglas, y al buscar salen los resultados de todo el libro. */
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
  const searching = rq.trim().length > 0;
  const found = useMemo(() => (rules && searching ? searchRules(rules, rq) : []), [rules, rq, searching]);
  const book = useMemo(() => (rules ? buildBook(rules) : []), [rules]);
  // al ir a una regla desde un enlace o la lista, su marcapáginas se abre
  useEffect(() => {
    const e = ruleId ? rules?.find((x) => x.id === ruleId) : undefined;
    if (e && !useStore.getState().rq.trim() && useStore.getState().rcat !== e.cat) set({ rcat: e.cat });
  }, [ruleId, rules, set]);
  const item = (e: RuleEntry) => (
    <li key={e.id}>
      <button className={e.id === ruleId ? 'rule-item on' : 'rule-item'} aria-pressed={e.id === ruleId} onClick={() => openRule(e.id)}>
        <span className="rule-name">{e.n}</span>
        <span className="rule-meta">{e.cat === 'Conjuros' ? (e.l ? 'Conjuro de nivel ' + e.l : 'Truco') : e.cat}{e.en && e.en !== e.n ? ' · ' + e.en : ''}</span>
      </button>
    </li>
  );
  const more = (n: number) => n > limit && <li><button className="btn" style={{ width: '100%' }} onClick={() => setLimit(limit + PAGE)}>Mostrar más ({n - limit} restantes)</button></li>;
  const toggle = (cat: string) => {
    const open = rcat !== cat;
    set({ rcat: open ? cat : '' });
    if (open) setTimeout(() => bookGoto(chapterId(cat)), 30);
  };
  return (
    <div className="panel rules-panel">
      <div className="panel-head"><h2>Reglas</h2>{rules && <span className="muted small">{rules.length} entradas</span>}</div>
      <div className="field"><label htmlFor="rules-search">Buscar (español o inglés)</label>
        <input id="rules-search" className="input" type="search" value={rq} placeholder="derribado, prone, empujar, cobertura, bola de fuego…" onChange={(e) => set({ rq: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter' && found[0]) openRule(found[0].id); }} /></div>
      {!rules && !rulesError && <p className="muted" style={{ margin: 0 }}>Cargando las reglas…</p>}
      {rulesError && <p className="warn">{rulesError} <button className="btn small" onClick={() => void loadRules()}>Reintentar</button></p>}
      {rules && searching && (
        <>
          <span className="muted small" role="status">{found.length ? found.length + (found.length === 1 ? ' resultado' : ' resultados') + ' · pulsa uno para ir a su página del libro' : 'Nada coincide.'}</span>
          <ul className="rule-list">{found.slice(0, limit).map(item)}{more(found.length)}</ul>
        </>
      )}
      {rules && !searching && (
        <ul className="rule-marks">
          {book.map((ch) => {
            const open = rcat === ch.cat;
            return (
              <li key={ch.cat} className={open ? 'rule-mark-wrap open' : 'rule-mark-wrap'}>
                <button className="rule-mark" aria-expanded={open} onClick={() => toggle(ch.cat)}>
                  <span className="rule-mark-name">{ch.cat}</span><span className="rule-mark-n">{ch.entries.length}</span>
                </button>
                {open && <ul className="rule-list">{ch.entries.slice(0, limit).map(item)}{more(ch.entries.length)}</ul>}
              </li>
            );
          })}
        </ul>
      )}
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
      {rows.filter(([, v]) => v).map(([k, v]) => <p key={k} className="sb-desc"><span className="sb-label">{k}</span> {v}</p>)}
    </>
  );
}

/** Una regla del libro: título, texto con sus enlaces y tablas. */
const RuleEntryView = memo(function RuleEntryView({ e, on }: { e: RuleEntry; on: boolean }) {
  const blocks = useMemo(() => parseMarkup(e.t), [e]);
  return (
    <article id={'rule-' + e.id} className={on ? 'rule-entry on' : 'rule-entry'} aria-label={'Regla: ' + e.n}>
      <h3 className="rule-title">{e.n}{e.en && e.en !== e.n && <span className="rule-en">{e.en}</span>}</h3>
      {e.cat === 'Conjuros' && <SpellHead e={e} />}
      {blocks.map((b, i) => {
        if (b.k === 'h') return <h4 key={i} className="rule-sub">{b.s}</h4>;
        if (b.k === 'p') return <p key={i} className="sb-desc"><Inl c={b.c} /></p>;
        if (b.k === 'ul') return <ul key={i} className="rule-ul">{b.items.map((it, j) => <li key={j}><Inl c={it} /></li>)}</ul>;
        return (
          <div key={i} className="rule-table-wrap">
            <table className="rule-table">
              {b.head && <thead><tr>{b.head.map((h, j) => <th key={j}><Inl c={h} /></th>)}</tr></thead>}
              <tbody>{b.rows.map((r, j) => {
                const cols = Math.max(b.head?.length || 0, ...b.rows.map((x) => x.length));
                // fila de categoría («Armadura ligera…»): una sola celda que ocupa toda la tabla
                return r.length === 1 && cols > 1
                  ? <tr key={j} className="rule-cat"><td colSpan={cols}><Inl c={r[0]} /></td></tr>
                  : <tr key={j}>{r.map((cl, k) => <td key={k}><Inl c={cl} /></td>)}</tr>;
              })}</tbody>
            </table>
          </div>
        );
      })}
    </article>
  );
});

const SPELL_CHUNK = 40;

/** El libro de reglas (columna central): todas las reglas por orden, con los conjuros al final. Elegir una regla salta a su página. */
export function RuleBook() {
  const rules = useStore((s) => s.rules);
  const ruleId = useStore((s) => s.ruleId);
  const ruleSeq = useStore((s) => s.ruleSeq);
  const canBack = useStore((s) => s.ruleBack.length > 0);
  const { ruleGoBack, loadRules } = useStore.getState();
  const book = useMemo(() => (rules ? buildBook(rules) : []), [rules]);
  // los conjuros (340) se pintan por tramos según se baja; al ir a uno, se pintan hasta él
  const [spells, setSpells] = useState(SPELL_CHUNK);
  const sentinel = useRef<HTMLDivElement>(null);
  const lastSeq = useRef(-1);
  // dos columnas como en un libro (se recuerda en este dispositivo)
  const [cols2, setCols2] = useState(() => { try { return localStorage.getItem('cronica-reglas-columnas') === '2'; } catch { return false; } });
  const toggleCols = () => { const v = !cols2; setCols2(v); try { localStorage.setItem('cronica-reglas-columnas', v ? '2' : '1'); } catch { /* nada */ } };
  useEffect(() => { void loadRules(); }, [loadRules]);
  const spellIdx = useMemo(() => {
    const ch = book.find((c) => c.cat === 'Conjuros');
    return ch && ruleId ? ch.entries.findIndex((e) => e.id === ruleId) : -1;
  }, [book, ruleId]);
  useEffect(() => { if (spellIdx >= spells) setSpells(spellIdx + SPELL_CHUNK); }, [spellIdx, spells]);
  // salto a la regla elegida (una vez por petición, cuando su página ya está pintada)
  useEffect(() => {
    if (!ruleId || !book.length || lastSeq.current === ruleSeq) return;
    if (!document.getElementById('rule-' + ruleId)) return;
    lastSeq.current = ruleSeq;
    bookGoto('rule-' + ruleId);
  }, [ruleId, ruleSeq, book, spells]);
  const moreSpells = useCallback(() => setSpells((n) => n + SPELL_CHUNK), []);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((en) => { if (en.some((x) => x.isIntersecting)) setSpells((n) => n + SPELL_CHUNK); }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [book, spells]);
  if (!rules) return <div className="panel" style={{ textAlign: 'center', padding: '40px 24px' }}><p className="muted" style={{ margin: 0 }}>Cargando el libro de reglas…</p></div>;
  return (
    <div className={cols2 ? 'rule-book cols2' : 'rule-book'} aria-label="Libro de reglas">
      <div className="rule-bookbar">
        <span className="eyebrow">Libro de reglas · SRD 5.2.1</span>
        <span className="rule-bookbtns">
          <button className="rollbtn rule-cols" aria-pressed={cols2} title="Leer en dos columnas, como un libro" onClick={toggleCols}>{cols2 ? 'Una columna' : 'Dos columnas'}</button>
          <button className="rollbtn rule-up" title="Volver al buscador y los marcapáginas" onClick={() => document.querySelector('.rules-panel')?.scrollIntoView({ block: 'start' })}>↑ Índice</button>
          {canBack && <button className="rollbtn dmg" onClick={ruleGoBack}>← Atrás</button>}
        </span>
      </div>
      {(() => { const content = (
    <>
      <h2 className="rule-booktitle">Libro de reglas</h2>
      <p className="rule-intro">Todas las reglas por orden, con los conjuros al final. Elige una a la izquierda o búscala y el libro se abre en su página.</p>
      <RuleQuick />
      {book.map((ch) => {
        const list = ch.cat === 'Conjuros' ? ch.entries.slice(0, spells) : ch.entries;
        return (
          <section key={ch.cat} id={ch.id} className="rule-chapter">
            <h2 className="rule-chapter-title">{ch.cat}</h2>
            {list.map((e) => <RuleEntryView key={e.id} e={e} on={e.id === ruleId} />)}
            {!cols2 && ch.cat === 'Conjuros' && ch.entries.length > spells && <div ref={sentinel} className="muted small" style={{ textAlign: 'center', padding: 12 }}>Cargando más conjuros…</div>}
          </section>
        );
      })}
    </>
  ); return cols2 ? <PagedColumns onNearEnd={moreSpells}>{content}</PagedColumns> : content; })()}
    </div>
  );
}
