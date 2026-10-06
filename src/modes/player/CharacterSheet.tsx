import { useMemo, useState } from 'react';
import { CONDITIONS } from '../../data/constants';
import { ABILS, type Abil, type ClassFeature, type PlayerData } from '../../data/player';
import { derive, longRest, partsLabel, shortRest, usesMax, type Character } from '../../engine/character';
import { fmt, sgn } from '../../engine/dice';
import { norm } from '../../engine/util';
import Picker from '../../shared/Picker';
import Pips from '../../shared/Pips';
import { useLibrary, type LibraryData } from '../../store/library';
import { usePlayer } from '../../store/player';
import { useStore } from '../../store/useStore';
import type { RollSpec } from '../../store/state';
import { subclassSpells, subclassText } from '../../engine/subclassChoices';
import { plainText, useSpells } from './spells';
import SubclassActions, { choiceResources } from './SubclassActions';
import SubclassChoices, { choiceRows, resolveChoices } from './SubclassChoices';

const ABIL_N: Record<Abil, string> = { str: 'Fuerza', dex: 'Destreza', con: 'Constitución', int: 'Inteligencia', wis: 'Sabiduría', cha: 'Carisma' };
const ABIL_S: Record<Abil, string> = { str: 'FUE', dex: 'DES', con: 'CON', int: 'INT', wis: 'SAB', cha: 'CAR' };

interface FeatureRow { key: string; n: string; d: string; src: string; max: number | null; per: string }

/** Rasgos que tiene a su nivel: de clase, de subclase, de especie y dotes, con sus usos. */
function featureRows(c: Character, data: PlayerData | null, lib: LibraryData): FeatureRow[] {
  const cls = data?.classes.find((x) => x.id === c.classId);
  const sp = data?.species.find((x) => x.id === c.speciesId);
  const rows: FeatureRow[] = [];
  const add = (f: ClassFeature, src: string) => {
    const max = usesMax(f.u, c, cls);
    rows.push({ key: f.n, n: f.n, d: f.d, src, max: max && max > 0 ? max : null, per: f.u?.per || '' });
  };
  cls?.f.filter((f) => f.lv <= c.level).forEach((f) => add(f, cls.n + ' ' + f.lv));
  // los rasgos de la subclase del SRD solo si es la elegida
  if (cls?.sub && c.level >= cls.sub.lv && norm(c.subclass) === norm(cls.sub.n)) cls.sub.f.filter((f) => f.lv <= c.level).forEach((f) => add(f, cls.sub!.n + ' ' + f.lv));
  // subclase de la biblioteca propia (si es la elegida)
  const libSub = lib.subclasses.find((s) => s.cls === c.classId && norm(s.n) === norm(c.subclass));
  libSub?.f.filter((f) => f.lv <= c.level).forEach((f) => rows.push({ key: libSub.id + f.lv + f.n, n: f.n, d: f.d, src: libSub.n + ' ' + f.lv, max: null, per: '' }));
  choiceRows(resolveChoices(c, data, lib)).forEach((r) => rows.push({ ...r, max: null, per: '' }));
  sp?.t.forEach((f) => add(f, sp.n));
  const CAT: Record<string, string> = { origin: 'Dote de origen', general: 'Dote', 'fighting-style': 'Estilo de combate', 'epic-boon': 'Don épico', other: 'Rasgo propio' };
  c.feats.forEach((name) => {
    const ft = data?.feats.find((x) => x.n === name);
    if (ft) { add({ lv: 0, n: ft.n, d: ft.d, u: ft.u }, CAT[ft.cat] || 'Dote'); return; }
    const lf = lib.feats.find((x) => x.n === name);
    if (lf) rows.push({ key: lf.id, n: lf.n, d: (lf.req ? 'Requisitos: ' + lf.req + '\n\n' : '') + lf.d, src: CAT[lf.cat] || 'Dote', max: null, per: '' });
  });
  c.customFeats.forEach((f) => rows.push({ key: f.id, n: f.n, d: f.d, src: CAT[f.cat] || 'Rasgo propio', max: f.max && f.max > 0 ? f.max : null, per: f.per }));
  return rows;
}

