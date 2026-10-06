import { useMemo, useState } from 'react';
import { ABILS, type Abil } from '../../data/player';
import { derive, mod, weaponFromData, type Character, type CharWeapon } from '../../engine/character';
import { fmt } from '../../engine/dice';
import { uid } from '../../engine/util';
import Picker from '../../shared/Picker';
import { usePlayer } from '../../store/player';
import { useStore } from '../../store/useStore';
import { spellMatches } from './CharacterSheet';

const ABIL_N: Record<Abil, string> = { str: 'Fuerza', dex: 'Destreza', con: 'Constitución', int: 'Inteligencia', wis: 'Sabiduría', cha: 'Carisma' };
const STANDARD = [15, 14, 13, 12, 10, 8];
/** Coste de la compra de puntos (27 puntos, puntuaciones de 8 a 15). */
const POINT_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
const DMG_TYPES = ['contundente', 'cortante', 'perforante', 'ácido', 'frío', 'fuego', 'fuerza', 'necrótico', 'psíquico', 'radiante', 'relámpago', 'trueno', 'veneno'];

/** Crear o editar la hoja: cada cambio se guarda al momento; lo calculable se calcula solo. */
export default function CharacterEditor({ c }: { c: Character }) {
  const data = usePlayer((s) => s.data);
  const { update, remove, setEditing } = usePlayer.getState();
  const spellsDb = useStore((s) => s.spells);
  const [confirmDel, setConfirmDel] = useState(false);
  const [weaponPick, setWeaponPick] = useState('');
  const [spellQ, setSpellQ] = useState('');
  const set = (patch: Partial<Character>) => update(c.id, patch);
  const d = useMemo(() => derive(c, data), [c, data]);
  const cls = d.cls;
  const bg = data?.backgrounds.find((x) => x.id === c.backgroundId);

  if (!data) return <div className="panel"><p className="muted" style={{ margin: 0 }}>Cargando clases, especies y equipo…</p></div>;

  const setAbil = (a: Abil, v: number) => set({ abil: { ...c.abil, [a]: Math.max(1, Math.min(30, v || 1)) } });
  const points = ABILS.reduce((t, a) => t + (POINT_COST[c.abil[a]] ?? NaN), 0);
  // matriz estándar: las puntuaciones altas a las características principales de la clase, luego Constitución
  const standard = () => {
    const order = [...(cls?.primary || []), ...(['con', 'dex', 'wis', 'cha', 'int', 'str'] as Abil[])].filter((a, i, arr) => arr.indexOf(a) === i);
    set({ abil: Object.fromEntries(order.map((a, i) => [a, STANDARD[i]])) as Record<Abil, number> });
  };
  // al llegar al nivel de subclase se propone la del SRD (se puede cambiar por otra escribiéndola)
  const setLevel = (v: number) => {
    const level = Math.max(1, Math.min(20, v || 1));
    set({ level, subclass: !c.subclass && cls?.sub && level >= cls.sub.lv ? cls.sub.n : c.subclass });
  };
  const chooseClass = (id: string) => {
    const k = data.classes.find((x) => x.id === id);
    const keep = c.skills.filter((s) => bg?.skills.includes(s));
    set({ classId: id, className: '', subclass: k?.sub && c.level >= k.sub.lv ? k.sub.n : c.subclass, skills: keep, hp: c.hp || 0 });
  };
  const chooseBackground = (id: string) => {
    const b = data.backgrounds.find((x) => x.id === id);
    const old = data.backgrounds.find((x) => x.id === c.backgroundId);
    const skills = c.skills.filter((s) => !old?.skills.includes(s)).concat(b?.skills || []).filter((s, i, a) => a.indexOf(s) === i);
    const feats = c.feats.filter((f) => f !== old?.feat).concat(b?.feat && !c.feats.includes(b.feat) ? [b.feat] : []);
    set({ backgroundId: id, backgroundName: '', skills, feats });
  };
  const pool = cls ? (cls.skills.pool.includes('*') ? Object.keys(data.skills) : cls.skills.pool) : [];
  const fromBg = new Set(bg?.skills || []);
  const classPicked = c.skills.filter((s) => !fromBg.has(s) && pool.includes(s)).length;
  const toggleSkill = (k: string) => set({ skills: c.skills.includes(k) ? c.skills.filter((x) => x !== k) : [...c.skills, k], expertise: c.expertise.filter((x) => x !== k || !c.skills.includes(k)) });
  const toggleExp = (k: string) => set({ expertise: c.expertise.includes(k) ? c.expertise.filter((x) => x !== k) : [...c.expertise, k] });
  const addWeapon = () => {
    const w = data.weapons.find((x) => x.id === weaponPick);
    if (w) set({ weapons: [...c.weapons, weaponFromData(w, cls)] });
    else if (weaponPick === 'custom') set({ weapons: [...c.weapons, { id: 'w-' + uid(), name: 'Arma', dmg: '1d6', type: 'contundente', abil: 'auto', kind: 'melee', finesse: false, prof: true, bonus: 0 }] });
    setWeaponPick('');
  };
  const setWeapon = (id: string, patch: Partial<CharWeapon>) => set({ weapons: c.weapons.map((w) => (w.id === id ? { ...w, ...patch } : w)) });
  const spellResults = spellQ.trim().length >= 2
    ? Object.entries(spellsDb).filter(([k, s]) => !c.spells.includes(k) && spellMatches(spellQ, s.n, s.en)).sort((a, b) => a[1].l - b[1].l || a[1].n.localeCompare(b[1].n, 'es')).slice(0, 12)
    : [];
  const finish = () => {
    // al terminar de crear, empieza con los PG al máximo
    if (!c.hp) set({ hp: d.hpMax });
    setEditing(false);
  };

  return (
    <div className="pc">
      <div className="panel">
        <div className="panel-head">
          <h2>{c.name ? 'Editar a ' + c.name : 'Nuevo personaje'}</h2>
          <button className="btn small primary" onClick={finish}>Listo</button>
        </div>
        <p className="muted small" style={{ margin: 0 }}>Los cambios se guardan solos. Lo que se puede calcular (CA, PG, salvaciones, habilidades, ataques, CD de conjuros) se calcula a partir de lo que elijas; abajo puedes ajustar cualquier número a mano.</p>

        <fieldset className="fs">
          <legend>Identidad</legend>
          <div className="row2">
            <div className="field"><label htmlFor="ce-name">Nombre del personaje</label><input id="ce-name" className="input" value={c.name} onChange={(e) => set({ name: e.target.value })} /></div>
            <div className="field"><label htmlFor="ce-player">Jugador</label><input id="ce-player" className="input" value={c.player} onChange={(e) => set({ player: e.target.value })} /></div>
          </div>
          <div className="row2">
            <div className="field"><label htmlFor="ce-sp">Especie</label>
              <select id="ce-sp" className="input" value={c.speciesId} onChange={(e) => set({ speciesId: e.target.value })}>
                <option value="">Otra (escríbela)</option>
                {data.species.map((s) => <option key={s.id} value={s.id}>{s.n}</option>)}
              </select></div>
            {!c.speciesId && <div className="field"><label htmlFor="ce-spn">Nombre de la especie</label><input id="ce-spn" className="input" value={c.speciesName} onChange={(e) => set({ speciesName: e.target.value })} /></div>}
          </div>
          <div className="row-name">
            <div className="field"><label htmlFor="ce-cls">Clase</label>
              <select id="ce-cls" className="input" value={c.classId} onChange={(e) => chooseClass(e.target.value)}>
                <option value="">Otra (escríbela)</option>
                {data.classes.map((k) => <option key={k.id} value={k.id}>{k.n}</option>)}
              </select></div>
            <div className="field"><label htmlFor="ce-lvl">Nivel</label><input id="ce-lvl" className="input" type="number" min={1} max={20} value={c.level} onChange={(e) => setLevel(parseInt(e.target.value, 10))} /></div>
          </div>
          {!c.classId && <div className="field"><label htmlFor="ce-clsn">Nombre de la clase</label><input id="ce-clsn" className="input" value={c.className} onChange={(e) => set({ className: e.target.value })} /></div>}
          <div className="field"><label htmlFor="ce-sub">Subclase{cls?.sub ? ' (desde el nivel ' + cls.sub.lv + '; la del SRD es ' + cls.sub.n + ')' : ''}</label>
            <input id="ce-sub" className="input" value={c.subclass} onChange={(e) => set({ subclass: e.target.value })} placeholder={cls?.sub?.n || ''} /></div>
          <div className="field"><label htmlFor="ce-bg">Trasfondo</label>
            <select id="ce-bg" className="input" value={c.backgroundId} onChange={(e) => chooseBackground(e.target.value)}>
              <option value="">Otro (escríbelo)</option>
              {data.backgrounds.map((b) => <option key={b.id} value={b.id}>{b.n}</option>)}
            </select></div>
          {!c.backgroundId && <div className="field"><label htmlFor="ce-bgn">Nombre del trasfondo</label><input id="ce-bgn" className="input" value={c.backgroundName} onChange={(e) => set({ backgroundName: e.target.value })} /></div>}
          {bg && <p className="muted small" style={{ margin: 0 }}>{bg.n}: +2 a una y +1 a otra (o +1 a las tres) entre {bg.abil.map((a) => ABIL_N[a]).join(', ')}; competencia en {bg.skills.map((s) => data.skills[s]).join(' y ')}; dote {bg.feat}.</p>}
        </fieldset>

        <fieldset className="fs">
          <legend>Características</legend>
          <div className="row3 abil-grid">
            {ABILS.map((a) => (
              <div key={a} className="abil-edit">
                <label htmlFor={'ce-ab-' + a}>{ABIL_N[a].slice(0, 3).toUpperCase()}</label>
                <input id={'ce-ab-' + a} type="number" min={1} max={30} className="input" value={c.abil[a]} onChange={(e) => setAbil(a, parseInt(e.target.value, 10))} />
                <span className="muted small">{fmt(mod(c.abil[a]))}{d.saves[a].prof ? ' · salv.' : ''}</span>
              </div>
            ))}
          </div>
          <div className="rollrow">
            <button className="btn small" onClick={standard}>Matriz estándar (15, 14, 13, 12, 10, 8)</button>
            <span className="muted small">{Number.isNaN(points) ? 'Compra de puntos: fuera de 8–15' : 'Compra de puntos: ' + points + ' de 27'}</span>
          </div>
          <span className="muted small">Suma aquí los bonificadores del trasfondo.</span>
        </fieldset>

        <fieldset className="fs">
          <legend>Habilidades</legend>
          <span className="muted small">{cls ? cls.n + ': elige ' + cls.skills.count + (cls.skills.pool.includes('*') ? ' cualesquiera' : '') + ' (llevas ' + classPicked + ').' : ''}{bg ? ' El trasfondo ya da ' + bg.skills.map((s) => data.skills[s]).join(' y ') + '.' : ''} Marca «P» para pericia.</span>
          <div className="ce-skills">
            {Object.keys(data.skills).sort((a, b) => data.skills[a].localeCompare(data.skills[b], 'es')).map((k) => (
              <span key={k} className={pool.includes(k) || fromBg.has(k) ? 'ce-skill suggest' : 'ce-skill'}>
                <label className="check"><input type="checkbox" checked={c.skills.includes(k)} onChange={() => toggleSkill(k)} />{data.skills[k]}</label>
                {c.skills.includes(k) && <button className={c.expertise.includes(k) ? 'ts on' : 'ts'} aria-pressed={c.expertise.includes(k)} aria-label={'Pericia en ' + data.skills[k]} onClick={() => toggleExp(k)}>P</button>}
              </span>
            ))}
          </div>
        </fieldset>

        <fieldset className="fs">
          <legend>Equipo</legend>
          <div className="row2">
            <div className="field"><label htmlFor="ce-armor">Armadura</label>
              <select id="ce-armor" className="input" value={c.armorId} onChange={(e) => set({ armorId: e.target.value })}>
                <option value="">Sin armadura</option>
                {data.armor.filter((a) => a.type !== 'shl').map((a) => <option key={a.id} value={a.id}>{a.n} (CA {a.ac}{a.dex == null ? ' + Des' : a.dex ? ' + Des máx. ' + a.dex : ''})</option>)}
              </select></div>
            <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={c.shield} onChange={(e) => set({ shield: e.target.checked })} />Escudo (+2 CA)</label>
          </div>
          <span className="muted small">CA calculada: {d.ac} ({d.acNote}).</span>
          <div className="rollrow">
            <select className="input" aria-label="Arma para añadir" value={weaponPick} onChange={(e) => setWeaponPick(e.target.value)} style={{ flex: '1 1 200px', width: 'auto' }}>
              <option value="">Añadir arma…</option>
              <option value="custom">Arma o ataque propio</option>
              {data.weapons.map((w) => <option key={w.id} value={w.id}>{w.n} ({w.dmg} {w.type})</option>)}
            </select>
            <button className="btn small" disabled={!weaponPick} onClick={addWeapon}>Añadir</button>
          </div>
          {c.weapons.map((w) => (
            <div key={w.id} className="sub ce-weapon">
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div className="field" style={{ flex: 1 }}><label htmlFor={'cw-n-' + w.id}>Nombre</label><input id={'cw-n-' + w.id} className="input" value={w.name} onChange={(e) => setWeapon(w.id, { name: e.target.value })} /></div>
                <button className="btn small ghost" onClick={() => set({ weapons: c.weapons.filter((x) => x.id !== w.id) })}>Quitar</button>
              </div>
              <div className="row4f">
                <div className="field"><label htmlFor={'cw-d-' + w.id}>Daño</label><input id={'cw-d-' + w.id} className="input" value={w.dmg} onChange={(e) => setWeapon(w.id, { dmg: e.target.value })} /></div>
                <div className="field"><label htmlFor={'cw-t-' + w.id}>Tipo</label><select id={'cw-t-' + w.id} className="input" value={w.type} onChange={(e) => setWeapon(w.id, { type: e.target.value })}>{DMG_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
                <div className="field"><label htmlFor={'cw-a-' + w.id}>Característica</label><select id={'cw-a-' + w.id} className="input" value={w.abil} onChange={(e) => setWeapon(w.id, { abil: e.target.value as CharWeapon['abil'] })}><option value="auto">Automática</option>{ABILS.map((a) => <option key={a} value={a}>{ABIL_N[a]}</option>)}</select></div>
                <div className="field"><label htmlFor={'cw-b-' + w.id}>Bonif. mágico</label><input id={'cw-b-' + w.id} className="input" type="number" value={w.bonus} onChange={(e) => setWeapon(w.id, { bonus: parseInt(e.target.value, 10) || 0 })} /></div>
              </div>
              <label className="check"><input type="checkbox" checked={w.prof} onChange={(e) => setWeapon(w.id, { prof: e.target.checked })} />Competente</label>
            </div>
          ))}
        </fieldset>

        <fieldset className="fs">
          <legend>Conjuros y dotes</legend>
          <div className="field"><label htmlFor="ce-spq">Añadir conjuro (escribe al menos 2 letras)</label>
            <input id="ce-spq" className="input" value={spellQ} onChange={(e) => setSpellQ(e.target.value)} placeholder="Bola de fuego, Curar heridas…" /></div>
          {spellResults.length > 0 && (
            <div className="chips">{spellResults.map(([k, s]) => <button key={k} className="chip" onClick={() => { set({ spells: [...c.spells, k] }); setSpellQ(''); }}>+ {s.n} <span className="chip-tag">{s.l || 'T'}</span></button>)}</div>
          )}
          {c.spells.length > 0 && (
            <div className="chips">{c.spells.map((k) => <button key={k} className="chip on" title="Quitar" onClick={() => set({ spells: c.spells.filter((x) => x !== k) })}>{spellsDb[k]?.n || k} ✕</button>)}</div>
          )}
          <Picker title="Dotes" summary={c.feats.join(', ')}>
            <div className="chips">
              {data.feats.map((f) => <button key={f.id} className={c.feats.includes(f.n) ? 'chip on' : 'chip'} aria-pressed={c.feats.includes(f.n)} onClick={() => set({ feats: c.feats.includes(f.n) ? c.feats.filter((x) => x !== f.n) : [...c.feats, f.n] })}>{f.n}</button>)}
            </div>
          </Picker>
        </fieldset>

        <fieldset className="fs">
          <legend>Ajustes a mano</legend>
          <span className="muted small">Déjalos vacíos para usar el cálculo. Útil para objetos mágicos o rasgos que la app no aplica sola.</span>
          <div className="row4f">
            {([['ac', 'CA', d.ac], ['hpMax', 'PG máx.', d.hpMax], ['init', 'Iniciativa', d.init], ['speed', 'Velocidad', d.speed]] as const).map(([k, label, calc]) => (
              <div key={k} className="field"><label htmlFor={'ov-' + k}>{label}</label>
                <input id={'ov-' + k} className="input" type="number" value={c.ov[k] ?? ''} placeholder={String(calc)} onChange={(e) => { const v = e.target.value === '' ? undefined : parseInt(e.target.value, 10); const ov = { ...c.ov }; if (v == null || Number.isNaN(v)) delete ov[k]; else ov[k] = v; set({ ov }); }} /></div>
            ))}
          </div>
        </fieldset>

        <div className="rollrow" style={{ justifyContent: 'space-between' }}>
          <button className="btn primary" onClick={finish}>Listo</button>
          <button className="btn small ghost" onClick={() => { if (confirmDel) remove(c.id); else setConfirmDel(true); }}>{confirmDel ? '¿Seguro? Borrar personaje' : 'Borrar personaje'}</button>
        </div>
      </div>
    </div>
  );
}
