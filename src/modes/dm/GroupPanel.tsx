import { DMG_TYPES } from '../../data/constants';
import type { RosterEntry } from '../../data/types';
import { fmt } from '../../engine/dice';
import { blankRoster } from '../../store/persist';
import { useRoom } from '../../store/room';
import { useStore } from '../../store/useStore';
import Picker from '../../shared/Picker';

export default function GroupPanel() {
  const roster = useStore((s) => s.roster);
  const combatants = useStore((s) => s.combatants);
  const pf = useStore((s) => s.pcForm);
  const editingPcId = useStore((s) => s.editingPcId);
  const pcMsg = useStore((s) => s.pcMsg);
  const confirmKey = useStore((s) => s.confirmKey);
  const { set, addPc, addAllPcs, savePc, deletePc } = useStore.getState();
  const inC = new Set(combatants.map((c) => c.rosterId).filter(Boolean));
  // jugadores conectados ahora a la sala
  const online = new Set(useRoom((r) => r.members).map((m) => m.uid));
  const setF = (k: keyof RosterEntry, v: string | string[]) => set({ pcForm: { ...useStore.getState().pcForm, [k]: v }, pcMsg: '' });

  return (
    <div className="panel group-panel">
      <div className="panel-head">
        <h2>Tu grupo</h2>
        {roster.length > 0 && <button className="btn small" onClick={addAllPcs}>Todos al combate</button>}
      </div>
      {!roster.length && <p className="muted" style={{ margin: 0 }}>Guarda aquí a tus jugadores una vez y añádelos a cada combate con un clic.</p>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {roster.map((r) => (
          <li key={r.id} className="beast roster-item">
            <span className="roster-info">
            <span className="beast-name">{r.name}{inC.has(r.id) && <span className="tag">En combate</span>}{r.roomUid && online.has(r.roomUid) && <span className="tag pdf">En la sala</span>}</span>
            <span style={{ fontSize: 13, color: '#b2a691' }}>
              {[r.player ? 'Jugador: ' + r.player : '', r.cls, 'Nivel ' + (r.level || 1), 'CA ' + (r.ac || '—'), 'PG ' + (r.hp || '—'), 'Ini ' + fmt(parseInt(r.initb, 10) || 0), 'Perc. pasiva ' + (r.pp || 10)].filter(Boolean).join(' · ')}
              {r.res.length > 0 && ' · resiste ' + r.res.join(', ')}
            </span>
            </span>
            <div className="roster-actions">
              {!inC.has(r.id) && <button className="btn small" onClick={() => addPc(r)}>Al combate</button>}
              <button className="btn small ghost" onClick={() => set({ pcForm: { ...blankRoster(), ...r }, editingPcId: r.id, pcMsg: '' })}>Editar</button>
              <button className="btn small ghost" onClick={() => deletePc(r.id)}>{confirmKey === 'pc-' + r.id ? '¿Seguro? Quitar' : 'Quitar'}</button>
            </div>
          </li>
        ))}
      </ul>

      <fieldset className="fs">
        <legend>{editingPcId ? 'Editar jugador' : 'Nuevo jugador'}</legend>
        <div className="row2">
          <div className="field"><label htmlFor="pf-name">Personaje</label><input id="pf-name" className="input" value={pf.name} onChange={(e) => setF('name', e.target.value)} /></div>
          <div className="field"><label htmlFor="pf-player">Jugador</label><input id="pf-player" className="input" value={pf.player} onChange={(e) => setF('player', e.target.value)} /></div>
        </div>
        <div className="row2">
          <div className="field"><label htmlFor="pf-cls">Clase</label><input id="pf-cls" className="input" value={pf.cls} onChange={(e) => setF('cls', e.target.value)} placeholder="Paladín 3 / Brujo 5" /></div>
          <div className="field"><label htmlFor="pf-lvl">Nivel total</label><input id="pf-lvl" type="number" min={1} max={20} className="input" value={pf.level} onChange={(e) => setF('level', e.target.value)} /></div>
        </div>
        <div className="row4">
          <div className="field"><label htmlFor="pf-ac">CA</label><input id="pf-ac" type="number" className="input" value={pf.ac} onChange={(e) => setF('ac', e.target.value)} /></div>
          <div className="field"><label htmlFor="pf-hp">PG máx.</label><input id="pf-hp" type="number" className="input" value={pf.hp} onChange={(e) => setF('hp', e.target.value)} /></div>
          <div className="field"><label htmlFor="pf-ini">Ini</label><input id="pf-ini" type="number" className="input" value={pf.initb} onChange={(e) => setF('initb', e.target.value)} /></div>
          <div className="field"><label htmlFor="pf-pp">Perc. pas.</label><input id="pf-pp" type="number" className="input" value={pf.pp} onChange={(e) => setF('pp', e.target.value)} /></div>
        </div>
        <Picker title="Resistencias al daño" summary={pf.res.join(', ')}>
          <div className="chips">
            {DMG_TYPES.map((t) => {
              const on = pf.res.includes(t);
              return <button key={t} className={on ? 'chip resist' : 'chip'} aria-pressed={on} onClick={() => setF('res', on ? pf.res.filter((x) => x !== t) : pf.res.concat([t]))}>{t}</button>;
            })}
          </div>
        </Picker>
        {pcMsg && <p className="warn">{pcMsg}</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={savePc}>Guardar jugador</button>
          {editingPcId && <button className="btn ghost" onClick={() => set({ pcForm: blankRoster(), editingPcId: null, pcMsg: '' })}>Cancelar</button>}
        </div>
      </fieldset>

      <p className="muted small" style={{ margin: 0 }}>La copia de seguridad (grupo, criaturas, encuentros y combate) está en el botón «Copia» de arriba.</p>
    </div>
  );
}
