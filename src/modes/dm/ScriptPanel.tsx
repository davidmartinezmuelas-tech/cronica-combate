import { useMemo, useRef, useState } from 'react';
import { linkEncounters, readScriptFile } from '../../engine/script';
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
        <input ref={file} type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" hidden aria-label="Subir guion (.txt o .md)" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      {msg && <p className="warn small" role="alert" style={{ margin: 0 }}>{msg}</p>}
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
