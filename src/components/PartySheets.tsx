import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { RosterEntry } from '../data/types';
import { fmt } from '../engine/dice';
import { extrasLine, readSheet, type SheetData } from '../engine/sheetImport';
import { blankRoster } from '../store/persist';
import { readPdfFields } from '../store/pdfFields';
import { getPdf } from '../store/pdfs';
import { useStore } from '../store/useStore';

// PDF.js solo se descarga al abrir una hoja
const PdfViewer = lazy(() => import('./PdfViewer'));

/** Hojas en blanco cuyos campos sabe leer la app (se enlazan, no se alojan: su licencia no permite redistribuirlas). */
const SHEETS = [
  { name: 'Hoja oficial de 2024 (rellenable)', by: 'D&D Beyond', url: 'https://media.dndbeyond.com/compendium-images/free-rules/downloads/2024-character-sheet.pdf' },
];

type Field = 'name' | 'cls' | 'ac' | 'hp' | 'initb' | 'pp';
const FIELDS: [Field, string][] = [['name', 'Nombre'], ['cls', 'Clase'], ['ac', 'CA'], ['hp', 'PG máx.'], ['initb', 'Iniciativa'], ['pp', 'Percepción pasiva']];

/** Confirma qué datos de la hoja se copian a la ficha: nada se sobrescribe sin marcarlo. */
function ImportDialog({ r, data, onClose }: { r: RosterEntry; data: SheetData; onClose: () => void }) {
  const line = extrasLine(data);
  const newRes = data.res.filter((t) => !r.res.includes(t));
  const [vals, setVals] = useState<Record<Field, string>>(() => Object.fromEntries(FIELDS.map(([k]) => [k, data[k]])) as Record<Field, string>);
  const [on, setOn] = useState<Record<string, boolean>>(() => ({
    ...Object.fromEntries(FIELDS.map(([k]) => [k, !!data[k] && data[k] !== r[k]])),
    res: newRes.length > 0,
    notes: !!line && !(r.notes || '').includes(line),
  }));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const show = (k: Field, v: string) => (k === 'initb' && v ? fmt(parseInt(v, 10) || 0) : v || '—');
  const apply = () => {
    const patch: Partial<RosterEntry> = {};
    for (const [k] of FIELDS) if (on[k] && vals[k].trim()) patch[k] = vals[k].trim();
    if (patch.cls) patch.level = (/\d+/.exec(patch.cls) || [data.level || r.level])[0];
    if (on.res) patch.res = [...r.res, ...newRes];
    if (on.notes) patch.notes = (r.notes ? r.notes.replace(/\s+$/, '') + '\n\n' : '') + line;
    if (Object.keys(patch).length) useStore.getState().updatePc(r.id, patch, 'datos de la hoja de ' + r.name);
    onClose();
  };
  const any = Object.values(on).some(Boolean);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Datos de la hoja de personaje" onClick={onClose}>
      <div className="panel dialog" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head"><h2>Datos de la hoja</h2></div>
        <p className="muted small" style={{ marginTop: 0 }}>Marca lo que quieras copiar a la ficha de {r.name}. Puedes corregir cada valor antes de aplicarlo.</p>
        <table className="sheet-import">
          <thead><tr><th scope="col"><span className="sr-only">Copiar</span></th><th scope="col">Dato</th><th scope="col">Ahora</th><th scope="col">En la hoja</th></tr></thead>
          <tbody>
            {FIELDS.map(([k, label]) => (
              <tr key={k}>
                <td><input type="checkbox" aria-label={'Copiar ' + label} checked={!!on[k]} disabled={!vals[k].trim()} onChange={(e) => setOn({ ...on, [k]: e.target.checked })} /></td>
                <th scope="row">{label}</th>
                <td className="muted">{show(k, r[k])}</td>
                <td><input className="input" aria-label={label + ' en la hoja'} value={vals[k]} onChange={(e) => { setVals({ ...vals, [k]: e.target.value }); setOn({ ...on, [k]: !!e.target.value.trim() }); }} /></td>
              </tr>
            ))}
            {data.res.length > 0 && (
              <tr>
                <td><input type="checkbox" aria-label="Añadir resistencias" checked={!!on.res} disabled={!newRes.length} onChange={(e) => setOn({ ...on, res: e.target.checked })} /></td>
                <th scope="row">Resistencias</th>
                <td className="muted">{r.res.join(', ') || '—'}</td>
                <td>{data.res.join(', ')}</td>
              </tr>
            )}
          </tbody>
        </table>
        {line && (
          <label className="sheet-import-notes">
            <input type="checkbox" checked={!!on.notes} onChange={(e) => setOn({ ...on, notes: e.target.checked })} />
            <span>Añadir a las notas: <span className="muted">{line}</span></span>
          </label>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 12 }}>
          <button className="btn ghost" onClick={onClose}>No copiar nada</button>
          <button className="btn primary" disabled={!any} onClick={apply} autoFocus>Copiar a la ficha</button>
        </div>
      </div>
    </div>
  );
}

