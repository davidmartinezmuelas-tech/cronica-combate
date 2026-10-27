import { useEffect, useState } from 'react';
import { CONDITIONS, DMG_TYPES } from '../../data/constants';
import { ABILS, type Abil } from '../../data/player';
import type { LibSpell } from '../../engine/bookImport';
import { validDice } from '../../engine/homebrew';
import type { SpellRoll } from '../../engine/spellRoll';
import { norm, uid } from '../../engine/util';
import { useLibrary } from '../../store/library';
import { usePlayer } from '../../store/player';
import { useStore } from '../../store/useStore';

const ABIL_N: Record<Abil, string> = { str: 'Fuerza', dex: 'Destreza', con: 'Constitución', int: 'Inteligencia', wis: 'Sabiduría', cha: 'Carisma' };
const SCHOOLS = ['Abjuración', 'Adivinación', 'Conjuración', 'Encantamiento', 'Evocación', 'Ilusión', 'Nigromancia', 'Transmutación'];
const NONE: SpellRoll = { attack: null, save: null, half: false, damage: null, heal: null, count: 1, cantrip: null, upDice: '', upCount: false };

/** Borrador de la ficha: lo que se escribe (componentes por separado y la tirada como una opción). */
interface Draft extends LibSpell { roll: 'none' | 'melee' | 'ranged' | 'save'; cv: boolean; cs: boolean; cm: boolean; mat: string; dmgDice: string; dmgType: string; dmgMod: boolean; healDice: string; healMod: boolean }

const toDraft = (s: LibSpell): Draft => {
  const r = s.sr || NONE;
  const m = /M \(([^)]*)\)/.exec(s.cmp);
  return {
    ...s, roll: r.attack === 'cuerpo a cuerpo' ? 'melee' : r.attack === 'a distancia' ? 'ranged' : r.save ? 'save' : 'none',
    cv: /\bV\b/.test(s.cmp), cs: /\bS\b/.test(s.cmp), cm: /\bM\b/.test(s.cmp), mat: m ? m[1] : '',
    dmgDice: r.damage ? r.damage.dice + (r.damage.flat ? '+' + r.damage.flat : '') : '', dmgType: r.damage?.type || '', dmgMod: !!r.damage?.mod,
    healDice: r.heal?.dice || '', healMod: !!r.heal?.mod,
  };
};
const blank = (): Draft => toDraft({ id: 'own-sp-' + uid(), n: '', l: 1, esc: 'Evocación', classes: [], ct: 'Acción', r: '60 pies', cmp: 'V, S', du: 'Instantáneo', c: 0, rit: 0, t: '', own: true, sr: NONE });

/** De la ficha a un conjuro de la biblioteca con sus tiradas. */
function fromDraft(d: Draft): LibSpell {
  const dm = /^(\d*d\d+)(?:\+(\d+))?$/.exec(d.dmgDice);
  const sr: SpellRoll = {
    attack: d.roll === 'melee' ? 'cuerpo a cuerpo' : d.roll === 'ranged' ? 'a distancia' : null,
    save: d.roll === 'save' ? d.sr?.save || 'dex' : null,
    half: d.roll === 'save' && !!d.sr?.half,
    damage: d.dmgDice ? { dice: dm ? dm[1] : d.dmgDice, flat: dm?.[2] ? parseInt(dm[2], 10) : 0, type: d.dmgType, mod: d.dmgMod } : null,
    heal: d.healDice ? { dice: d.healDice, mod: d.healMod } : null,
    count: Math.max(1, d.sr?.count || 1),
    cantrip: d.l === 0 ? d.sr?.cantrip || null : null,
    upDice: d.l > 0 ? d.sr?.upDice || '' : '',
    upCount: d.l > 0 && !!d.sr?.upCount,
  };
  const cmp = [d.cv && 'V', d.cs && 'S', d.cm && 'M' + (d.mat.trim() ? ' (' + d.mat.trim() + ')' : '')].filter(Boolean).join(', ');
  return { id: d.id, n: d.n.trim(), l: d.l, esc: d.esc, classes: d.classes, ct: d.ct, r: d.r, cmp, du: d.du, c: d.c, rit: d.rit, t: d.t, own: true, sr, ...(d.roll === 'save' && d.cond ? { cond: d.cond } : {}), ...(d.self?.on && (d.self.ac || d.self.temp || d.self.hpMax || d.self.speed || d.self.resist) ? { self: d.self } : {}) };
}

