import { useEffect, useMemo, useState } from 'react';
import type { Encounter } from '../../data/types';
import { findDice, linkEncounters, parseMarkdown, type Block, type Inline } from '../../engine/script';
import { D20Icon } from '../../shared/Icons';
import { useStore } from '../../store/useStore';

/** Texto con tiradas: «2d10 fuego» o «1d20+5» son botones que tiran en la mesa de dados, como los ataques. */
function Dice({ text }: { text: string }) {
  return (
    <>
      {findDice(text).map((d, k) => (d.t === 'text'
        ? <span key={k}>{d.text}</span>
        : (
          <button key={k} className="script-roll" title={d.kind === 'damage' ? 'Tirar el daño en la mesa' : d.kind === 'check' ? 'Tirar la prueba en la mesa' : 'Tirar en la mesa'}
            onClick={() => useStore.getState().roll({ label: 'Guion · ' + d.text.trim(), kind: d.kind, parts: [{ expr: d.expr, ...(d.type ? { type: d.type } : {}) }], noAdv: d.kind !== 'check' })}>
            <D20Icon size={14} />{d.text.trim()}
          </button>
        )))}
    </>
  );
}

/** Texto en línea con su formato; los nombres de encuentros guardados son botones que los cargan. */
function Inl({ inl, encounters, open }: { inl: Inline[]; encounters: Pick<Encounter, 'id' | 'name'>[]; open: (id: string) => void }) {
  return (
    <>
      {inl.map((x, k) => {
        const st = { fontWeight: x.b ? 700 : undefined, fontStyle: x.i ? 'italic' : undefined } as const;
        if (x.code) return <code key={k} className="script-code">{x.text}</code>;
        return (
          <span key={k} style={st}>
            {linkEncounters(x.text, encounters).map((p, j) => (p.t === 'enc'
              ? <button key={j} className="linkbtn" style={{ fontWeight: 700 }} title="Cargar este encuentro y ir a Combate" onClick={() => open(p.id)}>{p.text}</button>
              : <Dice key={j} text={p.text} />))}
          </span>
        );
      })}
    </>
  );
}

function Blocks({ blocks, encounters, open }: { blocks: Block[]; encounters: Pick<Encounter, 'id' | 'name'>[]; open: (id: string) => void }) {
  const inl = (x: Inline[]) => <Inl inl={x} encounters={encounters} open={open} />;
  return (
    <>
      {blocks.map((b, i) => {
        if (b.t === 'h') { const H = (['h2', 'h3', 'h4'] as const)[b.level - 1]; return <H key={i} className="script-h">{inl(b.inl)}</H>; }
        if (b.t === 'hr') return <hr key={i} className="script-hr" />;
        if (b.t === 'code') return <pre key={i} className="script-pre">{b.text}</pre>;
        if (b.t === 'quote') return <blockquote key={i} className="script-quote">{inl(b.inl)}</blockquote>;
        if (b.t === 'list') {
          const L = b.ordered ? 'ol' : 'ul';
          return <L key={i} className="script-list">{b.items.map((it, k) => <li key={k} style={{ marginLeft: it.depth * 18 }}>{inl(it.inl)}</li>)}</L>;
        }
        return <p key={i} className="script-p">{inl(b.inl)}</p>;
      })}
    </>
  );
}

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
  const blocks = useMemo(() => parseMarkdown(script?.text || ''), [script?.text]);
  // los combates que nombra el texto, en el orden en que salen
  const used = useMemo(() => {
    const ids = linkEncounters(script?.text || '', encounters).flatMap((p) => (p.t === 'enc' ? [p.id] : []));
    return [...new Set(ids)].map((id) => encounters.find((e) => e.id === id)!);
  }, [script?.text, encounters]);

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
        <textarea className="input" aria-label="Texto del guion" rows={22} style={{ minHeight: 360, lineHeight: 1.5 }} value={script.text} placeholder="Escribe o pega aquí tu guion. Admite Markdown (# títulos, **negrita**, - listas). El nombre de un encuentro guardado se convierte en un botón."
          onChange={(e) => patchScript(script.id, { text: e.target.value })} />
      ) : (
        <>
          {used.length > 0 && (
            <div className="rollrow" aria-label="Combates de este guion">
              {used.map((e) => <button key={e.id} className="btn small gold" onClick={() => openScriptEncounter(e.id)} title="Carga este encuentro y va a Combate">Ir al combate: {e.name}</button>)}
            </div>
          )}
          <article className="script-text script-page" style={{ overflowWrap: 'anywhere' }}>
            <Blocks blocks={blocks} encounters={encounters} open={openScriptEncounter} />
          </article>
          {!encounters.length && <p className="muted small" style={{ margin: 0 }}>Aún no tienes encuentros guardados. Prepáralos en <button className="linkbtn" onClick={() => set({ tab: 'combat' })}>Combate</button> con «Guardar encuentro» y escribe su nombre en el guion.</p>}
        </>
      )}
    </div>
  );
}