export default function CharacterSheet({ c }: { c: Character }) {
  const data = usePlayer((s) => s.data);
  const { update, replace, setEditing } = usePlayer.getState();
  const spellIdx = useSpells();
  const { roll } = useStore.getState();
  const d = useMemo(() => derive(c, data), [c, data]);
  const lib = useLibrary();
  const features = useMemo(() => featureRows(c, data, lib), [c, data, lib]);
  const [amount, setAmount] = useState('');
  const [resting, setResting] = useState(false);
  const [confirmLong, setConfirmLong] = useState(false);

  const sp = data?.species.find((x) => x.id === c.speciesId);
  const bg = data?.backgrounds.find((x) => x.id === c.backgroundId) || lib.backgrounds.find((x) => x.id === c.backgroundId);
  const who = c.name || 'Personaje';
  const r = (label: string, kind: RollSpec['kind'], expr: string, extra: Partial<RollSpec> = {}) =>
    roll({ label: who + ' · ' + label, kind, who, parts: [{ expr }], ...extra });
  const d20 = (b: number) => '1d20' + sgn(b);
  const set = (patch: Partial<Character>) => update(c.id, patch);

  const amt = parseInt(amount, 10);
  const damage = () => {
    if (!(amt > 0)) return;
    const fromTemp = Math.min(c.temp, amt);
    const rest = amt - fromTemp;
    const hp = Math.max(0, c.hp - rest);
    set({ temp: c.temp - fromTemp, hp, death: c.hp > 0 && hp === 0 ? { s: 0, f: 0 } : c.death });
    setAmount('');
  };
  const heal = () => { if (amt > 0) { set({ hp: Math.min(d.hpMax, c.hp + amt), death: { s: 0, f: 0 } }); setAmount(''); } };
  const giveTemp = () => { if (amt > 0) { set({ temp: Math.max(c.temp, amt) }); setAmount(''); } };

  const deathSave = () => r('salvación contra la muerte', 'free', '1d20', {
    after: (total) => {
      const cur = usePlayer.getState().characters.find((x) => x.id === c.id) || c;
      if (total === 20) { update(c.id, { hp: 1, death: { s: 0, f: 0 } }); return { resultNote: '¡20 natural! Recupera 1 PG y vuelve en sí.' }; }
      const ds = { ...cur.death };
      if (total === 1) ds.f += 2; else if (total >= 10) ds.s += 1; else ds.f += 1;
      ds.s = Math.min(3, ds.s); ds.f = Math.min(3, ds.f);
      update(c.id, { death: ds });
      return { resultNote: ds.f >= 3 ? 'Tercer fallo: el personaje muere.' : ds.s >= 3 ? 'Tres éxitos: queda estable.' : total >= 10 ? 'Éxito (' + ds.s + '/3).' : 'Fallo (' + ds.f + '/3).' };
    },
  });

  const spendHd = () => {
    if (c.hdSpent >= c.level) return;
    r('dado de golpe', 'free', '1d' + d.hdDie + sgn(d.mods.con), {
      after: (total) => {
        const cur = usePlayer.getState().characters.find((x) => x.id === c.id) || c;
        const gain = Math.max(0, total);
        update(c.id, { hp: Math.min(d.hpMax, cur.hp + gain), hdSpent: cur.hdSpent + 1 });
        return { resultNote: 'Recupera ' + gain + ' PG.' };
      },
    });
  };

  const skillsSorted = Object.entries(d.skills).sort((a, b) => (data?.skills[a[0]] || a[0]).localeCompare(data?.skills[b[0]] || b[0], 'es'));
  // los de la subclase (siempre preparados) se suman solos a los que ha elegido
  const subSpells = subclassSpells(c, d.cls, subclassText(c, d.cls, lib.subclasses), spellIdx.list).filter((x) => !c.spells.includes(x.id));
  const spellList = [...c.spells.map((k) => ({ k, s: spellIdx.get(k), sub: false })), ...subSpells.map((x) => ({ k: x.id, s: spellIdx.get(x.id), sub: true }))].filter((x) => x.s).sort((a, b) => (a.s!.l || 0) - (b.s!.l || 0) || a.s!.n.localeCompare(b.s!.n, 'es'));
  const hpPct = Math.max(0, Math.min(100, Math.round((c.hp / Math.max(1, d.hpMax)) * 100)));

  return (
    <div className="pc">
      <div className="panel pc-head">
        <div className="panel-head">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <h2>{c.name || 'Sin nombre'}</h2>
            <span className="muted">{[sp?.n || c.speciesName, (d.cls?.n || c.className || 'Sin clase') + ' ' + c.level + (c.subclass ? ' (' + c.subclass + ')' : ''), bg?.n || c.backgroundName].filter(Boolean).join(' · ')}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className={c.inspiration ? 'chip on' : 'chip'} aria-pressed={c.inspiration} onClick={() => set({ inspiration: !c.inspiration })}>Inspiración heroica</button>
            <button className="btn small" onClick={() => setEditing(true)}>Editar hoja</button>
          </div>
        </div>
        <div className="pc-stats">
          <div className="stat" title={d.acNote}><span className="stat-k">CA</span><span className="stat-v">{d.ac}</span><span className="muted small">{d.acNote}</span></div>
          <div className="stat"><span className="stat-k">PG</span><span className="stat-v">{c.hp}<span className="stat-of"> / {d.hpMax}</span></span>{c.temp > 0 && <span className="stat-tmp">+{c.temp} temporales</span>}
            <span className="hpbar"><span className={'hpfill ' + (hpPct <= 25 ? 'low' : hpPct <= 50 ? 'mid' : '')} style={{ width: hpPct + '%' }} /></span></div>
          <button className="stat stat-btn" onClick={() => r('iniciativa', 'init', d20(d.init))} title="Tirar iniciativa"><span className="stat-k">Iniciativa</span><span className="stat-v">{fmt(d.init)}</span></button>
          <div className="stat"><span className="stat-k">Velocidad</span><span className="stat-v">{d.speed}<span className="stat-of"> pies</span></span></div>
          <div className="stat"><span className="stat-k">Competencia</span><span className="stat-v">{fmt(d.pb)}</span></div>
          <div className="stat"><span className="stat-k">Percepción pasiva</span><span className="stat-v">{d.pp}</span></div>
        </div>
        <div className="pc-hp-row">
          <input className="input" type="number" min={0} inputMode="numeric" aria-label="Cantidad de PG" placeholder="PG" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') damage(); }} />
          <button className="btn primary" onClick={damage}>Daño</button>
          <button className="btn heal" onClick={heal}>Curación</button>
          <button className="btn temp" onClick={giveTemp}>PG temporales</button>
          <span className="muted small">Dados de golpe: {c.level - c.hdSpent}/{c.level} (d{d.hdDie})</span>
        </div>
        {c.hp === 0 && (
          <div className="sub" style={{ borderColor: '#c0513c' }}>
            <div className="panel-head"><strong style={{ color: '#f3e6c8' }}>Salvaciones contra la muerte</strong>
              <span className="res-row">
                <span className="res">Éxitos <span className="pips">{[0, 1, 2].map((j) => <span key={j} className={j < c.death.s ? 'pip ok' : 'pip off'} />)}</span></span>
                <span className="res">Fallos <span className="pips">{[0, 1, 2].map((j) => <span key={j} className={j < c.death.f ? 'pip bad' : 'pip off'} />)}</span></span>
              </span>
            </div>
            <button className="btn small gold" style={{ alignSelf: 'flex-start' }} onClick={deathSave}>Tirar salvación</button>
          </div>
        )}
      </div>

      <div className="pc-grid">
        <section className="panel" aria-label="Características">
          <h3 className="eyebrow">Características y salvaciones</h3>
          <div className="pc-abils">
            {ABILS.map((a) => (
              <div key={a} className="pc-abil">
                <span className="pc-abil-k">{ABIL_S[a]} <b>{c.abil[a]}</b></span>
                <button className="btn small" title={'Prueba de ' + ABIL_N[a]} onClick={() => r('prueba de ' + ABIL_N[a], 'check', d20(d.mods[a]))}>Prueba {fmt(d.mods[a])}</button>
                <button className={d.saves[a].prof ? 'btn small gold' : 'btn small ghost'} title={'Salvación de ' + ABIL_N[a] + (d.saves[a].prof ? ' (competente)' : '')} onClick={() => r('salvación de ' + ABIL_N[a], 'save', d20(d.saves[a].bonus))}>Salv {fmt(d.saves[a].bonus)}</button>
              </div>
            ))}
          </div>
        </section>

        <section className="panel" aria-label="Habilidades">
          <h3 className="eyebrow">Habilidades</h3>
          <ul className="pc-skills">
            {skillsSorted.map(([k, s]) => (
              <li key={k}>
                <button className="pc-skill" onClick={() => r(data?.skills[k] || k, 'check', d20(s.bonus))} title={'Tirar ' + (data?.skills[k] || k)}>
                  <span className={s.exp ? 'dot exp' : s.prof ? 'dot on' : 'dot'} aria-label={s.exp ? 'Pericia' : s.prof ? 'Competente' : 'Sin competencia'} />
                  <span className="pc-skill-n">{data?.skills[k] || k} <span className="muted small">{ABIL_S[s.abil]}</span></span>
                  <b>{fmt(s.bonus)}</b>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="panel" aria-label="Ataques">
        <h3 className="eyebrow">Ataques</h3>
        {!d.attacks.length && <p className="muted small" style={{ margin: 0 }}>Añade tus armas en «Editar hoja».</p>}
        {d.attacks.map(({ w, atk, parts, verParts }) => (
          <div key={w.id} className="pc-attack">
            <span className="pc-attack-n">{w.name}<span className="muted small">{[w.kind === 'ranged' ? 'distancia' : 'cuerpo a cuerpo', w.range, ...(w.props || []), w.mastery ? 'maestría: ' + w.mastery : ''].filter(Boolean).join(' · ')}</span></span>
            <span className="rollrow">
              <button className="rollbtn" onClick={() => r(w.name + ': ataque', 'attack', d20(atk))}>Ataque {fmt(atk)}</button>
              <button className="rollbtn dmg" onClick={() => roll({ label: who + ' · ' + w.name + ': daño', kind: 'damage', who, by: null, parts })}>Daño {partsLabel(parts)}</button>
              {verParts.length > 0 && <button className="rollbtn dmg" onClick={() => roll({ label: who + ' · ' + w.name + ': daño a dos manos', kind: 'damage', who, by: null, parts: verParts })}>A dos manos {partsLabel(verParts)}</button>}
            </span>
          </div>
        ))}
      </section>

      <SubclassActions c={c} d={d} data={data} lib={lib} set={set} />

      {(d.spell || spellList.length > 0) && (
        <section className="panel" aria-label="Conjuros">
          <div className="panel-head">
            <h3 className="eyebrow">Conjuros</h3>
            {d.spell && <span className="rollrow">
              <span className="muted small">CD {d.spell.dc} · {ABIL_N[d.spell.abil]}</span>
              <button className="rollbtn" onClick={() => r('ataque de conjuro', 'attack', d20(d.spell!.atk))}>Ataque de conjuro {fmt(d.spell.atk)}</button>
            </span>}
          </div>
          {d.slots.length > 0 && (
            <div className="pc-slots">
              {d.slots.map((n, i) => (
                <span key={i} className="res">Nivel {i + 1}
                  <Pips max={n} used={Math.min(n, c.slotsUsed[i] || 0)} label={'Espacios de nivel ' + (i + 1)} onSet={(v) => { const u = c.slotsUsed.slice(); u[i] = Math.max(0, Math.min(n, v)); set({ slotsUsed: u }); }} />
                </span>
              ))}
            </div>
          )}
          {d.pact && <div className="pc-slots"><span className="res">Magia de pacto (nivel {d.pact.lv})<Pips max={d.pact.n} used={Math.min(d.pact.n, c.pactUsed)} label="Espacios de pacto" onSet={(v) => set({ pactUsed: Math.max(0, Math.min(d.pact!.n, v)) })} /></span></div>}
          {!spellList.length ? <p className="muted small" style={{ margin: 0 }}>Añade tus conjuros en «Editar hoja».</p> : (
            <ul className="pc-features">
              {spellList.map(({ k, s, sub }) => (
                <li key={k}>
                  <details>
                    <summary><b>{s!.n}</b> <span className="muted small">{s!.l ? 'nivel ' + s!.l : 'truco'}{s!.c ? ' · concentración' : ''}{s!.rit ? ' · ritual' : ''}</span>{sub && <span className="chip-tag">Subclase · siempre preparado</span>}</summary>
                    <p className="muted small" style={{ margin: '4px 0' }}>{[s!.ct, s!.r, s!.cmp, s!.du].filter(Boolean).join(' · ')}</p>
                    <p className="pc-text">{plainText(s!.t)}</p>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="panel" aria-label="Rasgos y dotes">
        <h3 className="eyebrow">Rasgos y dotes</h3>
        <SubclassChoices c={c} data={data} lib={lib} set={set} restOnly />
        {!features.length && <p className="muted small" style={{ margin: 0 }}>Elige especie, clase y dotes en «Editar hoja» para ver aquí sus rasgos.</p>}
        <ul className="pc-features">
          {features.map((f) => (
            <li key={f.src + f.key}>
              <details>
                <summary>
                  <b>{f.n}</b> <span className="muted small">{f.src}{f.per ? ' · se recupera en descanso ' + (f.per === 'sr' ? 'corto o largo' : 'largo') : ''}</span>
                  {f.max != null && <span onClick={(e) => e.preventDefault()}><Pips max={f.max} used={Math.min(f.max, c.uses[f.key] || 0)} label={'Usos de ' + f.n} onSet={(v) => set({ uses: { ...c.uses, [f.key]: Math.max(0, Math.min(f.max!, v)) } })} /></span>}
                </summary>
                <p className="pc-text">{f.d}</p>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel" aria-label="Estados y descansos">
        <Picker title="Estados" summary={[...c.conds, c.exh ? 'Agotamiento ' + c.exh : ''].filter(Boolean).join(', ')}>
          <div className="chips">
            {CONDITIONS.map(([k]) => <button key={k} className={c.conds.includes(k) ? 'chip on' : 'chip'} aria-pressed={c.conds.includes(k)} onClick={() => set({ conds: c.conds.includes(k) ? c.conds.filter((x) => x !== k) : [...c.conds, k] })}>{k}</button>)}
          </div>
          <span className="res">Agotamiento
            <span className="stepper">
              <button className="step" aria-label="Reducir agotamiento" onClick={() => set({ exh: Math.max(0, c.exh - 1) })}>−</button>
              <span className="qty">{c.exh}</span>
              <button className="step" aria-label="Aumentar agotamiento" onClick={() => set({ exh: Math.min(6, c.exh + 1) })}>+</button>
            </span>
          </span>
        </Picker>
        {c.conds.length > 0 && <ul className="rem">{c.conds.map((k) => <li key={k}><span><strong>{k}:</strong> {CONDITIONS.find((x) => x[0] === k)?.[1]}</span></li>)}</ul>}
        <div className="pc-rest">
          <button className="btn small" onClick={() => setResting(!resting)} aria-expanded={resting}>Descanso corto</button>
          <button className="btn small" onClick={() => { if (confirmLong) { replace(longRest(c, d)); setConfirmLong(false); } else setConfirmLong(true); }}>{confirmLong ? '¿Seguro? Descanso largo' : 'Descanso largo'}</button>
        </div>
        {resting && (
          <div className="sub">
            <span className="small">Gasta dados de golpe para curarte (d{d.hdDie} {fmt(d.mods.con)} cada uno). Te quedan {c.level - c.hdSpent}.</span>
            <div className="rollrow">
              <button className="rollbtn" disabled={c.hdSpent >= c.level || c.hp >= d.hpMax} onClick={spendHd}>Gastar un dado de golpe</button>
              <button className="btn small primary" onClick={() => { replace(shortRest(c, [...features.filter((f) => f.per === 'sr').map((f) => f.key), ...choiceResources(c, data, lib).filter((r) => r.per === 'sr').map((r) => r.key)])); setResting(false); }}>Terminar descanso corto</button>
            </div>
          </div>
        )}
      </section>

      <section className="panel" aria-label="Notas">
        <div className="row2">
          <div className="field"><label htmlFor="pc-langs">Idiomas</label><input id="pc-langs" className="input" value={c.langs} onChange={(e) => set({ langs: e.target.value })} /></div>
          <div className="field"><label htmlFor="pc-tools">Herramientas</label><input id="pc-tools" className="input" value={c.tools} onChange={(e) => set({ tools: e.target.value })} /></div>
        </div>
        <div className="field"><label htmlFor="pc-notes">Notas</label><textarea id="pc-notes" className="input" rows={4} value={c.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Equipo, objetivos, vínculos, lo que pasó la última sesión…" /></div>
      </section>
    </div>
  );
}
