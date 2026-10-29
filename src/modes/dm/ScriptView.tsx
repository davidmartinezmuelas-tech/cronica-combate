import { useEffect, useMemo, useState } from 'react';
import { linkEncounters } from '../../engine/script';
import { useStore } from '../../store/useStore';

/** El guion elegido (columna central): se lee con los combates como botones, o se edita como texto. */
export default function ScriptView() {
  const scripts = useStore((s) => s.scripts);
  const scriptId = useStore((s) => s.scriptId);
  const encounters = useStore((s) => s.encounters);
  const confirmKey = useStore((s) => s.confirmKey);
  const { patchScript, deleteScript, openScriptEncounter, set } = useStore.getState();
  const script = scripts.find((x) => x.id === scriptId) || scripts[0] || null;
  const [edit, setEdit] = useState(false);
  // al cambiar de guion: vacío = a escribir; con texto = a leer
  useEffect(() => { setEdit(!!script && !script.text.trim()); }, [script?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const parts = useMemo(() => linkEncounters(script?.text || '', encounters), [script?.text, encounters]);
  const used = useMemo(() => {
    const ids = new Set(parts.flatMap((p) => (p.t === 'enc' ? [p.id] : [])));
    return encounters.filter((e) => ids.has(e.id));
  }, [parts, encounters]);

  if (!script) {
    return (
      <div className="panel" style={{ alignItems: 'center', textAlign: 'center', padding: '40px 24px' }}>
        <h2>El guion de la sesión</h2>
        <p className="muted" style={{ margin: 0 }}>Crea un guion o sube un archivo de texto desde el panel de la izquierda.</p>
      </div>
    );
  }

  return (
    <div className="panel script-view">
      <div className="panel-head">
        <input className="input" aria-label="Título del guion" style={{ flex: 1, minWidth: 180, fontWeight: 700 }} value={script.title} onChange={(e) => patchScript(script.id, { title: e.target.value })} />
        <div className="rollrow">
          <button className="btn small" onClick={() => setEdit(!edit)}>{edit ? 'Leer' : 'Editar'}</button>
          <button className="btn small ghost danger" onClick={() => deleteScript(script.id)}>{confirmKey === 'script-' + script.id ? '¿Seguro? Borrar' : 'Borrar'}</button>
        </div>
      </div>
      {edit ? (
        <textarea className="input" aria-label="Texto del guion" rows={22} style={{ minHeight: 360, lineHeight: 1.5 }} value={script.text} placeholder="Escribe o pega aquí tu guion. El nombre de un encuentro guardado se convierte en un botón."
          onChange={(e) => patchScript(script.id, { text: e.target.value })} />
      ) : (
        <>
          {used.length > 0 && (
            <div className="rollrow" aria-label="Combates de este guion">
              {used.map((e) => <button key={e.id} className="btn small gold" onClick={() => openScriptEncounter(e.id)} title="Carga este encuentro y va a Combate">Ir al combate: {e.name}</button>)}
            </div>
          )}
          <div className="script-text" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 16, overflowWrap: 'anywhere' }}>
            {parts.map((p, i) => (p.t === 'enc'
              ? <button key={i} className="linkbtn" style={{ fontWeight: 700 }} title="Cargar este encuentro y ir a Combate" onClick={() => openScriptEncounter(p.id)}>{p.text}</button>
              : <span key={i}>{p.text}</span>))}
          </div>
          {!encounters.length && <p className="muted small" style={{ margin: 0 }}>Aún no tienes encuentros guardados. Prepáralos en <button className="linkbtn" onClick={() => set({ tab: 'combat' })}>Combate</button> con «Guardar encuentro» y escribe su nombre en el guion.</p>}
        </>
      )}
    </div>
  );
}
