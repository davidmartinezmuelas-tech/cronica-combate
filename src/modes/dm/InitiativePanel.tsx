import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Combatant, Encounter } from '../../data/types';
import { encounterDifficulty, sortCombatants } from '../../engine/combat';
import { nfmt } from '../../engine/util';
import { useStore } from '../../store/useStore';
import ActiveConditions from './ActiveConditions';
import CombatHistory from './CombatHistory';

/** Dificultad del encuentro (reglas 2024), en pequeño bajo la iniciativa. */
function Difficulty() {
  const combatants = useStore((s) => s.combatants);
  const monById = useStore((s) => s.monById);
  const srd = useStore((s) => s.srd);
  const d = useMemo(() => encounterDifficulty(combatants, monById), [combatants, monById, srd]);
  if (!combatants.some((c) => c.kind === 'monster')) return null;
  if (!d.has || !d.budget) return <p className="diff-mini muted small">{d.text}</p>;
  const max = Math.max(d.budget[2] * 1.6, d.xp) || 1;
  const pct = (v: number) => Math.min(100, Math.round((v / max) * 100));
  return (
    <div className="diff-mini" title={'Reglas 2024 · Baja ' + nfmt(d.budget[0]) + ' · Moderada ' + nfmt(d.budget[1]) + ' · Alta ' + nfmt(d.budget[2]) + ' PX'}>
      <div className="diff-mini-top">
        <span className="eyebrow">Dificultad</span>
        <strong className={'diff-mini-label d' + d.level}>{d.label}</strong>
        <span className="muted small">{nfmt(d.xp)} PX · {d.party}</span>
      </div>
      <div className="diffbar" role="img" aria-label={'Dificultad ' + d.label + ': ' + nfmt(d.xp) + ' PX; baja ' + nfmt(d.budget[0]) + ', moderada ' + nfmt(d.budget[1]) + ', alta ' + nfmt(d.budget[2])}>
        <span className={'difffill d' + d.level} style={{ width: pct(d.xp) + '%' }} />
        {d.budget.map((b, i) => <span key={i} className="diffmark" style={{ left: pct(b) + '%' }} />)}
      </div>
    </div>
  );
}

function statusOf(c: Combatant, started: boolean): string {
  const bits: string[] = [];
  const down = c.kind === 'monster' ? c.hp <= 0 : c.kind === 'pc' ? !!c.dead || c.hp <= 0 : false;
  if (c.init == null) bits.push(started ? 'Sin iniciativa: no actúa' : 'Sin iniciativa');
  if (c.kind === 'monster' && c.hp <= 0) bits.push('Derrotado');
  if (c.kind === 'pc' && c.dead) bits.push('Muerto');
  else if (c.kind === 'pc' && c.hp <= 0) bits.push(c.stable ? 'Estable' : 'Salv. muerte ' + (c.death?.s || 0) + '✓ ' + (c.death?.f || 0) + '✗');
  if (!down && c.kind !== 'lair' && c.maxHp && c.hp <= c.maxHp / 2) bits.push('Ensangrentado');
  if (c.conc) bits.push('Concentrando');
  c.conds.forEach((cd) => { if (!(c.kind === 'pc' && cd.k === 'Inconsciente' && c.hp <= 0)) bits.push(cd.k + (cd.r != null ? ' (' + cd.r + ')' : '')); });
  if (c.exh) bits.push('Agotamiento ' + c.exh);
  if (c.laMax) bits.push('Leg. ' + (c.laMax - c.laUsed) + '/' + c.laMax);
  if (c.lrMax) bits.push('Res. leg. ' + (c.lrMax - c.lrUsed) + '/' + c.lrMax);
  if (c.kind === 'lair') bits.push('Pierde los empates');
  return bits.join(' · ');
}

/** Quien se está arrastrando en la lista (el dataTransfer no se puede leer mientras se pasa por encima). */
let dragging: string | null = null;

/** Cada fila avisa aquí de dónde caería lo que se arrastra (para el arrastre con el dedo, que no usa el de HTML5). */
const rowOver = new Map<string, (v: 'above' | 'below' | null) => void>();

