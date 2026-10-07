import { useEffect, useRef, useState } from 'react';
import { sheetToCharacter } from '../../engine/characterImport';
import { readSheet, type SheetField } from '../../engine/sheetImport';
import { readPdfFields } from '../../store/pdfFields';
import { useStore } from '../../store/useStore';
import { activeCharacter, lastBackup, usePlayer } from '../../store/player';
import AccountBox from '../../shared/AccountBox';
import CharacterEditor from './CharacterEditor';
import CharacterSheet from './CharacterSheet';

/** Mis personajes: elegir, crear (o importar del PDF rellenable) y la hoja del activo. */
export default function CharacterArea() {
  const loaded = usePlayer((s) => s.loaded);
  const data = usePlayer((s) => s.data);
  const dataError = usePlayer((s) => s.dataError);
  const characters = usePlayer((s) => s.characters);
  const active = usePlayer(activeCharacter);
  const editing = usePlayer((s) => s.editing);
  const { init, loadData, select, create, replace, setEditing } = usePlayer.getState();
  const file = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const [note, setNote] = useState('');
  const [last, setLast] = useState(lastBackup());

  // copia de seguridad: un archivo .json que se descarga (todos los personajes o solo uno)
  const download = (text: string, name: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const slug = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'personaje';
  const backupAll = () => {
    download(usePlayer.getState().exportText(), 'personajes-cronica-' + new Date().toISOString().slice(0, 10) + '.json');
    setLast(lastBackup());
    setNote('Copia guardada con ' + characters.length + (characters.length === 1 ? ' personaje.' : ' personajes.'));
  };
  const exportOne = () => {
    if (!active) return;
    download(usePlayer.getState().exportText([active.id]), slug(active.name) + '-cronica.json');
    setNote((active.name || 'El personaje') + ' exportado: se carga con «Cargar copia» en otro dispositivo.');
  };
  const loadBackup = async (f: File | undefined) => {
    if (!f) return;
    setNote(await usePlayer.getState().importText(await f.text()));
    if (backupRef.current) backupRef.current.value = '';
  };

  useEffect(() => { void init(); void loadData(); }, [init, loadData]);

  const importPdf = async (f: File | undefined) => {
    if (!f) return;
    setMsg('');
    let fields: SheetField[] = [];
    try { fields = await readPdfFields(f); } catch { /* sin formulario */ }
    const sheet = readSheet(fields);
    if (file.current) file.current.value = '';
    if (!sheet) { setMsg('Ese PDF no tiene campos rellenables que la app sepa leer. Crea el personaje a mano.'); return; }
    await Promise.all([loadData(), useStore.getState().loadRules()]);
    const d = usePlayer.getState().data;
    if (!d) { setMsg('No se pudieron cargar las clases y especies.'); return; }
    const spells = (useStore.getState().rules || []).filter((e) => e.cat === 'Conjuros').map((e) => ({ id: e.id, n: e.n, en: e.en }));
    const base = create();
    replace({ ...sheetToCharacter(fields, sheet, d, spells, f.name), id: base.id });
    setEditing(true);
  };

  if (!loaded) return <div className="panel"><p className="muted" style={{ margin: 0 }}>Cargando tus personajes…</p></div>;

  return (
    <>
      <div className="panel pc-bar">
        <div className="panel-head">
          <h2>Mis personajes</h2>
          <div className="rollrow">
            <button className="btn small primary" onClick={() => create()}>Nuevo personaje</button>
            <button className="btn small" onClick={() => file.current?.click()}>Importar desde PDF</button>
          </div>
        </div>
        <div className="rollrow pc-backup">
          <button className="btn small ghost" disabled={!characters.length} onClick={backupAll}>Guardar copia</button>
          {active && <button className="btn small ghost" onClick={exportOne}>Exportar {active.name || 'personaje'}</button>}
          <button className="btn small ghost" onClick={() => backupRef.current?.click()}>Cargar copia</button>
          <span className="muted small">{characters.length ? (last ? 'Última copia: ' + new Date(last).toLocaleDateString('es-ES') + '.' : 'Tus personajes solo están en este dispositivo: guarda una copia de vez en cuando.') : ''} La copia no incluye tu biblioteca.</span>
        </div>
        <AccountBox />
        <input ref={backupRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Copia de personajes" onChange={(e) => void loadBackup(e.target.files?.[0])} />
        {note && <p className="muted small" role="status" style={{ margin: 0 }}>{note}</p>}
        {characters.length > 1 && (
          <div className="chips" role="group" aria-label="Elegir personaje">
            {characters.map((c) => <button key={c.id} className={c.id === active?.id ? 'chip on' : 'chip'} aria-pressed={c.id === active?.id} onClick={() => select(c.id)}>{c.name || 'Sin nombre'}</button>)}
          </div>
        )}
        {!characters.length && <p className="muted" style={{ margin: 0 }}>Aún no tienes personajes. Créalo paso a paso con las clases, especies y trasfondos del SRD 2024, o importa tu hoja en PDF rellenable (la oficial de 2024 y otras con campos como Name, Class, AC o Max HP).</p>}
        <input ref={file} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="Hoja de personaje en PDF" onChange={(e) => void importPdf(e.target.files?.[0])} />
        {(msg || dataError) && <p className="warn" role="alert" style={{ margin: 0 }}>{msg || dataError}</p>}
      </div>
      {active && (editing ? <CharacterEditor c={active} /> : data || active.classId === '' ? <CharacterSheet c={active} /> : <div className="panel"><p className="muted" style={{ margin: 0 }}>Cargando…</p></div>)}
    </>
  );
}
