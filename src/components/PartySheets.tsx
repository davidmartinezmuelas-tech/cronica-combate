import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { RosterEntry } from '../data/types';
import { fmt } from '../engine/dice';
import { blankRoster } from '../store/persist';
import { getPdf } from '../store/pdfs';
import { useStore } from '../store/useStore';

// PDF.js solo se descarga al abrir una hoja
const PdfViewer = lazy(() => import('./PdfViewer'));

const kb = (n: number) => (n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

function Sheet({ r, inCombat, open, onToggle, onZoom }: { r: RosterEntry; inCombat: boolean; open: boolean; onToggle: () => void; onZoom: () => void }) {
  const { set, updatePc, attachPdf, removePdf, confirm } = useStore.getState();
  const confirmKey = useStore((s) => s.confirmKey);
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const id = 'pc-sheet-' + r.id;
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setMsg(await attachPdf(r.id, f));
    setBusy(false);
    if (file.current) file.current.value = '';
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
