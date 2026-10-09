import { useEffect, useRef, useState } from 'react';
import { ABILS, type Abil } from '../../data/player';
import type { LibBackground } from '../../engine/bookImport';
import { norm } from '../../engine/util';
import Picker from '../../shared/Picker';
import { readBook, type BookResult } from '../../store/bookReader';
import { useLibrary } from '../../store/library';
import { usePlayer } from '../../store/player';
import { useStore } from '../../store/useStore';

const ABIL_N: Record<Abil, string> = { str: 'Fuerza', dex: 'Destreza', con: 'Constitución', int: 'Inteligencia', wis: 'Sabiduría', cha: 'Carisma' };
const CAT_N: Record<string, string> = { origin: 'origen', general: 'general', 'fighting-style': 'estilo de combate', 'epic-boon': 'don épico' };

/** Lo que el SRD ya trae no se duplica en la biblioteca. */
function withoutSrd(r: BookResult, srd: { feats: string[]; backgrounds: string[]; spells: string[]; subclasses: string[] }): BookResult {
  const has = (list: string[], n: string) => list.some((x) => norm(x) === norm(n));
  return { ...r, feats: r.feats.filter((f) => !has(srd.feats, f.n)), backgrounds: r.backgrounds.filter((b) => !has(srd.backgrounds, b.n)), spells: r.spells.filter((s) => !has(srd.spells, s.n)), subclasses: r.subclasses.filter((s) => !has(srd.subclasses, s.n)) };
}
const CLASS_N: Record<string, string> = { barbarian: 'Bárbaro', bard: 'Bardo', cleric: 'Clérigo', druid: 'Druida', fighter: 'Guerrero', monk: 'Monje', paladin: 'Paladín', ranger: 'Explorador', rogue: 'Pícaro', sorcerer: 'Hechicero', warlock: 'Brujo', wizard: 'Mago' };
const incomplete = (b: LibBackground) => b.abil.length !== 3 || b.skills.length !== 2 || !b.feat;
/** Qué le falta a un trasfondo (para decirlo en la revisión). */
const missing = (b: LibBackground) => [b.abil.length !== 3 ? 'marca 3 características (' + b.abil.length + ')' : '', b.skills.length !== 2 ? 'elige 2 habilidades' : '', !b.feat ? 'elige la dote de origen' : ''].filter(Boolean).join(' · ');

