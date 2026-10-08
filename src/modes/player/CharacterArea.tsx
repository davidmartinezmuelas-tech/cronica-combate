import { useEffect, useRef, useState } from 'react';
import { offListSpells, sheetToCharacter, type SpellRef } from '../../engine/characterImport';
import { norm } from '../../engine/util';
import { InfoDialog } from '../../shared/Card';
import { useLibrary } from '../../store/library';
import { readSheet, type SheetField } from '../../engine/sheetImport';
import { readPdfFields } from '../../store/pdfFields';
import { useStore } from '../../store/useStore';
import { activeCharacter, lastBackup, usePlayer } from '../../store/player';
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
  // conjuros de la hoja importada que no son de la lista de su clase: se pregunta antes de añadirlos
  const [askSpells, setAskSpells] = useState<{ charId: string; cls: string; list: SpellRef[] } | null>(null);

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
    // los del SRD y los de tu biblioteca (los que no repiten un conjuro del SRD)
    await useLibrary.getState().init();
    const srd: SpellRef[] = (useStore.getState().rules || []).filter((e) => e.cat === 'Conjuros').map((e) => ({ id: e.id, n: e.n, en: e.en }));
    const srdNames = new Set(srd.map((x) => norm(x.n)));
    const spells: SpellRef[] = [...srd, ...useLibrary.getState().spells.filter((x) => !srdNames.has(norm(x.n))).map((x) => ({ id: x.id, n: x.n, en: '', classes: x.classes }))];
    const base = create();
    const ch = { ...sheetToCharacter(fields, sheet, d, spells, f.name), id: base.id };
    replace(ch);
    setEditing(true);
    const off = offListSpells(fields, sheet, d, spells).filter((x) => !ch.spells.includes(x.id));
    if (off.length) setAskSpells({ charId: ch.id, cls: d.classes.find((k) => k.id === ch.classId)?.n || 'tu clase', list: off });
  };

  if (!loaded) return <div className="panel"><p className="muted" style={{ margin: 0 }}>Cargando tus personajes…</p></div>;

  return (
    <>
      {/* pestañas de personajes sobre la hoja; a la derecha, crear o importar uno nuevo */}
      <div className="pc-book">
        <div className="pc-tabs-row">
          <div className="pc-tabs" role="tablist" aria-label="Elegir personaje">
            {characters.map((c) => <button key={c.id} role="tab" aria-selected={c.id === active?.id} className={c.id === active?.id ? 'pc-tab on' : 'pc-tab'} onClick={() => select(c.id)}>{c.name || 'Sin nombre'}</button>)}
          </div>
          <div className="pc-tabs-actions">
            <button className="btn small primary" onClick={() => create()}>Nuevo personaje</button>
            <button className="btn small" onClick={() => file.current?.click()}>Importar desde PDF</button>
          </div>
        </div>
        {(msg || dataError) && <p className="warn" role="alert" style={{ margin: '0 0 8px' }}>{msg || dataError}</p>}
        {!characters.length && (
          <div className="panel">
            <h2>Mis personajes</h2>
            <p className="muted" style={{ margin: 0 }}>Aún no tienes personajes. Créalo paso a paso con las clases, especies y trasfondos del SRD 2024, o importa tu hoja en PDF rellenable (la oficial de 2024 y otras con campos como Name, Class, AC o Max HP).</p>
          </div>
        )}
        {/* la ficha y el editor, en papel claro como una hoja de verdad */}
        <div className="paper" style={{ display: 'contents' }}>
          {active && (editing ? <CharacterEditor c={active} /> : data || active.classId === '' ? <CharacterSheet c={active} /> : <div className="panel"><p className="muted" style={{ margin: 0 }}>Cargando…</p></div>)}
        </div>
      </div>
      {/* al final de la hoja: copia de seguridad */}
      <div className="panel pc-backup-bar">
        <span className="eyebrow">Copia de seguridad</span>
        <div className="rollrow">
          <button className="btn small" disabled={!characters.length} onClick={backupAll} title="Descarga todos tus personajes en un archivo (sin tu biblioteca)">Guardar copia</button>
          {active && <button className="btn small" onClick={exportOne} aria-label={'Exportar ' + (active.name || 'personaje')} title={'Descarga solo a ' + (active.name || 'este personaje')}>Exportar personaje</button>}
          <button className="btn small" onClick={() => backupRef.current?.click()}>Cargar copia</button>
          {characters.length > 0 && <span className="muted small">{last ? 'Última copia: ' + new Date(last).toLocaleDateString('es-ES') + '.' : 'Aún no tienes copia: guarda una copia de vez en cuando.'}</span>}
        </div>
        {note && <p className="muted small" role="status" style={{ margin: 0 }}>{note}</p>}
      </div>
      {askSpells && (
        <InfoDialog title="Conjuros de fuera de tu lista" onClose={() => setAskSpells(null)}>
          <p style={{ marginTop: 0 }}>La hoja tiene conjuros que no son de la lista de {askSpells.cls}: <b>{askSpells.list.map((x) => x.n).join(', ')}</b>.</p>
          <p className="muted small">Puede ser por una dote (Iniciado en la magia), un rasgo de tu especie o un objeto. ¿Los añado a la hoja?</p>
          <div className="rollrow">
            <button className="btn small primary" onClick={() => {
              const cur = usePlayer.getState().characters.find((x) => x.id === askSpells.charId);
              if (cur) usePlayer.getState().update(cur.id, { spells: [...cur.spells, ...askSpells.list.map((x) => x.id).filter((id) => !cur.spells.includes(id))] });
              setAskSpells(null);
            }}>Sí, añadirlos</button>
          </div>
        </InfoDialog>
      )}
      <input ref={backupRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Copia de personajes" onChange={(e) => void loadBackup(e.target.files?.[0])} />
      <input ref={file} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="Hoja de personaje en PDF" onChange={(e) => void importPdf(e.target.files?.[0])} />
    </>
  );
}
