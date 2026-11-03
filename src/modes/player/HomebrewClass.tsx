import { useState } from 'react';
import { ABILS, type Abil } from '../../data/player';
import type { LibClass, LibClassFeature } from '../../engine/bookImport';
import { norm } from '../../engine/util';
import { usePlayer } from '../../store/player';
import { FeatureFields, fmtTable, parseTable } from './HomebrewPanel';

const ABIL_N: Record<Abil, string> = { str: 'Fuerza', dex: 'Destreza', con: 'Constitución', int: 'Inteligencia', wis: 'Sabiduría', cha: 'Carisma' };
const ARMOR: [string, string][] = [['lgt', 'Ligera'], ['med', 'Media'], ['hvy', 'Pesada'], ['shl', 'Escudos']];
const WEAPONS: [string, string][] = [['sim', 'Armas sencillas'], ['mar', 'Armas marciales']];
const HIT_DICE = [6, 8, 10, 12];
const CASTER: [LibClass['caster'], string][] = [['none', 'No lanza conjuros'], ['full', 'Completo (como el Mago)'], ['half', 'La mitad (como el Paladín)'], ['third', 'Un tercio (como el Caballero arcano)'], ['pact', 'Magia de pacto (como el Brujo)']];

export const slug = (s: string) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Clase en blanco para empezar a escribirla. */
export const blankClass = (id: string): LibClass => ({ id, n: '', en: '', hd: 8, saves: [], skills: { count: 2, pool: ['*'] }, armor: [], weapons: ['sim'], caster: 'none', spellAb: '', primary: [], asi: [4, 8, 12, 16, 19], f: [], sc: {}, sub: null, d: '', spells: [], subLv: 3, own: true });

/** El nombre de la tabla de usos de un rasgo: «id.nombre-del-rasgo». */
const scaleOf = (cls: LibClass, i: number) => cls.id + '.' + (slug(cls.f[i]?.n || '') || 'rasgo-' + i);

/** Deja la clase lista para guardar: rasgos limpios, las tablas de usos pasadas a `sc` y las de conjuros en sus claves. */
export function cleanClass(d: LibClass, castTxt: { c: string; p: string }): LibClass {
  const f = d.f.filter((x) => x.n.trim()).sort((a, b) => a.lv - b.lv);
  const sc: LibClass['sc'] = {};
  const feats: LibClassFeature[] = f.map((x, i) => {
    if (!x.u?.max.startsWith('@scale.')) { const { t: _t, ...rest } = x; return rest; }
    const key = d.id + '.' + (slug(x.n) || 'rasgo-' + i);
    sc[key] = parseTable(x.t || '');
    return { ...x, u: { ...x.u, max: '@scale.' + key } };
  });
  const casts = d.caster !== 'none';
  if (casts) { sc[d.id + '.cantrips-known'] = parseTable(castTxt.c); sc[d.id + '.max-prepared'] = parseTable(castTxt.p); }
  const asi = [...new Set(d.asi.filter((n) => n >= 1 && n <= 20))].sort((a, b) => a - b);
  return { ...d, n: d.n.trim(), en: d.n.trim(), f: feats, sc, asi, spellAb: casts ? d.spellAb || d.primary[0] || 'int' : '', ...(casts ? {} : { listFrom: undefined }) };
}

export const castTextOf = (c: LibClass) => ({ c: fmtTable(c.sc[c.id + '.cantrips-known'] as Record<number, number>), p: fmtTable(c.sc[c.id + '.max-prepared'] as Record<number, number>) });

/**
 * Formulario de una clase propia (o importada de otro libro): dado de golpe, competencias, lanzamiento de conjuros y
 * rasgos nivel a nivel, con tablas de usos por nivel. La guarda HomebrewPanel en la biblioteca como una clase más.
 */
