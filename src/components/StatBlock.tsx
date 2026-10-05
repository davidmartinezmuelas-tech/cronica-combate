import { ABIL, ABIL_LONG, DMG_TYPES, SECTIONS } from '../data/constants';
import type { Combatant, Feature, Monster, SectionKey } from '../data/types';
import { fmt, modOf, parseExpr, prettyExpr, sgn } from '../engine/dice';
import { nfmt, pbOf } from '../engine/util';
import { useStore } from '../store/useStore';
import { D20Icon } from './Icons';

const dmgLabel = (parts: [string, string][]) => parts.map(([d, t]) => prettyExpr(d) + (t ? ' ' + t : '')).join(' + ');

interface PipProps { max: number; used: number; onSet: (v: number) => void; label: string }
export function Pips({ max, used, onSet, label }: PipProps) {
  return (
    <span className="pips" role="group" aria-label={label + ': ' + (max - used) + ' de ' + max + ' disponibles'}>
      {Array.from({ length: max }, (_, j) => {
        const avail = j < max - used;
        return <button key={j} className={avail ? 'pip' : 'pip off'} aria-label={avail ? 'Gastar uno' : 'Recuperar uno'} title={avail ? 'Disponible' : 'Gastado'} onClick={() => onSet(avail ? used + 1 : used - 1)} />;
      })}
    </span>
  );
}

