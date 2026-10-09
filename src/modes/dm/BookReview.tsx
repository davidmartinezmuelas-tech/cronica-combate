import { useEffect, useRef, useState } from 'react';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ABIL, ABIL_LONG, DMG_TYPES } from '../../data/constants';
import type { Feature, Monster, SectionKey } from '../../data/types';
import { avgOf, modOf, parseExpr } from '../../engine/dice';
import { useStore } from '../../store/useStore';

type PdfDoc = Awaited<ReturnType<typeof import('pdfjs-dist')['getDocument']>['promise']>;

const SEC_N: Record<SectionKey, string> = { tr: 'Atributos', ac_: 'Acciones', ba: 'Acciones adicionales', re: 'Reacciones', lg: 'Acciones legendarias' };

/** Lo que se puede corregir de una ficha. */
interface Draft {
  ac: string; hp: string; hd: string;
  ab: string[]; sv: string[];
  f: Record<string, { atk: string; dmg: string; type: string; dc: string; abil: string; half: boolean }>;
}

const featOf = (m: Monster, code: string): Feature | undefined => { const [, sec, i] = code.split(':'); return m[sec as SectionKey]?.[+i]; };

function draftOf(m: Monster): Draft {
  const f: Draft['f'] = {};
  for (const c of m.chk || []) {
    if (!c.startsWith('f:')) continue;
    const ft = featOf(m, c);
    f[c] = { atk: ft?.atk != null ? String(ft.atk) : '', dmg: ft?.dmg?.[0]?.[0] || '', type: ft?.dmg?.[0]?.[1] || 'cortante', dc: ft?.dc ? String(ft.dc[0]) : '', abil: ft?.dc?.[1] || 'DES', half: !!ft?.half };
  }
  return { ac: String(m.ac), hp: String(m.hp), hd: m.hd === String(m.hp) ? '' : m.hd, ab: m.ab.map(String), sv: m.sv.map(String), f };
}

/** Aplica lo corregido; la ficha queda revisada. */
function applyDraft(m: Monster, d: Draft): Monster {
  const n: Monster = { ...m, ab: m.ab.slice(), sv: m.sv.slice() };
  const int = (v: string, def: number) => { const x = parseInt(v.replace('−', '-'), 10); return isNaN(x) ? def : x; };
  for (const c of m.chk || []) {
    if (c === 'ca') n.ac = int(d.ac, m.ac);
    else if (c === 'pg') {
      const hd = d.hd.replace(/\s+/g, '');
      if (parseExpr(hd)) n.hd = hd;
      n.hp = int(d.hp, parseExpr(hd) ? avgOf(hd) : m.hp);
      if (!parseExpr(n.hd)) n.hd = String(n.hp);
    } else if (c.startsWith('ab:')) {
      const i = +c.slice(3);
      n.ab[i] = Math.max(1, Math.min(30, int(d.ab[i], m.ab[i])));
      n.sv[i] = int(d.sv[i], modOf(n.ab[i]));
    } else if (c.startsWith('f:')) {
      const [, sec, idx, what] = c.split(':') as [string, SectionKey, string, string];
      const v = d.f[c];
      const list = (n[sec] || []).slice();
      const ft = { ...list[+idx] };
      if (what === 'dmg') {
        const expr = v.dmg.replace(/\s+/g, '');
        if (parseExpr(expr)) ft.dmg = [[expr, v.type], ...(ft.dmg || []).slice(1)];
        if (v.atk.trim()) ft.atk = int(v.atk, ft.atk ?? 0);
      } else {
        const dc = int(v.dc, 0);
        if (dc) ft.dc = [dc, v.abil];
        if (v.half) ft.half = 1; else delete ft.half;
        const expr = v.dmg.replace(/\s+/g, '');
        if (parseExpr(expr)) ft.dmg = [[expr, v.type], ...(ft.dmg || []).slice(1)];
      }
      list[+idx] = ft;
      n[sec] = list;
    }
  }
  delete n.chk;
  return n;
}

const label = (m: Monster, c: string) => {
  if (c === 'ca') return 'CA';
  if (c === 'pg') return 'Puntos de golpe';
  if (c.startsWith('ab:')) return ABIL_LONG[+c.slice(3)];
  const [, sec] = c.split(':');
  return (featOf(m, c)?.n || '') + ' · ' + SEC_N[sec as SectionKey];
};

/**
 * Revisar las fichas del Manual de Monstruos con datos que el OCR no pudo leer: a la izquierda, la página del PDF del
 * usuario a la altura de la ficha; a la derecha, solo los datos que faltan.
 */