export default function HomebrewClass({ draft, setDraft, castTxt, setCastTxt, taken, onSave, onCancel }: {
  draft: LibClass; setDraft: (c: LibClass) => void; castTxt: { c: string; p: string }; setCastTxt: (t: { c: string; p: string }) => void;
  taken: boolean; onSave: () => void; onCancel: () => void;
}) {
  const data = usePlayer((s) => s.data);
  const [extraLv, setExtraLv] = useState(1);
  const skills = Object.entries(data?.skills || {});
  const listers = (data?.classes || []).filter((k) => k.spells.length > 0 && k.id !== draft.id);
  const put = (patch: Partial<LibClass>) => setDraft({ ...draft, ...patch });
  const setF = (i: number, patch: Partial<LibClassFeature>) => setDraft({ ...draft, f: draft.f.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const add = (lv: number) => setDraft({ ...draft, f: [...draft.f, { lv, n: '', d: '' }] });
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const levels = [...new Set([1, 2, 3, ...draft.f.map((f) => f.lv)])].sort((a, b) => a - b);
  const anySkill = draft.skills.pool.includes('*');
  const casts = draft.caster !== 'none';
  const valid = !!draft.n.trim() && !taken;

  return (
    <div className="panel hb-edit" aria-label="Clase propia">
      <div className="panel-head">
        <h2>{draft.n || 'Clase nueva'}</h2>
        <span className="rollrow">
          <button className="btn small primary" disabled={!valid} onClick={onSave}>Guardar</button>
          <button className="btn small ghost" onClick={onCancel}>Cancelar</button>
        </span>
      </div>
      <div className="field"><label htmlFor="hc-n">Nombre de la clase</label>
        <input id="hc-n" className="input" value={draft.n} placeholder="Chamán, Cazador de demonios…" onChange={(e) => put({ n: e.target.value })} /></div>
      {taken && <p className="warn small" style={{ margin: 0 }}>Ya hay una clase con ese nombre.</p>}
      <div className="field"><label htmlFor="hc-d">Descripción (opcional)</label>
        <textarea id="hc-d" className="input" rows={2} value={draft.d} onChange={(e) => put({ d: e.target.value })} /></div>

      <fieldset className="fs hb-level">
        <legend>Rasgos básicos</legend>
        <div className="row2">
          <div className="field"><label htmlFor="hc-hd">Dado de golpe</label>
            <select id="hc-hd" className="input" value={draft.hd} onChange={(e) => put({ hd: parseInt(e.target.value, 10) })}>
              {HIT_DICE.map((h) => <option key={h} value={h}>d{h}</option>)}
            </select></div>
          <div className="field"><label htmlFor="hc-sl">Subclase desde el nivel</label>
            <input id="hc-sl" className="input" type="number" min={1} max={20} value={draft.subLv ?? 3} onChange={(e) => put({ subLv: Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 3)) })} /></div>
        </div>
        <div role="group" aria-label="Características principales" className="chips">
          <span className="muted small">Características principales</span>
          {ABILS.map((a) => <button key={a} className={'chip' + (draft.primary.includes(a) ? ' on' : '')} aria-pressed={draft.primary.includes(a)} onClick={() => put({ primary: toggle(draft.primary, a) })}>{ABIL_N[a]}</button>)}
        </div>
        <div role="group" aria-label="Salvaciones con competencia" className="chips">
          <span className="muted small">Salvaciones</span>
          {ABILS.map((a) => <button key={a} className={'chip' + (draft.saves.includes(a) ? ' on' : '')} aria-pressed={draft.saves.includes(a)} onClick={() => put({ saves: toggle(draft.saves, a) })}>{ABIL_N[a]}</button>)}
        </div>
        <div role="group" aria-label="Armaduras" className="chips">
          <span className="muted small">Armaduras</span>
          {ARMOR.map(([k, n]) => <button key={k} className={'chip' + (draft.armor.includes(k) ? ' on' : '')} aria-pressed={draft.armor.includes(k)} onClick={() => put({ armor: toggle(draft.armor, k) })}>{n}</button>)}
        </div>
        <div role="group" aria-label="Armas" className="chips">
          <span className="muted small">Armas</span>
          {WEAPONS.map(([k, n]) => <button key={k} className={'chip' + (draft.weapons.includes(k) ? ' on' : '')} aria-pressed={draft.weapons.includes(k)} onClick={() => put({ weapons: toggle(draft.weapons, k) })}>{n}</button>)}
        </div>
        <div className="field"><label htmlFor="hc-asi">Niveles con mejora de característica</label>
          <input id="hc-asi" className="input" value={draft.asi.join(', ')} placeholder="4, 8, 12, 16, 19"
            onChange={(e) => put({ asi: e.target.value.split(/[,\s]+/).map((x) => parseInt(x, 10)).filter((n) => n >= 1 && n <= 20) })} /></div>
      </fieldset>

      <fieldset className="fs hb-level">
        <legend>Habilidades</legend>
        <div className="row2">
          <div className="field"><label htmlFor="hc-sc">Cuántas elige</label>
            <input id="hc-sc" className="input" type="number" min={0} max={6} value={draft.skills.count} onChange={(e) => put({ skills: { ...draft.skills, count: Math.max(0, Math.min(6, parseInt(e.target.value, 10) || 0)) } })} /></div>
          <label className="hb-check"><input type="checkbox" checked={anySkill} onChange={(e) => put({ skills: { ...draft.skills, pool: e.target.checked ? ['*'] : [] } })} /> Puede elegir cualquiera</label>
        </div>
        {!anySkill && <div role="group" aria-label="Habilidades de la clase" className="chips">
          {skills.map(([k, n]) => <button key={k} className={'chip' + (draft.skills.pool.includes(k) ? ' on' : '')} aria-pressed={draft.skills.pool.includes(k)} onClick={() => put({ skills: { ...draft.skills, pool: toggle(draft.skills.pool, k) } })}>{n}</button>)}
        </div>}
      </fieldset>

      <fieldset className="fs hb-level">
        <legend>Lanzamiento de conjuros</legend>
        <div className="row2">
          <div className="field"><label htmlFor="hc-cp">Tipo de lanzador</label>
            <select id="hc-cp" className="input" value={draft.caster} onChange={(e) => put({ caster: e.target.value as LibClass['caster'] })}>
              {CASTER.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select></div>
          {casts && <div className="field"><label htmlFor="hc-ca">Característica de lanzamiento</label>
            <select id="hc-ca" className="input" value={draft.spellAb || 'int'} onChange={(e) => put({ spellAb: e.target.value as Abil })}>
              {ABILS.map((a) => <option key={a} value={a}>{ABIL_N[a]}</option>)}
            </select></div>}
        </div>
        {casts && <>
          <div className="field"><label htmlFor="hc-cl">Lista de conjuros de</label>
            <select id="hc-cl" className="input" value={draft.listFrom || ''} onChange={(e) => put({ listFrom: e.target.value || undefined })}>
              <option value="">Ninguna (sin lista propia)</option>
              {listers.map((k) => <option key={k.id} value={k.id}>{k.n}</option>)}
            </select></div>
          <div className="field"><label htmlFor="hc-ct">Trucos por nivel (nivel:cantidad)</label>
            <input id="hc-ct" className="input" value={castTxt.c} placeholder="1:2, 4:3, 10:4" onChange={(e) => setCastTxt({ ...castTxt, c: e.target.value })} /></div>
          <div className="field"><label htmlFor="hc-cc">Conjuros preparados por nivel (nivel:cantidad)</label>
            <input id="hc-cc" className="input" value={castTxt.p} placeholder="1:2, 2:3, 3:4" onChange={(e) => setCastTxt({ ...castTxt, p: e.target.value })} /></div>
          {!Object.keys(parseTable(castTxt.p)).length && <p className="warn small" style={{ margin: 0 }}>Sin la tabla de preparados, la clase no tendrá conjuros de nivel 1 o más.</p>}
        </>}
      </fieldset>

      {levels.map((lv) => (
        <fieldset key={lv} className="fs hb-level">
          <legend>Nivel {lv}</legend>
          {draft.f.map((f, i) => f.lv !== lv ? null : (
            <FeatureFields key={i} f={f} i={i} scaleKey={scaleOf(draft, i)} tableTxt={f.t} onTable={(t) => setF(i, { t })}
              setF={(patch) => setF(i, patch)} onRemove={() => setDraft({ ...draft, f: draft.f.filter((_, j) => j !== i) })} />
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
        <button className="btn primary" disabled={!valid} onClick={onSave}>Guardar clase</button>
        <button className="btn ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}
