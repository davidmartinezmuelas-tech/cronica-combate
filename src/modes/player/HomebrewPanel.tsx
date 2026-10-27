import { useState } from 'react';
import { ABILS, type Abil, type Uses } from '../../data/player';
import { CONDITIONS, DMG_TYPES } from '../../data/constants';
import type { LibSubclass } from '../../engine/bookImport';
import { validDice, type HbFx } from '../../engine/homebrew';
import { norm, uid } from '../../engine/util';
import { useLibrary } from '../../store/library';
import { usePlayer } from '../../store/player';
import HomebrewSpells from './HomebrewSpells';
import { useSpells } from './spells';

const ABIL_N: Record<Abil, string> = { str: 'Fuerza', dex: 'Destreza', con: 'Constitución', int: 'Inteligencia', wis: 'Sabiduría', cha: 'Carisma' };
type Feature = LibSubclass['f'][number];

const KINDS: [HbFx['kind'] | '', string][] = [['', 'Solo texto'], ['attack', 'Tirada de ataque'], ['save', 'Salvación con tu CD'], ['heal', 'Curación'], ['temp', 'PG temporales'], ['hit', 'Daño extra al golpear'], ['bonus', 'Bonificador fijo']];
const ABIL_OPTS: [NonNullable<HbFx['abil']>, string][] = [['str', 'Fuerza'], ['dex', 'Destreza'], ['best', 'La mejor de Fuerza y Destreza'], ['spell', 'Tu característica de conjuros'], ['con', 'Constitución'], ['int', 'Inteligencia'], ['wis', 'Sabiduría'], ['cha', 'Carisma']];

/** Conjuros que un rasgo deja siempre preparados (del SRD, del libro o propios), desde el nivel del rasgo. */
function SpellPick({ id, ids, set }: { id: string; ids: string[]; set: (ids: string[]) => void }) {
  const spells = useSpells();
  const [q, setQ] = useState('');
  const found = q.trim().length < 2 ? [] : spells.list.filter((x) => !ids.includes(x.id) && norm(x.n).includes(norm(q))).slice(0, 8);
  return (
    <div className="hb-sp">
      <div className="field"><label htmlFor={id + 'sp'}>Conjuros siempre preparados (opcional)</label>
        <input id={id + 'sp'} className="input" value={q} placeholder="Busca un conjuro…" onChange={(e) => setQ(e.target.value)} /></div>
      {found.length > 0 && <div className="chips">{found.map((x) => <button key={x.id} className="chip" onClick={() => { set([...ids, x.id]); setQ(''); }}>+ {x.n} <span className="chip-tag">{x.l ? x.l : 'T'}</span></button>)}</div>}
      {ids.length > 0 && <div className="chips">{ids.map((k) => <button key={k} className="chip on" title="Quitar" onClick={() => set(ids.filter((x) => x !== k))}>{spells.get(k)?.n || k} ✕</button>)}</div>}
    </div>
  );
}

