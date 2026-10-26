import { useEffect, useRef, useState } from 'react';
import { offListSpells, sheetToCharacter, unknownSpells, type SpellRef } from '../../engine/characterImport';
import { subclassSpells, subclassText } from '../../engine/subclassChoices';
import { sampleCharacter } from '../../engine/sample';
import { norm } from '../../engine/util';
import { InfoDialog } from '../../shared/Card';
import { useLibrary } from '../../store/library';
import { readSheet, type SheetField } from '../../engine/sheetImport';
import { readPdfFields } from '../../store/pdfFields';
import { useStore } from '../../store/useStore';
import { activeCharacter, usePlayer } from '../../store/player';
import CharacterEditor from './CharacterEditor';
import CharacterSheet from './CharacterSheet';
import { useMobileTabs } from './mobileTabs';
import PlayerBackup from './PlayerBackup';

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
  // quien llega nuevo: un personaje ya hecho para ver la hoja funcionando
  const tryExample = () => {
    if (!data) return;
    const c = create();
    replace({ ...sampleCharacter(data), id: c.id });
    setEditing(false);
  };
  const [msg, setMsg] = useState('');
  // conjuros de la hoja importada que no son de la lista de su clase: se pregunta antes de añadirlos
  const [askSpells, setAskSpells] = useState<{ charId: string; cls: string; list: SpellRef[]; missing: string[] } | null>(null);

  useEffect(() => { void init(); void loadData(); void useLibrary.getState().init(); }, [init, loadData]);
  // la pestaña del personaje activo, siempre a la vista (con muchos personajes la fila se desplaza)
  useEffect(() => { document.querySelector('.pc-tab.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [active?.id]);

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
    const made = sheetToCharacter(fields, sheet, d, spells, f.name);
    // los conjuros que no están en ningún sitio se anotan en la hoja para no perderlos
    const missing = unknownSpells(sheet, spells);
    const ch = { ...made, id: base.id, ...(missing.length ? { notes: made.notes + '\nConjuros de la hoja que no se encontraron: ' + missing.join(', ') + '.' } : {}) };
    replace(ch);
    setEditing(true);
    // los siempre preparados de la subclase (Conjuros dracónicos…) no son «de fuera de tu lista»
    const cls = d.classes.find((k) => k.id === ch.classId);
    const always = new Set(subclassSpells(ch, cls, subclassText(ch, cls, useLibrary.getState().subclasses), spells.map((s) => ({ id: s.id, n: s.n, l: 0 }))).map((x) => x.id));
    const off = offListSpells(fields, sheet, d, spells).filter((x) => !ch.spells.includes(x.id) && !always.has(x.id));
    if (off.length || missing.length) setAskSpells({ charId: ch.id, cls: cls?.n || 'tu clase', list: off, missing });
  };

  // pestañas del móvil: solo con una hoja a la vista (no en el editor ni sin personajes)
  const showsSheet = !!active && !editing;
  useEffect(() => { useMobileTabs.setState({ sheet: showsSheet }); return () => useMobileTabs.setState({ sheet: false }); }, [showsSheet]);

  if (!loaded) return <div className="panel"><p className="muted" style={{ margin: 0 }}>Cargando tus personajes…</p></div>;

  return (
    <>
      {/* pestañas de personajes sobre la hoja; a la derecha, crear o importar uno nuevo */}
      <div className="pc-book">
        <div className="pc-tabs-row" data-tour="pc-tabs" data-sec="combate">
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
            <div className="rollrow" style={{ marginTop: 10 }}>
              <button className="btn small" disabled={!data} onClick={tryExample}>Probar con un ejemplo</button>
              <span className="small muted">Crea una clériga de nivel 3 ya hecha para ver cómo funciona la hoja.</span>
            </div>
          </div>
        )}
        {/* la ficha y el editor, en papel claro como una hoja de verdad */}
        <div className="paper" style={{ display: 'contents' }}>
          {active && (editing ? <CharacterEditor c={active} /> : data || active.classId === '' ? <CharacterSheet c={active} /> : <div className="panel"><p className="muted" style={{ margin: 0 }}>Cargando…</p></div>)}
        </div>
      </div>
      {/* al final de la hoja: copia de seguridad */}
      <div className="panel pc-backup-bar" data-sec="rasgos">
        <span className="eyebrow">Copia de seguridad</span>
        <PlayerBackup />
      </div>
      {askSpells && (
        <InfoDialog title={askSpells.list.length ? 'Conjuros de fuera de tu lista' : 'Conjuros que no se encontraron'} onClose={() => setAskSpells(null)}>
          {askSpells.missing.length > 0 && <p style={{ marginTop: 0 }}>Estos conjuros de la hoja no están en el SRD ni en tu biblioteca: <b>{askSpells.missing.join(', ')}</b>. Importa tu Manual del Jugador en «Biblioteca» y vuelve a importar la hoja, o créalos en «Mis creaciones». Quedan anotados en las notas del personaje.</p>}
          {askSpells.list.length > 0 && <p style={{ marginTop: 0 }}>La hoja tiene conjuros que no son de la lista de {askSpells.cls}: <b>{askSpells.list.map((x) => x.n).join(', ')}</b>.</p>}
          {askSpells.list.length > 0 && <p className="muted small">Puede ser por una dote (Iniciado en la magia), un rasgo de tu especie o un objeto. ¿Los añado a la hoja?</p>}
          <div className="rollrow">
            {askSpells.list.length === 0 && <button className="btn small primary" onClick={() => setAskSpells(null)}>Entendido</button>}
            {askSpells.list.length > 0 && <button className="btn small primary" onClick={() => {
              const cur = usePlayer.getState().characters.find((x) => x.id === askSpells.charId);
              if (cur) usePlayer.getState().update(cur.id, { spells: [...cur.spells, ...askSpells.list.map((x) => x.id).filter((id) => !cur.spells.includes(id))] });
              setAskSpells(null);
            }}>Sí, añadirlos</button>}
          </div>
        </InfoDialog>
      )}
      <input ref={file} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="Hoja de personaje en PDF" onChange={(e) => void importPdf(e.target.files?.[0])} />
    </>
  );
}