/** Arrastre táctil por el asa: sigue al dedo y, al soltar, mueve a quien se arrastra encima o debajo de la fila que haya debajo. */
function startTouchDrag(e: React.PointerEvent, id: string) {
  if (e.pointerType === 'mouse') return; // el ratón arrastra la fila entera
  e.preventDefault();
  try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* sin captura: se sigue por la ventana */ }
  let hit: { id: string; after: boolean } | null = null;
  const mark = (v: { id: string; after: boolean } | null) => {
    if (hit && (!v || v.id !== hit.id)) rowOver.get(hit.id)?.(null);
    if (v) rowOver.get(v.id)?.(v.after ? 'below' : 'above');
    hit = v;
  };
  const move = (ev: PointerEvent) => {
    const li = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-cid]');
    const target = li?.dataset.cid;
    if (!li || !target || target === id) { mark(null); return; }
    const r = li.getBoundingClientRect();
    mark({ id: target, after: ev.clientY >= r.top + r.height / 2 });
    // cerca del borde de la columna: se desplaza para llegar a las filas lejanas
    const box = li.closest<HTMLElement>('.col-left');
    if (box) { const b = box.getBoundingClientRect(); if (ev.clientY < b.top + 40) box.scrollBy(0, -12); else if (ev.clientY > b.bottom - 40) box.scrollBy(0, 12); }
  };
  const end = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    const h = hit;
    mark(null);
    if (h && ev.type === 'pointerup') useStore.getState().moveCombatant(id, h.id, h.after);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}

function Row({ c, prev, next }: { c: Combatant; prev?: string; next?: string }) {
  const started = useStore((s) => s.started);
  const isActive = useStore((s) => s.started && s.activeId === c.id);
  const isSel = useStore((s) => s.selId === c.id);
  const { set, patchC, moveCombatant } = useStore.getState();
  const [over, setOver] = useState<'above' | 'below' | null>(null);
  useEffect(() => { rowOver.set(c.id, setOver); return () => { rowOver.delete(c.id); }; }, [c.id]);
  const pct = c.maxHp ? Math.max(0, Math.round((c.hp / c.maxHp) * 100)) : 0;
  const down = c.kind === 'monster' ? c.hp <= 0 : c.kind === 'pc' ? !!c.dead || c.hp <= 0 : false;
  const cls = ['init-row', c.kind, isActive ? 'active' : '', isSel ? 'sel' : '', down ? 'down' : ''].join(' ');
  const commit = (v: string) => { const n = parseInt(v.replace('−', '-'), 10); if (!isNaN(n)) patchC(c.id, { init: n }, 'iniciativa'); };
  return (
    <li data-cid={c.id} className={'init-li' + (over ? ' drop-' + over : '')} style={{ display: 'flex', gap: 6, alignItems: 'center' }}
      draggable onDragStart={(e) => { dragging = c.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.id); }}
      onDragEnd={() => { dragging = null; setOver(null); }}
      onDragOver={(e) => { if (!dragging || dragging === c.id) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setOver(e.clientY < r.top + r.height / 2 ? 'above' : 'below'); }}
      onDragLeave={() => setOver(null)}
      onDrop={(e) => { e.preventDefault(); const id = dragging; const after = over === 'below'; dragging = null; setOver(null); if (id && id !== c.id) moveCombatant(id, c.id, after); }}>
      <button className={cls} title={c.name} onClick={() => { set({ selId: c.id, spellOpen: null }); showCard(); }} aria-pressed={isSel}>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* una línea: iniciativa, nombre y marcas a la izquierda; CA y PG a la derecha (la fila ocupa la mitad que antes) */}
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="init-badge" title="Arrastra el número para cambiar el orden" onPointerDown={(e) => startTouchDrag(e, c.id)} aria-label={'Iniciativa ' + (c.init ?? 'sin tirar')}>{c.init == null ? '—' : c.init}</span>
            <span style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.2, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
            {c.kind === 'pc' && <span className="pc-flag">PJ</span>}
            {isActive && <span className="turn-flag" title="En turno" aria-label="En turno">▶</span>}
            {c.kind !== 'lair' && (
              <span style={{ whiteSpace: 'nowrap', fontWeight: 700, marginLeft: 'auto', fontSize: 12, color: 'var(--text-2)' }}>CA {c.ac} · {c.hp}/{c.maxHp}{c.temp > 0 && <span style={{ color: '#9cc4e4' }}> +{c.temp}</span>}</span>
            )}
          </span>
          {c.kind !== 'lair' && <span className="hpbar"><span className={'hpfill ' + (pct <= 25 ? 'low' : pct <= 50 ? 'mid' : '')} style={{ width: pct + '%' }} /></span>}
          {(() => { const st = statusOf(c, started); return st ? <span style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.3, overflowWrap: 'anywhere' }}>{st}</span> : null; })()}
        </span>
      </button>
      {(prev || next) && (
        <span className="init-move">
          <button className="init-move-btn" disabled={!prev} aria-label={'Subir a ' + c.name} title="Subir en el orden" onClick={() => prev && moveCombatant(c.id, prev, false)}>▲</button>
          <button className="init-move-btn" disabled={!next} aria-label={'Bajar a ' + c.name} title="Bajar en el orden" onClick={() => next && moveCombatant(c.id, next, true)}>▼</button>
        </span>
      )}
      {c.init == null && (
        <input className="input init-in" type="text" inputMode="numeric" aria-label={'Iniciativa de ' + c.name} placeholder="Ini"
          onBlur={(e) => commit(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      )}
    </li>
  );
}

