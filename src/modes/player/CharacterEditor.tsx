import { useMemo, useState } from 'react';
import { ABILS, type Abil } from '../../data/player';
import { derive, mod, weaponFromData, type Character, type CharWeapon, type CustomFeat, type FeatCat } from '../../engine/character';
import { fmt } from '../../engine/dice';
import { norm, uid } from '../../engine/util';
import Picker from '../../shared/Picker';
import { useLibrary } from '../../store/library';
import { usePlayer } from '../../store/player';
import { useSpells } from './spells';

const ABIL_N: Record<Abil, string> = { str: 'Fuerza', dex: 'Destreza', con: 'Constitución', int: 'Inteligencia', wis: 'Sabiduría', cha: 'Carisma' };
const STANDARD = [15, 14, 13, 12, 10, 8];
/** Coste de la compra de puntos (27 puntos, puntuaciones de 8 a 15). */
const POINT_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
const DMG_TYPES = ['contundente', 'cortante', 'perforante', 'ácido', 'frío', 'fuego', 'fuerza', 'necrótico', 'psíquico', 'radiante', 'relámpago', 'trueno', 'veneno'];
const FEAT_CATS: [FeatCat, string][] = [['origin', 'Dotes de origen'], ['general', 'Dotes generales'], ['fighting-style', 'Estilos de combate'], ['epic-boon', 'Dones épicos'], ['other', 'Rasgos propios']];
const CAT_ONE: Record<FeatCat, string> = { origin: 'Dote de origen', general: 'Dote general', 'fighting-style': 'Estilo de combate', 'epic-boon': 'Don épico', other: 'Rasgo propio' };
/** Clases con el rasgo Estilo de combate en el SRD. */
const STYLE_CLASSES = ['fighter', 'paladin', 'ranger'];