/** El efecto de un rasgo propio: lo que la hoja sabe tirar o sumar (ataque, salvación, curación, daño extra, bonificador). */
export function FxEditor({ id, fx, set }: { id: string; fx: HbFx | undefined; set: (fx: HbFx | undefined) => void }) {
  const k = fx?.kind || '';
  const put = (patch: Partial<HbFx>) => set({ ...(fx as HbFx), ...patch });
  const dice = (label: string) => (
    <div className="field"><label htmlFor={id + 'dmg'}>{label}</label>
      <input id={id + 'dmg'} className="input" value={fx?.dmg || ''} placeholder="2d6" onChange={(e) => put({ dmg: e.target.value.replace(/\s+/g, '') })} /></div>
  );
  const abil = (label: string) => (
    <div className="field"><label htmlFor={id + 'ab'}>{label}</label>
      <select id={id + 'ab'} className="input" value={fx?.abil || 'str'} onChange={(e) => put({ abil: e.target.value as HbFx['abil'] })}>
        {ABIL_OPTS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
      </select></div>
  );
  const type = (
    <div className="field"><label htmlFor={id + 'ty'}>Tipo de daño</label>
      <select id={id + 'ty'} className="input" value={fx?.type || ''} onChange={(e) => put({ type: e.target.value })}>
        <option value="">Sin tipo</option>{DMG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select></div>
  );
  const addMod = <label className="check small"><input type="checkbox" checked={!!fx?.addMod} onChange={(e) => put({ addMod: e.target.checked })} />Sumar el modificador</label>;
  const badDice = !!fx?.dmg && !validDice(fx.dmg);
  return (
    <div className="hb-fx">
      <div className="field"><label htmlFor={id + 'k'}>Efecto en la hoja</label>
        <select id={id + 'k'} className="input" value={k} onChange={(e) => {
          const v = e.target.value as HbFx['kind'] | '';
          set(v ? { kind: v, abil: v === 'save' || v === 'heal' || v === 'temp' ? 'spell' : 'str', ...(v === 'save' ? { save: 'dex', half: true } : {}) } : undefined);
        }}>
          {KINDS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
        </select></div>
      {k === 'attack' && <>{abil('Característica del ataque')}{dice('Daño')}{type}{addMod}</>}
      {k === 'save' && <>
        {abil('Característica de la CD')}
        <div className="field"><label htmlFor={id + 'sv'}>Salvación del objetivo</label>
          <select id={id + 'sv'} className="input" value={fx?.save || 'dex'} onChange={(e) => put({ save: e.target.value as HbFx['save'] })}>
            {ABILS.map((a) => <option key={a} value={a}>{ABIL_N[a]}</option>)}
          </select></div>
        {dice('Daño (opcional)')}{type}
        <label className="check small"><input type="checkbox" checked={!!fx?.half} onChange={(e) => put({ half: e.target.checked })} />Mitad de daño si la supera</label>
        <div className="field"><label htmlFor={id + 'co'}>Estado si falla</label>
          <select id={id + 'co'} className="input" value={fx?.cond || ''} onChange={(e) => put({ cond: e.target.value || undefined })}>
            <option value="">Ninguno</option>{CONDITIONS.map(([n]) => <option key={n} value={n}>{n}</option>)}
          </select></div>
      </>}
      {(k === 'heal' || k === 'temp') && <>{dice(k === 'heal' ? 'Cura' : 'PG temporales')}{abil('Característica')}{addMod}</>}
      {k === 'hit' && <>{dice('Daño extra')}{type}{abil('Característica')}{addMod}</>}
      {k === 'bonus' && <>
        <div className="field"><label htmlFor={id + 'ac'}>CA</label><input id={id + 'ac'} className="input" type="number" value={fx?.ac ?? ''} placeholder="+1" onChange={(e) => put({ ac: parseInt(e.target.value, 10) || undefined })} /></div>
        <div className="field"><label htmlFor={id + 'sp'}>Velocidad (pies)</label><input id={id + 'sp'} className="input" type="number" step={5} value={fx?.speed ?? ''} placeholder="+10" onChange={(e) => put({ speed: parseInt(e.target.value, 10) || undefined })} /></div>
        <div className="field"><label htmlFor={id + 're'}>Resistencia</label>
          <select id={id + 're'} className="input" value={fx?.resist || ''} onChange={(e) => put({ resist: e.target.value || undefined })}>
            <option value="">Ninguna</option>{DMG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select></div>
      </>}
      {badDice && <p className="warn small" style={{ margin: 0 }}>Escribe los dados como 2d6, 1d8+2 o 5.</p>}
    </div>
  );
}

/** Usos de un rasgo propio, en la forma de los datos de la app («2», «@prof», «max(1, @abilities.cha.mod)»). */
type UseKind = '' | 'n' | 'pb' | 'mod';
const kindOf = (u?: Uses): { k: UseKind; n: number; a: Abil } => {
  if (!u) return { k: '', n: 1, a: 'cha' };
  if (u.max === '@prof') return { k: 'pb', n: 1, a: 'cha' };
  const m = /@abilities\.(\w+)\.mod/.exec(u.max);
  if (m) return { k: 'mod', n: 1, a: m[1] as Abil };
  return { k: 'n', n: parseInt(u.max, 10) || 1, a: 'cha' };
};
const usesOf = (k: UseKind, n: number, a: Abil, per: string): Uses | undefined =>
  k === 'n' ? { max: String(Math.max(1, Math.min(10, n))), per } : k === 'pb' ? { max: '@prof', per } : k === 'mod' ? { max: 'max(1, @abilities.' + a + '.mod)', per } : undefined;

/**
 * Mis creaciones: subclases propias (homebrew o de otros libros) escritas a mano, nivel a nivel. Se guardan en la
 * biblioteca (y, con cuenta, en la nube) como una subclase más, así que el editor, la subida de nivel y la hoja las usan igual.
 */
export default function HomebrewPanel() {
  const lib = useLibrary();
  const data = usePlayer((s) => s.data);
  const [draft, setDraft] = useState<LibSubclass | null>(null);
  const [confirmDel, setConfirmDel] = useState('');
  const [extraLv, setExtraLv] = useState(1);
  const own = lib.subclasses.filter((s) => s.own && !s.guest);
  const classes = data?.classes || [];
  const clsName = (id: string) => classes.find((k) => k.id === id)?.n || id;

  const save = () => {
    if (!draft || !draft.n.trim()) return;
    const clean: LibSubclass = { ...draft, n: draft.n.trim(), own: true, f: draft.f.filter((f) => f.n.trim()).sort((a, b) => a.lv - b.lv) };
    void lib.save({ subclasses: [...lib.subclasses.filter((s) => s.id !== clean.id), clean] });
    setDraft(null);
  };

  if (!draft) {
    return (
      <div className="panel" aria-label="Mis creaciones">
        <div className="panel-head"><h2>Mis creaciones</h2></div>
        <p className="muted small" style={{ margin: 0 }}>Subclases y conjuros propios, de tu mesa o de otros libros: escribe sus rasgos nivel a nivel o lo que hace el conjuro, y funcionarán en el personaje como los demás. Se guardan en este dispositivo y, si tienes cuenta, también en la nube para tenerlas en todos tus dispositivos. Van en «Exportar biblioteca» para pasárselas a tu grupo.</p>
        <h3 className="eyebrow">Subclases propias</h3>
        {own.length > 0 && (
          <ul className="hb-list">
            {own.map((s) => (
              <li key={s.id}>
                <span><b>{s.n}</b> <span className="muted small">subclase de {clsName(s.cls)} · {s.f.length} {s.f.length === 1 ? 'rasgo' : 'rasgos'}</span></span>
                <span className="rollrow">
                  <button className="btn small" onClick={() => setDraft(s)}>Editar</button>
                  <button className="btn small ghost danger" onClick={() => { if (confirmDel === s.id) { void lib.save({ subclasses: lib.subclasses.filter((x) => x.id !== s.id) }); setConfirmDel(''); } else setConfirmDel(s.id); }}>{confirmDel === s.id ? '¿Seguro? Borrar' : 'Borrar'}</button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <button className="btn small" style={{ alignSelf: 'flex-start' }} disabled={!classes.length} onClick={() => setDraft({ id: 'own-' + uid(), n: '', cls: classes[0]?.id || '', d: '', f: [], own: true })}>Crear subclase</button>
        <HomebrewSpells />
      </div>
    );
  }

  const cls = classes.find((k) => k.id === draft.cls);
  // los niveles en que la clase gana rasgos de subclase (los de su subclase del SRD) y los que ya tengan rasgos
  const levels = [...new Set([...(cls?.sub?.f.map((f) => f.lv) || [3]), ...draft.f.map((f) => f.lv)])].sort((a, b) => a - b);
  const setF = (i: number, patch: Partial<Feature>) => setDraft({ ...draft, f: draft.f.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const add = (lv: number) => setDraft({ ...draft, f: [...draft.f, { lv, n: '', d: '' }] });
  const taken = lib.subclasses.some((s) => s.id !== draft.id && s.cls === draft.cls && norm(s.n) === norm(draft.n)) || (!!cls?.sub && norm(cls.sub.n) === norm(draft.n));

  return (
    <div className="panel hb-edit" aria-label="Subclase propia">
      <div className="panel-head">
        <h2>{draft.n || 'Subclase nueva'}</h2>
        <span className="rollrow">
          <button className="btn small primary" disabled={!draft.n.trim() || taken} onClick={save}>Guardar</button>
          <button className="btn small ghost" onClick={() => setDraft(null)}>Cancelar</button>
        </span>
      </div>
      <div className="row2">
        <div className="field"><label htmlFor="hb-cls">Clase</label>
          <select id="hb-cls" className="input" value={draft.cls} onChange={(e) => setDraft({ ...draft, cls: e.target.value })}>
            {classes.map((k) => <option key={k.id} value={k.id}>{k.n}</option>)}
          </select></div>
        <div className="field"><label htmlFor="hb-n">Nombre de la subclase</label>
          <input id="hb-n" className="input" value={draft.n} placeholder="Juramento del Alba, Colegio de las Sombras…" onChange={(e) => setDraft({ ...draft, n: e.target.value })} /></div>
      </div>
      {taken && <p className="warn small" style={{ margin: 0 }}>Ya hay una subclase de {clsName(draft.cls)} con ese nombre.</p>}
      <div className="field"><label htmlFor="hb-d">Descripción (opcional)</label>
        <textarea id="hb-d" className="input" rows={2} value={draft.d} onChange={(e) => setDraft({ ...draft, d: e.target.value })} /></div>
      <p className="muted small" style={{ margin: 0 }}>Si ya la lleva algún personaje y le cambias el nombre, vuelve a elegirla en su «Editar hoja».</p>

      {levels.map((lv) => (
        <fieldset key={lv} className="fs hb-level">
          <legend>Nivel {lv}</legend>
          {draft.f.map((f, i) => f.lv !== lv ? null : (
            <div key={i} className="hb-feat">
              <div className="field"><label htmlFor={'hb-fn' + i}>Rasgo</label>
                <input id={'hb-fn' + i} className="input" value={f.n} placeholder="Nombre del rasgo" onChange={(e) => setF(i, { n: e.target.value })} /></div>
              <div className="field"><label htmlFor={'hb-fd' + i}>Qué hace</label>
                <textarea id={'hb-fd' + i} className="input" rows={3} value={f.d} onChange={(e) => setF(i, { d: e.target.value })} /></div>
              {(() => {
                const u = kindOf(f.u);
                const per = f.u?.per || 'lr';
                return (
                  <div className="hb-uses">
                    <div className="field"><label htmlFor={'hb-fu' + i}>Usos</label>
                      <select id={'hb-fu' + i} className="input" value={u.k} onChange={(e) => setF(i, { u: usesOf(e.target.value as UseKind, u.n, u.a, per) })}>
                        <option value="">Sin límite</option>
                        <option value="n">Un número fijo</option>
                        <option value="pb">Tu bono de competencia</option>
                        <option value="mod">Tu modificador de…</option>
                      </select></div>
                    {u.k === 'n' && <div className="field"><label htmlFor={'hb-fun' + i}>Cuántos</label>
                      <input id={'hb-fun' + i} className="input" type="number" min={1} max={10} value={u.n} onChange={(e) => setF(i, { u: usesOf('n', parseInt(e.target.value, 10) || 1, u.a, per) })} /></div>}
                    {u.k === 'mod' && <div className="field"><label htmlFor={'hb-fua' + i}>Característica</label>
                      <select id={'hb-fua' + i} className="input" value={u.a} onChange={(e) => setF(i, { u: usesOf('mod', u.n, e.target.value as Abil, per) })}>
                        {ABILS.map((a) => <option key={a} value={a}>{ABIL_N[a]}</option>)}
                      </select></div>}
                    {u.k && <div className="field"><label htmlFor={'hb-fup' + i}>Se recuperan</label>
                      <select id={'hb-fup' + i} className="input" value={per} onChange={(e) => setF(i, { u: usesOf(u.k, u.n, u.a, e.target.value) })}>
                        <option value="sr">En un descanso corto o largo</option>
                        <option value="lr">En un descanso largo</option>
                      </select></div>}
                    <button className="btn small ghost" onClick={() => setDraft({ ...draft, f: draft.f.filter((_, j) => j !== i) })}>Quitar rasgo</button>
                  </div>
                );
              })()}
              <FxEditor id={'hb' + i} fx={f.fx} set={(fx) => setF(i, { fx })} />
              <SpellPick id={'hb' + i} ids={f.sp || []} set={(sp) => setF(i, { sp: sp.length ? sp : undefined })} />
            </div>
          ))}
          <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => add(lv)}>+ Rasgo de nivel {lv}</button>
        </fieldset>
      ))}
      <div className="rollrow">
        <label className="field hb-extra">Otro nivel
          <input className="input" type="number" min={1} max={20} value={extraLv} onChange={(e) => setExtraLv(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))} />
        </label>
        <button className="btn small" onClick={() => add(extraLv)}>+ Rasgo en ese nivel</button>
      </div>
      <div className="rollrow">
        <button className="btn primary" disabled={!draft.n.trim() || taken} onClick={save}>Guardar subclase</button>
        <button className="btn ghost" onClick={() => setDraft(null)}>Cancelar</button>
      </div>
    </div>
  );
}