/** Pestaña plegable (marcapáginas) del panel: sale solo el título y, al pulsarla, se despliega lo que contiene. */
function Fold({ title, count, open, onToggle, children }: { title: string; count?: number; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className={open ? 'fold open' : 'fold'}>
      <button className="rule-mark" aria-expanded={open} onClick={onToggle}>
        <span className="rule-mark-name">{title}</span>{count != null && <span className="rule-mark-n">{count}</span>}
      </button>
      {open && <div className="fold-body">{children}</div>}
    </div>
  );
}

/** Contenido de un encuentro preparado: se puede renombrar y cambiar cuántas criaturas lleva, o quitar alguna, sin cargarlo al combate. */
function EncounterBody({ e }: { e: Encounter }) {
  const confirmKey = useStore((s) => s.confirmKey);
  const { loadEncounter, deleteEncounter, updateEncounter, monById } = useStore.getState();
  const [name, setName] = useState(e.name);
  useEffect(() => { setName(e.name); }, [e.name]);
  const setQty = (monsterId: string, d: number) => updateEncounter(e.id, { items: e.items.map((it) => (it.monsterId === monsterId ? { ...it, qty: it.qty + d } : it)) });
  const rename = () => { if (name.trim() === e.name) return; if (!updateEncounter(e.id, { name })) setName(e.name); };
  return (
    <div className="enc-tag-body">
      <div className="field"><label htmlFor={'enc-n-' + e.id}>Nombre</label>
        <input id={'enc-n-' + e.id} className="input" value={name} onChange={(ev) => setName(ev.target.value)} onBlur={rename} onKeyDown={(ev) => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }} /></div>
      <ul className="enc-items enc-edit">
        {e.items.map((it) => {
          const nm = monById(it.monsterId)?.n || it.monsterId;
          return (
            <li key={it.monsterId + (it.inLair ? '-l' : '')}>
              <span className="enc-edit-name">{nm}</span>
              <button className="btn small ghost" aria-label={'Una menos de ' + nm} disabled={it.qty <= 1} onClick={() => setQty(it.monsterId, -1)}>−</button>
              <span className="enc-edit-qty" aria-label={it.qty + ' de ' + nm}>{it.qty}</span>
              <button className="btn small ghost" aria-label={'Una más de ' + nm} disabled={it.qty >= 20} onClick={() => setQty(it.monsterId, 1)}>+</button>
              <button className="btn small ghost danger" aria-label={'Quitar ' + nm + ' del encuentro'} disabled={e.items.length <= 1} onClick={() => updateEncounter(e.id, { items: e.items.filter((x) => x !== it) })}>✕</button>
            </li>
          );
        })}
      </ul>
      <label className="check"><input type="checkbox" checked={e.lair} onChange={(ev) => updateEncounter(e.id, { lair: ev.target.checked })} />Con acciones de guarida</label>
      <span style={{ display: 'flex', gap: 6 }}>
        <button className="btn small" onClick={() => loadEncounter(e.id)}>Cargar</button>
        <button className="btn small ghost danger" onClick={() => deleteEncounter(e.id)}>{confirmKey === 'enc-' + e.id ? '¿Seguro? Borrar' : 'Borrar'}</button>
      </span>
    </div>
  );
}

