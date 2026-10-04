import { useMemo } from 'react';
import type { Combatant } from '../data/types';
import { sortCombatants } from '../engine/combat';
import { useStore } from '../store/useStore';

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
    <li style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
      <button className={cls} onClick={() => set({ selId: c.id, spellOpen: null })} aria-pressed={isSel}>
        <span className="init-badge" aria-label={'Iniciativa ' + (c.init ?? 'sin tirar')}>{c.init == null ? '—' : c.init}</span>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.2, overflowWrap: 'anywhere' }}>{c.name}</span>
            {c.kind === 'pc' && <span className="pc-flag">PJ</span>}
            {isActive && <span className="turn-flag">En turno</span>}
            {c.kind !== 'lair' && <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: '#cdbd9f', whiteSpace: 'nowrap' }}>CA {c.ac}</span>}
          </span>
          {c.kind !== 'lair' && <span className="hpbar"><span className={'hpfill ' + (pct <= 25 ? 'low' : pct <= 50 ? 'mid' : '')} style={{ width: pct + '%' }} /></span>}
          <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#cdbd9f' }}>
            <span style={{ minWidth: 0, lineHeight: 1.3 }}>{statusOf(c, started)}</span>
            {c.kind !== 'lair' && (
              <span style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{c.hp} / {c.maxHp} PG{c.temp > 0 && <span style={{ color: '#9cc4e4' }}> +{c.temp}</span>}</span>
            )}
          </span>
        </span>
      </button>
      {c.init == null && (
        <input className="input init-in" type="text" inputMode="numeric" aria-label={'Iniciativa de ' + c.name} placeholder="Ini"
          onBlur={(e) => commit(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      )}
    </li>
  );
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
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Iniciativa</h2>
        <button className="btn small gold" onClick={rollInit} title="Atajo: I">Tirar iniciativa de monstruos</button>
      </div>
      <label className="check"><input type="checkbox" checked={surprised} onChange={(e) => set({ surprised: e.target.checked })} />Los monstruos están sorprendidos (desventaja)</label>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {order.map((c) => <Row key={c.id} c={c} />)}
      </ol>
      {!combatants.length && <p className="muted" style={{ margin: 0 }}>El encuentro está vacío. Empieza añadiendo monstruos desde el Bestiario.</p>}
      {pendingPc && <p className="muted small" style={{ margin: 0 }}>Escribe en la casilla la iniciativa que saque cada jugador y pulsa Intro.</p>}
      {rosterOut.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid #33271c', paddingTop: 12 }}>
          <div className="panel-head"><span className="eyebrow">Tu grupo</span><button className="btn small" onClick={addAllPcs}>Añadir a todos</button></div>
          <div className="chips">{rosterOut.map((r) => <button key={r.id} className="chip" onClick={() => addPc(r)}>+ {r.name}</button>)}</div>
        </div>
      )}
      {!roster.length && <button className="btn small ghost" onClick={() => set({ tab: 'group' })} style={{ alignSelf: 'flex-start' }}>Guardar a tus jugadores en Grupo</button>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, borderTop: '1px solid #33271c', paddingTop: 12 }}>
        {!combatants.some((c) => c.kind === 'lair') && <button className="btn small ghost" onClick={addLairCombatant}>Añadir acciones de guarida (ini 20)</button>}
        {started && <button className="btn small ghost" onClick={() => confirm('end', endCombat)}>{confirmKey === 'end' ? '¿Seguro? Pulsa otra vez' : 'Terminar combate'}</button>}
        {combatants.length > 0 && <button className="btn small ghost" onClick={() => confirm('clear', clearAll)}>{confirmKey === 'clear' ? '¿Seguro? Pulsa otra vez' : 'Vaciar encuentro'}</button>}
      </div>
    </div>
  );
}
