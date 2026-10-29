import { useRef, useState } from 'react';
import { readScriptFile } from '../../engine/script';
import { useStore } from '../../store/useStore';

/** Lista de guiones de sesión (columna izquierda): crear, subir un archivo de texto y elegir cuál se ve. */
export default function ScriptPanel() {
  const scripts = useStore((s) => s.scripts);
  const scriptId = useStore((s) => s.scriptId);
  const { addScript, set } = useStore.getState();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');

  const upload = async (f: File | undefined) => {
    if (!f) return;
    const r = await readScriptFile(f);
    if (!r.ok) { setMsg(r.message); return; }
    setMsg('');
    addScript(r.title, r.text);
    set({ toast: 'Guion «' + r.title + '» subido' });
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
          </li>
        ))}
      </ul>
    </div>
  );
}