function Encounters() {
  const encounters = useStore((s) => s.encounters);
  const hasMonsters = useStore((s) => s.combatants.some((c) => c.kind === 'monster'));
  const { saveEncounter } = useStore.getState();
  const [name, setName] = useState('');
  const [open, setOpen] = useState(false);
  const [which, setWhich] = useState<string | null>(null);
  const save = () => { if (saveEncounter(name)) setName(''); };
  return (
    <div className="init-block">
      <Fold title="Encuentros preparados" count={encounters.length} open={open} onToggle={() => setOpen(!open)}>
        {encounters.length > 0 ? (
          <ul className="enc-tags">
            {encounters.map((e) => (
              <li key={e.id} className={which === e.id ? 'enc-tag open' : 'enc-tag'}>
                <button className="enc-tag-name" aria-expanded={which === e.id} onClick={() => setWhich(which === e.id ? null : e.id)}>
                  <span className="enc-tag-chev" aria-hidden="true">{which === e.id ? '▾' : '▸'}</span>{e.name}
                </button>
                {which === e.id && <EncounterBody e={e} />}
              </li>
            ))}
          </ul>
        ) : <p className="muted small" style={{ margin: 0 }}>Añade monstruos y guárdalos aquí para cargarlos de un clic el día de la sesión.</p>}
      </Fold>
      {hasMonsters && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: 1, minWidth: 160 }}><label htmlFor="enc-name">Guardar los monstruos actuales como</label>
            <input id="enc-name" className="input" value={name} placeholder="Emboscada en el puente" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} /></div>
          <button className="btn small" onClick={save}>Guardar encuentro</button>
        </div>
      )}
    </div>
  );
}

