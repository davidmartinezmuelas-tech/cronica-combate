import { useEffect, useMemo, useRef, useState } from 'react';
import type { Encounter } from '../../data/types';
import { findDice, linkEncounters, parseMarkdown, type Block, type Inline } from '../../engine/script';
import { extractBlocks, type ImportPlan } from '../../engine/scriptBlocks';
import { InfoDialog } from '../../shared/Card';
import PagedColumns from '../../shared/PagedColumns';
import { D20Icon } from '../../shared/Icons';
import { useStore } from '../../store/useStore';
import EncounterInsert from './EncounterInsert';

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
        if (b.t === 'code' && (b.lang === 'encuentro' || b.lang === 'criatura')) {
          const nm = /^nombre:s*(.+)$/im.exec(b.text)?.[1]?.trim() || '';
          const enc = b.lang === 'encuentro' ? encounters.find((e) => e.name.trim().toLowerCase() === nm.toLowerCase()) : undefined;
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
              {enc && <button className="script-roll" onClick={() => open(enc.id)} title="Carga este encuentro y va a Combate">Ir al combate: {enc.name}</button>}
              <details className="script-combat" style={{ width: '100%' }}>
                <summary>{b.lang === 'encuentro' ? 'Encuentro' : 'Ficha de criatura'}{nm ? ': ' + nm : ''}</summary>
                <pre className="script-pre">{b.text}</pre>
              </details>
            </div>
          );
        }
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

