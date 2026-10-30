import { useEffect, useMemo, useRef, useState } from 'react';
import { rankBy } from '../../engine/search';
import { searchRules } from '../../engine/rules';
import { norm } from '../../engine/util';
import { useStore } from '../../store/useStore';

interface Hit { key: string; group: string; title: string; meta: string; go: () => void }

const PER_GROUP = 6;

/** Un fragmento del texto alrededor de la primera coincidencia. */
function snippet(text: string, q: string): string {
  const flat = text.replace(/\s+/g, ' ');
  const at = norm(flat).indexOf(q);
  if (at < 0) return '';
  const from = Math.max(0, at - 30);
  return (from ? '…' : '') + flat.slice(from, at + q.length + 50).trim() + '…';
}

/** Buscador global (Ctrl+K): criaturas, reglas y conjuros, guiones, encuentros y jugadores en una sola caja. */
export default function GlobalSearch() {
  const rules = useStore((s) => s.rules);
  const custom = useStore((s) => s.custom);
  const book = useStore((s) => s.book);
  const srd = useStore((s) => s.srd);
  const scripts = useStore((s) => s.scripts);
  const encounters = useStore((s) => s.encounters);
  const roster = useStore((s) => s.roster);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const close = () => useStore.getState().set({ searchOpen: false });
  useEffect(() => { void useStore.getState().loadRules(); }, []);

  const hits = useMemo<Hit[]>(() => {
    const nq = norm(q.trim());
    if (!nq) return [];
    const st = useStore.getState();
    const out: Hit[] = [];
    const go = (patch: Parameters<typeof st.set>[0]) => () => { st.set({ ...patch, searchOpen: false }); };
    rankBy([...custom, ...book, ...srd], nq, (m) => [m.n, m.en]).slice(0, PER_GROUP).forEach((m) =>
      out.push({ key: 'm' + m.id, group: 'Criaturas', title: m.n, meta: m.sz + ' ' + m.t + ' · VD ' + m.cr + (m.custom ? ' · propia' : ''), go: go({ tab: 'bestiary', viewId: m.id, spellOpen: null }) }));
    if (rules) searchRules(rules, nq).slice(0, PER_GROUP).forEach((e) =>
      out.push({ key: 'r' + e.id, group: 'Reglas y conjuros', title: e.n, meta: e.cat === 'Conjuros' ? (e.l ? 'Conjuro de nivel ' + e.l : 'Truco') : e.cat, go: () => { st.openRule(e.id); st.set({ searchOpen: false }); } }));
    scripts.filter((s) => norm(s.title).includes(nq) || norm(s.text).includes(nq)).slice(0, PER_GROUP).forEach((s) =>
      out.push({ key: 's' + s.id, group: 'Guiones', title: s.title || 'Sin título', meta: norm(s.title).includes(nq) ? 'Título' : snippet(s.text, nq), go: go({ tab: 'script', scriptId: s.id }) }));
    rankBy(encounters, nq, (e) => [e.name]).slice(0, PER_GROUP).forEach((e) =>
      out.push({ key: 'e' + e.id, group: 'Encuentros preparados', title: e.name, meta: e.items.reduce((n, i) => n + i.qty, 0) + ' criaturas · Enter carga el encuentro al combate', go: () => { st.loadEncounter(e.id); st.set({ searchOpen: false }); } }));
    rankBy(roster, nq, (r) => [r.name, r.player, r.cls]).slice(0, PER_GROUP).forEach((r) =>
      out.push({ key: 'p' + r.id, group: 'Grupo', title: r.name, meta: [r.cls, r.player].filter(Boolean).join(' · '), go: go({ tab: 'group' }) }));
    return out;
  }, [q, custom, book, srd, rules, scripts, encounters, roster]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => { listRef.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' }); }, [sel]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => Math.min(hits.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); hits[sel]?.go(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Búsqueda global" onClick={close}>
      <div className="panel dialog gsearch" onClick={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <div className="field"><label htmlFor="gsearch-q">Buscar en todo</label>
          <input id="gsearch-q" className="input" type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="criatura, regla, conjuro, guion, encuentro o jugador" autoComplete="off" /></div>
        {!q.trim() && <p className="muted small" style={{ margin: 0 }}>Escribe para buscar. Flechas para moverte, Enter para abrir, Esc para cerrar.</p>}
        {!!q.trim() && !hits.length && <p className="muted small" role="status" style={{ margin: 0 }}>{rules ? 'Nada coincide.' : 'Cargando las reglas…'}</p>}
        {!!hits.length && (
          <ul className="gsearch-list" ref={listRef} aria-label="Resultados">
            {hits.map((h, i) => (
              <li key={h.key}>
                {(i === 0 || hits[i - 1].group !== h.group) && <h3 className="eyebrow">{h.group}</h3>}
                <button className={i === sel ? 'rule-item on' : 'rule-item'} onMouseEnter={() => setSel(i)} onClick={h.go}>
                  <span className="rule-name">{h.title}</span>
                  {h.meta && <span className="rule-meta">{h.meta}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