/** En pantallas estrechas la ficha queda debajo de la lista: se baja hasta ella para que se vea qué se ha abierto. */
function showCard() {
  if (typeof window === 'undefined' || !window.matchMedia?.('(max-width: 1023px)').matches) return;
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  requestAnimationFrame(() => document.querySelector('.combatant-card')?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' }));
}

export default function InitiativePanel() {
  const combatants = useStore((s) => s.combatants);
  const roster = useStore((s) => s.roster);
  const started = useStore((s) => s.started);
  const surprised = useStore((s) => s.surprised);
  const confirmKey = useStore((s) => s.confirmKey);
  const { set, rollInit, autoOrder, addPc, addAllPcs, addLairCombatant, endCombat, clearAll, confirm } = useStore.getState();
  const order = useMemo(() => sortCombatants(combatants), [combatants]);
  const inC = new Set(combatants.map((c) => c.rosterId).filter(Boolean));
  const rosterOut = roster.filter((r) => !inC.has(r.id));
  const pendingPc = combatants.some((c) => c.init == null && c.kind === 'pc');
  const pendingMon = combatants.filter((c) => c.init == null && c.kind === 'monster').length;
  // ya en combate, el botón solo sirve para los refuerzos: volver a tirar a todos desordenaría la ronda
  const hasMon = combatants.some((c) => c.kind === 'monster');
  const showRoll = hasMon && (!started || pendingMon > 0);
  // móvil: al empezar el combate se pliegan las opciones de preparación (se pueden abrir)
  const narrow = () => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 560px)').matches;
  const [groupOpen, setGroupOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [condOpen, setCondOpen] = useState(true);
  const condCount = combatants.reduce((n, c) => n + c.conds.length, 0);
  const history = useStore((s) => s.history);
  const [extrasOpen, setExtrasOpen] = useState(() => !(started && narrow()));
  useEffect(() => { setExtrasOpen(!(started && narrow())); }, [started]);
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Iniciativa</h2>
        {showRoll && <button className="btn small gold" onClick={() => rollInit()} title="Atajo: I">{started ? 'Tirar iniciativa de los nuevos (' + pendingMon + ')' : 'Tirar iniciativa de monstruos'}</button>}
      </div>
      {(!started || surprised) && <label className="check"><input type="checkbox" checked={surprised} onChange={(e) => set({ surprised: e.target.checked })} />Los monstruos están sorprendidos (desventaja)</label>}
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {order.map((c, i) => <Row key={c.id} c={c} prev={order[i - 1]?.id} next={order[i + 1]?.id} />)}
      </ol>
      {order.length > 1 && <p className="muted small" style={{ margin: 0 }}>Arrastra una fila (en táctil, por el número) o usa ▲▼ para cambiar el orden a mano (dotes, decisiones).{combatants.some((c) => c.ord != null) && <> <button className="btn small ghost" onClick={autoOrder}>Orden automático</button></>}</p>}
      <Difficulty />
      {!combatants.length && <p className="muted" style={{ margin: 0 }}>El encuentro está vacío. Empieza añadiendo monstruos desde el Bestiario.</p>}
      {pendingPc && <p className="muted small" style={{ margin: 0 }}>Escribe en la casilla la iniciativa que saque cada jugador y pulsa Intro.</p>}
      {/* en móvil, durante el combate, lo que se usa poco va plegado para llegar antes al turno */}
      <details className="init-extras" open={extrasOpen} onToggle={(e) => setExtrasOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="init-extras-sum">Más opciones (grupo, encuentros, guarida)</summary>
      {roster.length > 0 && (
        <div className="init-block">
          <Fold title="Tu grupo" count={roster.length} open={groupOpen} onToggle={() => setGroupOpen(!groupOpen)}>
            {rosterOut.length > 0 ? (
              <>
                <div className="chips">{rosterOut.map((r) => <button key={r.id} className="chip" onClick={() => addPc(r)}>+ {r.name}</button>)}</div>
                <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={addAllPcs}>Añadir a todos</button>
              </>
            ) : <p className="muted small" style={{ margin: 0 }}>Todo tu grupo ya está en el combate.</p>}
          </Fold>
        </div>
      )}
      {!roster.length && <button className="btn small ghost" onClick={() => set({ tab: 'group' })} style={{ alignSelf: 'flex-start' }}>Guardar a tus jugadores en Grupo</button>}
      <Encounters />
      {condCount > 0 && (
        <div className="init-block">
          <Fold title="Estados activos" count={condCount} open={condOpen} onToggle={() => setCondOpen(!condOpen)}>
            <ActiveConditions />
          </Fold>
        </div>
      )}
      <div className="init-block">
        <Fold title="Historial del combate" count={history.length} open={histOpen} onToggle={() => setHistOpen(!histOpen)}>
          <CombatHistory />
        </Fold>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, borderTop: '1px solid #4b4138', paddingTop: 12 }}>
        {!combatants.some((c) => c.kind === 'lair') && <button className="btn small ghost" onClick={addLairCombatant}>Añadir acciones de guarida (ini 20)</button>}
        {started && <button className="btn small ghost danger" onClick={() => confirm('end', endCombat)}>{confirmKey === 'end' ? '¿Seguro? Pulsa otra vez' : 'Terminar combate'}</button>}
        {combatants.length > 0 && <button className="btn small ghost danger" onClick={() => confirm('clear', clearAll)}>{confirmKey === 'clear' ? '¿Seguro? Pulsa otra vez' : 'Vaciar encuentro'}</button>}
      </div>
      </details>
    </div>
  );
}