const kb = (n: number) => (n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

function Sheet({ r, inCombat, open, onToggle, onZoom }: { r: RosterEntry; inCombat: boolean; open: boolean; onToggle: () => void; onZoom: () => void }) {
  const { set, updatePc, attachPdf, removePdf, confirm } = useStore.getState();
  const confirmKey = useStore((s) => s.confirmKey);
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<SheetData | null>(null);
  const id = 'pc-sheet-' + r.id;
  /** Busca los datos del personaje en los campos rellenables; «quiet» no avisa si no hay nada (al subir). */
  const readData = async (blob: Blob, quiet: boolean) => {
    let data: SheetData | null = null;
    try { data = readSheet(await readPdfFields(blob)); } catch { /* PDF sin formulario o dañado */ }
    if (data) setFound(data);
    else if (!quiet) setMsg('Esta hoja no tiene campos rellenables con datos que la app sepa leer.');
  };
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    const err = await attachPdf(r.id, f);
    setMsg(err);
    if (!err) await readData(f, true);
    setBusy(false);
    if (file.current) file.current.value = '';
  };
  const readStored = async () => {
    const b = r.pdf && (await getPdf(r.pdf.id));
    if (!b) { setMsg('La hoja no está en este dispositivo.'); return; }
    setMsg('');
    setBusy(true);
    await readData(b, false);
    setBusy(false);
  };
  const openNewTab = async () => {
    const b = r.pdf && (await getPdf(r.pdf.id));
    if (!b) { setMsg('La hoja no está en este dispositivo.'); return; }
    window.open(URL.createObjectURL(b), '_blank', 'noopener');
  };
  const stats: [string, string][] = [
    ['Jugador', r.player || '—'], ['Clase', r.cls || '—'], ['Nivel', r.level || '1'], ['CA', r.ac || '—'], ['PG máx.', r.hp || '—'],
    ['Iniciativa', fmt(parseInt(r.initb, 10) || 0)], ['Percepción pasiva', r.pp || '10'], ['Resistencias', r.res.length ? r.res.join(', ') : '—'],
  ];
  return (
    <li className={open ? 'pc-sheet open' : 'pc-sheet'}>
      <button className="pc-sheet-head" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <span className="pc-sheet-chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
          <span className="pc-sheet-name">{r.name}{inCombat && <span className="tag">En combate</span>}{r.pdf && <span className="tag pdf">PDF</span>}</span>
          <span className="pc-sheet-sub">{[r.cls, 'Nivel ' + (r.level || 1), r.player ? 'Jugador: ' + r.player : ''].filter(Boolean).join(' · ')}</span>
        </span>
        <span className="pc-sheet-stats">
          <span><b>CA</b> {r.ac || '—'}</span><span><b>PG</b> {r.hp || '—'}</span><span><b>Ini</b> {fmt(parseInt(r.initb, 10) || 0)}</span>
        </span>
      </button>
      {open && (
        <div id={id} className="pc-sheet-body">
          <dl className="pc-sheet-grid">
            {stats.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn small" onClick={() => set({ pcForm: { ...blankRoster(), ...r }, editingPcId: r.id, pcMsg: '' })}>Editar datos</button>
          </div>
          <div className="field"><label htmlFor={id + '-notes'}>Notas</label>
            <textarea id={id + '-notes'} className="input" rows={4} value={r.notes || ''} placeholder="Trasfondo, objetivos, vínculos, objetos importantes, lo que pasó la última sesión…"
              onChange={(e) => updatePc(r.id, { notes: e.target.value }, 'notas de ' + r.name)} /></div>
          <div className="pc-pdf">
            <div className="panel-head">
              <span className="eyebrow">Hoja de personaje</span>
              {r.pdf && <span className="muted small">{r.pdf.name} · {kb(r.pdf.size)}</span>}
            </div>
            {r.pdf ? (
              <>
                <Suspense fallback={<p className="muted small" style={{ margin: 0 }}>Cargando el visor…</p>}>
                  <PdfViewer pdfId={r.pdf.id} />
                </Suspense>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn small" onClick={onZoom}>Pantalla completa</button>
                  <button className="btn small" disabled={busy} onClick={() => void readStored()}>{busy ? 'Leyendo…' : 'Leer datos de la hoja'}</button>
                  <button className="btn small ghost" onClick={() => void openNewTab()}>Abrir en otra pestaña</button>
                  <button className="btn small ghost" onClick={() => file.current?.click()}>Cambiar PDF</button>
                  <button className="btn small ghost" onClick={() => confirm('pdf-' + r.id, () => removePdf(r.id))}>{confirmKey === 'pdf-' + r.id ? '¿Seguro? Quitar' : 'Quitar PDF'}</button>
                </div>
              </>
            ) : (
              <div className="pdf-drop">
                <span className="muted small">Sube la hoja de personaje en PDF (hasta 30 MB). Se guarda en este dispositivo y va incluida en «Descargar copia».</span>
                <button className="btn small primary" disabled={busy} onClick={() => file.current?.click()}>{busy ? 'Guardando…' : 'Subir PDF'}</button>
              </div>
            )}
            <input ref={file} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label={'Hoja de personaje de ' + r.name} onChange={(e) => void upload(e.target.files?.[0])} />
            {msg && <p className="warn" role="alert" style={{ margin: 0 }}>{msg}</p>}
          </div>
        </div>
      )}
      {found && <ImportDialog r={r} data={found} onClose={() => setFound(null)} />}
    </li>
  );
}

/** Fichas plegables de los jugadores del grupo (pestaña Grupo). */
export default function PartySheets() {
  const roster = useStore((s) => s.roster);
  const combatants = useStore((s) => s.combatants);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [zoomed, setZoomed] = useState<RosterEntry | null>(null);
  const inC = new Set(combatants.map((c) => c.rosterId).filter(Boolean));
  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoomed(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomed]);
  const anyOpen = roster.some((r) => open[r.id]);
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Fichas del grupo</h2>
        {roster.length > 1 && (
          <button className="btn small ghost" onClick={() => setOpen(anyOpen ? {} : Object.fromEntries(roster.map((r) => [r.id, true])))}>{anyOpen ? 'Plegar todas' : 'Desplegar todas'}</button>
        )}
      </div>
      {!roster.length && <p className="muted" style={{ margin: 0 }}>Cuando guardes jugadores con el formulario de la izquierda, aparecerán aquí. Púlsalos para ver sus datos, sus notas y su hoja de personaje en PDF.</p>}
      <ul className="pc-sheets">
        {roster.map((r) => (
          <Sheet key={r.id} r={r} inCombat={inC.has(r.id)} open={!!open[r.id]} onToggle={() => setOpen({ ...open, [r.id]: !open[r.id] })} onZoom={() => setZoomed(r)} />
        ))}
      </ul>
      <details className="sheet-links">
        <summary>Hojas de personaje compatibles</summary>
        <p className="muted small">Si el jugador rellena una de estas hojas en el ordenador, al subir el PDF la app ofrece copiar nombre, clase, nivel, CA, PG, iniciativa, percepción pasiva y resistencias, y añadir a las notas especie, subclase, trasfondo, velocidad e idiomas. Otras hojas rellenables con campos como Name, Class, AC o Max HP (en inglés o en español) suelen funcionar también. Una hoja escaneada o rellenada a mano no tiene campos que leer.</p>
        <ul>
          {SHEETS.map((h) => <li key={h.url}><a href={h.url} target="_blank" rel="noopener noreferrer">{h.name}</a> <span className="muted small">({h.by})</span></li>)}
        </ul>
      </details>
      {zoomed?.pdf && (
        <div className="overlay pdf-overlay" role="dialog" aria-modal="true" aria-label={'Hoja de personaje de ' + zoomed.name} onClick={() => setZoomed(null)}>
          <div className="panel dialog pdf-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="panel-head"><h2>{zoomed.name}</h2><button className="btn small ghost" autoFocus onClick={() => setZoomed(null)}>Cerrar</button></div>
            <Suspense fallback={<p className="muted">Cargando el visor…</p>}><PdfViewer pdfId={zoomed.pdf.id} tall /></Suspense>
          </div>
        </div>
      )}
    </div>
  );
}
