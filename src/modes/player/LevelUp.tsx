import { useState } from 'react';
import { ABILS, type Abil, type ClassData, type ClassFeature, type PlayerData } from '../../data/player';
import { applyFeatAsi, featAsi, featAsiOptions } from '../../engine/featAsi';
import { asClass, classEntries, derive, totalLevel, type Character, type ClassEntry } from '../../engine/character';
import { activeChoices, choiceCount, spellSwapRules, subclassSpells, subclassText } from '../../engine/subclassChoices';
import { classAlwaysSpells } from '../../engine/spellPrep';
import { grantedSpells } from '../../engine/grantedSpells';
import { fmt } from '../../engine/dice';
import { norm } from '../../engine/util';
import { InfoDialog } from '../../shared/Card';
import type { LibraryData } from '../../store/library';
import { usePlayer } from '../../store/player';
import { useStore } from '../../store/useStore';
import { plainText, useSpells } from './spells';
import SubclassChoices from './SubclassChoices';
import SpellSwap, { applySwap, emptySwap, type SwapState } from './SpellSwap';

const ABIL_N: Record<Abil, string> = { str: 'Fuerza', dex: 'Destreza', con: 'Constitución', int: 'Inteligencia', wis: 'Sabiduría', cha: 'Carisma' };

/** El personaje tras subir un nivel en esa clase (la primera, otra de su multiclase o una nueva). */
function withLevel(c: Character, classId: string): Character {
  if (classId === c.classId) return { ...c, level: c.level + 1 };
  const multi = c.multi || [];
  const has = multi.some((e) => e.classId === classId);
  return { ...c, multi: has ? multi.map((e) => (e.classId === classId ? { ...e, level: e.level + 1 } : e)) : [...multi, { classId, className: '', level: 1, subclass: '' }] };
}

const tableAt = (cls: ClassData | undefined, key: string, lv: number) => {
  let v: number | string | null = null;
  for (const [l, x] of Object.entries(cls?.sc[cls.id + '.' + key] || {})) if (parseInt(l, 10) <= lv) v = x;
  return typeof v === 'number' ? v : v == null ? 0 : parseInt(String(v), 10) || 0;
};

/**
 * Subir de nivel paso a paso, como en papel: qué clase sube (o multiclase), los PG (media o tirada), lo que se gana,
 * la subclase y la mejora de característica o dote cuando toca, y los conjuros nuevos. Al confirmar se aplica todo.
 */
