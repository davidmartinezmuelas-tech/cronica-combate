import { useEffect, useRef, useState } from 'react';
import { blankCharacter, type Character } from '../../engine/character';
import { readSheet } from '../../engine/sheetImport';
import { norm } from '../../engine/util';
import { readPdfFields } from '../../store/pdfFields';
import { activeCharacter, usePlayer } from '../../store/player';
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
  const [msg, setMsg] = useState('');

  useEffect(() => { void init(); void loadData(); }, [init, loadData]);

  const importPdf = async (f: File | undefined) => {
    if (!f) return;
    setMsg('');
    let sheet = null;
    try { sheet = readSheet(await readPdfFields(f)); } catch { /* sin formulario */ }
    if (file.current) file.current.value = '';
    if (!sheet) { setMsg('Ese PDF no tiene campos rellenables que la app sepa leer. Crea el personaje a mano.'); return; }
    await loadData();
    const d = usePlayer.getState().data;
    const clsName = sheet.cls.replace(/\s*\d+\s*$/, '');
    const cls = d?.classes.find((k) => norm(k.n) === norm(clsName) || norm(k.en) === norm(clsName));
    const extra = (label: string) => sheet!.extras.find((e) => e.label === label)?.value || '';
    const sp = d?.species.find((s) => norm(s.n) === norm(extra('Especie')) || norm(s.en) === norm(extra('Especie')));
    const base = create();
    const c: Character = {
      ...blankCharacter(), id: base.id, name: sheet.name, classId: cls?.id || '', className: cls ? '' : clsName,
      level: parseInt(sheet.level, 10) || 1, subclass: extra('Subclase'), speciesId: sp?.id || '', speciesName: sp ? '' : extra('Especie'),
      backgroundName: extra('Trasfondo'), langs: extra('Idiomas'),
      ov: { ...(sheet.ac ? { ac: parseInt(sheet.ac, 10) } : {}), ...(sheet.hp ? { hpMax: parseInt(sheet.hp, 10) } : {}) },
      hp: parseInt(sheet.hp, 10) || 0,
      notes: 'Importado de ' + f.name + '. Revisa las características, las habilidades y el equipo: el PDF no siempre los trae.',
    };
    replace(c);
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