function SpellList({ f, c }: { f: Feature; c: Combatant | null }) {
  const spells = useStore((s) => s.spells);
  const spellOpen = useStore((s) => s.spellOpen);
  const { set, setSpUsed } = useStore.getState();
  const groups = new Map<string, NonNullable<Feature['sp']>>();
  (f.sp || []).forEach((x) => { const u = x[1] || ''; groups.set(u, [...(groups.get(u) || []), x]); });
  return (
    <>
      {Array.from(groups.entries()).map(([u, list]) => {
        const dn = /^(\d+)\/día/.exec(u);
        const max = dn ? parseInt(dn[1], 10) : 0;
        return (
          <div className="sp-group" key={u}>
            <span className="sp-label">{u === 'a voluntad' ? 'A voluntad' : u.includes('/día') ? u + ' cada uno' : 'Conjuros'}</span>
            {list.map(([k, , nm]) => {
              const sp = spells[k];
              const used = c ? c.spUsed[k] || 0 : 0;
              return (
                <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {sp ? (
                    <button className={spellOpen === k ? 'spell on' : 'spell'} aria-expanded={spellOpen === k} onClick={() => set({ spellOpen: spellOpen === k ? null : k })}>
                      {sp.n}<span className="spell-lv">{sp.l ? 'nv ' + sp.l : 'truco'}</span>
                    </button>
                  ) : <span className="spell">{nm || k}</span>}
                  {c && max > 0 && <Pips max={max} used={used} label={'Usos de ' + (sp?.n || nm)} onSet={(v) => setSpUsed(c.id, k, v, max)} />}
                </span>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

function FeatureRow({ c, sec, f, i, who }: { c: Combatant | null; sec: SectionKey; f: Feature; i: number; who: string }) {
  const { roll, setSpent, setUsed, useLeg, useLR } = useStore.getState();
  const key = sec + i;
  let tag = '';
  if (f.rc) tag = f.rc === 6 ? 'Recarga 6' : 'Recarga ' + f.rc + '–6';
  else if (f.day) tag = f.day + '/día' + (f.dayl ? ' (' + f.dayl + ' en guarida)' : '');
  if (sec === 'lg' && f.cost && f.cost > 1) tag = 'Cuesta ' + f.cost + ' acciones';
  const isLR = !!f.isLR || /^Resistencia legendaria/.test(f.n);
  const spent = !!(c && f.rc && c.spent[key]);
  const legCost = f.cost || 1;
  const okDmg = !!(f.dmg && f.dmg.length && f.dmg.every((p) => parseExpr(p[0])));
  const dayMax = c && f.day && !isLR ? (c.inLair && f.dayl ? f.dayl : f.day) : 0;
  return (
    <div className="sb-action">
      <p className="sb-desc">
        <strong><em>{f.n}</em></strong>{tag && <span className="sb-tag">{tag}</span>}{f.en && <span className="en-note">texto original en inglés</span>}. {f.d}
      </p>
      {f.sp && <SpellList f={f} c={c} />}
      <div className="rollrow">
        {f.atk != null && (
          <button className="rollbtn" onClick={() => roll({ label: who + ' · ' + f.n + ': ataque', kind: 'attack', who, cid: c?.id, parts: [{ expr: '1d20' + sgn(f.atk || 0) }] })}>
            <D20Icon />Ataque {fmt(f.atk || 0)}
          </button>
        )}
        {f.dc && <span className="dc-chip">CD {f.dc[0]} {f.dc[1]}{f.half ? ' · mitad si supera' : ''}</span>}
        {okDmg && (
          <button className="rollbtn dmg" onClick={() => {
            roll({ label: who + ' · ' + f.n + ': daño', kind: 'damage', who, half: !!f.half, by: c?.id ?? null, parts: f.dmg!.map(([e, t]) => ({ expr: e, type: t })) });
            if (c && f.rc) setSpent(c.id, key, true);
          }}>Daño {dmgLabel(f.dmg!)}</button>
        )}
        {okDmg && (f.alt || []).filter((a) => a.dmg.every((p) => parseExpr(p[0]))).map((a) => (
          <button key={a.l} className="rollbtn dmg" onClick={() => {
            roll({ label: who + ' · ' + f.n + ': daño ' + a.l, kind: 'damage', who, half: !!f.half, by: c?.id ?? null, parts: a.dmg.map(([e, t]) => ({ expr: e, type: t })) });
            if (c && f.rc) setSpent(c.id, key, true);
          }}>Daño {a.l}: {dmgLabel(a.dmg)}</button>
        ))}
        {c && f.rc && <button className={spent ? 'rc spent' : 'rc'} onClick={() => setSpent(c.id, key, !spent)}>{spent ? 'Gastada (pulsa para recargar)' : 'Disponible'}</button>}
        {c && dayMax > 0 && <Pips max={dayMax} used={c.used[key] || 0} label={'Usos de ' + f.n} onSet={(v) => setUsed(c.id, key, v, dayMax)} />}
        {c && sec === 'lg' && c.laMax > 0 && (
          <button className={c.laMax - c.laUsed >= legCost ? 'btn small gold' : 'btn small ghost'} onClick={() => useLeg(c.id, legCost, f.n)}>Usar ({legCost})</button>
        )}
        {c && isLR && c.lrMax > 0 && <button className="btn small gold" onClick={() => useLR(c.id)}>Usar ({c.lrMax - c.lrUsed} restantes)</button>}
      </div>
    </div>
  );
}

export function SpellCard() {
  const key = useStore((s) => s.spellOpen);
  const sp = useStore((s) => (s.spellOpen ? s.spells[s.spellOpen] : undefined));
  const { set, roll } = useStore.getState();
  if (!key || !sp) return null;
  const dice = /(\d+d\d+)/.exec(sp.d || '');
  const type = DMG_TYPES.find((t) => new RegExp('daño de ' + t, 'i').test(sp.d || '')) || '';
  const meta = [sp.l ? 'Nivel ' + sp.l : 'Truco', sp.ct, sp.r, sp.du, sp.c ? 'concentración' : '', sp.rit ? 'ritual' : '', sp.cmp].filter(Boolean).join(' · ');
  return (
    <div className="spellcard" role="region" aria-label={'Conjuro ' + sp.n}>
      <div className="panel-head" style={{ alignItems: 'flex-start' }}>
        <div><h3>{sp.n}</h3><span style={{ fontFamily: "'Alegreya Sans', sans-serif", fontSize: 13, fontWeight: 700, color: '#6b5238' }}>{meta}</span></div>
        <span style={{ display: 'flex', gap: 6 }}>
          <button className="rollbtn" onClick={() => void useStore.getState().openRuleByName(sp.n, 'Conjuros')}>Ver en Reglas</button>
          <button className="rollbtn dmg" onClick={() => set({ spellOpen: null })}>Cerrar</button>
        </span>
      </div>
      <p className="sb-desc" style={{ margin: 0 }}>{sp.d || 'Sin descripción disponible.'}</p>
      {dice && <div className="rollrow"><button className="rollbtn" onClick={() => roll({ label: sp.n, kind: 'damage', parts: [{ expr: dice[1], type }] })}>Tirar {dice[1]}{type ? ' ' + type : ''}</button></div>}
    </div>
  );
}

export default function StatBlock({ m, c }: { m: Monster; c: Combatant | null }) {
  const { roll } = useStore.getState();
  const who = c ? c.name : m.n;
  const lines: [string, string][] = [];
  const add = (l: string, v?: string | null) => { if (v && String(v).trim()) lines.push([l, String(v)]); };
  add('Habilidades', m.sk);
  add('Vulnerabilidades', m.vul.join(', '));
  add('Resistencias', m.res.join(', '));
  const imm = m.imm.join(', ');
  const ci = m.ci.join(', ');
  add('Inmunidades', imm && ci ? imm + '; ' + ci : imm || ci);
  add('Sentidos', (m.sen ? m.sen + '; ' : '') + 'Percepción pasiva ' + m.pp);
  add('Idiomas', m.lang);
  add('VD', m.cr + ' (PX ' + nfmt(m.xp) + (m.xpl ? ', o ' + nfmt(m.xpl) + ' en su guarida' : '') + '; BC ' + fmt(m.pb || pbOf(m.cr)) + ')');
  if (m.hab?.length) add('Hábitat', m.hab.join(', '));
  return (
    <article className="statblock" aria-label={'Hoja de ' + m.n}>
      <h2 className="sb-name">{m.n}</h2>
      <p className="sb-meta">{m.sz} {m.t}, {m.al}{m.en && <span className="en-note">{m.en}</span>}</p>
      <div className="sb-rule" />
      <div className="sb-top">
        <p><span className="sb-label">CA</span> {m.ac}</p>
        <p><span className="sb-label">Iniciativa</span>{' '}
          <button className="abil-btn" style={{ width: 'auto', display: 'inline' }} onClick={() => roll({ label: who + ' · iniciativa', kind: 'init', cid: c?.id, parts: [{ expr: '1d20' + sgn(m.ini || 0) }] })}>
            {fmt(m.ini || 0)} ({10 + (m.ini || 0)})
          </button></p>
      </div>
      <p><span className="sb-label">PG</span> {m.hp} ({prettyExpr(m.hd)})</p>
      <p><span className="sb-label">Velocidad</span> {m.spd || '—'}</p>
      <div className="sb-rule" />
      <div className="sb-abils">
        {m.ab.map((sc, i) => {
          const md = modOf(sc);
          const sv = m.sv ? m.sv[i] : md;
          return (
            <div className="abil-box" key={i}>
              <span className="abil-k">{ABIL[i]} {sc}</span>
              <button className="abil-btn" title={'Prueba de ' + ABIL_LONG[i]} aria-label={'Prueba de ' + ABIL_LONG[i] + ' ' + fmt(md)}
                onClick={() => roll({ label: who + ' · prueba de ' + ABIL_LONG[i], kind: 'check', cid: c?.id, ability: i, parts: [{ expr: '1d20' + sgn(md) }] })}>Mod {fmt(md)}</button>
              <button className="abil-btn" title={'Salvación de ' + ABIL_LONG[i]} aria-label={'Salvación de ' + ABIL_LONG[i] + ' ' + fmt(sv)}
                onClick={() => roll({ label: who + ' · salvación de ' + ABIL_LONG[i], kind: 'save', cid: c?.id, ability: i, parts: [{ expr: '1d20' + sgn(sv) }] })}>Salv {fmt(sv)}</button>
            </div>
          );
        })}
      </div>
      <div className="sb-rule" />
      {lines.map(([l, v]) => <p key={l}><span className="sb-label">{l}</span> {v}</p>)}
      {SECTIONS.filter(([k]) => (m[k] || []).length).map(([k, title]) => (
        <section key={k} aria-label={title}>
          {k === 'tr' ? <div className="sb-rule" /> : <h3 className="sb-section">{title}</h3>}
          {k === 'lg' && (
            <p className="sb-desc" style={{ fontStyle: 'italic', marginBottom: 8 }}>
              Usos: {m.la || 3}{m.lair ? ' (' + ((m.la || 3) + 1) + ' en su guarida)' : ''}. Inmediatamente después del turno de otra criatura, puede gastar un uso para realizar una de estas acciones. Recupera todos los usos al inicio de cada uno de sus turnos.
            </p>
          )}
          {m[k]!.map((f, i) => <FeatureRow key={k + i} c={c} sec={k} f={f} i={i} who={who} />)}
        </section>
      ))}
    </article>
  );
}