/** Biblioteca propia: dotes, trasfondos y conjuros del libro del usuario, guardados solo en su dispositivo. */
export default function LibraryPanel() {
  const lib = useLibrary();
  const data = usePlayer((s) => s.data);
  const rules = useStore((s) => s.rules);
  const pdfRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [found, setFound] = useState<BookResult | null>(null);
  const [msg, setMsg] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [renaming, setRenaming] = useState<number | null>(null);
  const cancel = useRef({ cancelled: false });

  useEffect(() => { void lib.init(); void usePlayer.getState().loadData(); void useStore.getState().loadRules(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const srd = {
    feats: data?.feats.map((f) => f.n) || [],
    backgrounds: data?.backgrounds.map((b) => b.n) || [],
    spells: (rules || []).filter((e) => e.cat === 'Conjuros').map((e) => e.n),
    subclasses: (data?.classes || []).map((k) => k.sub?.n || '').filter(Boolean),
  };
  const originFeats = [...(data?.feats.filter((f) => f.cat === 'origin').map((f) => f.n) || []), ...(found?.feats || lib.feats).filter((f) => f.cat === 'origin').map((f) => f.n)];

  const importPdf = async (f: File | undefined) => {
    if (!f) return;
    setMsg('');
    setFound(null);
    cancel.current = { cancelled: false };
    try {
      const r = await readBook(f, (p, t) => setProgress([p, t]), cancel.current);
      const nothing = !r.feats.length && !r.backgrounds.length && !r.spells.length && !r.subclasses.length;
      if (nothing) setMsg('No se ha encontrado ninguna dote, trasfondo ni conjuro. El importador está hecho para el Manual del Jugador 2024 en español con texto (no un PDF de imágenes).');
      else {
        const f = withoutSrd(r, srd);
        // los trasfondos por completar, arriba (una sola vez: no saltan de sitio al completarlos)
        setFound({ ...f, backgrounds: [...f.backgrounds.filter(incomplete), ...f.backgrounds.filter((b) => !incomplete(b))] });
      }
    } catch (e) {
      if ((e as Error).message !== 'cancelado') setMsg('No se pudo leer el PDF (' + (e as Error).message + ').');
    }
    setProgress(null);
    if (pdfRef.current) pdfRef.current.value = '';
  };
  const setBg = (i: number, patch: Partial<LibBackground>) => found && setFound({ ...found, backgrounds: found.backgrounds.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const saveFound = () => {
    if (!found) return;
    const merge = <T extends { id: string }>(a: T[], b: T[]) => [...a.filter((x) => !b.some((y) => y.id === x.id)), ...b];
    void lib.save({ source: 'Manual del Jugador 2024 (tu PDF)', feats: merge(lib.feats, found.feats), backgrounds: merge(lib.backgrounds, found.backgrounds), spells: merge(lib.spells, found.spells), subclasses: merge(lib.subclasses, found.subclasses) });
    setMsg('Guardado en tu biblioteca: ' + found.subclasses.length + ' subclases, ' + found.feats.length + ' dotes, ' + found.backgrounds.length + ' trasfondos y ' + found.spells.length + ' conjuros. Ya aparecen al crear o editar un personaje.');
    setFound(null);
  };
  const exportFile = () => {
    const blob = new Blob([lib.exportText()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'biblioteca-cronica.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const importFile = async (f: File | undefined) => {
    if (!f) return;
    setMsg(await lib.importText(await f.text()));
    if (jsonRef.current) jsonRef.current.value = '';
  };

  const total = lib.feats.length + lib.backgrounds.length + lib.spells.length + lib.subclasses.length;
  return (
    <div className="pc">
      <div data-tour="library" className="panel">
        <div className="panel-head"><h2>Tu biblioteca</h2><span className="muted small">{lib.source || 'vacía'}</span></div>
        <p className="muted small" style={{ margin: 0 }}>Aquí puedes añadir las dotes, los trasfondos y los conjuros de tu Manual del Jugador 2024 que no están en el SRD. Se leen de tu PDF dentro de este navegador y se guardan solo en este dispositivo: no se suben a ningún sitio ni forman parte de la app. Si exportas el archivo para tu grupo, que sea para quien tenga el libro.</p>
        <div className="pc-stats lib-stats">
          <div className="stat"><span className="stat-k">Subclases</span><span className="stat-v">{lib.subclasses.length}</span></div>
          <div className="stat"><span className="stat-k">Dotes</span><span className="stat-v">{lib.feats.length}</span></div>
          <div className="stat"><span className="stat-k">Trasfondos</span><span className="stat-v">{lib.backgrounds.length}</span></div>
          <div className="stat"><span className="stat-k">Conjuros</span><span className="stat-v">{lib.spells.length}</span></div>
        </div>
        <div className="rollrow">
          <button className="btn small primary" disabled={!!progress} onClick={() => pdfRef.current?.click()}>Importar del Manual del Jugador (PDF)</button>
          <button className="btn small" disabled={!total} onClick={exportFile}>Exportar biblioteca</button>
          <button className="btn small" onClick={() => jsonRef.current?.click()}>Cargar archivo de biblioteca</button>
          {total > 0 && <button className="btn small ghost" onClick={() => { if (confirmClear) { void lib.clear(); setConfirmClear(false); setMsg('Biblioteca vaciada.'); } else setConfirmClear(true); }}>{confirmClear ? '¿Seguro? Vaciar' : 'Vaciar'}</button>}
        </div>
        <input ref={pdfRef} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="PDF del Manual del Jugador" onChange={(e) => void importPdf(e.target.files?.[0])} />
        <input ref={jsonRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Archivo de biblioteca" onChange={(e) => void importFile(e.target.files?.[0])} />
        {progress && (
          <div className="sub" role="status">
            <span className="small">Leyendo el libro: página {progress[0]} de {progress[1]}…</span>
            <span className="hpbar"><span className="hpfill" style={{ width: Math.round((progress[0] / progress[1]) * 100) + '%' }} /></span>
            <button className="btn small ghost" style={{ alignSelf: 'flex-start' }} onClick={() => { cancel.current.cancelled = true; }}>Cancelar</button>
          </div>
        )}
        {msg && <p className="warn" role="status" style={{ margin: 0 }}>{msg}</p>}
      </div>

      {found && (
        <div className="panel">
          <div className="panel-head"><h2>Revisa lo encontrado</h2>
            <span className="rollrow"><button className="btn small primary" onClick={saveFound}>Guardar en mi biblioteca</button><button className="btn small ghost" onClick={() => setFound(null)}>Descartar</button></span>
          </div>
          <p className="muted small" style={{ margin: 0 }}>El texto viene del reconocimiento de caracteres del PDF, así que puede tener alguna errata. No se incluye lo que ya trae el SRD. Los trasfondos marcados tienen algún dato que no se pudo leer: complétalos aquí.</p>
          <Picker open={found.backgrounds.some(incomplete)} title={'Trasfondos (' + found.backgrounds.length + ')'} summary={found.backgrounds.some(incomplete) ? found.backgrounds.filter(incomplete).length + ' por completar: ' + found.backgrounds.filter(incomplete).map((b) => b.n).join(', ') : found.backgrounds.map((b) => b.n).join(', ')}>
            {found.backgrounds.map((b, i) => (
              <div key={b.id} className={incomplete(b) ? 'sub lib-bg warn-border' : 'sub lib-bg'}>
                <b>{b.n}{incomplete(b) && <span className="warn small"> · falta: {missing(b)}</span>}</b>
                <div className="chips" role="group" aria-label={'Características de ' + b.n}>
                  {ABILS.map((a) => <button key={a} className={b.abil.includes(a) ? 'chip on' : 'chip'} aria-pressed={b.abil.includes(a)} onClick={() => setBg(i, { abil: b.abil.includes(a) ? b.abil.filter((x) => x !== a) : [...b.abil, a] })}>{ABIL_N[a]}</button>)}
                </div>
                <div className="row3">
                  {[0, 1].map((k) => (
                    <div key={k} className="field"><label htmlFor={'lb-s' + k + b.id}>Habilidad {k + 1}</label>
                      <select id={'lb-s' + k + b.id} className="input" value={b.skills[k] || ''} onChange={(e) => { const s = b.skills.slice(); s[k] = e.target.value; setBg(i, { skills: s.filter(Boolean) }); }}>
                        <option value="">—</option>
                        {data && Object.entries(data.skills).map(([key, n]) => <option key={key} value={key}>{n}</option>)}
                      </select></div>
                  ))}
                  <div className="field"><label htmlFor={'lb-f' + b.id}>Dote de origen</label>
                    <select id={'lb-f' + b.id} className="input" value={b.feat} onChange={(e) => setBg(i, { feat: e.target.value })}>
                      <option value="">—</option>
                      {[...new Set([b.feat, ...originFeats].filter(Boolean))].map((n) => <option key={n}>{n}</option>)}
                    </select></div>
                </div>
              </div>
            ))}
          </Picker>
          <Picker open={found.subclasses.some((s) => / sin título /.test(s.n))} title={'Subclases (' + found.subclasses.length + ')'} summary={found.subclasses.some((s) => / sin título /.test(s.n)) ? 'pon nombre a ' + found.subclasses.filter((s) => / sin título /.test(s.n)).length + ' sin título' : found.subclasses.map((s) => s.n).join(', ')}>
            <ul className="lib-list">
              {found.subclasses.map((s, i) => (
                <li key={s.id + i}>
                  {/ sin título /.test(s.n) || renaming === i
                    ? <input className="input" aria-label={'Nombre de la subclase de ' + CLASS_N[s.cls]} defaultValue={/ sin título /.test(s.n) ? '' : s.n} placeholder={'Nombre (subclase de ' + (CLASS_N[s.cls] || s.cls) + ')'} onBlur={(e) => { const n = e.target.value.trim(); if (n) setFound({ ...found, subclasses: found.subclasses.map((x, j) => (j === i ? { ...x, n } : x)) }); setRenaming(null); }} />
                    : <button className="gen-link" title="Cambiar el nombre" onClick={() => setRenaming(i)}>{s.n}</button>}
                  <span className="muted small"> {CLASS_N[s.cls] || s.cls} · rasgos de nivel {[...new Set(s.f.map((f) => f.lv))].join(', ')}{/ sin título /.test(s.n) ? ' · el PDF no deja leer su título: escríbelo' : ''}</span>
                </li>
              ))}
            </ul>
          </Picker>
          <Picker title={'Dotes (' + found.feats.length + ')'} summary={found.feats.slice(0, 12).map((f) => f.n).join(', ') + (found.feats.length > 12 ? '…' : '')}>
            <ul className="lib-list">{found.feats.map((f) => <li key={f.id}>{f.n} <span className="muted small">{CAT_N[f.cat]}{f.req ? ' · ' + f.req : ''}</span></li>)}</ul>
          </Picker>
          <Picker title={'Conjuros (' + found.spells.length + ')'} summary={found.spells.slice(0, 12).map((s) => s.n).join(', ') + (found.spells.length > 12 ? '…' : '')}>
            <ul className="lib-list">{found.spells.map((s) => <li key={s.id}>{s.n} <span className="muted small">{s.l ? 'nivel ' + s.l : 'truco'} · {s.esc}</span></li>)}</ul>
          </Picker>
        </div>
      )}
    </div>
  );
}
