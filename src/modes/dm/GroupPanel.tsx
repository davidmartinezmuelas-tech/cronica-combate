import { useRef } from 'react';
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
  const ioMsg = useStore((s) => s.ioMsg);
  const confirmKey = useStore((s) => s.confirmKey);
  const storageOk = useStore((s) => s.storageOk);
  const persistent = useStore((s) => s.persistent);
  const { set, addPc, addAllPcs, savePc, deletePc, exportData, importText } = useStore.getState();
  const fileRef = useRef<HTMLInputElement>(null);
  const inC = new Set(combatants.map((c) => c.rosterId).filter(Boolean));
  // jugadores conectados ahora a la sala
  const online = new Set(useRoom((r) => r.members).map((m) => m.uid));
  const setF = (k: keyof RosterEntry, v: string | string[]) => set({ pcForm: { ...useStore.getState().pcForm, [k]: v }, pcMsg: '' });

  const doExport = async () => {
    set({ ioMsg: 'Preparando la copia…' });
    const blob = new Blob([await exportData()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cronica-combate-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    set({ ioMsg: 'Copia descargada. Guárdala donde quieras (Drive, USB…).' });
  };
  const doImport = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 300 * 1024 * 1024) { set({ ioMsg: 'El archivo es demasiado grande para ser una copia de la app.' }); return; }
    set({ ioMsg: 'Cargando la copia…' });
    await importText(await f.text());
    if (fileRef.current) fileRef.current.value = '';
  };

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
              {!inC.has(r.id) && <button className="btn small primary" onClick={() => addPc(r)}>Al combate</button>}
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

      <fieldset className="fs">
        <legend>Tus datos</legend>
        <p className="muted small" style={{ margin: 0 }}>
          {storageOk
            ? 'Tu grupo, tus criaturas y el combate en curso se guardan solos en este dispositivo' + (persistent ? ' (protegidos frente a limpiezas automáticas del navegador).' : '. El navegador podría borrarlos si se queda sin espacio: haz copias de vez en cuando.')
            : 'Este navegador no permite guardar datos (¿modo privado?). Descarga una copia antes de cerrar.'}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn small" onClick={() => void doExport()}>Descargar copia</button>
          <button className="btn small" onClick={() => fileRef.current?.click()}>Cargar copia…</button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Archivo de copia" onChange={(e) => void doImport(e.target.files?.[0])} />
        </div>
        <p className="muted small" style={{ margin: 0 }}>La copia incluye grupo (con sus hojas en PDF), criaturas propias, encuentros y el combate abierto. Al cargarla se fusiona con lo que ya tienes.</p>
        {ioMsg && <p className="small" role="status" style={{ margin: 0, color: '#e8c062' }}>{ioMsg}</p>}
      </fieldset>
    </div>
  );
}