export default function BookReview({ file, onPickFile, onClose }: { file: Blob | null; onPickFile: () => void; onClose: () => void }) {
  const book = useStore((s) => s.book);
  const [ids] = useState(() => book.filter((m) => m.chk?.length).map((m) => m.id));
  const [idx, setIdx] = useState(0);
  const m = book.find((x) => x.id === ids[idx]);
  const [draft, setDraft] = useState<Draft | null>(() => (m ? draftOf(m) : null));
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(false);
  const view = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // abrir el PDF (ya está en memoria: se eligió al importar)
  useEffect(() => {
    if (!file) return;
    let alive = true;
    let loaded: PdfDoc | null = null;
    (async () => {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      loaded = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      if (alive) setDoc(loaded); else void loaded.loadingTask.destroy();
    })().catch((e: Error) => { if (alive) setError(e.message || 'No se pudo abrir el PDF.'); });
    return () => { alive = false; if (loaded) void loaded.loadingTask.destroy(); };
  }, [file]);

  // dibujar la página de la ficha y llevar la vista a su título
  const src = m?.src;
  useEffect(() => {
    const box = view.current, cv = canvas.current;
    if (!doc || !src || !box || !cv) return;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    let cancelled = false;
    (async () => {
      const page = await doc.getPage(Math.min(src.p, doc.numPages));
      const base = page.getViewport({ scale: 1 });
      const scale = (((box.clientWidth || 520) - 2) * (zoom ? 1.8 : 1)) / base.width;
      const vp = page.getViewport({ scale });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const hi = page.getViewport({ scale: scale * dpr });
      if (cancelled) return;
      cv.width = Math.floor(hi.width);
      cv.height = Math.floor(hi.height);
      cv.style.width = Math.floor(vp.width) + 'px';
      cv.style.height = Math.floor(vp.height) + 'px';
      task = page.render({ canvas: cv, viewport: hi });
      try { await task.promise; } catch { /* cancelada al cambiar de ficha */ }
      if (cancelled) return;
      const [, top] = vp.convertToViewportPoint(0, src.y);
      box.scrollTop = Math.max(0, top - 60);
      box.scrollLeft = zoom && src.col ? vp.width / 2 - 20 : 0;
    })();
    return () => { cancelled = true; task?.cancel(); };
  }, [doc, src, zoom]);

  if (!m || !draft) {
    return (
      <div className="overlay" role="dialog" aria-modal="true" aria-label="Revisar fichas" onClick={onClose}>
        <div className="panel dialog" onClick={(e) => e.stopPropagation()}>
          <div className="panel-head"><h2>Revisar fichas</h2><button className="btn small ghost" autoFocus onClick={onClose}>Cerrar</button></div>
          <p style={{ margin: 0 }}>No queda ninguna ficha por revisar.</p>
        </div>
      </div>
    );
  }
  const go = (to: number) => {
    const next = useStore.getState().book.find((x) => x.id === ids[to]);
    setIdx(to);
    setDraft(next ? draftOf(next) : null);
  };
  const save = () => {
    const st = useStore.getState();
    st.setBook(st.book.map((x) => (x.id === m.id ? applyDraft(x, draft) : x)));
    if (idx + 1 < ids.length) go(idx + 1); else onClose();
  };
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const setF = (c: string, patch: Partial<Draft['f'][string]>) => setDraft({ ...draft, f: { ...draft.f, [c]: { ...draft.f[c], ...patch } } });
  const chk = m.chk || [];
  const abs = chk.filter((c) => c.startsWith('ab:')).map((c) => +c.slice(3));

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Revisar fichas" onClick={onClose}>
      <div className="panel dialog review" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>Revisar fichas</h2>
          <span className="muted small">{idx + 1} de {ids.length}</span>
          <button className="btn small ghost" autoFocus onClick={onClose}>Cerrar</button>
        </div>
        <div className="review-grid">
          <div className="review-page">
            <div className="review-tools">
              <span className="small">{m.src ? 'Página ' + m.src.p + ' de tu PDF' : 'Sin página'}</span>
              {doc && <button className="btn small ghost" aria-pressed={zoom} onClick={() => setZoom(!zoom)}>{zoom ? 'Ver entera' : 'Ampliar'}</button>}
            </div>
            <div className="review-view" ref={view}>
              {!file && <div className="review-empty"><p className="small">Para ver la página, elige otra vez el PDF del Manual (no se guarda en el dispositivo).</p><button className="btn small" onClick={onPickFile}>Elegir el PDF</button></div>}
              {error && <p className="warn">{error}</p>}
              {file && !doc && !error && <p className="muted small">Abriendo el PDF…</p>}
              <canvas ref={canvas} aria-label={'Página del libro con la ficha de ' + m.n} />
            </div>
          </div>
          <div className="review-form">
            <h3 className="review-name">{m.n}</h3>
            <p className="muted small" style={{ margin: 0 }}>{m.sz} {m.t} · VD {m.cr}. Copia lo que ves en la página; lo que dejes como está se queda así.</p>
            {chk.includes('ca') && <div className="field"><label htmlFor="rv-ac">CA</label><input id="rv-ac" className="input" inputMode="numeric" value={draft.ac} onChange={(e) => set({ ac: e.target.value })} /></div>}
            {chk.includes('pg') && (
              <div className="row2">
                <div className="field"><label htmlFor="rv-hp">PG</label><input id="rv-hp" className="input" inputMode="numeric" value={draft.hp} onChange={(e) => set({ hp: e.target.value })} /></div>
                <div className="field"><label htmlFor="rv-hd">Dados de golpe</label><input id="rv-hd" className="input" value={draft.hd} placeholder="20d10+80" onChange={(e) => set({ hd: e.target.value })} /></div>
              </div>
            )}
            {abs.length > 0 && (
              <div className="review-abs">
                {abs.map((i) => (
                  <div key={i} className="review-ab">
                    <span className="eyebrow">{ABIL[i]}</span>
                    <input className="input" aria-label={ABIL_LONG[i]} inputMode="numeric" value={draft.ab[i]} onChange={(e) => { const ab = draft.ab.slice(); ab[i] = e.target.value; set({ ab }); }} />
                    <input className="input" aria-label={'Salvación de ' + ABIL_LONG[i]} value={draft.sv[i]} onChange={(e) => { const sv = draft.sv.slice(); sv[i] = e.target.value; set({ sv }); }} />
                  </div>
                ))}
                <span className="muted small">Puntuación y salvación (SALV.)</span>
              </div>
            )}
            {chk.filter((c) => c.startsWith('f:')).map((c) => {
              const ft = featOf(m, c);
              const v = draft.f[c];
              const dmg = c.endsWith(':dmg');
              return (
                <div key={c} className="sub review-feat">
                  <span className="eyebrow">{label(m, c)}</span>
                  <p className="small review-text">{ft?.d.slice(0, 260)}{(ft?.d.length || 0) > 260 ? '…' : ''}</p>
                  <div className="row2">
                    {dmg
                      ? <div className="field"><label htmlFor={'rv-a' + c}>Ataque</label><input id={'rv-a' + c} className="input" value={v.atk} placeholder="+6" onChange={(e) => setF(c, { atk: e.target.value })} /></div>
                      : <div className="field"><label htmlFor={'rv-c' + c}>CD</label><input id={'rv-c' + c} className="input" inputMode="numeric" value={v.dc} onChange={(e) => setF(c, { dc: e.target.value })} /></div>}
                    {!dmg && <div className="field"><label htmlFor={'rv-s' + c}>Salvación de</label>
                      <select id={'rv-s' + c} className="input" value={v.abil} onChange={(e) => setF(c, { abil: e.target.value })}>{ABIL.map((a, i) => <option key={a} value={a}>{ABIL_LONG[i]}</option>)}</select></div>}
                  </div>
                  <div className="row2">
                    <div className="field"><label htmlFor={'rv-d' + c}>Daño</label><input id={'rv-d' + c} className="input" value={v.dmg} placeholder="2d6+4" onChange={(e) => setF(c, { dmg: e.target.value })} /></div>
                    <div className="field"><label htmlFor={'rv-t' + c}>Tipo</label>
                      <select id={'rv-t' + c} className="input" value={v.type} onChange={(e) => setF(c, { type: e.target.value })}>{DMG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
                  </div>
                  {!dmg && <label className="check"><input type="checkbox" checked={v.half} onChange={(e) => setF(c, { half: e.target.checked })} />Mitad de daño si la supera</label>}
                </div>
              );
            })}
            <div className="rollrow">
              <button className="btn primary" onClick={save}>{idx + 1 < ids.length ? 'Guardar y siguiente' : 'Guardar y terminar'}</button>
              <button className="btn" disabled={idx + 1 >= ids.length} onClick={() => go(idx + 1)}>Saltar</button>
              <button className="btn ghost" disabled={idx === 0} onClick={() => go(idx - 1)}>Anterior</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
