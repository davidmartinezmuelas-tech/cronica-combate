import { useEffect, useMemo, useState } from 'react';
import type { Combatant } from '../../data/types';
import { encounterDifficulty, sortCombatants } from '../../engine/combat';
import { nfmt } from '../../engine/util';
import { useStore } from '../../store/useStore';

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

function Row({ c }: { c: Combatant }) {
  const started = useStore((s) => s.started);
  const isActive = useStore((s) => s.started && s.activeId === c.id);
  const isSel = useStore((s) => s.selId === c.id);
  const { set, patchC } = useStore.getState();
  const pct = c.maxHp ? Math.max(0, Math.round((c.hp / c.maxHp) * 100)) : 0;
  const down = c.kind === 'monster' ? c.hp <= 0 : c.kind === 'pc' ? !!c.dead || c.hp <= 0 : false;
  const cls = ['init-row', c.kind, isActive ? 'active' : '', isSel ? 'sel' : '', down ? 'down' : ''].join(' ');
  const commit = (v: string) => { const n = parseInt(v.replace('−', '-'), 10); if (!isNaN(n)) patchC(c.id, { init: n }, 'iniciativa'); };
  return (
    <li style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <button className={cls} title={c.name} onClick={() => { set({ selId: c.id, spellOpen: null }); showCard(); }} aria-pressed={isSel}>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* una línea: iniciativa, nombre y marcas a la izquierda; CA y PG a la derecha (la fila ocupa la mitad que antes) */}
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="init-badge" aria-label={'Iniciativa ' + (c.init ?? 'sin tirar')}>{c.init == null ? '—' : c.init}</span>
            <span style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.2, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
            {c.kind === 'pc' && <span className="pc-flag">PJ</span>}
            {isActive && <span className="turn-flag">Turno</span>}
            {c.kind !== 'lair' && (
              <span style={{ whiteSpace: 'nowrap', fontWeight: 700, marginLeft: 'auto', fontSize: 12, color: '#c6bba6' }}>CA {c.ac} · {c.hp}/{c.maxHp}{c.temp > 0 && <span style={{ color: '#9cc4e4' }}> +{c.temp}</span>}</span>
            )}
          </span>
          {c.kind !== 'lair' && <span className="hpbar"><span className={'hpfill ' + (pct <= 25 ? 'low' : pct <= 50 ? 'mid' : '')} style={{ width: pct + '%' }} /></span>}
          {(() => { const st = statusOf(c, started); return st ? <span style={{ fontSize: 12, color: '#c6bba6', lineHeight: 1.3, overflowWrap: 'anywhere' }}>{st}</span> : null; })()}
        </span>
      </button>
      {c.init == null && (
        <input className="input init-in" type="text" inputMode="numeric" aria-label={'Iniciativa de ' + c.name} placeholder="Ini"
          onBlur={(e) => commit(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      )}
    </li>
  );
}

function Encounters() {
  const encounters = useStore((s) => s.encounters);
  const hasMonsters = useStore((s) => s.combatants.some((c) => c.kind === 'monster'));
  const confirmKey = useStore((s) => s.confirmKey);
  const { saveEncounter, loadEncounter, deleteEncounter, monById } = useStore.getState();
  const [name, setName] = useState('');
  const save = () => { if (saveEncounter(name)) setName(''); };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid #524031', paddingTop: 12 }}>
      <span className="eyebrow">Encuentros preparados</span>
      {encounters.length > 0 && (
        <ul className="rem">
          {encounters.map((e) => (
            <li key={e.id}>
              <span style={{ flex: 1, minWidth: 160 }}>
                <strong>{e.name}</strong>
                <span className="muted small" style={{ display: 'block' }}>
                  {e.items.map((it) => it.qty + ' × ' + (monById(it.monsterId)?.n || it.monsterId)).join(', ')}{e.lair ? ' · guarida' : ''}
                </span>
              </span>
              <span style={{ display: 'flex', gap: 6 }}>
                <button className="btn small" onClick={() => loadEncounter(e.id)}>Cargar</button>
                <button className="btn small ghost" onClick={() => deleteEncounter(e.id)}>{confirmKey === 'enc-' + e.id ? '¿Seguro? Borrar' : 'Borrar'}</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {hasMonsters ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: 1, minWidth: 160 }}><label htmlFor="enc-name">Guardar los monstruos actuales como</label>
            <input id="enc-name" className="input" value={name} placeholder="Emboscada en el puente" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} /></div>
          <button className="btn small" onClick={save}>Guardar encuentro</button>
        </div>
      ) : !encounters.length && <p className="muted small" style={{ margin: 0 }}>Añade monstruos y guárdalos aquí para cargarlos de un clic el día de la sesión.</p>}
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
  const { set, rollInit, addPc, addAllPcs, addLairCombatant, endCombat, clearAll, confirm } = useStore.getState();
  const order = useMemo(() => sortCombatants(combatants), [combatants]);
  const inC = new Set(combatants.map((c) => c.rosterId).filter(Boolean));
  const rosterOut = roster.filter((r) => !inC.has(r.id));
  const pendingPc = combatants.some((c) => c.init == null && c.kind === 'pc');
  const pendingMon = combatants.filter((c) => c.init == null && c.kind === 'monster').length;
  // ya en combate, el botón solo sirve para los refuerzos: volver a tirar a todos desordenaría la ronda
  const showRoll = !started || pendingMon > 0;
  // móvil: al empezar el combate se pliegan las opciones de preparación (se pueden abrir)
  const narrow = () => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 560px)').matches;
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
        {order.map((c) => <Row key={c.id} c={c} />)}
      </ol>
      <Difficulty />
      {!combatants.length && <p className="muted" style={{ margin: 0 }}>El encuentro está vacío. Empieza añadiendo monstruos desde el Bestiario.</p>}
      {pendingPc && <p className="muted small" style={{ margin: 0 }}>Escribe en la casilla la iniciativa que saque cada jugador y pulsa Intro.</p>}
      {/* en móvil, durante el combate, lo que se usa poco va plegado para llegar antes al turno */}
      <details className="init-extras" open={extrasOpen} onToggle={(e) => setExtrasOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="init-extras-sum">Más opciones (grupo, encuentros, guarida)</summary>
      {rosterOut.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid #524031', paddingTop: 12 }}>
          <div className="panel-head"><span className="eyebrow">Tu grupo</span><button className="btn small" onClick={addAllPcs}>Añadir a todos</button></div>
          <div className="chips">{rosterOut.map((r) => <button key={r.id} className="chip" onClick={() => addPc(r)}>+ {r.name}</button>)}</div>
        </div>
      )}
      {!roster.length && <button className="btn small ghost" onClick={() => set({ tab: 'group' })} style={{ alignSelf: 'flex-start' }}>Guardar a tus jugadores en Grupo</button>}
      <Encounters />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, borderTop: '1px solid #524031', paddingTop: 12 }}>
        {!combatants.some((c) => c.kind === 'lair') && <button className="btn small ghost" onClick={addLairCombatant}>Añadir acciones de guarida (ini 20)</button>}
        {started && <button className="btn small ghost" onClick={() => confirm('end', endCombat)}>{confirmKey === 'end' ? '¿Seguro? Pulsa otra vez' : 'Terminar combate'}</button>}
        {combatants.length > 0 && <button className="btn small ghost" onClick={() => confirm('clear', clearAll)}>{confirmKey === 'clear' ? '¿Seguro? Pulsa otra vez' : 'Vaciar encuentro'}</button>}
      </div>
      </details>
    </div>
  );
}