export default function LevelUp({ c, data, lib, onClose, onDone }: { c: Character; data: PlayerData; lib: LibraryData; onClose: () => void; onDone: (prev: Character) => void }) {
  const spellIdx = useSpells();
  const owned = classEntries(c).filter((e) => e.classId);
  const [classId, setClassId] = useState(c.classId || owned[0]?.classId || '');
  const [hp, setHp] = useState<{ mode: 'avg' | 'roll'; roll?: number }>({ mode: 'avg' });
  const [featAbil, setFeatAbil] = useState('');
  const [asi, setAsi] = useState<{ mode: '2' | '11' | 'feat'; a: Abil; b: Abil; feat: string }>({ mode: '2', a: 'str', b: 'dex', feat: '' });
  const [sub, setSub] = useState('');
  const [picks, setPicks] = useState<string[]>([]);
  // elecciones de subclase (maniobras, invocaciones…) hechas aquí y un conjuro cambiado por otro (opcional)
  const [choices, setChoices] = useState<Record<string, string[]>>(() => c.choices || {});
  const [swap, setSwap] = useState<SwapState>(emptySwap);
  // rasgos que piden elegir al subir: Estilo de combate (una dote de estilo) y Pericia (dos habilidades)
  const [style, setStyle] = useState('');
  const [exp, setExp] = useState<string[]>([]);
  // conjuros nuevos: pestaña de nivel, buscador y el que se está mirando (su texto debajo)
  const [spTab, setSpTab] = useState<number | null>(null);
  const [spQ, setSpQ] = useState('');
  const [peek, setPeek] = useState('');
  const total = totalLevel(c);
  if (total >= 20) return <InfoDialog title="Subir de nivel" onClose={onClose}><p style={{ margin: 0 }}>Ya estás en el nivel 20, el máximo.</p></InfoDialog>;

  const cls = data.classes.find((x) => x.id === classId);
  const cur: ClassEntry | undefined = classEntries(c).find((e) => e.classId === classId);
  const newLv = (cur?.level || 0) + 1;
  const next = withLevel(c, classId);
  const before = derive(c, data);
  const after = derive(next, data);
  const con = after.mods.con;
  const die = cls?.hd || 8;
  const avg = Math.floor(die / 2) + 1;
  // lo que suben los PG máximos con todas las reglas (dado o media + Constitución, Duro, Dureza enana…), sin el ajuste a mano
  const free = (x: Character) => ({ ...x, ov: { ...x.ov, hpMax: undefined } });
  const withRoll = hp.mode === 'roll' && hp.roll != null ? { ...next, hpRolls: { ...(next.hpRolls || {}), [classId + ':' + newLv]: hp.roll } } : next;
  const hpGain = Math.max(0, derive(free(withRoll), data).hpMax - derive(free(c), data).hpMax);
  const newFeatures: ClassFeature[] = (cls?.f || []).filter((f) => f.lv === newLv);
  const subName = cur?.subclass || sub;
  const subSrd = cls?.sub && norm(subName) === norm(cls.sub.n) ? cls.sub : null;
  const subFeatures = (subSrd?.f || []).filter((f) => f.lv === newLv);
  const libSub = lib.subclasses.find((s) => s.cls === classId && norm(s.n) === norm(subName));
  const libSubFeatures = (libSub?.f || []).filter((f) => f.lv === newLv);
  const needSub = !!cls?.sub && newLv === cls.sub.lv && !cur?.subclass;
  const asiLevel = !!cls?.asi.includes(newLv);
  const unmet = (() => {
    if (cur || !cls?.primary?.length) return '';
    const ok = cls.id === 'fighter' ? cls.primary.some((a) => c.abil[a] >= 13) : cls.primary.every((a) => c.abil[a] >= 13);
    return ok ? '' : cls.n + ' pide 13 en ' + cls.primary.map((a) => ABIL_N[a]).join(cls.id === 'fighter' ? ' o ' : ' y ');
  })();
  // conjuros: los que le tocan de más a su nuevo nivel en esa clase, y hasta qué nivel puede elegir
  const maxBefore = Math.max(before.slots.length, before.pact?.lv || 0);
  const maxAfter = Math.max(after.slots.length, after.pact?.lv || 0);
  const newCantrips = Math.max(0, tableAt(cls, 'cantrips-known', newLv) - tableAt(cls, 'cantrips-known', newLv - 1));
  const newPrepared = Math.max(0, tableAt(cls, 'max-prepared', newLv) - tableAt(cls, 'max-prepared', newLv - 1));
  // la clase que sube, vista sola con su nuevo nivel y subclase: sus elecciones y si alguna gana opciones en este nivel
  const view = asClass({ ...next, choices }, { classId, className: cur?.className || '', level: newLv, subclass: subName });
  const growing = activeChoices(view).filter((d) => choiceCount(d, newLv) > choiceCount(d, newLv - 1));
  const modOf = (v: number) => Math.floor((v - 10) / 2);
  // dones épicos (nivel 19) junto a las dotes generales
  const epic = total + 1 >= 19 ? [...data.feats.filter((f) => f.cat === 'epic-boon'), ...lib.feats.filter((f) => f.cat === 'epic-boon' && !data.feats.some((x) => norm(x.n) === norm(f.n)))] : [];
  const featText = (n: string) => data.feats.find((f) => f.n === n)?.d || lib.feats.find((f) => f.n === n)?.d || '';
  // la mejora de característica de la dote elegida (Atleta: Fuerza o Destreza; Resiliente: una sin competencia en su salvación…)
  const featFa = asi.feat ? featAsi(featText(asi.feat)) : null;
  const faOpts = featFa ? featAsiOptions(featFa, c, data) : [];
  const faPick = (faOpts.includes(featAbil as Abil) ? featAbil : faOpts[0]) as Abil | undefined;
  // Estilo de combate (guerrero 1, paladín 2, explorador 2) y Pericia (bardo 2 y 9, pícaro 1 y 6, explorador 9)
  const styles = [...data.feats.filter((f) => f.cat === 'fighting-style'), ...lib.feats.filter((f) => f.cat === 'fighting-style' && !data.feats.some((x) => norm(x.n) === norm(f.n)))];
  const needStyle = newFeatures.some((f) => norm(f.n) === 'estilo de combate') && !c.feats.some((n) => styles.some((f) => f.n === n));
  const EXP_AT: Record<string, number[]> = { bard: [2, 9], rogue: [1, 6], ranger: [9] };
  const needExp = (EXP_AT[classId] || []).includes(newLv) ? 2 : 0;
  const expPool = c.skills.filter((k) => !c.expertise.includes(k));
  // conjuros que dan los rasgos al llegar a este nivel: de la clase (Hallar corcel…), de la subclase y de la especie
  const subNow = subName ? asClass({ ...next, choices }, { classId, className: cur?.className || '', level: newLv, subclass: subName }) : null;
  const subGain = subNow ? subclassSpells(subNow, cls, subclassText(subNow, cls, lib.subclasses), spellIdx.list).filter((x) => x.at === newLv).map((x) => ({ id: x.id, why: subName + ' · siempre preparado' })) : [];
  const alwaysBefore = new Set(classAlwaysSpells(c, spellIdx.list).map((x) => x.id));
  const classGain = classAlwaysSpells(next, spellIdx.list).filter((x) => !alwaysBefore.has(x.id)).map((x) => ({ id: x.id, why: x.n + ' · siempre preparado' }));
  const grantsBefore = new Set(grantedSpells(c, spellIdx.list, before.mods).map((g) => g.id));
  const grantGain = grantedSpells(next, spellIdx.list, after.mods).filter((g) => !grantsBefore.has(g.id)).map((g) => ({ id: g.id, why: g.src + (g.how === 'lr' ? ' · 1 vez por descanso largo sin espacio' : g.how === 'will' ? ' · a voluntad' : '') }));
  const gainedSpells = [...classGain, ...subGain, ...grantGain].filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i);
  // límites de los conjuros nuevos: los que se ganan (no más)
  // los que ya se tienen siempre preparados (de la clase o de la subclase) no se eligen
  const alwaysHave = new Set([...gainedSpells.map((g) => g.id), ...classAlwaysSpells(next, spellIdx.list).map((x) => x.id),
    ...(subNow ? subclassSpells(subNow, cls, subclassText(subNow, cls, lib.subclasses), spellIdx.list).map((x) => x.id) : [])]);
  const capCantrips = newCantrips;
  const capSpells = newPrepared;
  const classSpells = new Set([...(cls?.spells || []), ...spellIdx.list.filter((s) => s.classes?.includes(classId)).map((s) => s.id)]);
  // solo lo que toca: trucos si gana trucos; conjuros si gana preparados o un nivel nuevo (los del nivel recién desbloqueado, primero)
  const wantSpells = newPrepared > 0 || maxAfter > maxBefore;
  const pickable = spellIdx.list
    .filter((s) => classSpells.has(s.id) && !c.spells.includes(s.id) && !alwaysHave.has(s.id) && (s.l || 0) <= maxAfter && (s.l ? wantSpells && capSpells > 0 : newCantrips > 0))
    .sort((a, b) => (a.l ? 1 : 0) - (b.l ? 1 : 0) || (b.l || 0) - (a.l || 0) || a.n.localeCompare(b.n, 'es'));
  const known = c.spells.map((id) => spellIdx.get(id)).filter((x): x is NonNullable<typeof x> => !!x && classSpells.has(x.id));
  // qué puede cambiar esta clase al subir (las que cambian tras un descanso largo lo hacen al descansar)
  const rules = spellSwapRules(classId);
  const swapPool = spellIdx.list.filter((x) => classSpells.has(x.id) && !c.spells.includes(x.id) && !picks.includes(x.id) && (x.l || 0) <= maxAfter).sort((a, b) => (a.l || 0) - (b.l || 0) || a.n.localeCompare(b.n, 'es'));
  const canCantrip = rules.cantrip === 'level';
  const canSpell = rules.spells?.when === 'level';
  const pickedCantrips = picks.filter((id) => !spellIdx.get(id)?.l).length;
  const pickedSpells = picks.length - pickedCantrips;
  const feats = [...data.feats.filter((f) => f.cat === 'general'), ...lib.feats.filter((f) => f.cat === 'general' && !data.feats.some((x) => norm(x.n) === norm(f.n)))];
  const raise = (a: Abil, n: number) => Math.min(20, c.abil[a] + n);

  const rollHp = () => useStore.getState().roll({
    label: (c.name || 'Personaje') + ' · PG al subir a ' + (cls?.n || '') + ' ' + newLv, kind: 'free', parts: [{ expr: '1d' + die }],
    after: (t) => { setHp({ mode: 'roll', roll: t }); return { resultNote: 'Ganas ' + Math.max(1, t + con) + ' PG (' + t + fmt(con) + ').' }; },
  });

  const confirm = () => {
    let n = withLevel(c, classId);
    if (needSub && sub) n = classId === c.classId ? { ...n, subclass: sub } : { ...n, multi: (n.multi || []).map((e) => (e.classId === classId ? { ...e, subclass: sub } : e)) };
    if (asiLevel) {
      if (asi.mode === '2') n = { ...n, abil: { ...n.abil, [asi.a]: raise(asi.a, 2) } };
      else if (asi.mode === '11') n = { ...n, abil: { ...n.abil, [asi.a]: raise(asi.a, 1), [asi.b]: raise(asi.b, 1) } };
      else if (asi.feat) n = { ...n, feats: [...n.feats, asi.feat], ...(featFa && faPick ? applyFeatAsi(n, asi.feat, featFa, faPick, data) : {}) };
    }
    if (hp.mode === 'roll' && hp.roll != null) n = { ...n, hpRolls: { ...(n.hpRolls || {}), [classId + ':' + newLv]: hp.roll } };
    if (picks.length) n = { ...n, spells: [...n.spells, ...picks.filter((id) => !n.spells.includes(id))] };
    if (growing.length) n = { ...n, choices };
    if (needStyle && style) n = { ...n, feats: [...n.feats, style] };
    if (exp.length) n = { ...n, expertise: [...n.expertise, ...exp.filter((k) => !n.expertise.includes(k))] };
    n = { ...n, spells: applySwap(n.spells, swap, []) };
    // lo que sube el máximo (calculado sin el ajuste a mano); si los PG máximos estaban fijados a mano (hoja importada),
    // el ajuste sube lo mismo. Los PG actuales suben también eso
    const gain = Math.max(0, derive(free(n), data).hpMax - derive(free(c), data).hpMax);
    if (c.ov.hpMax != null) n = { ...n, ov: { ...n.ov, hpMax: c.ov.hpMax + gain } };
    n = { ...n, hp: Math.max(1, c.hp + gain), updatedAt: Date.now() };
    usePlayer.getState().replace(n);
    onDone(c);
  };

  const okToConfirm = (!asiLevel || asi.mode !== 'feat' || !!asi.feat) && (!asiLevel || asi.mode !== '11' || asi.a !== asi.b) && !!classId;
  // pestañas de nivel de los conjuros nuevos (trucos y cada nivel que puede elegir)
  const spLevels = [...new Set(pickable.map((s) => s.l || 0))].sort((a, b) => a - b);
  const tab = spTab != null && spLevels.includes(spTab) ? spTab : spLevels[0] ?? 0;
  const q = norm(spQ);
  const shownSpells = pickable.filter((s) => (q.length >= 2 ? norm(s.n).includes(q) || norm(s.en || '').includes(q) : (s.l || 0) === tab));
  const peekS = peek ? spellIdx.get(peek) : undefined;
  // lo que falta por decidir (no impide confirmar salvo la dote o las dos características)
  const growLeft = growing.reduce((t, dd) => t + Math.max(0, choiceCount(dd, newLv) - (choices[dd.id]?.length || 0)), 0);
  const pending = [
    needSub && !sub ? 'subclase' : '',
    asiLevel && asi.mode === 'feat' && !asi.feat ? 'dote' : '',
    needStyle && !style ? 'estilo de combate' : '',
    needExp && exp.length < needExp ? 'pericia (' + exp.length + ' de ' + needExp + ')' : '',
    capCantrips && pickedCantrips < capCantrips ? 'trucos (' + pickedCantrips + ' de ' + capCantrips + ')' : '',
    capSpells && pickable.some((x) => x.l) && pickedSpells < capSpells ? 'conjuros (' + pickedSpells + ' de ' + capSpells + ')' : '',
    growLeft ? 'elecciones de ' + (subName || cls?.n) + ' (' + growLeft + ')' : '',
  ].filter(Boolean);
  const subOptions = [...(cls?.sub ? [{ n: cls.sub.n, d: cls.sub.d, f: cls.sub.f }] : []), ...lib.subclasses.filter((x) => x.cls === classId && (!cls?.sub || norm(x.n) !== norm(cls.sub.n))).map((x) => ({ n: x.n, d: x.d, f: x.f }))];
  const allNewFeatures = [
    ...newFeatures.map((f) => ({ n: f.n, src: (cls?.n || '') + ' ' + newLv, d: plainText(f.d) })),
    ...subFeatures.map((f) => ({ n: f.n, src: (subSrd?.n || '') + ' ' + newLv, d: plainText(f.d) })),
    ...libSubFeatures.map((f) => ({ n: f.n, src: (libSub?.n || '') + ' ' + newLv, d: f.d })),
  ];
  const others = data.classes.filter((x) => !owned.some((e) => e.classId === x.id));

  const chipPick = (id: string, on: boolean, full: boolean) => setPicks(on ? picks.filter((x) => x !== id) : full ? picks : [...picks, id]);
  const lvLabel = (l: number) => (l ? 'Nivel ' + l : 'Trucos');

  return (
    <InfoDialog title={'Subir a nivel ' + (total + 1)} onClose={onClose}>
      <div className="lvl lvl2">
        {/* resumen: lo que ganas de un vistazo y lo que falta por decidir */}
        <aside className="lvl-sum" aria-label="Resumen de la subida">
          <b className="lvl-sum-t">{cls?.n || 'Clase'} {newLv - 1} → {newLv}</b>
          <ul className="lvl-gains">
            <li>PG máximos: {before.hpMax} → {before.hpMax + hpGain} <span className="muted small">(+{hpGain})</span></li>
            <li>Dados de golpe +1 d{die}</li>
            {after.pb > before.pb && <li>Competencia {fmt(before.pb)} → {fmt(after.pb)}</li>}
            {allNewFeatures.length > 0 && <li>{allNewFeatures.length} {allNewFeatures.length === 1 ? 'rasgo nuevo' : 'rasgos nuevos'}</li>}
            {needSub && <li>Subclase</li>}
            {asiLevel && <li>Mejora de característica o dote</li>}
            {maxAfter > maxBefore && <li className="lvl-new">Conjuros de nivel {maxAfter}</li>}
            {after.slots.join() !== before.slots.join() && <li>Espacios: {before.slots.join(' · ') || 'ninguno'} → {after.slots.join(' · ')}</li>}
            {after.pact && JSON.stringify(after.pact) !== JSON.stringify(before.pact) && <li>Pacto: {after.pact.n} de nivel {after.pact.lv}</li>}
            {capCantrips > 0 && <li>+{capCantrips} {capCantrips === 1 ? 'truco' : 'trucos'}</li>}
            {capSpells > 0 && <li>+{capSpells} {capSpells === 1 ? 'conjuro preparado' : 'conjuros preparados'}</li>}
            {gainedSpells.length > 0 && <li>{gainedSpells.length} {gainedSpells.length === 1 ? 'conjuro' : 'conjuros'} por tus rasgos</li>}
          </ul>
          {pending.length > 0 ? <p className="small lvl-pending" style={{ margin: 0 }}>Falta: {pending.join(', ')}.</p> : <p className="small lvl-ok" style={{ margin: 0 }}>Todo elegido.</p>}
        </aside>

        <div className="lvl-main">
          <section className="lvl-step lvl-half" data-grp="base">
            <h3 className="eyebrow">Qué clase sube</h3>
            <div className="chips">
              {owned.map((e) => {
                const k = data.classes.find((x) => x.id === e.classId);
                return <button key={e.classId} className={classId === e.classId ? 'chip on' : 'chip'} aria-pressed={classId === e.classId} onClick={() => { setClassId(e.classId); setHp({ mode: 'avg' }); setPicks([]); setStyle(''); setExp([]); }}>{(k?.n || e.className) + ' ' + e.level + ' → ' + (e.level + 1)}</button>;
              })}
            </div>
            <label className="field lvl-multi"><span className="small">O multiclasear en otra clase</span>
              <select className="input" value={owned.some((e) => e.classId === classId) ? '' : classId} onChange={(ev) => { setClassId(ev.target.value || c.classId); setHp({ mode: 'avg' }); setPicks([]); setStyle(''); setExp([]); }}>
                <option value="">Sin multiclase</option>
                {others.map((x) => <option key={x.id} value={x.id}>{x.n} (nivel 1)</option>)}
              </select>
            </label>
            {unmet && <p className="warn small" style={{ margin: 0 }}>Requisito de multiclase: {unmet}. Puedes hacerlo igual si tu máster lo permite.</p>}
          </section>

          <section className="lvl-step lvl-half" data-grp="hp">
            <h3 className="eyebrow">Puntos de golpe</h3>
            <div className="rollrow">
              <button className={hp.mode === 'avg' ? 'chip on' : 'chip'} aria-pressed={hp.mode === 'avg'} onClick={() => setHp({ mode: 'avg' })}>Media: {avg}{fmt(con)} = {Math.max(1, avg + con)}</button>
              <button className="btn small gold" onClick={rollHp}>Tirar 1d{die}{fmt(con)}</button>
              {hp.mode === 'roll' && hp.roll != null && <span className="chip on">Tirada: {hp.roll}{fmt(con)} = {Math.max(1, hp.roll + con)}</span>}
            </div>
            <p className="muted small" style={{ margin: 0 }}>Cada nivel suma un dado de golpe d{die} más tu Constitución ({fmt(con)}); la media es lo seguro, tirar puede dar más o menos.</p>
          </section>

          <section className="lvl-step" data-grp="ft">
            <h3 className="eyebrow">Lo que ganas</h3>
            {!allNewFeatures.length && !gainedSpells.length && <p className="muted small" style={{ margin: 0 }}>{needSub ? 'En este nivel eliges tu subclase: sus rasgos aparecen al elegirla.' : 'Ningún rasgo nuevo en este nivel' + (after.pb > before.pb ? ', pero sube tu competencia' : '') + '.'}</p>}
            <ul className="lvl-feats">
              {allNewFeatures.map((f) => (
                <li key={f.src + f.n} className="lvl-feat">
                  <b>{f.n}</b> <span className="muted small">{f.src}</span>
                  <p className="pc-text lvl-feat-d">{f.d}</p>
                </li>
              ))}
            </ul>
            {gainedSpells.length > 0 && (
              <div className="lvl-gspells">
                <span className="small" style={{ fontWeight: 700 }}>Conjuros que te dan tus rasgos</span>
                <div className="chips">{gainedSpells.map((g) => <button key={g.id} className={peek === g.id ? 'chip on' : 'chip'} title="Ver qué hace" onClick={() => setPeek(peek === g.id ? '' : g.id)}>{spellIdx.get(g.id)?.n} <span className="chip-tag">{g.why}</span></button>)}</div>
              </div>
            )}
          </section>

          {needSub && (
            <section className="lvl-step" data-grp="sub">
              <h3 className="eyebrow">Subclase</h3>
              <p className="muted small" style={{ margin: 0 }}>Define tu estilo de juego desde ahora. Si no lo tienes claro, puedes elegirla más tarde en «Editar hoja».</p>
              <div className="lvl-subs" role="group" aria-label="Subclase">
                {subOptions.map((o) => {
                  const on = sub === o.n;
                  const now = o.f.filter((f) => f.lv === newLv);
                  return (
                    <button key={o.n} className={on ? 'lvl-sub on' : 'lvl-sub'} aria-pressed={on} onClick={() => setSub(on ? '' : o.n)}>
                      <b>{o.n}</b>
                      {o.d && <span className="small lvl-sub-d">{plainText(o.d).slice(0, 220)}{plainText(o.d).length > 220 ? '…' : ''}</span>}
                      {now.length > 0 && <span className="muted small">A nivel {newLv}: {now.map((f) => f.n).join(', ')}</span>}
                    </button>
                  );
                })}
              </div>
              {!subOptions.length && <p className="muted small" style={{ margin: 0 }}>No hay subclases de {cls?.n} en tu biblioteca: elígela más tarde en «Editar hoja».</p>}
            </section>
          )}

          {needStyle && (
            <section className="lvl-step lvl-half" data-grp="sub">
              <h3 className="eyebrow">Estilo de combate</h3>
              <select className="input" aria-label="Estilo de combate" value={style} onChange={(e) => setStyle(e.target.value)}>
                <option value="">Elige un estilo</option>
                {styles.map((f) => <option key={f.n} value={f.n}>{f.n}</option>)}
              </select>
              {style && <p className="pc-text small lvl-feat-d" style={{ margin: 0 }}>{plainText(featText(style))}</p>}
            </section>
          )}

          {needExp > 0 && (
            <section className="lvl-step lvl-half" data-grp="sub">
              <h3 className="eyebrow">Pericia ({exp.length} de {needExp})</h3>
              <p className="muted small" style={{ margin: 0 }}>Duplicas tu bonificador por competencia en dos habilidades en las que ya eres competente.</p>
              <div className="chips" role="group" aria-label="Pericia">
                {expPool.map((k) => { const on = exp.includes(k); return <button key={k} className={on ? 'chip on' : 'chip'} aria-pressed={on} disabled={!on && exp.length >= needExp} onClick={() => setExp(on ? exp.filter((x) => x !== k) : [...exp, k])}>{data.skills[k] || k}</button>; })}
              </div>
              {!expPool.length && <p className="muted small" style={{ margin: 0 }}>No tienes habilidades con competencia sin pericia: márcalas en «Editar hoja» y elige allí la pericia («P»).</p>}
            </section>
          )}

          {asiLevel && (
            <section className="lvl-step" data-grp="asi">
              <h3 className="eyebrow">Mejora de característica o dote</h3>
              <div className="segbox lvl-asi" role="group" aria-label="Mejora">
                {([['2', '+2 a una'], ['11', '+1 a dos'], ['feat', 'Una dote']] as const).map(([k, l]) => <button key={k} className={asi.mode === k ? 'seg on' : 'seg'} aria-pressed={asi.mode === k} onClick={() => setAsi({ ...asi, mode: k })}>{l}</button>)}
              </div>
              {asi.mode !== 'feat' ? (
                <div className="row2">
                  <select className="input" aria-label="Característica que sube" value={asi.a} onChange={(e) => setAsi({ ...asi, a: e.target.value as Abil })}>
                    {ABILS.map((a) => { const to = raise(a, asi.mode === '2' ? 2 : 1); return <option key={a} value={a}>{ABIL_N[a]} {c.abil[a]} → {to}{modOf(to) !== modOf(c.abil[a]) ? ' (' + fmt(modOf(c.abil[a])) + ' → ' + fmt(modOf(to)) + ')' : ''}</option>; })}
                  </select>
                  {asi.mode === '11' && (
                    <select className="input" aria-label="Segunda característica" value={asi.b} onChange={(e) => setAsi({ ...asi, b: e.target.value as Abil })}>
                      {ABILS.map((a) => { const to = raise(a, 1); return <option key={a} value={a}>{ABIL_N[a]} {c.abil[a]} → {to}{modOf(to) !== modOf(c.abil[a]) ? ' (' + fmt(modOf(c.abil[a])) + ' → ' + fmt(modOf(to)) + ')' : ''}</option>; })}
                    </select>
                  )}
                </div>
              ) : (
                <>
                  <select className="input" aria-label="Dote" value={asi.feat} onChange={(e) => { setFeatAbil(''); setAsi({ ...asi, feat: e.target.value }); }}>
                    <option value="">Elige una dote</option>
                    {[...feats, ...epic].filter((f) => !c.feats.includes(f.n)).map((f) => <option key={f.n} value={f.n}>{f.n}{epic.includes(f) ? ' (don épico)' : ''}</option>)}
                  </select>
                  {asi.feat && <p className="pc-text small lvl-feat-d" style={{ margin: 0 }}>{plainText(featText(asi.feat))}</p>}
                  {featFa && (faOpts.length
                    ? <select className="input" aria-label="Característica que sube la dote" value={faPick} onChange={(e) => setFeatAbil(e.target.value)} disabled={faOpts.length === 1}>
                      {faOpts.map((a) => <option key={a} value={a}>{ABIL_N[a]} {c.abil[a]} → {Math.min(featFa.max, c.abil[a] + 1)}{featFa.save ? ' (y competencia en su salvación)' : ''}</option>)}
                    </select>
                    : <p className="warn small" role="status" style={{ margin: 0 }}>Ninguna de sus características se puede subir ya: se añade la dote sin la mejora.</p>)}
                </>
              )}
              {asi.mode === '11' && asi.a === asi.b && <p className="warn small" style={{ margin: 0 }}>Elige dos características distintas.</p>}
              <p className="muted small" style={{ margin: 0 }}>El modificador sube cada 2 puntos. Ninguna puntuación pasa de 20 con esta mejora.</p>
            </section>
          )}

          {(capCantrips > 0 || capSpells > 0) && pickable.length > 0 && (
            <section className="lvl-step" data-grp="sp">
              <h3 className="eyebrow">Conjuros nuevos</h3>
              <p className="small" style={{ margin: 0 }}>
                {[capCantrips ? 'Ganas ' + capCantrips + (capCantrips > 1 ? ' trucos' : ' truco') : '', capSpells ? capSpells + (capSpells > 1 ? ' conjuros preparados más' : ' conjuro preparado más') : ''].filter(Boolean).join(' y ')}.
                {' '}Elegidos: {pickedCantrips} {pickedCantrips === 1 ? 'truco' : 'trucos'} y {pickedSpells} {pickedSpells === 1 ? 'conjuro' : 'conjuros'}. Pulsa uno para ver qué hace.
              </p>
              <div className="rollrow">
                {spLevels.length > 1 && !q && (
                  <span className="sp-tabs" role="tablist" aria-label="Conjuros nuevos por nivel">
                    {spLevels.map((l) => <button key={l} role="tab" aria-selected={tab === l} className={tab === l ? 'sp-tab on' : 'sp-tab'} onClick={() => setSpTab(l)}>{lvLabel(l)}</button>)}
                  </span>
                )}
                <input className="input lvl-spq" aria-label="Buscar conjuro nuevo" placeholder="Buscar…" value={spQ} onChange={(e) => setSpQ(e.target.value)} />
              </div>
              <div className="chips lvl-spells">
                {shownSpells.slice(0, 120).map((s) => {
                  const on = picks.includes(s.id);
                  const full = s.l ? pickedSpells >= capSpells : pickedCantrips >= capCantrips;
                  return <button key={s.id} className={on ? 'chip on' : 'chip'} aria-pressed={on} disabled={!on && full} title={!on && full ? 'Ya has elegido los que ganas' : undefined} onClick={() => { chipPick(s.id, on, full); setPeek(s.id); }}>{s.n} <span className="chip-tag">{s.l ? s.l : 'T'}</span></button>;
                })}
                {!shownSpells.length && <span className="muted small">Ninguno coincide.</span>}
              </div>
            </section>
          )}

          {peekS && (
            <section className="lvl-step lvl-peek" data-grp="sp" aria-label={'Qué hace ' + peekS.n}>
              <b>{peekS.n}</b> <span className="muted small">{peekS.l ? 'nivel ' + peekS.l : 'truco'}{peekS.c ? ' · concentración' : ''}{peekS.rit ? ' · ritual' : ''} · {[peekS.ct, peekS.r, peekS.du].filter(Boolean).join(' · ')}</span>
              <p className="pc-text small lvl-feat-d" style={{ margin: 0 }}>{plainText(peekS.t)}</p>
            </section>
          )}

          {growing.length > 0 && (
            <section className="lvl-step" data-grp="sub">
              <h3 className="eyebrow">Elecciones de {subName || cls?.n}</h3>
              <p className="small" style={{ margin: 0 }}>{growing.map((d) => d.label + ': ' + (choiceCount(d, newLv) - choiceCount(d, newLv - 1)) + ' más').join(' · ')}</p>
              <SubclassChoices c={view} data={data} lib={lib} set={(p) => { if (p.choices) setChoices(p.choices); }} />
            </section>
          )}

          {known.length > 0 && (canCantrip || canSpell || rules.spells?.when === 'rest' || rules.cantrip === 'rest') && (
            <section className="lvl-step" data-grp="sp">
              <h3 className="eyebrow">Cambiar conjuros (opcional)</h3>
              {(canCantrip || canSpell) && <p className="muted small" style={{ margin: 0 }}>Al ganar un nivel de {cls?.n.toLowerCase()} puedes cambiar {[canCantrip ? 'un truco' : '', canSpell ? 'un conjuro' : ''].filter(Boolean).join(' y ')} por otro de tu lista.</p>}
              {(canCantrip || canSpell) && <SpellSwap cls={cls} known={known} pool={swapPool} cantrip={canCantrip} spells={canSpell ? 'one' : null} preparedMax={null} state={swap} setState={setSwap} />}
              {(rules.spells?.when === 'rest' || rules.cantrip === 'rest') && <p className="muted small" style={{ margin: 0 }}>{cls?.n} cambia {rules.spells?.all ? 'todos sus conjuros preparados' : rules.spells ? 'un conjuro' : ''}{rules.cantrip === 'rest' ? (rules.spells ? ' y un truco' : 'un truco') : ''} tras un descanso largo: te lo ofreceré al descansar.</p>}
            </section>
          )}

          <div className="lvl-actions">
            <button className="btn primary" disabled={!okToConfirm} onClick={confirm}>Confirmar: subir a nivel {total + 1}</button>
            <button className="btn ghost" onClick={onClose}>Cancelar</button>
            {pending.length > 0 && <span className="muted small">Puedes subir igual y elegir lo que falta en «Editar hoja».</span>}
          </div>
        </div>
      </div>
    </InfoDialog>
  );
}

