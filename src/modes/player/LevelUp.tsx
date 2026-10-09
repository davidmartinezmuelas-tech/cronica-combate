import { useState } from 'react';
import { ABILS, type Abil, type ClassData, type ClassFeature, type PlayerData } from '../../data/player';
import { asClass, classEntries, derive, totalLevel, type Character, type ClassEntry } from '../../engine/character';
import { activeChoices, choiceCount, spellSwapRules } from '../../engine/subclassChoices';
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
  const [asi, setAsi] = useState<{ mode: '2' | '11' | 'feat'; a: Abil; b: Abil; feat: string }>({ mode: '2', a: 'str', b: 'dex', feat: '' });
  const [sub, setSub] = useState('');
  const [picks, setPicks] = useState<string[]>([]);
  // elecciones de subclase (maniobras, invocaciones…) hechas aquí y un conjuro cambiado por otro (opcional)
  const [choices, setChoices] = useState<Record<string, string[]>>(() => c.choices || {});
  const [swap, setSwap] = useState<SwapState>(emptySwap);
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
  const classSpells = new Set([...(cls?.spells || []), ...spellIdx.list.filter((s) => s.classes?.includes(classId)).map((s) => s.id)]);
  // solo lo que toca: trucos si gana trucos; conjuros si gana preparados o un nivel nuevo (los del nivel recién desbloqueado, primero)
  const wantSpells = newPrepared > 0 || maxAfter > maxBefore;
  const pickable = spellIdx.list
    .filter((s) => classSpells.has(s.id) && !c.spells.includes(s.id) && (s.l || 0) <= maxAfter && (s.l ? wantSpells : newCantrips > 0))
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
      else if (asi.feat) n = { ...n, feats: [...n.feats, asi.feat] };
    }
    if (hp.mode === 'roll' && hp.roll != null) n = { ...n, hpRolls: { ...(n.hpRolls || {}), [classId + ':' + newLv]: hp.roll } };
    if (picks.length) n = { ...n, spells: [...n.spells, ...picks.filter((id) => !n.spells.includes(id))] };
    if (growing.length) n = { ...n, choices };
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
  const others = data.classes.filter((x) => !owned.some((e) => e.classId === x.id));

  return (
    <InfoDialog title={'Subir a nivel ' + (total + 1)} onClose={onClose}>
      <div className="lvl">
        <section className="lvl-step">
          <h3 className="eyebrow">1 · Qué clase sube</h3>
          <div className="chips">
            {owned.map((e) => {
              const k = data.classes.find((x) => x.id === e.classId);
              return <button key={e.classId} className={classId === e.classId ? 'chip on' : 'chip'} aria-pressed={classId === e.classId} onClick={() => { setClassId(e.classId); setHp({ mode: 'avg' }); setPicks([]); }}>{(k?.n || e.className) + ' ' + e.level + ' → ' + (e.level + 1)}</button>;
            })}
          </div>
          <label className="field lvl-multi"><span className="small">O multiclasear en otra clase</span>
            <select className="input" value={owned.some((e) => e.classId === classId) ? '' : classId} onChange={(ev) => { setClassId(ev.target.value || c.classId); setHp({ mode: 'avg' }); setPicks([]); }}>
              <option value="">Sin multiclase</option>
              {others.map((x) => <option key={x.id} value={x.id}>{x.n} (nivel 1)</option>)}
            </select>
          </label>
          {unmet && <p className="warn small" style={{ margin: 0 }}>Requisito de multiclase: {unmet}. Puedes hacerlo igual si tu máster lo permite.</p>}
        </section>

        <section className="lvl-step">
          <h3 className="eyebrow">2 · Puntos de golpe</h3>
          <div className="rollrow">
            <button className={hp.mode === 'avg' ? 'chip on' : 'chip'} aria-pressed={hp.mode === 'avg'} onClick={() => setHp({ mode: 'avg' })}>Media: {avg}{fmt(con)} = {Math.max(1, avg + con)}</button>
            <button className="btn small gold" onClick={rollHp}>Tirar 1d{die}{fmt(con)}</button>
            {hp.mode === 'roll' && hp.roll != null && <span className="chip on">Tirada: {hp.roll}{fmt(con)} = {Math.max(1, hp.roll + con)}</span>}
          </div>
          <p className="muted small" style={{ margin: 0 }}>PG máximos: {before.hpMax} → {before.hpMax + hpGain}{after.pb > before.pb ? ' · competencia ' + fmt(before.pb) + ' → ' + fmt(after.pb) : ''} · dados de golpe +1 d{die}</p>
        </section>

        <section className="lvl-step">
          <h3 className="eyebrow">3 · Lo que ganas</h3>
          {[...newFeatures, ...subFeatures].length + libSubFeatures.length === 0 && <p className="muted small" style={{ margin: 0 }}>Ningún rasgo nuevo en este nivel{after.pb > before.pb ? ', pero sube tu competencia' : ''}.</p>}
          <ul className="lvl-feats">
            {newFeatures.map((f) => <li key={'c' + f.n}><details><summary><b>{f.n}</b> <span className="muted small">{cls?.n} {newLv}</span></summary><p className="pc-text">{plainText(f.d)}</p></details></li>)}
            {subFeatures.map((f) => <li key={'s' + f.n}><details><summary><b>{f.n}</b> <span className="muted small">{subSrd?.n} {newLv}</span></summary><p className="pc-text">{plainText(f.d)}</p></details></li>)}
            {libSubFeatures.map((f) => <li key={'l' + f.n}><details><summary><b>{f.n}</b> <span className="muted small">{libSub?.n} {newLv}</span></summary><p className="pc-text">{f.d}</p></details></li>)}
          </ul>
          {maxAfter > maxBefore && <p className="lvl-new">Ya puedes lanzar conjuros de nivel {maxAfter}.</p>}
          {after.slots.join() !== before.slots.join() && <p className="muted small" style={{ margin: 0 }}>Espacios de conjuro: {before.slots.join(' · ') || 'ninguno'} → {after.slots.join(' · ')}</p>}
          {after.pact && JSON.stringify(after.pact) !== JSON.stringify(before.pact) && <p className="muted small" style={{ margin: 0 }}>Magia de pacto: {after.pact.n} espacios de nivel {after.pact.lv}</p>}
        </section>

        {needSub && (
          <section className="lvl-step">
            <h3 className="eyebrow">4 · Subclase</h3>
            <select className="input" aria-label="Subclase" value={sub} onChange={(e) => setSub(e.target.value)}>
              <option value="">Elígela (o más tarde en «Editar hoja»)</option>
              {cls?.sub && <option value={cls.sub.n}>{cls.sub.n}</option>}
              {lib.subclasses.filter((s) => s.cls === classId).map((s) => <option key={s.id} value={s.n}>{s.n}</option>)}
            </select>
          </section>
        )}

        {asiLevel && (
          <section className="lvl-step">
            <h3 className="eyebrow">{needSub ? '5' : '4'} · Mejora de característica o dote</h3>
            <div className="segbox lvl-asi" role="group" aria-label="Mejora">
              {([['2', '+2 a una'], ['11', '+1 a dos'], ['feat', 'Una dote']] as const).map(([k, l]) => <button key={k} className={asi.mode === k ? 'seg on' : 'seg'} aria-pressed={asi.mode === k} onClick={() => setAsi({ ...asi, mode: k })}>{l}</button>)}
            </div>
            {asi.mode !== 'feat' ? (
              <div className="row2">
                <select className="input" aria-label="Característica que sube" value={asi.a} onChange={(e) => setAsi({ ...asi, a: e.target.value as Abil })}>
                  {ABILS.map((a) => <option key={a} value={a}>{ABIL_N[a]} {c.abil[a]} → {raise(a, asi.mode === '2' ? 2 : 1)}</option>)}
                </select>
                {asi.mode === '11' && (
                  <select className="input" aria-label="Segunda característica" value={asi.b} onChange={(e) => setAsi({ ...asi, b: e.target.value as Abil })}>
                    {ABILS.map((a) => <option key={a} value={a}>{ABIL_N[a]} {c.abil[a]} → {raise(a, 1)}</option>)}
                  </select>
                )}
              </div>
            ) : (
              <select className="input" aria-label="Dote" value={asi.feat} onChange={(e) => setAsi({ ...asi, feat: e.target.value })}>
                <option value="">Elige una dote general</option>
                {feats.filter((f) => !c.feats.includes(f.n)).map((f) => <option key={f.n} value={f.n}>{f.n}</option>)}
              </select>
            )}
            {asi.mode === '11' && asi.a === asi.b && <p className="warn small" style={{ margin: 0 }}>Elige dos características distintas.</p>}
            <p className="muted small" style={{ margin: 0 }}>Ninguna puntuación pasa de 20 con esta mejora.</p>
          </section>
        )}

        {(newCantrips > 0 || newPrepared > 0 || maxAfter > maxBefore) && pickable.length > 0 && (
          <section className="lvl-step">
            <h3 className="eyebrow">Conjuros nuevos</h3>
            <p className="small" style={{ margin: 0 }}>
              {[newCantrips ? 'Ganas ' + newCantrips + (newCantrips > 1 ? ' trucos' : ' truco') : '', newPrepared ? newPrepared + (newPrepared > 1 ? ' conjuros preparados más' : ' conjuro preparado más') : ''].filter(Boolean).join(' y ') || 'Puedes cambiar o añadir conjuros'}.
              {' '}Elegidos: {pickedCantrips} {pickedCantrips === 1 ? 'truco' : 'trucos'} y {pickedSpells} {pickedSpells === 1 ? 'conjuro' : 'conjuros'}.
            </p>
            <div className="chips lvl-spells">
              {pickable.slice(0, 80).map((s) => {
                const on = picks.includes(s.id);
                return <button key={s.id} className={on ? 'chip on' : 'chip'} aria-pressed={on} onClick={() => setPicks(on ? picks.filter((x) => x !== s.id) : [...picks, s.id])}>{s.n} <span className="chip-tag">{s.l ? s.l : 'T'}</span></button>;
              })}
            </div>
          </section>
        )}

        {growing.length > 0 && (
          <section className="lvl-step">
            <h3 className="eyebrow">Elecciones de {subName || cls?.n}</h3>
            <p className="small" style={{ margin: 0 }}>{growing.map((d) => d.label + ': ' + (choiceCount(d, newLv) - choiceCount(d, newLv - 1)) + ' más').join(' · ')}</p>
            <SubclassChoices c={view} data={data} lib={lib} set={(p) => { if (p.choices) setChoices(p.choices); }} />
          </section>
        )}

        {known.length > 0 && (canCantrip || canSpell || rules.spells?.when === 'rest' || rules.cantrip === 'rest') && (
          <section className="lvl-step">
            <h3 className="eyebrow">Cambiar conjuros (opcional)</h3>
            {(canCantrip || canSpell) && <p className="muted small" style={{ margin: 0 }}>Al ganar un nivel de {cls?.n.toLowerCase()} puedes cambiar {[canCantrip ? 'un truco' : '', canSpell ? 'un conjuro' : ''].filter(Boolean).join(' y ')} por otro de tu lista.</p>}
            {(canCantrip || canSpell) && <SpellSwap cls={cls} known={known} pool={swapPool} cantrip={canCantrip} spells={canSpell ? 'one' : null} preparedMax={null} state={swap} setState={setSwap} />}
            {(rules.spells?.when === 'rest' || rules.cantrip === 'rest') && <p className="muted small" style={{ margin: 0 }}>{cls?.n} cambia {rules.spells?.all ? 'todos sus conjuros preparados' : rules.spells ? 'un conjuro' : ''}{rules.cantrip === 'rest' ? (rules.spells ? ' y un truco' : 'un truco') : ''} tras un descanso largo: te lo ofreceré al descansar.</p>}
          </section>
        )}

        <div className="lvl-actions">
          <button className="btn primary" disabled={!okToConfirm} onClick={confirm}>Confirmar: subir a nivel {total + 1}</button>
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </InfoDialog>
  );
}

