import { useMemo, useRef, useState } from 'react';
import { linkEncounters, MAX_SCRIPT_BYTES, readScriptFile, scriptTitleFromFile } from '../../engine/script';
import { NO_TEXT, NO_TEXT_HELP, readAdventure } from '../../store/bookReader';
import { useStore } from '../../store/useStore';

/** Los combates que nombra un guion, en el orden en que salen, como subcarpeta del guion. */
function ScriptCombats({ text }: { text: string }) {
  const encounters = useStore((s) => s.encounters);
  const { openScriptEncounter } = useStore.getState();
  const used = useMemo(() => {
    const ids = linkEncounters(text, encounters).flatMap((p) => (p.t === 'enc' ? [p.id] : []));
    return [...new Set(ids)].map((id) => encounters.find((e) => e.id === id)!);
  }, [text, encounters]);
  if (!used.length) return null;
  return (
    <ul className="script-combats" aria-label="Combates de este guion">
      {used.map((e) => <li key={e.id}><button className="script-combat-btn" title="Carga este encuentro y va a Combate" onClick={() => openScriptEncounter(e.id)}>{e.name}</button></li>)}
    </ul>
  );
}

/** Lista de guiones de sesión (columna izquierda): crear, subir un archivo de texto y elegir cuál se ve. */
export default function ScriptPanel() {
  const scripts = useStore((s) => s.scripts);
  const scriptId = useStore((s) => s.scriptId);
  const { addScript, set, showToast } = useStore.getState();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const pdf = useRef<HTMLInputElement>(null);
  const cancel = useRef({ cancelled: false });
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [ok, setOk] = useState(false);

  /** Una aventura en PDF -> un guion con sus encuentros ya cargados (se lee en este navegador). */
  const importAdventure = async (f: File | undefined) => {
    if (!f) return;
    setMsg(''); setOk(false);
    cancel.current = { cancelled: false };
    try {
      const st = useStore.getState();
      const r = await readAdventure(f, [...st.custom, ...st.book, ...st.srd].map((m) => ({ id: m.id, n: m.n, en: m.en })), (p, t) => setProgress([p, t]), cancel.current);
      if (r.text.length < 200) setMsg('No se ha encontrado texto que convertir en guion.');
      else if (new Blob([r.text]).size > MAX_SCRIPT_BYTES) setMsg('La aventura es demasiado larga para un guion (máximo 1 MB de texto).');
      else {
        addScript(scriptTitleFromFile(f.name), r.text);
        const now = useStore.getState();
        now.applyScriptBlocks(now.planScriptBlocks(r.text));
        setOk(true);
        setMsg('Aventura importada (' + r.pages + ' páginas) con ' + r.encounters.length + ' encuentros.' + (r.unresolved.length ? ' Criaturas que no están en tu bestiario y quedan solo en el texto: ' + r.unresolved.join(', ') + '.' : ''));
      }
    } catch (e) {
      const m = (e as Error).message;
      if (m === NO_TEXT) setMsg(NO_TEXT_HELP);
      else if (m !== 'cancelado') setMsg('No se pudo leer el PDF (' + m + ').');
    }
    setProgress(null);
  };

  const upload = async (f: File | undefined) => {
    if (!f) return;
    const r = await readScriptFile(f);
    if (!r.ok) { setMsg(r.message); return; }
    setMsg('');
    addScript(r.title, r.text);
    showToast('Guion «' + r.title + '» subido');
  };

  return (
    <div className="panel">
      <div className="panel-head"><h2>Guiones</h2></div>
      <div className="rollrow">
        <button className="btn small primary" onClick={() => addScript('Sesión ' + (scripts.length + 1), '')}>Nuevo guion</button>
        <button className="btn small" onClick={() => file.current?.click()}>Subir archivo</button>
        <button className="btn small gold" disabled={!!progress} title="Convierte el PDF de una aventura en un guion con sus encuentros y tiradas (se lee en este navegador)" onClick={() => pdf.current?.click()}>Importar aventura (PDF)</button>
        <input ref={pdf} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="PDF de la aventura" onChange={(e) => { void importAdventure(e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={file} type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" hidden aria-label="Subir guion (.txt o .md)" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      {progress && (
        <div className="sub" role="status">
          <span className="small">Leyendo la aventura: página {progress[0]} de {progress[1]}…</span>
          <span className="hpbar"><span className="hpfill" style={{ width: Math.round((progress[0] / progress[1]) * 100) + '%' }} /></span>
          <button className="btn small ghost" onClick={() => { cancel.current.cancelled = true; }}>Cancelar</button>
        </div>
      )}
      {msg && <p className={ok ? 'muted small' : 'warn small'} role={ok ? 'status' : 'alert'} style={{ margin: 0 }}>{msg}</p>}
      {!scripts.length && <p className="muted" style={{ margin: 0 }}>Escribe aquí el guion de tu sesión o sube un archivo de texto (.txt o .md). Si escribes el nombre de un encuentro guardado, se convierte en un botón que lo carga en Combate.</p>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {scripts.map((s) => (
          <li key={s.id}>
            <button className={'btn' + (s.id === scriptId ? ' gold' : '')} style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left' }} aria-current={s.id === scriptId ? 'true' : undefined} onClick={() => set({ scriptId: s.id })}>{s.title}</button>
            <ScriptCombats text={s.text} />
          </li>
        ))}
      </ul>
    </div>
  );
}