/** Crear o editar la hoja: cada cambio se guarda al momento; lo calculable se calcula solo. */
export default function CharacterEditor({ c }: { c: Character }) {
  const data = usePlayer((s) => s.data);
  const { update, remove, setEditing } = usePlayer.getState();
  const spellIdx = useSpells();
  const lib = useLibrary();
  const [confirmDel, setConfirmDel] = useState(false);
  const [weaponPick, setWeaponPick] = useState('');
  const [spellQ, setSpellQ] = useState('');
  const [allSpells, setAllSpells] = useState(false);
  const [newFeat, setNewFeat] = useState<CustomFeat | null>(null);
  const set = (patch: Partial<Character>) => update(c.id, patch);
  const d = useMemo(() => derive(c, data), [c, data]);
  const cls = d.cls;
  // subclases: la del SRD, las de la biblioteca propia para esta clase u «Otra»
  const libSubs = lib.subclasses.filter((s) => s.cls === c.classId);
  const subValue = !c.subclass ? '' : cls?.sub && norm(c.subclass) === norm(cls.sub.n) ? 'srd' : libSubs.some((s) => norm(s.n) === norm(c.subclass)) ? 'lib:' + libSubs.find((s) => norm(s.n) === norm(c.subclass))!.n : 'other';
  // trasfondos: los del SRD y los de la biblioteca propia, con la misma forma
  const libBgs = lib.backgrounds.filter((b) => !data?.backgrounds.some((x) => norm(x.n) === norm(b.n)));
  const allBgs = [...(data?.backgrounds || []).map((b) => ({ id: b.id, n: b.n, abil: b.abil, skills: b.skills, feat: b.feat })), ...libBgs.map((b) => ({ id: b.id, n: b.n, abil: b.abil, skills: b.skills, feat: b.feat }))];
  const bg = allBgs.find((x) => x.id === c.backgroundId);
  // dotes: las del SRD y las de la biblioteca (sin duplicar)
  const allFeats: { id: string; n: string; cat: string }[] = [...(data?.feats || []), ...lib.feats.filter((f) => !data?.feats.some((x) => norm(x.n) === norm(f.n)))];

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
    set({ classId: id, className: '', subclass: k?.sub && c.level >= k.sub.lv ? k.sub.n : '', skills: keep });
  };
  const chooseBackground = (id: string) => {
    const b = allBgs.find((x) => x.id === id);
    const old = allBgs.find((x) => x.id === c.backgroundId);
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
    else if (weaponPick === 'custom') set({ weapons: [...c.weapons, { id: 'w-' + uid(), name: 'Arma', dmg: '1d6', type: 'contundente', abil: 'auto', kind: 'melee', finesse: false, prof: true, bonus: 0, extra: [] }] });
    setWeaponPick('');
  };
  const setWeapon = (id: string, patch: Partial<CharWeapon>) => set({ weapons: c.weapons.map((w) => (w.id === id ? { ...w, ...patch } : w)) });

  // conjuros: los de su lista de clase (o todos si se pide o la clase no es del SRD)
  const classList = new Set([...(cls?.spells || []), ...spellIdx.list.filter((s) => cls && s.classes?.includes(cls.id)).map((s) => s.id)]);
  const useClassList = !allSpells && classList.size > 0;
  const spellResults = spellIdx.list
    .filter((s) => !c.spells.includes(s.id) && (!useClassList || classList.has(s.id)))
    .filter((s) => { const q = norm(spellQ); return q.length >= 2 ? norm(s.n).includes(q) || norm(s.en).includes(q) : !q && useClassList; })
    .sort((a, b) => (a.l || 0) - (b.l || 0) || a.n.localeCompare(b.n, 'es'))
    .slice(0, useClassList && !spellQ ? 60 : 16);

  const featGroups = FEAT_CATS.filter(([cat]) => cat !== 'other' && (cat !== 'fighting-style' || STYLE_CLASSES.includes(c.classId) || c.feats.some((f) => allFeats.find((x) => x.n === f)?.cat === cat)) && (cat !== 'epic-boon' || c.level >= 19));
  const toggleFeat = (f: { n: string }) => set({ feats: c.feats.includes(f.n) ? c.feats.filter((x) => x !== f.n) : [...c.feats, f.n] });
  const saveCustomFeat = () => {
    if (!newFeat || !newFeat.n.trim()) return;
    const exists = c.customFeats.some((f) => f.id === newFeat.id);
    set({ customFeats: exists ? c.customFeats.map((f) => (f.id === newFeat.id ? newFeat : f)) : [...c.customFeats, newFeat] });
    setNewFeat(null);
  };
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
        <p className="muted small" style={{ margin: 0 }}>Los cambios se guardan solos. Lo que se puede calcular (CA, PG, salvaciones, habilidades, ataques, CD de conjuros) se calcula a partir de lo que elijas; al final puedes ajustar cualquier número a mano. Las listas traen lo que incluye el SRD 5.2.1 (la parte de las reglas de 2024 de uso libre); lo de otros libros se escribe con «Otro» o como rasgo propio.</p>

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
          <div className="row2">
            <div className="field"><label htmlFor="ce-subsel">Subclase{cls?.sub ? ' (desde el nivel ' + cls.sub.lv + ')' : ''}</label>
              <select id="ce-subsel" className="input" value={subValue} onChange={(e) => { const v = e.target.value; set({ subclass: v === 'srd' ? cls?.sub?.n || '' : v === 'other' ? (subValue === 'other' ? c.subclass : 'Otra subclase') : v.startsWith('lib:') ? v.slice(4) : '' }); }}>
                <option value="">Sin subclase</option>
                {cls?.sub && <option value="srd">{cls.sub.n}</option>}
                {libSubs.map((s) => <option key={s.id} value={'lib:' + s.n}>{s.n}</option>)}
                <option value="other">Otra (escríbela)</option>
              </select></div>
            {subValue === 'other' && <div className="field"><label htmlFor="ce-sub">Nombre de la subclase</label><input id="ce-sub" className="input" value={c.subclass} onChange={(e) => set({ subclass: e.target.value })} /></div>}
          </div>
          {cls?.sub && !libSubs.length && <span className="muted small">El SRD solo incluye una subclase por clase ({cls.sub.n}). Las demás de tu libro puedes añadirlas en «Biblioteca»; si eliges otra, sus rasgos los añades abajo como rasgos propios.</span>}
          <div className="row2">
            <div className="field"><label htmlFor="ce-bg">Trasfondo</label>
              <select id="ce-bg" className="input" value={c.backgroundId} onChange={(e) => chooseBackground(e.target.value)}>
                <option value="">Otro (escríbelo)</option>
                <optgroup label="SRD">{data.backgrounds.map((b) => <option key={b.id} value={b.id}>{b.n}</option>)}</optgroup>
                {libBgs.length > 0 && <optgroup label="Tu biblioteca">{libBgs.map((b) => <option key={b.id} value={b.id}>{b.n}</option>)}</optgroup>}
              </select></div>
            {!c.backgroundId && <div className="field"><label htmlFor="ce-bgn">Nombre del trasfondo</label><input id="ce-bgn" className="input" value={c.backgroundName} onChange={(e) => set({ backgroundName: e.target.value })} /></div>}
          </div>
          {bg ? <p className="muted small" style={{ margin: 0 }}>{bg.n}: +2 a una y +1 a otra (o +1 a las tres) entre {bg.abil.map((a) => ABIL_N[a]).join(', ')}; competencia en {bg.skills.map((s) => data.skills[s]).join(' y ')}; dote de origen {bg.feat}.</p>
            : <p className="muted small" style={{ margin: 0 }}>Cualquier clase puede llevar cualquier trasfondo. El SRD solo trae cuatro (Acólito, Criminal, Sabio y Soldado); los de tu libro puedes añadirlos en «Biblioteca». Con otro, marca tú sus habilidades y elige o escribe su dote de origen abajo.</p>}
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
          <span className="muted small">Suma aquí los bonificadores del trasfondo y las mejoras de característica.</span>
        </fieldset>

        <fieldset className="fs">
          <legend>Habilidades</legend>
          <span className="muted small">{cls ? cls.n + ': elige ' + cls.skills.count + (cls.skills.pool.includes('*') ? ' cualesquiera' : ' de las resaltadas') + ' (llevas ' + classPicked + ').' : ''}{bg ? ' El trasfondo ya da ' + bg.skills.map((s) => data.skills[s]).join(' y ') + '.' : ''} Marca «P» para pericia.</span>
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
          <legend>Armadura</legend>
          <div className="row2">
            <div className="field"><label htmlFor="ce-armor">Armadura</label>
              <select id="ce-armor" className="input" value={c.armorId} onChange={(e) => set({ armorId: e.target.value })}>
                <option value="">Sin armadura</option>
                {data.armor.filter((a) => a.type !== 'shl').map((a) => <option key={a.id} value={a.id}>{a.n} (CA {a.ac}{a.dex == null ? ' + Des' : a.dex ? ' + Des máx. ' + a.dex : ''})</option>)}
                <option value="custom">Personalizada (de otro libro o hecha por el máster)</option>
              </select></div>
            <div className="field"><label htmlFor="ce-armorb">Bonif. mágico de la armadura</label><input id="ce-armorb" className="input" type="number" value={c.armorBonus} onChange={(e) => set({ armorBonus: parseInt(e.target.value, 10) || 0 })} /></div>
          </div>
          {c.armorId === 'custom' && (
            <div className="row4f">
              <div className="field"><label htmlFor="ce-arn">Nombre</label><input id="ce-arn" className="input" value={c.armorCustom.name} onChange={(e) => set({ armorCustom: { ...c.armorCustom, name: e.target.value } })} /></div>
              <div className="field"><label htmlFor="ce-arc">CA base</label><input id="ce-arc" className="input" type="number" value={c.armorCustom.ac} onChange={(e) => set({ armorCustom: { ...c.armorCustom, ac: parseInt(e.target.value, 10) || 10 } })} /></div>
              <div className="field"><label htmlFor="ce-ard">Destreza</label>
                <select id="ce-ard" className="input" value={c.armorCustom.dex == null ? 'all' : String(c.armorCustom.dex)} onChange={(e) => set({ armorCustom: { ...c.armorCustom, dex: e.target.value === 'all' ? null : parseInt(e.target.value, 10) } })}>
                  <option value="all">Suma toda (ligera)</option><option value="2">Máx. +2 (intermedia)</option><option value="0">No suma (pesada)</option>
                </select></div>
            </div>
          )}
          <div className="row2">
            <label className="check"><input type="checkbox" checked={c.shield} onChange={(e) => set({ shield: e.target.checked })} />Escudo (+2 CA)</label>
            {c.shield && <div className="field"><label htmlFor="ce-shb">Bonif. mágico del escudo</label><input id="ce-shb" className="input" type="number" value={c.shieldBonus} onChange={(e) => set({ shieldBonus: parseInt(e.target.value, 10) || 0 })} /></div>}
          </div>
          <span className="muted small">CA calculada: {d.ac} ({d.acNote}).</span>
        </fieldset>

        <fieldset className="fs">
          <legend>Armas y ataques</legend>
          <div className="rollrow">
            <select className="input" aria-label="Arma para añadir" value={weaponPick} onChange={(e) => setWeaponPick(e.target.value)} style={{ flex: '1 1 200px', width: 'auto' }}>
              <option value="">Añadir arma…</option>
              <option value="custom">Arma mágica o personalizada</option>
              {data.weapons.map((w) => <option key={w.id} value={w.id}>{w.n} ({w.dmg} {w.type})</option>)}
            </select>
            <button className="btn small" disabled={!weaponPick} onClick={addWeapon}>Añadir</button>
          </div>
          <span className="muted small">Cualquier arma se puede cambiar: nombre, daño, bonificador mágico y daños extra (p. ej. una espada flamígera: 1d8 cortante + 1d6 fuego).</span>
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
              {(w.extra || []).map((x, i) => (
                <div key={i} className="row4f">
                  <div className="field"><label htmlFor={'cw-xd-' + w.id + i}>Daño extra</label><input id={'cw-xd-' + w.id + i} className="input" value={x.dmg} onChange={(e) => setWeapon(w.id, { extra: (w.extra || []).map((y, j) => (j === i ? { ...y, dmg: e.target.value } : y)) })} /></div>
                  <div className="field"><label htmlFor={'cw-xt-' + w.id + i}>Tipo</label><select id={'cw-xt-' + w.id + i} className="input" value={x.type} onChange={(e) => setWeapon(w.id, { extra: (w.extra || []).map((y, j) => (j === i ? { ...y, type: e.target.value } : y)) })}>{DMG_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
                  <button className="btn small ghost" style={{ alignSelf: 'end' }} onClick={() => setWeapon(w.id, { extra: (w.extra || []).filter((_, j) => j !== i) })}>Quitar daño</button>
                </div>
              ))}
              <div className="rollrow">
                <button className="btn small" onClick={() => setWeapon(w.id, { extra: [...(w.extra || []), { dmg: '1d6', type: 'fuego' }] })}>+ Daño extra</button>
                <label className="check"><input type="checkbox" checked={w.prof} onChange={(e) => setWeapon(w.id, { prof: e.target.checked })} />Competente</label>
                <label className="check"><input type="checkbox" checked={w.kind === 'ranged'} onChange={(e) => setWeapon(w.id, { kind: e.target.checked ? 'ranged' : 'melee' })} />A distancia</label>
                <label className="check"><input type="checkbox" checked={w.finesse} onChange={(e) => setWeapon(w.id, { finesse: e.target.checked })} />Sutil</label>
              </div>
            </div>
          ))}
        </fieldset>

        <fieldset className="fs">
          <legend>Conjuros</legend>
          <div className="field"><label htmlFor="ce-spq">Buscar conjuro{useClassList ? ' de la lista de ' + cls!.n : ''}</label>
            <input id="ce-spq" className="input" value={spellQ} onChange={(e) => setSpellQ(e.target.value)} placeholder="Castigo divino, Bola de fuego, Curar heridas…" /></div>
          <div className="rollrow">
            {classList.size > 0 && <label className="check"><input type="checkbox" checked={allSpells} onChange={(e) => setAllSpells(e.target.checked)} />Mostrar conjuros de otras clases</label>}
            {!spellIdx.loaded && <span className="muted small">Cargando conjuros…</span>}
          </div>
          {spellResults.length > 0 && (
            <div className="chips ce-spell-results">{spellResults.map((s) => <button key={s.id} className="chip" onClick={() => { set({ spells: [...c.spells, s.id] }); setSpellQ(''); }}>+ {s.n} <span className="chip-tag">{s.l ? s.l : 'T'}</span></button>)}</div>
          )}
          {c.spells.length > 0 && (
            <div className="chips">{c.spells.map((k) => <button key={k} className="chip on" title="Quitar" onClick={() => set({ spells: c.spells.filter((x) => x !== k) })}>{spellIdx.get(k)?.n || k} ✕</button>)}</div>
          )}
        </fieldset>

        <fieldset className="fs">
          <legend>Dotes, estilos de combate y rasgos propios</legend>
          <span className="muted small">{lib.feats.length ? 'Dotes del SRD y de tu biblioteca.' : 'El SRD trae 4 dotes de origen, 2 generales, 4 estilos de combate y 7 dones épicos. Las de tu libro puedes añadirlas en «Biblioteca» o aquí como dote propia.'}</span>
          {featGroups.map(([cat, title]) => {
            const list = allFeats.filter((f) => f.cat === cat).sort((a, b) => a.n.localeCompare(b.n, 'es'));
            const mine = c.feats.filter((n) => list.some((f) => f.n === n)).concat(c.customFeats.filter((f) => f.cat === cat).map((f) => f.n));
            return (
              <Picker key={cat} title={title} summary={mine.join(', ')}>
                <div className="chips">
                  {list.map((f) => <button key={f.id} className={c.feats.includes(f.n) ? 'chip on' : 'chip'} aria-pressed={c.feats.includes(f.n)} onClick={() => toggleFeat(f)}>{f.n}</button>)}
                </div>
              </Picker>
            );
          })}
          {c.customFeats.length > 0 && (
            <ul className="pc-features">
              {c.customFeats.map((f) => (
                <li key={f.id} className="ce-custom">
                  <span><b>{f.n}</b> <span className="muted small">{CAT_ONE[f.cat]}{f.max ? ' · ' + f.max + ' usos por descanso ' + (f.per === 'sr' ? 'corto' : 'largo') : ''}</span></span>
                  <span className="rollrow">
                    <button className="btn small ghost" onClick={() => setNewFeat(f)}>Editar</button>
                    <button className="btn small ghost" onClick={() => set({ customFeats: c.customFeats.filter((x) => x.id !== f.id) })}>Quitar</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {newFeat ? (
            <div className="sub">
              <div className="row2">
                <div className="field"><label htmlFor="cf-n">Nombre</label><input id="cf-n" className="input" value={newFeat.n} onChange={(e) => setNewFeat({ ...newFeat, n: e.target.value })} placeholder="Protección, Duro, Ataque divino…" /></div>
                <div className="field"><label htmlFor="cf-c">Tipo</label>
                  <select id="cf-c" className="input" value={newFeat.cat} onChange={(e) => setNewFeat({ ...newFeat, cat: e.target.value as FeatCat })}>{FEAT_CATS.map(([k]) => <option key={k} value={k}>{CAT_ONE[k]}</option>)}</select></div>
              </div>
              <div className="field"><label htmlFor="cf-d">Qué hace</label><textarea id="cf-d" className="input" rows={3} value={newFeat.d} onChange={(e) => setNewFeat({ ...newFeat, d: e.target.value })} /></div>
              <div className="row2">
                <div className="field"><label htmlFor="cf-m">Usos (vacío = sin límite)</label><input id="cf-m" className="input" type="number" min={1} value={newFeat.max ?? ''} onChange={(e) => setNewFeat({ ...newFeat, max: e.target.value ? parseInt(e.target.value, 10) : null })} /></div>
                <div className="field"><label htmlFor="cf-p">Se recuperan</label>
                  <select id="cf-p" className="input" value={newFeat.per} onChange={(e) => setNewFeat({ ...newFeat, per: e.target.value as CustomFeat['per'] })}><option value="lr">En descanso largo</option><option value="sr">En descanso corto o largo</option><option value="">No se recuperan solos</option></select></div>
              </div>
              <div className="rollrow">
                <button className="btn small primary" disabled={!newFeat.n.trim()} onClick={saveCustomFeat}>Guardar</button>
                <button className="btn small ghost" onClick={() => setNewFeat(null)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => setNewFeat({ id: 'f-' + uid(), n: '', d: '', cat: 'general', max: null, per: 'lr' })}>+ Dote o rasgo propio</button>
          )}
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