/** Mis creaciones: conjuros propios, con lo que hacen al lanzarlos (ataque o salvación, daño, curación, mejora). */
export default function HomebrewSpells() {
  const lib = useLibrary();
  const data = usePlayer((s) => s.data);
  const rules = useStore((s) => s.rules);
  const [d, setD] = useState<Draft | null>(null);
  const [confirmDel, setConfirmDel] = useState('');
  const own = lib.spells.filter((s) => s.own && !s.guest);
  const casters = (data?.classes || []).filter((k) => k.caster !== 'none');
  // las reglas, para no repetir el nombre de un conjuro del SRD
  useEffect(() => { void useStore.getState().loadRules(); }, []);

  if (!d) {
    return (
      <div className="hb-spells">
        <h3 className="eyebrow">Conjuros propios</h3>
        {own.length > 0 && (
          <ul className="hb-list">
            {own.map((s) => (
              <li key={s.id}>
                <span><b>{s.n}</b> <span className="muted small">{s.l ? 'nivel ' + s.l : 'truco'} · {s.esc}{s.classes.length ? ' · ' + s.classes.map((k) => casters.find((x) => x.id === k)?.n || k).join(', ') : ''}</span></span>
                <span className="rollrow">
                  <button className="btn small" onClick={() => setD(toDraft(s))}>Editar</button>
                  <button className="btn small ghost danger" onClick={() => { if (confirmDel === s.id) { void lib.save({ spells: lib.spells.filter((x) => x.id !== s.id) }); setConfirmDel(''); } else setConfirmDel(s.id); }}>{confirmDel === s.id ? '¿Seguro? Borrar' : 'Borrar'}</button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <button className="btn small primary" style={{ alignSelf: 'flex-start' }} onClick={() => setD(blank())}>Crear conjuro</button>
      </div>
    );
  }

  const put = (p: Partial<Draft>) => setD({ ...d, ...p });
  const putR = (p: Partial<SpellRoll>) => setD({ ...d, sr: { ...(d.sr || NONE), ...p } });
  const clash = !!d.n.trim() && ((rules || []).some((e) => e.cat === 'Conjuros' && norm(e.n) === norm(d.n)) || lib.spells.some((s) => s.id !== d.id && norm(s.n) === norm(d.n)));
  const bad = [d.dmgDice, d.healDice, d.sr?.upDice || '', d.self?.temp || ''].some((x) => x && !validDice(x));
  const putS = (p: Partial<NonNullable<Draft['self']>>) => setD({ ...d, self: { on: d.self?.on || 'self', ...(d.self || {}), ...p } });
  const ok = !!d.n.trim() && !clash && !bad;
  const save = () => { if (!ok) return; void lib.save({ spells: [...lib.spells.filter((s) => s.id !== d.id), fromDraft(d)] }); setD(null); };

  return (
    <div className="hb-edit hb-spell" aria-label="Conjuro propio">
      <div className="panel-head">
        <h3 className="hb-title">{d.n || 'Conjuro nuevo'}</h3>
        <span className="rollrow">
          <button className="btn small primary" disabled={!ok} onClick={save}>Guardar</button>
          <button className="btn small ghost" onClick={() => setD(null)}>Cancelar</button>
        </span>
      </div>
      <div className="row2">
        <div className="field"><label htmlFor="hs-n">Nombre del conjuro</label><input id="hs-n" className="input" value={d.n} onChange={(e) => put({ n: e.target.value })} /></div>
        <div className="row2">
          <div className="field"><label htmlFor="hs-l">Nivel</label>
            <select id="hs-l" className="input" value={d.l} onChange={(e) => put({ l: parseInt(e.target.value, 10) })}>
              {Array.from({ length: 10 }, (_, i) => <option key={i} value={i}>{i ? 'Nivel ' + i : 'Truco'}</option>)}
            </select></div>
          <div className="field"><label htmlFor="hs-e">Escuela</label>
            <select id="hs-e" className="input" value={d.esc} onChange={(e) => put({ esc: e.target.value })}>{SCHOOLS.map((x) => <option key={x}>{x}</option>)}</select></div>
        </div>
      </div>
      {clash && <p className="warn small" style={{ margin: 0 }}>Ya hay un conjuro con ese nombre: ponle otro.</p>}
      <div className="field"><span className="hb-lab">Listas de clase (en cuáles sale para preparar)</span>
        <div className="chips">{casters.map((k) => <button key={k.id} className={d.classes.includes(k.id) ? 'chip on' : 'chip'} aria-pressed={d.classes.includes(k.id)} onClick={() => put({ classes: d.classes.includes(k.id) ? d.classes.filter((x) => x !== k.id) : [...d.classes, k.id] })}>{k.n}</button>)}</div>
      </div>
      <div className="hb-grid">
        <div className="field"><label htmlFor="hs-ct">Tiempo de lanzamiento</label><input id="hs-ct" className="input" value={d.ct} onChange={(e) => put({ ct: e.target.value })} /></div>
        <div className="field"><label htmlFor="hs-r">Alcance o área</label><input id="hs-r" className="input" value={d.r} placeholder="60 pies; Uno mismo (cono de 15 pies)" onChange={(e) => put({ r: e.target.value })} /></div>
        <div className="field"><label htmlFor="hs-du">Duración</label><input id="hs-du" className="input" value={d.du} onChange={(e) => put({ du: e.target.value })} /></div>
      </div>
      <div className="rollrow">
        <label className="check small"><input type="checkbox" checked={d.cv} onChange={(e) => put({ cv: e.target.checked })} />V</label>
        <label className="check small"><input type="checkbox" checked={d.cs} onChange={(e) => put({ cs: e.target.checked })} />S</label>
        <label className="check small"><input type="checkbox" checked={d.cm} onChange={(e) => put({ cm: e.target.checked })} />M</label>
        {d.cm && <input className="input hb-mat" aria-label="Componente material" value={d.mat} placeholder="una pluma de halcón" onChange={(e) => put({ mat: e.target.value })} />}
        <label className="check small"><input type="checkbox" checked={!!d.c} onChange={(e) => put({ c: e.target.checked ? 1 : 0 })} />Concentración</label>
        <label className="check small"><input type="checkbox" checked={!!d.rit} onChange={(e) => put({ rit: e.target.checked ? 1 : 0 })} />Ritual</label>
      </div>
      <div className="field"><label htmlFor="hs-t">Descripción</label><textarea id="hs-t" className="input" rows={3} value={d.t} onChange={(e) => put({ t: e.target.value })} /></div>

      <fieldset className="fs hb-level">
        <legend>Al lanzarlo</legend>
        <div className="hb-grid">
          <div className="field"><label htmlFor="hs-roll">Tirada</label>
            <select id="hs-roll" className="input" value={d.roll} onChange={(e) => put({ roll: e.target.value as Draft['roll'] })}>
              <option value="none">Sin tirada (impacta solo o cura)</option>
              <option value="melee">Ataque de conjuro cuerpo a cuerpo</option>
              <option value="ranged">Ataque de conjuro a distancia</option>
              <option value="save">Salvación del objetivo</option>
            </select></div>
          {d.roll === 'save' && <div className="field"><label htmlFor="hs-sv">Salvación de</label>
            <select id="hs-sv" className="input" value={d.sr?.save || 'dex'} onChange={(e) => putR({ save: e.target.value as Abil })}>{ABILS.map((a) => <option key={a} value={a}>{ABIL_N[a]}</option>)}</select></div>}
          {d.roll === 'save' && <div className="field"><label htmlFor="hs-co">Estado si falla</label>
            <select id="hs-co" className="input" value={d.cond || ''} onChange={(e) => put({ cond: e.target.value || undefined })}><option value="">Ninguno</option>{CONDITIONS.map(([n]) => <option key={n}>{n}</option>)}</select></div>}
        </div>
        {d.roll === 'save' && <label className="check small"><input type="checkbox" checked={!!d.sr?.half} onChange={(e) => putR({ half: e.target.checked })} />Mitad de daño si la supera</label>}
        <div className="hb-grid">
          <div className="field"><label htmlFor="hs-dmg">Daño</label><input id="hs-dmg" className="input" value={d.dmgDice} placeholder="3d6" onChange={(e) => put({ dmgDice: e.target.value.replace(/\s+/g, '') })} /></div>
          <div className="field"><label htmlFor="hs-ty">Tipo de daño</label>
            <select id="hs-ty" className="input" value={d.dmgType} onChange={(e) => put({ dmgType: e.target.value })}><option value="">Sin tipo</option>{DMG_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
          <div className="field"><label htmlFor="hs-n2">Impactos (rayos, dardos)</label><input id="hs-n2" className="input" type="number" min={1} max={10} value={d.sr?.count || 1} onChange={(e) => putR({ count: Math.max(1, parseInt(e.target.value, 10) || 1) })} /></div>
          <div className="field"><label htmlFor="hs-h">Curación</label><input id="hs-h" className="input" value={d.healDice} placeholder="2d8" onChange={(e) => put({ healDice: e.target.value.replace(/\s+/g, '') })} /></div>
        </div>
        <div className="rollrow">
          <label className="check small"><input type="checkbox" checked={d.dmgMod} onChange={(e) => put({ dmgMod: e.target.checked })} />Sumar tu modificador al daño</label>
          <label className="check small"><input type="checkbox" checked={d.healMod} onChange={(e) => put({ healMod: e.target.checked })} />Sumar tu modificador a la curación</label>
        </div>
        {d.l === 0 ? (
          <div className="field"><label htmlFor="hs-ct0">Mejora del truco (niveles 5, 11 y 17)</label>
            <select id="hs-ct0" className="input" value={d.sr?.cantrip || ''} onChange={(e) => putR({ cantrip: (e.target.value || null) as SpellRoll['cantrip'] })}>
              <option value="">No mejora</option><option value="dice">Más dados de daño</option><option value="count">Más impactos</option>
            </select></div>
        ) : (
          <div className="hb-grid">
            <div className="field"><label htmlFor="hs-up">Con un espacio superior, por cada nivel: más daño</label><input id="hs-up" className="input" value={d.sr?.upDice || ''} placeholder="1d6" onChange={(e) => putR({ upDice: e.target.value.replace(/\s+/g, '') })} /></div>
            <label className="check small"><input type="checkbox" checked={!!d.sr?.upCount} onChange={(e) => putR({ upCount: e.target.checked })} />…o un impacto más</label>
          </div>
        )}
        {bad && <p className="warn small" style={{ margin: 0 }}>Escribe los dados como 2d6, 1d8+2 o 5.</p>}
      </fieldset>

      <fieldset className="fs hb-level">
        <legend>Efecto sobre quien lo recibe (opcional)</legend>
        <p className="muted small" style={{ margin: 0 }}>Como Escudo de fe o Auxilio: se aplica a la hoja al lanzarlo («Lanzar sobre mí» o, en la sala, sobre otros) y se quita al acabar o al perder la concentración.</p>
        <div className="hb-grid">
          <div className="field"><label htmlFor="hs-on">Sobre quién</label>
            <select id="hs-on" className="input" value={d.self?.on || ''} onChange={(e) => (e.target.value ? putS({ on: e.target.value as 'self' | 'any' }) : setD({ ...d, self: undefined }))}>
              <option value="">Ninguno</option><option value="self">Solo sobre ti</option><option value="any">Sobre ti o un aliado</option>
            </select></div>
          {d.self?.on && <>
            <div className="field"><label htmlFor="hs-ac">CA</label><input id="hs-ac" className="input" type="number" value={d.self.ac ?? ''} placeholder="+2" onChange={(e) => putS({ ac: parseInt(e.target.value, 10) || undefined })} /></div>
            <div className="field"><label htmlFor="hs-tmp">PG temporales</label><input id="hs-tmp" className="input" value={d.self.temp || ''} placeholder="2d4+4" onChange={(e) => putS({ temp: e.target.value.replace(/\s+/g, '') || undefined })} /></div>
            <div className="field"><label htmlFor="hs-hp">PG máximos</label><input id="hs-hp" className="input" type="number" value={d.self.hpMax ?? ''} placeholder="+5" onChange={(e) => putS({ hpMax: parseInt(e.target.value, 10) || undefined })} /></div>
            <div className="field"><label htmlFor="hs-spd">Velocidad (pies)</label><input id="hs-spd" className="input" type="number" step={5} value={d.self.speed ?? ''} placeholder="+10" onChange={(e) => putS({ speed: parseInt(e.target.value, 10) || undefined })} /></div>
            <div className="field"><label htmlFor="hs-res">Resistencia</label>
              <select id="hs-res" className="input" value={d.self.resist || ''} onChange={(e) => putS({ resist: e.target.value || undefined })}><option value="">Ninguna</option>{DMG_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
          </>}
        </div>
        {d.self?.on && d.self.temp && <label className="check small"><input type="checkbox" checked={!!d.self.tempMod} onChange={(e) => putS({ tempMod: e.target.checked })} />Sumar tu modificador a los PG temporales</label>}
      </fieldset>
      <div className="rollrow">
        <button className="btn primary" disabled={!ok} onClick={save}>Guardar conjuro</button>
        <button className="btn ghost" onClick={() => setD(null)}>Cancelar</button>
      </div>
    </div>
  );
}
