import { useMemo, useRef, useState } from 'react';
import { ABILS, type Abil } from '../../data/player';
import { asClass, classEntries, derive, totalLevel, weaponFromData, type Character, type ClassEntry, type CharWeapon, type CustomFeat, type FeatCat } from '../../engine/character';
import { choiceSkills, subclassCaster, subclassSpells, subclassText } from '../../engine/subclassChoices';
import { norm, uid } from '../../engine/util';
import { DRACONIC_ANCESTRY } from '../../engine/classEffects';
import { assignSpells, casterPreps, classAlwaysSpells } from '../../engine/spellPrep';
import { hasMagicInitiate, MI_FROM_BACKGROUND, MI_KEY, SPECIES_ABIL_KEY, speciesHasSpells, TOME_KEY } from '../../engine/grantedSpells';
import { hasInvocation } from '../../engine/subclassChoices';
import { InfoDialog } from '../../shared/Card';
import Picker from '../../shared/Picker';
import { useLibrary } from '../../store/library';
import { usePlayer } from '../../store/player';
import { plainText, useSpells } from './spells';
import SubclassChoices from './SubclassChoices';
import AbilityMethods, { BG_ASI_KEY, bgBonus } from './AbilityMethods';
import { FxEditor } from './HomebrewPanel';
import { applyGear, GEAR_KEY, gearOptions, gearText, LETTERS } from '../../engine/startingGear';

