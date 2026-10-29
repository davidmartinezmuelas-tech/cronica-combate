import { useRef, useState } from 'react';
import { DMG_TYPES } from '../../data/constants';
import type { RosterEntry } from '../../data/types';
import { fmt } from '../../engine/dice';
import { extrasLine, readSheet } from '../../engine/sheetImport';
import { blankRoster } from '../../store/persist';
import { readPdfFields } from '../../store/pdfFields';
import { useRoom } from '../../store/room';
import { useStore } from '../../store/useStore';
import Picker from '../../shared/Picker';

/** Nivel total a partir de la clase («Paladín 3 / Brujo 5» → 8). */
const totalLevel = (cls: string, fallback: string) => {
  const lvs = (cls.match(/\d+/g) || []).map(Number);
  return lvs.length > 1 ? String(Math.min(20, lvs.reduce((t, n) => t + n, 0))) : String(lvs[0] ?? (fallback || 1));
};

const initial = (name: string) => (name.trim()[0] || '?').toUpperCase();

export default function GroupPanel() {
  const roster = useStore((s) => s.roster);
  const combatants = useStore((s) => s.combatants);
  const pf = useStore((s) => s.pcForm);
  const editingPcId = useStore((s) => s.editingPcId);
  const pcMsg = useStore((s) => s.pcMsg);
  const confirmKey = useStore((s) => s.confirmKey);
  const { set, addPc, addAllPcs, savePc, deletePc, attachPdf } = useStore.getState();
  const inC = new Set(combatants.map((c) => c.rosterId).filter(Boolean));
  // jugadores conectados ahora a la sala
  const online = new Set(useRoom((r) => r.members).map((m) => m.uid));
  const setF = (k: keyof RosterEntry, v: string | string[]) => set({ pcForm: { ...useStore.getState().pcForm, [k]: v }, pcMsg: '' });
  // el formulario va plegado: solo se abre al pulsar «Nuevo jugador» o al editar a alguien
  const [creating, setCreating] = useState(false);
  const formOpen = creating || !!editingPcId;
  const [pdf, setPdf] = useState<File | null>(null); // hoja elegida para el jugador nuevo: se adjunta al guardarlo
  const [readMsg, setReadMsg] = useState('');
  const file = useRef<HTMLInputElement>(null);

  const reset = () => { setPdf(null); setReadMsg(''); };
  const close = () => { setCreating(false); reset(); set({ pcForm: blankRoster(), editingPcId: null, pcMsg: '' }); };
  const pickPdf = async (f: File | undefined) => {
    if (file.current) file.current.value = '';
    if (!f) return;
    setPdf(f);
    setReadMsg('');
    let data = null;
    try { data = readSheet(await readPdfFields(f)); } catch { /* sin formulario o dañado */ }
    if (!data) { setReadMsg('La hoja se adjuntará, pero no tiene campos rellenables que la app sepa leer: escribe los datos a mano.'); return; }
    const cur = useStore.getState().pcForm;
    const line = extrasLine(data);
    set({
      pcMsg: '',
      pcForm: {
        ...cur, name: data.name || cur.name, cls: data.cls || cur.cls, level: data.cls ? totalLevel(data.cls, data.level) : data.level || cur.level,
        ac: data.ac || cur.ac, hp: data.hp || cur.hp, initb: data.initb || cur.initb, pp: data.pp || cur.pp,
        res: [...new Set([...cur.res, ...data.res])], notes: line || cur.notes,
      },
    });
    setReadMsg('Datos leídos de la hoja. Revísalos y guarda.');
  };
  const save = async () => {
    const before = useStore.getState().roster.length;
    const editing = !!useStore.getState().editingPcId;
    savePc();
    const after = useStore.getState().roster;
    if (!editing && after.length === before) return; // faltaba el nombre: el formulario sigue abierto con el aviso
    const added = editing ? undefined : after[after.length - 1];
    if (added && pdf) { const err = await attachPdf(added.id, pdf); if (err) set({ pcMsg: added.name + ' guardado, pero la hoja no se adjuntó: ' + err }); }
    setCreating(false);
    reset();
  };

  return (
    <div className="panel group-panel">
      <div className="panel-head">
        <h2>Tu grupo</h2>
        {roster.length > 0 && <button className="btn small" onClick={addAllPcs}>Todos al combate</button>}
      </div>
      {!roster.length && <p className="muted" style={{ margin: 0 }}>Guarda aquí a tus jugadores una vez y añádelos a cada combate con un clic.</p>}
      <ul className="roster-cards">
        {roster.map((r) => (
          <li key={r.id} className={'roster-card' + (editingPcId === r.id ? ' editing' : '')}>
            <span className="roster-medal" aria-hidden="true">{initial(r.name)}</span>
            <span className="roster-main">
              <span className="roster-name">{r.name}{inC.has(r.id) && <span className="tag">En combate</span>}{r.roomUid && online.has(r.roomUid) && <span className="tag pdf">En la sala</span>}</span>
              <span className="roster-sub">{[r.cls, 'Nivel ' + (r.level || 1), r.player ? 'Jugador: ' + r.player : ''].filter(Boolean).join(' · ')}</span>
            </span>
            <span className="roster-stats">
              <span><b>CA</b>{r.ac || '—'}</span><span><b>PG</b>{r.hp || '—'}</span><span><b>Ini</b>{fmt(parseInt(r.initb, 10) || 0)}</span>
            </span>
            <span className="roster-extra">Perc. pasiva {r.pp || 10}{r.res.length > 0 && ' · resiste ' + r.res.join(', ')}</span>
            <div className="roster-actions">
              {!inC.has(r.id) && <button className="btn small" onClick={() => addPc(r)}>Al combate</button>}
              <button className="btn small ghost" onClick={() => { setCreating(false); reset(); set({ pcForm: { ...blankRoster(), ...r }, editingPcId: r.id, pcMsg: '' }); }}>Editar</button>
              <button className="btn small ghost danger" onClick={() => deletePc(r.id)}>{confirmKey === 'pc-' + r.id ? '¿Seguro? Quitar' : 'Quitar'}</button>
            </div>
          </li>
        ))}
      </ul>

      {!formOpen && <button className="new-pc-btn" onClick={() => { set({ pcForm: blankRoster(), editingPcId: null, pcMsg: '' }); setCreating(true); }}><span aria-hidden="true">+</span> Nuevo jugador</button>}
      {formOpen && (
        <fieldset className="fs new-pc">
          <legend>{editingPcId ? 'Editar jugador' : 'Nuevo jugador'}</legend>
          {!editingPcId && (
            <div className="new-pc-pdf">
              <button className="btn small" onClick={() => file.current?.click()}>{pdf ? 'Cambiar hoja PDF' : 'Subir hoja PDF'}</button>
              <span className="muted small">{pdf ? pdf.name : 'Rellena los datos solos desde la hoja, o escríbelos a mano.'}</span>
              <input ref={file} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="Hoja PDF del jugador nuevo" onChange={(e) => void pickPdf(e.target.files?.[0])} />
            </div>
          )}
          {readMsg && <p className="muted small" role="status" style={{ margin: 0 }}>{readMsg}</p>}
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
            <button className="btn primary" onClick={() => void save()}>Guardar jugador</button>
            <button className="btn ghost" onClick={close}>Cancelar</button>
          </div>
        </fieldset>
      )}

      <p className="muted small" style={{ margin: 0 }}>La copia de seguridad (grupo, criaturas, encuentros y combate) está en «Ajustes», arriba a la derecha.</p>
    </div>
  );
}