/** Resumen de lo que cargaría el guion, con sus avisos, antes de escribir nada. */
function PlanDialog({ plan, onApply, onClose }: { plan: ImportPlan; onApply: () => void; onClose: () => void }) {
  const warns = [...plan.warnings, ...plan.creatures.flatMap((c) => c.warnings.map((w) => c.monster.n + ': ' + w)), ...plan.encounters.flatMap((e) => e.warnings.map((w) => e.enc.name + ': ' + w))];
  const none = !plan.creatures.length && !plan.encounters.length;
  return (
    <InfoDialog title="Cargar combates del guion" onClose={onClose}>
      {plan.creatures.length > 0 && (
        <div>
          <span className="eyebrow">Criaturas propias ({plan.creatures.length})</span>
          <ul className="rem">{plan.creatures.map((c) => <li key={c.monster.id}><span style={{ flex: 1 }}><strong>{c.monster.n}</strong> <span className="muted small">CR {c.monster.cr} · CA {c.monster.ac} · PG {c.monster.hp}</span></span><span className={c.action === 'actualizar' ? 'chip-tag warn' : 'chip-tag'}>{c.action === 'actualizar' ? 'Sobrescribe la ficha' : 'Nueva'}</span></li>)}</ul>
        </div>
      )}
      {plan.encounters.length > 0 && (
        <div>
          <span className="eyebrow">Encuentros ({plan.encounters.length})</span>
          <ul className="rem">{plan.encounters.map((e) => <li key={e.enc.id}><span style={{ flex: 1 }}><strong>{e.enc.name}</strong><span className="muted small" style={{ display: 'block' }}>{e.enc.items.map((i) => i.qty + ' × ' + (useStore.getState().monById(i.monsterId)?.n || plan.creatures.find((c) => c.monster.id === i.monsterId)?.monster.n || i.monsterId)).join(', ')}{e.enc.lair ? ' · guarida' : ''}</span></span><span className={e.action === 'actualizar' ? 'chip-tag warn' : 'chip-tag'}>{e.action === 'actualizar' ? 'Actualiza' : 'Nuevo'}</span></li>)}</ul>
        </div>
      )}
      {warns.length > 0 && (
        <div>
          <span className="eyebrow">Avisos ({warns.length})</span>
          <ul className="rem">{warns.map((w, i) => <li key={i} className="warn small">{w}</li>)}</ul>
        </div>
      )}
      {none && <p className="muted" style={{ margin: 0 }}>No hay nada que cargar.</p>}
      <div className="rollrow">
        <button className="btn small primary" disabled={none} onClick={() => { onApply(); onClose(); }}>Cargar</button>
        <button className="btn small ghost" onClick={onClose}>Cancelar</button>
      </div>
    </InfoDialog>
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
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [adding, setAdding] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const caret = useRef(0); // dónde estaba el cursor al abrir el formulario de encuentro
  // dos columnas como en un libro (se recuerda en este dispositivo)
  const [cols2, setCols2] = useState(() => { try { return localStorage.getItem('cronica-guion-columnas') === '2'; } catch { return false; } });
  const toggleCols = () => { const v = !cols2; setCols2(v); try { localStorage.setItem('cronica-guion-columnas', v ? '2' : '1'); } catch { /* nada */ } };
  const nBlocks = useMemo(() => extractBlocks(script?.text || '').length, [script?.text]);
  // al cambiar de guion: vacío = a escribir; con texto = a leer
  useEffect(() => { setEdit(!!script && !script.text.trim()); }, [script?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const blocks = useMemo(() => parseMarkdown(script?.text || ''), [script?.text]);

  /** Escribe el bloque en el cursor (con línea en blanco alrededor) y guarda ya ese encuentro, para que su botón de combate aparezca ahí. */
  const insertBlock = (block: string) => {
    if (!script) return;
    const at = Math.min(caret.current, script.text.length);
    const before = script.text.slice(0, at), after = script.text.slice(at);
    // una línea en blanco a cada lado del bloque (sin duplicar las que ya haya)
    const blanks = (s: string, end: boolean) => (end ? /\n\n$/.test(s) : /^\n\n/.test(s)) ? '' : (end ? /\n$/.test(s) : /^\n/.test(s)) ? '\n' : '\n\n';
    const pre = before ? blanks(before, true) : '';
    const post = after ? blanks(after, false) : '\n';
    patchScript(script.id, { text: before + pre + block + post + after });
    const { planScriptBlocks, applyScriptBlocks } = useStore.getState();
    applyScriptBlocks(planScriptBlocks(block));
  };

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
        <input className="input" aria-label="Título del guion" style={{ flex: '0 1 340px', minWidth: 160, fontWeight: 700 }} value={script.title} onChange={(e) => patchScript(script.id, { title: e.target.value })} />
        <div className="rollrow">
          {nBlocks > 0 && <button className="btn small gold" title="Crea las criaturas y los encuentros de los bloques del guion" onClick={() => setPlan(useStore.getState().planScriptBlocks(script.text))}>Cargar combates del guion</button>}
          {edit && <button className="btn small gold" title="Escribe un bloque de encuentro en el punto del texto donde está el cursor" onClick={() => { caret.current = area.current?.selectionStart ?? script.text.length; setAdding(true); }}>Añadir encuentro</button>}
          {!edit && <button className="btn small ghost" aria-pressed={cols2} title="Leer en dos columnas pasando páginas, como un libro" onClick={toggleCols}>{cols2 ? 'Una columna' : 'Dos columnas'}</button>}
          <button className="btn small" onClick={() => setEdit(!edit)}>{edit ? 'Leer' : 'Editar'}</button>
          <button className="btn small ghost danger" onClick={() => deleteScript(script.id)}>{confirmKey === 'script-' + script.id ? '¿Seguro? Borrar' : 'Borrar'}</button>
        </div>
      </div>
      {edit ? (
        <textarea ref={area} className="input" aria-label="Texto del guion" rows={22} style={{ minHeight: 360, lineHeight: 1.5 }} value={script.text} placeholder="Escribe o pega aquí tu guion. Admite Markdown (# títulos, **negrita**, - listas). El nombre de un encuentro guardado se convierte en un botón."
          onChange={(e) => patchScript(script.id, { text: e.target.value })} />
      ) : (
        <>
          <article className={'script-text script-page' + (cols2 ? ' is-paged' : '')} style={{ overflowWrap: 'anywhere' }}>
            {cols2 ? <PagedColumns resetKey={script.id}><Blocks blocks={blocks} encounters={encounters} open={openScriptEncounter} /></PagedColumns> : <Blocks blocks={blocks} encounters={encounters} open={openScriptEncounter} />}
          </article>
          {!encounters.length && <p className="muted small" style={{ margin: 0 }}>Aún no tienes encuentros guardados. Prepáralos en <button className="linkbtn" onClick={() => set({ tab: 'combat' })}>Combate</button> con «Guardar encuentro» y escribe su nombre en el guion.</p>}
        </>
      )}
      {adding && <EncounterInsert onClose={() => setAdding(false)} onInsert={(block) => insertBlock(block)} />}
      {plan && <PlanDialog plan={plan} onApply={() => useStore.getState().applyScriptBlocks(plan)} onClose={() => setPlan(null)} />}
    </div>
  );
}