const ABIL_N: Record<Abil, string> = { str: 'Fuerza', dex: 'Destreza', con: 'Constitución', int: 'Inteligencia', wis: 'Sabiduría', cha: 'Carisma' };
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
  const [spCls, setSpCls] = useState('');
  const [spLv, setSpLv] = useState('');
  const [allSpells, setAllSpells] = useState(false);
  // conjuro para una clase que no lanza: se pide confirmación una vez (luego ya no se pregunta en esta edición)
  const [askSpell, setAskSpell] = useState<{ id: string; n: string } | null>(null);
  const [nonCasterOk, setNonCasterOk] = useState(false);
  const [newFeat, setNewFeat] = useState<CustomFeat | null>(null);
  // antes de elegir una dote o un conjuro, su texto en una ventana
  const [featInfo, setFeatInfo] = useState<{ n: string; cat: string } | null>(null);
  const [spellInfo, setSpellInfo] = useState<string | null>(null);
  // personaje nuevo: asistente paso a paso (las secciones del editor, una por paso)
  const wizard = usePlayer((s) => s.creating) === c.id;
  const [step, setStep] = useState(0);
  const topRef = useRef<HTMLDivElement>(null);
  const go = (n: number) => { setStep(n); topRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); };
  const set = (patch: Partial<Character>) => {
    // si un cambio sube los PG máximos (nivel, Constitución, Duro…), los actuales suben lo mismo; si los baja, no pasan del nuevo máximo
    // (un personaje recién creado, con 0 PG, empieza con el máximo al terminar)
    if (c.hp > 0 && !('hp' in patch)) {
      const before = derive(c, data).hpMax;
      const after = derive({ ...c, ...patch }, data).hpMax;
      if (after !== before) patch = { ...patch, hp: Math.max(1, Math.min(after, c.hp + Math.max(0, after - before))) };
    }
    update(c.id, patch);
  };
  // (las subclases propias de la biblioteca pueden sumar CA, velocidad o resistencias)
  const d = useMemo(() => derive(c, data), [c, data, lib.subclasses]); // eslint-disable-line react-hooks/exhaustive-deps
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

  // al llegar al nivel de subclase se propone la del SRD (se puede cambiar por otra escribiéndola)
  // multiclase: las demás clases y su nivel (el total no pasa de 20)
  const multi = c.multi || [];
  const otherLevels = multi.reduce((t, e) => t + (e.level || 0), 0);
  const setMulti = (next: ClassEntry[]) => set({ multi: next.length ? next : undefined });
  const patchMulti = (i: number, p: Partial<ClassEntry>) => setMulti(multi.map((e, j) => (j === i ? { ...e, ...p } : e)));
  // requisito de 2024: 13 en la característica principal de cada clase (guerrero: Fuerza o Destreza; monje, paladín y explorador: las dos)
  const ABIL_NAME: Record<string, string> = { str: 'Fuerza', dex: 'Destreza', con: 'Constitución', int: 'Inteligencia', wis: 'Sabiduría', cha: 'Carisma' };
  const unmet = (id: string) => {
    const k = data.classes.find((x) => x.id === id);
    if (!k?.primary?.length) return '';
    const ok = id === 'fighter' ? k.primary.some((a) => c.abil[a as Abil] >= 13) : k.primary.every((a) => c.abil[a as Abil] >= 13);
    return ok ? '' : k.n + ' pide 13 en ' + k.primary.map((a) => ABIL_NAME[a]).join(id === 'fighter' ? ' o ' : ' y ');
  };
  const setLevel = (v: number) => {
    const level = Math.max(1, Math.min(20 - otherLevels, v || 1));
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
    // el aumento de características del trasfondo anterior se quita (el nuevo se elige en «Características»)
    const bonus = bgBonus(c);
    const abil = Object.fromEntries(Object.entries(c.abil).map(([a, v]) => [a, v - bonus[a as Abil]])) as Character['abil'];
    set({ backgroundId: id, backgroundName: '', skills, feats, abil, choices: { ...(c.choices || {}), [BG_ASI_KEY]: [] } });
  };
  const pool = cls ? (cls.skills.pool.includes('*') ? Object.keys(data.skills) : cls.skills.pool) : [];
  const fromBg = new Set(bg?.skills || []);
  const classPicked = c.skills.filter((s) => !fromBg.has(s) && pool.includes(s)).length;
  // equipo inicial de la clase y lo que falta por elegir (arriba del editor)
  const gearOpts = c.className ? [] : gearOptions(c.classId);
  const gearDone = c.choices?.[GEAR_KEY]?.[0] || '';
  const asiPending = !!bg?.abil?.length && Array.isArray(c.choices?.[BG_ASI_KEY]) && !c.choices![BG_ASI_KEY].length;
  const missing = [
    !c.name.trim() && 'nombre',
    !c.speciesId && !c.speciesName && 'especie',
    !c.classId && !c.className && 'clase',
    !c.backgroundId && !c.backgroundName && 'trasfondo',
    asiPending && 'aumento del trasfondo',
    Object.values(c.abil).every((v) => v === 10) && 'características',
    cls && classPicked < cls.skills.count && 'habilidades de clase (' + classPicked + ' de ' + cls.skills.count + ')',
    gearOpts.length > 0 && !gearDone && !c.weapons.length && !c.armorId && 'equipo inicial',
    cls && cls.caster !== 'none' && !c.spells.length && 'conjuros',
  ].filter(Boolean) as string[];
  const toggleSkill = (k: string) => set({ skills: c.skills.includes(k) ? c.skills.filter((x) => x !== k) : [...c.skills, k], expertise: c.expertise.filter((x) => x !== k || !c.skills.includes(k)) });
  const subSkills = new Set(choiceSkills(c));
  const toggleExp = (k: string) => set({ expertise: c.expertise.includes(k) ? c.expertise.filter((x) => x !== k) : [...c.expertise, k] });

  const addWeapon = () => {
    const w = data.weapons.find((x) => x.id === weaponPick);
    if (w) set({ weapons: [...c.weapons, weaponFromData(w, cls)] });
    else if (weaponPick === 'custom') set({ weapons: [...c.weapons, { id: 'w-' + uid(), name: 'Arma', dmg: '1d6', type: 'contundente', abil: 'auto', kind: 'melee', finesse: false, prof: true, bonus: 0, extra: [] }] });
    setWeaponPick('');
  };
  const setWeapon = (id: string, patch: Partial<CharWeapon>) => set({ weapons: c.weapons.map((w) => (w.id === id ? { ...w, ...patch } : w)) });

  // conjuros: cada clase lanzadora prepara los suyos, de su lista y hasta el nivel que esa clase puede lanzar
  // (multiclase 2024); con «otras clases» se busca en todos
  const subCaster = subclassCaster(c);
  const preps = casterPreps(c, data, spellIdx.list);
  const lvOf = (id: string) => spellIdx.get(id)?.l || 0;
  // los que se tienen preparados sin contar: los de la subclase y los de la clase (Castigo divino, Marca del cazador…)
  const always = new Set([
    ...classEntries(c).flatMap((e) => { const v = asClass(c, e); const k = data.classes.find((x) => x.id === e.classId); return subclassSpells(v, k, subclassText(v, k, lib.subclasses), spellIdx.list).map((x) => x.id); }),
    ...classAlwaysSpells(c, spellIdx.list).map((a) => a.id),
  ]);
  const assigned = assignSpells(c.spells, preps, lvOf, always);
  const useClassList = !allSpells && preps.length > 0;
  // ¿la puede preparar alguna de sus clases? (trucos solo las que tienen; conjuros hasta su nivel)
  const canTake = (sp: { id: string; l?: number }, only?: string) => preps.some((pr) => (!only || pr.id === only) && pr.list.has(sp.id) && ((sp.l || 0) === 0 ? pr.cantrips != null : (sp.l || 0) <= pr.maxLv));
  const tabPrep = preps.find((pr) => pr.id === spCls) || (preps.length === 1 ? preps[0] : null);
  const tabLevels = [...new Set((tabPrep ? [tabPrep] : preps).flatMap((pr) => [...(pr.cantrips != null ? [0] : []), ...Array.from({ length: pr.maxLv }, (_, i) => i + 1)]))].sort((a, b) => a - b);
  const lvTab = tabLevels.includes(+spLv) ? +spLv : tabLevels[0] ?? 0;
  // los elegidos siguen las mismas pestañas (clase y nivel) que la lista para elegir
  const tabbed = useClassList && !spellQ && (preps.length > 1 || tabLevels.length > 1);
  const chosen = !tabbed ? c.spells : c.spells.filter((k) => lvOf(k) === lvTab && (!tabPrep || [...(assigned.byClass[tabPrep.id]?.cantrips || []), ...(assigned.byClass[tabPrep.id]?.spells || [])].includes(k) || (always.has(k) && tabPrep.list.has(k))));
  const spellResults = spellIdx.list
    .filter((sp) => !c.spells.includes(sp.id) && (!useClassList || canTake(sp, tabPrep?.id)))
    .filter((sp) => { const q = norm(spellQ); return q.length >= 2 ? norm(sp.n).includes(q) || norm(sp.en).includes(q) : !q && useClassList && (sp.l || 0) === lvTab; })
    .sort((a, b) => (a.l || 0) - (b.l || 0) || a.n.localeCompare(b.n, 'es'))
    .slice(0, useClassList && !spellQ ? 80 : 16);

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

  const caster = !!cls && cls.caster !== 'none';
  // repaso: lo calculado sin los ajustes a mano, para avisar de lo que no cuadra
  const calc = wizard ? derive({ ...c, ov: {} }, data) : d;
  const reviewWarn: string[] = [];
  if (wizard) {
    const armor = data.armor.find((x) => x.id === c.armorId);
    const wear = (armor ? armor.n : 'sin armadura') + (c.shield ? ' y escudo' : '');
    if (c.ov.ac != null && c.ov.ac !== calc.ac) reviewWarn.push('CA ' + c.ov.ac + ': con ' + wear + ' te sale ' + calc.ac + '. ' + (c.ov.ac > calc.ac ? 'Más solo si lo da un objeto mágico, un conjuro o un rasgo que la app no aplique; si no, no es correcto.' : 'Menos de lo que te corresponde: revísalo.'));
    const lv = totalLevel(c);
    const conMod = Math.floor((c.abil.con - 10) / 2);
    if (c.ov.hpMax != null && cls && !c.multi?.length) {
      const top = cls.hd * lv + conMod * lv;
      const low = cls.hd + (lv - 1) + conMod * lv;
      if (c.ov.hpMax > top) reviewWarn.push('PG máx. ' + c.ov.hpMax + ': no es posible. Con d' + cls.hd + ' y Constitución ' + (conMod >= 0 ? '+' : '') + conMod + ' a nivel ' + lv + ', el máximo sacando todo es ' + top + ' (la media es ' + calc.hpMax + ').');
      else if (c.ov.hpMax < Math.max(1, low)) reviewWarn.push('PG máx. ' + c.ov.hpMax + ': no es posible; lo mínimo a nivel ' + lv + ' es ' + Math.max(1, low) + ' (la media es ' + calc.hpMax + ').');
      else if (c.ov.hpMax !== calc.hpMax) reviewWarn.push('PG máx. ' + c.ov.hpMax + ': la media es ' + calc.hpMax + '. Vale si tiraste los dados.');
    }
    if (c.ov.init != null && c.ov.init !== calc.init) reviewWarn.push('Iniciativa ' + c.ov.init + ': te sale ' + (calc.init >= 0 ? '+' : '') + calc.init + ' por tu Destreza (y tus dotes). Revísalo si no tienes algo que la cambie.');
    if (c.ov.speed != null && c.ov.speed !== calc.speed) reviewWarn.push('Velocidad ' + c.ov.speed + ': tu especie te da ' + calc.speed + ' pies.');
    const bonus = bgBonus(c);
    for (const a of ABILS) {
      if (c.abil[a] > 20) reviewWarn.push(ABIL_N[a] + ' ' + c.abil[a] + ': no puede pasar de 20 (sin objetos mágicos).');
      else if (c.level < 4 && !c.multi?.length && c.abil[a] - bonus[a] > 18) reviewWarn.push(ABIL_N[a] + ' ' + c.abil[a] + ': al empezar, la puntuación base no pasa de 18 (ni tirando 4d6).');
    }
  }
  const STEPS = ['Quién eres', 'Trasfondo', 'Características', 'Habilidades', 'Equipo', caster || c.spells.length ? 'Conjuros y dotes' : 'Dotes', 'Repaso'];
  const last = STEPS.length - 1;

  return (
    <div className="pc" ref={topRef}>
      <div className={wizard ? 'panel ce-wiz' : 'panel'} data-step={wizard ? step : undefined}>
        <div className="panel-head">
          <h2>{wizard ? 'Nuevo personaje' : c.name ? 'Editar a ' + c.name : 'Nuevo personaje'}</h2>
          {wizard ? <button className="btn small ghost" onClick={() => usePlayer.getState().setCreating(null)}>Ver todo en una página</button>
            : <button className="btn small primary" onClick={finish}>Listo</button>}
        </div>
        {wizard && (
          <nav className="ce-steps" aria-label="Pasos para crear el personaje">
            {STEPS.map((n, i) => <button key={n} className={i === step ? 'ce-step on' : i < step ? 'ce-step done' : 'ce-step'} aria-current={i === step ? 'step' : undefined} onClick={() => go(i)}><span className="ce-step-n">{i + 1}</span>{n}</button>)}
          </nav>
        )}
        {wizard && <p className="ce-step-title">Paso {step + 1} de {STEPS.length}: {STEPS[step]}</p>}
        {missing.length > 0 ? <p className="small lvl-pending" role="status" data-wstep="s6" style={{ margin: 0 }}>Falta: {missing.join(', ')}.</p> : <p className="small lvl-ok" role="status" data-wstep="s6" style={{ margin: 0 }}>Todo lo básico está elegido.</p>}
        <p className="muted small" data-wstep="x" style={{ margin: 0 }}>Los cambios se guardan solos. Lo que se puede calcular (CA, PG, salvaciones, habilidades, ataques, CD de conjuros) se calcula a partir de lo que elijas; al final puedes ajustar cualquier número a mano. Las listas traen lo que incluye el SRD 5.2.1 (la parte de las reglas de 2024 de uso libre); lo de otros libros se escribe con «Otro» o como rasgo propio.</p>

        <fieldset className="fs" data-wstep="s0 s1">
          <legend>{wizard && step === 1 ? 'Trasfondo' : 'Identidad'}</legend>
          <div className="ce-part" data-wstep="s0">
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
            {/* elfo, gnomo y tiflin: característica para lanzar los conjuros de su linaje o legado (por defecto, la más alta) */}
            {speciesHasSpells(c.speciesId) && (() => {
              const best = (['int', 'wis', 'cha'] as const).reduce((a, b) => (d.mods[b] > d.mods[a] ? b : a), 'int' as 'int' | 'wis' | 'cha');
              return <div className="field"><label htmlFor="ce-spab">Característica para tus conjuros de especie</label>
                <select id="ce-spab" className="input" value={c.choices?.[SPECIES_ABIL_KEY]?.[0] || ''} onChange={(e) => set({ choices: { ...(c.choices || {}), [SPECIES_ABIL_KEY]: e.target.value ? [e.target.value] : [] } })}>
                  <option value="">La más alta ({ABIL_N[best]})</option>
                  {(['int', 'wis', 'cha'] as const).map((a) => <option key={a} value={a}>{ABIL_N[a]}</option>)}
                </select></div>;
            })()}
            {/* dracónido: su ascendencia da el tipo de su resistencia (y de su aliento) */}
            {c.speciesId === 'dragonborn' && <div className="field"><label htmlFor="ce-anc">Ascendencia dracónica</label>
              <select id="ce-anc" className="input" value={c.choices?.['species.ancestry']?.[0] || ''} onChange={(e) => set({ choices: { ...(c.choices || {}), 'species.ancestry': e.target.value ? [e.target.value] : [] } })}>
                <option value="">Sin elegir</option>
                {DRACONIC_ANCESTRY.map(([n, t]) => <option key={n} value={n}>{n} ({t})</option>)}
              </select></div>}
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
                {libSubs.map((s) => <option key={s.id} value={'lib:' + s.n}>{s.n}{s.own ? ' (propia)' : ''}</option>)}
                <option value="other">Otra (escríbela)</option>
              </select></div>
            {subValue === 'other' && <div className="field"><label htmlFor="ce-sub">Nombre de la subclase</label><input id="ce-sub" className="input" value={c.subclass} onChange={(e) => set({ subclass: e.target.value })} /></div>}
          </div>
          <SubclassChoices c={c} data={data} lib={lib} set={set} />
          {cls?.sub && !libSubs.length && <span className="muted small">El SRD solo incluye una subclase por clase ({cls.sub.n}). Las demás de tu libro puedes añadirlas en «Biblioteca»; si eliges otra, sus rasgos los añades abajo como rasgos propios.</span>}
          {/* multiclase: otras clases con su nivel y subclase; la primera (arriba) da las salvaciones y el dado de golpe completo del nivel 1 */}
          {multi.map((e, i) => {
            const k = data.classes.find((x) => x.id === e.classId);
            const subs = [...(k?.sub ? [k.sub.n] : []), ...lib.subclasses.filter((x) => x.cls === e.classId).map((x) => x.n)];
            return (
              <div key={i} className="ce-multi">
                <div className="field"><label htmlFor={'ce-mc' + i}>Otra clase</label>
                  <select id={'ce-mc' + i} className="input" value={e.classId} onChange={(ev) => patchMulti(i, { classId: ev.target.value, subclass: '' })}>
                    <option value="">Otra (escríbela)</option>
                    {data.classes.filter((x) => x.id === e.classId || (x.id !== c.classId && !multi.some((m) => m.classId === x.id))).map((x) => <option key={x.id} value={x.id}>{x.n}</option>)}
                  </select></div>
                {!e.classId && <div className="field"><label htmlFor={'ce-mcn' + i}>Nombre de la clase</label><input id={'ce-mcn' + i} className="input" value={e.className} onChange={(ev) => patchMulti(i, { className: ev.target.value })} /></div>}
                <div className="field ce-multi-lvl"><label htmlFor={'ce-ml' + i}>Nivel en ella</label>
                  <input id={'ce-ml' + i} className="input" type="number" min={1} max={20} value={e.level} onChange={(ev) => patchMulti(i, { level: Math.max(1, Math.min(20 - c.level - otherLevels + e.level, parseInt(ev.target.value, 10) || 1)) })} /></div>
                <div className="field"><label htmlFor={'ce-ms' + i}>Subclase</label>
                  <input id={'ce-ms' + i} className="input" list={'ce-msl' + i} value={e.subclass} placeholder={k?.sub ? 'Desde el nivel ' + k.sub.lv : ''} onChange={(ev) => patchMulti(i, { subclass: ev.target.value })} />
                  <datalist id={'ce-msl' + i}>{subs.map((n) => <option key={n} value={n} />)}</datalist></div>
                <button className="btn small ghost" onClick={() => setMulti(multi.filter((_, j) => j !== i))}>Quitar</button>
                {e.classId && (unmet(e.classId) || (i === 0 && unmet(c.classId))) && <span className="warn small ce-multi-note">Requisito de multiclase: {[unmet(c.classId), unmet(e.classId)].filter(Boolean).join('; ')}. Puedes añadirla igual.</span>}
                {e.classId && <div className="ce-multi-note"><SubclassChoices c={asClass(c, e)} data={data} lib={lib} set={set} /></div>}
              </div>
            );
          })}
          <div className="rollrow">
            <button className="btn small" disabled={totalLevel(c) >= 20} onClick={() => setMulti([...multi, { classId: '', className: '', level: 1, subclass: '' }])}>Añadir otra clase (multiclase)</button>
            {multi.length > 0 && <span className="muted small">Nivel total {totalLevel(c)}. La primera clase da las salvaciones y el dado de golpe completo del nivel 1.</span>}
          </div>
          </div>
          <div className="ce-part" data-wstep="s1">
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
          </div>
        </fieldset>

        <fieldset className="fs" data-wstep="s2">
          <legend>Características</legend>
          <AbilityMethods c={c} cls={cls} set={set} bgAbil={bg?.abil} bgName={bg?.n} />
        </fieldset>

        <fieldset className="fs" data-wstep="s3">
          <legend>Habilidades</legend>
          <span className="muted small">{cls ? cls.n + ': elige ' + cls.skills.count + (cls.skills.pool.includes('*') ? ' cualesquiera' : ' de las resaltadas') + ' (llevas ' + classPicked + ').' : ''}{bg ? ' El trasfondo ya da ' + bg.skills.map((s) => data.skills[s]).join(' y ') + '.' : ''} Marca «P» para pericia.</span>
          <div className="ce-skills">
            {Object.keys(data.skills).sort((a, b) => data.skills[a].localeCompare(data.skills[b], 'es')).map((k) => (
              <span key={k} className={pool.includes(k) || fromBg.has(k) ? 'ce-skill suggest' : 'ce-skill'}>
                <label className="check" title={subSkills.has(k) && !c.skills.includes(k) ? 'Por tu subclase' : undefined}><input type="checkbox" checked={c.skills.includes(k) || subSkills.has(k)} disabled={subSkills.has(k) && !c.skills.includes(k)} onChange={() => toggleSkill(k)} />{data.skills[k]}</label>
                {(c.skills.includes(k) || subSkills.has(k)) && <button className={c.expertise.includes(k) ? 'ts on' : 'ts'} aria-pressed={c.expertise.includes(k)} aria-label={'Pericia en ' + data.skills[k]} onClick={() => toggleExp(k)}>P</button>}
              </span>
            ))}
          </div>
        </fieldset>

        {data && gearOpts.length > 0 && (
          <fieldset className="fs" data-wstep="s4">
            <legend>Equipo inicial</legend>
            {gearDone ? <p className="muted small" style={{ margin: 0 }}>Puesta la opción {gearDone}: armadura, armas y el resto en tus notas. Lo puedes cambiar abajo.</p> : (
              <>
                <p className="muted small" style={{ margin: 0 }}>El de tu clase en el SRD. Elige una opción y se pone sola (armadura, escudo y armas; el resto y el oro van a tus notas). El de tu trasfondo, apúntalo en las notas.</p>
                <div className="ce-gear">
                  {gearOpts.map((o, i) => (
                    <button key={i} className="btn small ce-gear-opt" onClick={() => set(applyGear(c, o, LETTERS[i], data, cls))}><b>{LETTERS[i]}</b> {gearText(o, data)}</button>
                  ))}
                </div>
              </>
            )}
          </fieldset>
        )}

        <fieldset className="fs" data-wstep="s4">
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

        <fieldset className="fs" data-wstep="s4">
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

        <fieldset className="fs" data-wstep={caster || c.spells.length ? 's5' : 'x'}>
          <legend>Conjuros</legend>
          {subCaster && !cls?.spells.length && <p className="muted small" style={{ margin: 0 }}>{c.subclass}: conjuros de mago. Lanzas con Inteligencia.</p>}
          {preps.length > 0 && (
            <div className="spell-counts">
              {preps.map((pr) => {
                const b = assigned.byClass[pr.id];
                const chip = (have: number, max: number) => (have > max ? 'chip vuln' : have === max ? 'chip on' : 'chip');
                return (
                  <span key={pr.id} className="spell-count-row">
                    {preps.length > 1 && <b className="small">{pr.n} {pr.level}</b>}
                    {pr.cantrips != null && <span className={chip(b.cantrips.length, pr.cantrips)}>Trucos {b.cantrips.length} de {pr.cantrips}</span>}
                    {pr.prepared != null && <span className={chip(b.spells.length, pr.prepared)}>Conjuros preparados {b.spells.length} de {pr.prepared}</span>}
                    {pr.maxLv > 0 && <span className="muted small">hasta el nivel {pr.maxLv}</span>}
                  </span>
                );
              })}
              {assigned.other.length > 0 && <span className="muted small">Fuera de tus listas (no cuentan): {assigned.other.map((k) => spellIdx.get(k)?.n || k).join(', ')}.</span>}
            </div>
          )}
          {always.size > 0 && <p className="muted small" style={{ margin: 0 }}>Siempre preparados, sin contar (se añaden solos a la hoja): {[...always].map((k) => spellIdx.get(k)?.n || '').filter(Boolean).join(', ')}.</p>}
          <div className="field"><label htmlFor="ce-spq">Buscar conjuro{useClassList ? ' de la lista de ' + preps.map((k) => data.classes.find((x) => x.id === k.id)?.n || k.n).filter((x, i, a) => a.indexOf(x) === i).join(' y ') : ''}</label>
            <input id="ce-spq" className="input" value={spellQ} onChange={(e) => setSpellQ(e.target.value)} placeholder="Castigo divino, Bola de fuego, Curar heridas…" /></div>
          <div className="rollrow">
            {preps.length > 0 && <label className="check"><input type="checkbox" checked={allSpells} onChange={(e) => setAllSpells(e.target.checked)} />Mostrar conjuros de otras clases</label>}
            {!spellIdx.loaded && <span className="muted small">Cargando conjuros…</span>}
          </div>
          {useClassList && !spellQ && (
            <div className="sp-tabs-wrap">
              {preps.length > 1 && (
                <div className="sp-tabs" role="tablist" aria-label="Elegir conjuros por clase">
                  {[{ id: '', n: 'Todas' }, ...preps].map((pr) => <button key={pr.id} type="button" role="tab" aria-selected={(tabPrep?.id || '') === pr.id} className={(tabPrep?.id || '') === pr.id ? 'sp-tab on' : 'sp-tab'} onClick={() => setSpCls(pr.id)}>{pr.n}</button>)}
                </div>
              )}
              {tabLevels.length > 1 && (
                <div className="sp-tabs" role="tablist" aria-label="Elegir conjuros por nivel">
                  {tabLevels.map((l) => <button key={l} type="button" role="tab" aria-selected={lvTab === l} className={lvTab === l ? 'sp-tab on' : 'sp-tab'} onClick={() => setSpLv(String(l))}>{l === 0 ? 'Trucos' : 'Nivel ' + l}</button>)}
                </div>
              )}
            </div>
          )}
          {spellResults.length > 0 && (
            <div className="chips ce-spell-results">{spellResults.map((s) => <button key={s.id} className="chip" onClick={() => setSpellInfo(s.id)}>+ {s.n} <span className="chip-tag">{s.l ? s.l : 'T'}</span></button>)}</div>
          )}
          {askSpell && (
            <InfoDialog title="¿Añadir un conjuro?" onClose={() => setAskSpell(null)}>
              <p style={{ marginTop: 0 }}>{cls!.n}{c.subclass ? ' (' + c.subclass + ')' : ''} no lanza conjuros a nivel {c.level}. Solo tiene sentido si lo consigues de otra forma, como con una dote (Iniciado en la magia) o un rasgo de tu especie.</p>
              <p className="muted small">¿Seguro que quieres añadir <b>{askSpell.n}</b>? No se volverá a preguntar mientras editas esta hoja.</p>
              <div className="rollrow">
                <button className="btn small primary" onClick={() => { set({ spells: [...c.spells, askSpell.id] }); setSpellQ(''); setNonCasterOk(true); setAskSpell(null); }}>Sí, añadirlo</button>
              </div>
            </InfoDialog>
          )}
          {c.spells.length > 0 && (
            <div className="ce-chosen">
              <span className="eyebrow">Elegidos{tabbed ? ' · ' + (tabPrep ? tabPrep.n : 'todas las clases') + ' · ' + (lvTab === 0 ? 'trucos' : 'nivel ' + lvTab) : ''} ({chosen.length})</span>
              {chosen.length > 0
                ? <div className="chips">{chosen.map((k) => <button key={k} className="chip on" title="Quitar" onClick={() => set({ spells: c.spells.filter((x) => x !== k) })}>{spellIdx.get(k)?.n || k}{always.has(k) && <span className="chip-tag">ya preparado</span>} ✕</button>)}</div>
                : <span className="muted small">Ninguno en esta pestaña.</span>}
            </div>
          )}
        </fieldset>

        <fieldset className="fs" data-wstep="s5">
          <legend>Dotes, estilos de combate y rasgos propios</legend>
          <span className="muted small">{lib.feats.length ? 'Dotes del SRD y de tu biblioteca.' : 'El SRD trae 4 dotes de origen, 2 generales, 4 estilos de combate y 7 dones épicos. Las de tu libro puedes añadirlas en «Biblioteca» o aquí como dote propia.'}</span>
          {featGroups.map(([cat, title]) => {
            const list = allFeats.filter((f) => f.cat === cat).sort((a, b) => a.n.localeCompare(b.n, 'es'));
            const mine = c.feats.filter((n) => list.some((f) => f.n === n)).concat(c.customFeats.filter((f) => f.cat === cat).map((f) => f.n));
            return (
              <Picker key={cat} title={title} summary={mine.join(', ')}>
                <div className="chips">
                  {list.map((f) => <button key={f.id} className={c.feats.includes(f.n) ? 'chip on' : 'chip'} aria-pressed={c.feats.includes(f.n)} onClick={() => setFeatInfo({ n: f.n, cat })}>{f.n}</button>)}
                </div>
              </Picker>
            );
          })}
          {/* Iniciado en la magia: lista (la fija el trasfondo si viene de él), característica, dos trucos y un conjuro de nivel 1 */}
          {hasMagicInitiate(c) && (() => {
            const mi = c.choices?.[MI_KEY] || [];
            const fixed = MI_FROM_BACKGROUND[c.backgroundId];
            const listCls = fixed || mi[0] || 'cleric';
            const k = data.classes.find((x) => x.id === listCls);
            const pool = spellIdx.list.filter((x) => k?.spells.includes(x.id));
            const put = (i: number, v: string) => { const n = [listCls, mi[1] || 'wis', mi[2] || '', mi[3] || '', mi[4] || '']; n[i] = v; if (i === 0) { n[2] = ''; n[3] = ''; n[4] = ''; } set({ choices: { ...(c.choices || {}), [MI_KEY]: n } }); };
            const pick = (i: number, lvl: number, label: string) => (
              <div className="field"><label htmlFor={'ce-mi' + i}>{label}</label>
                <select id={'ce-mi' + i} className="input" value={mi[i] || ''} onChange={(e) => put(i, e.target.value)}>
                  <option value="">Elige…</option>
                  {pool.filter((x) => (x.l || 0) === lvl).sort((a, b) => a.n.localeCompare(b.n, 'es')).map((x) => <option key={x.id} value={x.id}>{x.n}</option>)}
                </select></div>
            );
            return (
              <fieldset className="fs ce-mi">
                <legend>Iniciado en la magia</legend>
                <div className="row2">
                  <div className="field"><label htmlFor="ce-mi0">Lista de conjuros</label>
                    <select id="ce-mi0" className="input" value={listCls} disabled={!!fixed} onChange={(e) => put(0, e.target.value)}>
                      {['cleric', 'druid', 'wizard'].map((id) => <option key={id} value={id}>{data.classes.find((x) => x.id === id)?.n || id}</option>)}
                    </select></div>
                  <div className="field"><label htmlFor="ce-mi1">Característica para lanzarlos</label>
                    <select id="ce-mi1" className="input" value={mi[1] || 'wis'} onChange={(e) => put(1, e.target.value)}>
                      {(['int', 'wis', 'cha'] as const).map((a) => <option key={a} value={a}>{ABIL_N[a]}</option>)}
                    </select></div>
                </div>
                <div className="row2">{pick(2, 0, 'Truco')}{pick(3, 0, 'Otro truco')}</div>
                {pick(4, 1, 'Conjuro de nivel 1 (una vez por descanso largo sin espacio; también con espacios si tienes)')}
                {fixed && <span className="muted small">La lista la fija tu trasfondo.</span>}
              </fieldset>
            );
          })()}
          {/* Pacto del tomo: tres trucos y dos rituales de nivel 1 de cualquier lista, en tu Libro de las sombras */}
          {classEntries(c).some((e) => e.classId === 'warlock') && hasInvocation(c, 'Pacto del tomo') && (() => {
            const tome = c.choices?.[TOME_KEY] || [];
            const put = (i: number, v: string) => { const n = [0, 1, 2, 3, 4].map((j) => tome[j] || ''); n[i] = v; set({ choices: { ...(c.choices || {}), [TOME_KEY]: n } }); };
            const pick = (i: number, label: string, ok: (x: { l?: number; rit?: number | boolean }) => boolean) => (
              <div className="field"><label htmlFor={'ce-tome' + i}>{label}</label>
                <select id={'ce-tome' + i} className="input" value={tome[i] || ''} onChange={(e) => put(i, e.target.value)}>
                  <option value="">Elige…</option>
                  {spellIdx.list.filter(ok).filter((x) => x.id === tome[i] || !tome.includes(x.id)).sort((a, b) => a.n.localeCompare(b.n, 'es')).map((x) => <option key={x.id} value={x.id}>{x.n}</option>)}
                </select></div>
            );
            const cantrip = (x: { l?: number }) => (x.l || 0) === 0;
            const ritual = (x: { l?: number; rit?: number | boolean }) => x.l === 1 && !!x.rit;
            return (
              <fieldset className="fs ce-mi">
                <legend>Pacto del tomo: Libro de las sombras</legend>
                <div className="row2">{pick(0, 'Truco', cantrip)}{pick(1, 'Segundo truco', cantrip)}</div>
                <div className="row2">{pick(2, 'Tercer truco', cantrip)}<span /></div>
                <div className="row2">{pick(3, 'Ritual de nivel 1', ritual)}{pick(4, 'Otro ritual de nivel 1', ritual)}</div>
                <span className="muted small">De cualquier clase. Cuentan como conjuros de brujo (Carisma); los rituales se lanzan como ritual sin espacio.</span>
              </fieldset>
            );
          })()}
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
              <FxEditor id="cf" fx={newFeat.fx} set={(fx) => setNewFeat({ ...newFeat, fx })} />
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

        <fieldset className="fs" data-wstep="x">
          <legend>Ajustes a mano</legend>
          <span className="muted small">Déjalos vacíos para usar el cálculo. Útil para objetos mágicos o rasgos que la app no aplica sola.</span>
          <div className="row4f">
            {([['ac', 'CA', d.ac], ['hpMax', 'PG máx.', d.hpMax], ['init', 'Iniciativa', d.init], ['speed', 'Velocidad', d.speed]] as const).map(([k, label, calc]) => (
              <div key={k} className="field"><label htmlFor={'ov-' + k}>{label}</label>
                <input id={'ov-' + k} className="input" type="number" value={c.ov[k] ?? ''} placeholder={String(calc)} onChange={(e) => { const v = e.target.value === '' ? undefined : parseInt(e.target.value, 10); const ov = { ...c.ov }; if (v == null || Number.isNaN(v)) delete ov[k]; else ov[k] = v; set({ ov }); }} /></div>
            ))}
          </div>
        </fieldset>

        {wizard && (
          <fieldset className="fs ce-review" data-wstep="s6">
            <legend>Repaso</legend>
            <p className="ce-review-t"><b>{c.name || 'Sin nombre'}</b> · {[data.species.find((x) => x.id === c.speciesId)?.n || c.speciesName, (cls?.n || c.className) + ' ' + c.level, bg?.n || c.backgroundName].filter(Boolean).join(' · ')}</p>
            {/* todo se puede cambiar aquí; lo que no cuadra con las reglas se avisa (sin impedirlo: puede haber un objeto mágico) */}
            <div className="ce-review-grid">
              {([['ac', 'CA', calc.ac], ['hpMax', 'PG máx.', calc.hpMax], ['init', 'Iniciativa', calc.init], ['speed', 'Velocidad', calc.speed]] as const).map(([k, label, v]) => (
                <label key={k} className={c.ov[k] != null && c.ov[k] !== v ? 'ce-rv warn-b' : 'ce-rv'}><span>{label}</span>
                  <input className="input" type="number" value={c.ov[k] ?? v} onChange={(e) => { const n = parseInt(e.target.value, 10); const ov = { ...c.ov }; if (Number.isNaN(n) || n === v) delete ov[k]; else ov[k] = n; set({ ov }); }} /></label>
              ))}
              {ABILS.map((a) => (
                <label key={a} className={c.abil[a] > 20 ? 'ce-rv warn-b' : 'ce-rv'}><span>{ABIL_N[a].slice(0, 3)}</span>
                  <input className="input" type="number" min={1} max={30} value={c.abil[a]} onChange={(e) => { const n = parseInt(e.target.value, 10); if (!Number.isNaN(n)) set({ abil: { ...c.abil, [a]: Math.max(1, Math.min(30, n)) } }); }} /></label>
              ))}
            </div>
            {reviewWarn.length > 0 && <ul className="ce-review-warn" role="status">{reviewWarn.map((w) => <li key={w}>{w}</li>)}</ul>}
            <p className="muted small" style={{ margin: 0 }}>{c.weapons.length ? 'Ataques: ' + d.attacks.map((x) => x.w.name + ' ' + (x.atk >= 0 ? '+' : '') + x.atk).join(', ') + '. ' : 'Sin armas. '}{caster ? (c.spells.length ? c.spells.length + ' conjuros y trucos elegidos.' : 'Aún sin conjuros.') : ''}</p>
            <p className="muted small" style={{ margin: 0 }}>Todo se puede cambiar luego en «Editar hoja».</p>
          </fieldset>
        )}

        {wizard && (
          <div className="ce-wiz-nav">
            <button className="btn" disabled={step === 0} onClick={() => go(step - 1)}>Anterior</button>
            <span className="muted small">Paso {step + 1} de {STEPS.length}</span>
            {step < last ? <button className="btn primary" onClick={() => go(step + 1)}>Siguiente</button>
              : <button className="btn primary" onClick={finish}>Crear personaje</button>}
          </div>
        )}

        {featInfo && (() => {
          const text = data.feats.find((f) => f.n === featInfo.n)?.d || lib.feats.find((f) => f.n === featInfo.n)?.d || '';
          const req = lib.feats.find((f) => f.n === featInfo.n)?.req;
          const has = c.feats.includes(featInfo.n);
          return (
            <InfoDialog title={featInfo.n} onClose={() => setFeatInfo(null)}>
              <p className="muted small" style={{ margin: 0 }}>{CAT_ONE[featInfo.cat as FeatCat] || 'Dote'}{req ? ' · Requisito: ' + req : ''}</p>
              {text ? <div className="pc-text info-text">{plainText(text)}</div> : <p className="muted small">Sin texto en este dispositivo.</p>}
              <div className="rollrow">
                <button className={has ? 'btn small' : 'btn small primary'} onClick={() => { toggleFeat({ n: featInfo.n }); setFeatInfo(null); }}>{has ? 'Quitar dote' : 'Elegir dote'}</button>
                <button className="btn small ghost" onClick={() => setFeatInfo(null)}>Volver</button>
              </div>
            </InfoDialog>
          );
        })()}
        {spellInfo && (() => {
          const s = spellIdx.get(spellInfo);
          if (!s) return null;
          const add = () => {
            setSpellInfo(null);
            if (cls && !d.spell && !nonCasterOk) { setAskSpell({ id: s.id, n: s.n }); return; }
            if (!c.spells.includes(s.id)) set({ spells: [...c.spells, s.id] });
            setSpellQ('');
          };
          return (
            <InfoDialog title={s.n} onClose={() => setSpellInfo(null)}>
              <p className="muted small" style={{ margin: 0 }}>{s.l ? 'Nivel ' + s.l : 'Truco'}{s.esc ? ' · ' + s.esc : ''}{s.c ? ' · concentración' : ''}{s.rit ? ' · ritual' : ''}</p>
              <p className="muted small" style={{ margin: 0 }}>{[s.ct, s.r, s.cmp, s.du].filter(Boolean).join(' · ')}</p>
              {s.t ? <div className="pc-text info-text">{plainText(s.t)}</div> : <p className="muted small">Sin texto en este dispositivo.</p>}
              <div className="rollrow">
                <button className="btn small primary" onClick={add}>{c.spells.includes(s.id) ? 'Ya lo tienes' : 'Añadir conjuro'}</button>
                <button className="btn small ghost" onClick={() => setSpellInfo(null)}>Volver</button>
              </div>
            </InfoDialog>
          );
        })()}

        <div className="rollrow" data-wstep="x" style={{ justifyContent: 'space-between' }}>
          <button className="btn primary" onClick={finish}>Listo</button>
          <button className="btn small ghost" onClick={() => { if (confirmDel) remove(c.id); else setConfirmDel(true); }}>{confirmDel ? '¿Seguro? Borrar personaje' : 'Borrar personaje'}</button>
        </div>
      </div>
    </div>
  );
}
