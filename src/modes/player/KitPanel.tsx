import type { JSX } from 'react';
import type { Abil } from '../../data/player';
import type { Character, Derived } from '../../engine/character';
import { fmt, sgn } from '../../engine/dice';
import { atLevel, resourceMax, type KitAction, type SubclassKit } from '../../engine/subclassActions';
import { optionItems, subclassText, type SubclassText } from '../../engine/subclassChoices';
import { norm } from '../../engine/util';
import Pips from '../../shared/Pips';
import type { LibraryData } from '../../store/library';
import { useStore } from '../../store/useStore';

const ABIL_N: Record<Abil, string> = { str: 'Fuerza', dex: 'Destreza', con: 'Constitución', int: 'Inteligencia', wis: 'Sabiduría', cha: 'Carisma' };
const per = (p: string) => (p === 'sr' ? 'corto o largo' : 'largo');

/** Texto de un rasgo de la subclase o de una opción dentro de un rasgo («Golpe psiónico.» dentro de «Poder psiónico»). */
function kitText(src: SubclassText | null, names: string[]): { n: string; d: string } | null {
  if (!src) return null;
  const want = names.map(norm);
  const ft = src.f.find((f) => want.includes(norm(f.n)));
  if (ft) return ft;
  for (const f of src.f) {
    const o = optionItems(f.d).find((x) => want.includes(norm(x.n)));
    if (o) return o;
  }
  return null;
}

interface Btn { k: string; t: string; dmg?: boolean; off?: boolean; go: () => void }

/** Rasgos de la subclase con sus tiradas: dados del recurso, usos propios, PG temporales, daño extra con las armas… */
export default function KitPanel({ c, d, lib, set, kit, actions }: { c: Character; d: Derived; lib: LibraryData; set: (patch: Partial<Character>) => void; kit: SubclassKit; actions: KitAction[] }) {
  const { roll } = useStore.getState();
  const who = c.name || 'Personaje';
  const src = subclassText(c, d.cls, lib.subclasses);
  const res = kit.res;
  const max = res ? resourceMax(res, c.level) : 0;
  const die = res ? 'd' + atLevel(res.die, c.level) : '';
  const used = res ? Math.min(max, c.uses[res.key] || 0) : 0;
  const left = max - used;
  const spend = (n = 1) => { if (res) set({ uses: { ...c.uses, [res.key]: Math.min(max, (c.uses[res.key] || 0) + n) } }); };
  const dcOf = (a: Abil | 'spell') => (a === 'spell' ? d.spell?.dc ?? 8 + d.pb + d.mods.cha : 8 + d.pb + d.mods[a]);
  const m = (a?: Abil) => (a ? d.mods[a] : 0);

  return (
    <section className="panel" aria-label={kit.title}>
      <div className="panel-head">
        <h3 className="eyebrow">{kit.title}</h3>
        {res && (
          <span className="rollrow">
            <span className="muted small">{res.n}: {left} de {max} ({die}){res.per === 'sr1' ? ' · uno vuelve en descanso corto, todos en largo' : ' · vuelven en descanso ' + per(res.per)}</span>
            <Pips max={max} used={used} label={res.n} onSet={(v) => set({ uses: { ...c.uses, [res.key]: Math.max(0, Math.min(max, v)) } })} />
          </span>
        )}
      </div>
      <ul className="pc-features">
        {actions.map((a) => {
          const text = kitText(src, a.n);
          const name = text?.n || a.n[0];
          const r = a.roll;
          const label = (what = '') => who + ' · ' + name + (what ? ': ' + what : '');
          const btns: Btn[] = [];
          let usesEl: JSX.Element | null = null;
          if (r.kind === 'die') {
            const plus = m(r.plus);
            const expr = '1' + die + (r.plus ? sgn(plus) : '');
            btns.push({
              k: 'd', t: (r.type ? 'Daño ' : 'Tirar ') + die + (r.plus ? ' ' + sgn(plus) : '') + (r.type ? ' ' + r.type : ''), dmg: !!r.type, off: r.spend !== false && left <= 0,
              go: () => {
                if (r.spend !== false) spend();
                roll({ label: label(), kind: r.type ? 'damage' : 'free', who, by: null, parts: [{ expr, type: r.type }], after: r.mult ? (t) => ({ resultNote: t * r.mult! + ' m' }) : undefined });
              },
            });
          } else if (r.kind === 'spend') {
            btns.push({ k: 's', t: 'Gastar un dado (recuperar el uso)', off: left <= 0, go: () => spend() });
          } else if (r.kind === 'extra') {
            d.attacks.forEach(({ w, parts, verParts }) => {
              btns.push({ k: 'w' + w.id, t: 'Daño con ' + w.name + ' + ' + r.expr, dmg: true, go: () => roll({ label: label('daño con ' + w.name), kind: 'damage', who, by: null, parts: [...parts, { expr: r.expr, type: w.type }] }) });
              if (verParts.length) btns.push({ k: 'v' + w.id, t: 'Daño con ' + w.name + ' a dos manos + ' + r.expr, dmg: true, go: () => roll({ label: label('daño con ' + w.name + ' a dos manos'), kind: 'damage', who, by: null, parts: [...verParts, { expr: r.expr, type: w.type }] }) });
            });
          } else if (r.kind === 'blade') {
            // arma sencilla y sutil: la mejor entre Fuerza y Destreza, con competencia
            const ab = Math.max(d.mods.str, d.mods.dex);
            btns.push({ k: 'a', t: 'Ataque ' + fmt(ab + d.pb), go: () => roll({ label: label('ataque'), kind: 'attack', who, parts: [{ expr: '1d20' + sgn(ab + d.pb) }] }) });
            btns.push({ k: 'b', t: 'Daño ' + r.dmg + sgn(ab) + ' ' + r.type, dmg: true, go: () => roll({ label: label('daño'), kind: 'damage', who, by: null, parts: [{ expr: r.dmg + sgn(ab), type: r.type }] }) });
            btns.push({ k: 'c', t: 'Segunda cuchilla ' + r.second + sgn(ab), dmg: true, go: () => roll({ label: label('segunda cuchilla'), kind: 'damage', who, by: null, parts: [{ expr: r.second + sgn(ab), type: r.type }] }) });
          } else if (r.kind === 'pool') {
            const most = Math.max(1, m(r.perUse));
            for (let n = 1; n <= most; n++) {
              btns.push({ k: 'p' + n, t: 'Curar ' + n + die, off: left < n, go: () => { spend(n); roll({ label: label('curación'), kind: 'free', parts: [{ expr: n + die }] }); } });
            }
          } else if (r.kind === 'roll') {
            const plus = m(r.plus);
            const expr = r.expr + (r.plus ? sgn(plus) : '');
            const umax = r.uses ? (typeof r.uses.max === 'number' ? r.uses.max : Math.max(1, m(r.uses.max))) : 0;
            const uused = r.uses ? Math.min(umax, c.uses[name] || 0) : 0;
            if (r.uses) usesEl = <span onClick={(e) => e.preventDefault()}><Pips max={umax} used={uused} label={'Usos de ' + name} onSet={(v) => set({ uses: { ...c.uses, [name]: Math.max(0, Math.min(umax, v)) } })} /></span>;
            btns.push({
              k: 'r', t: (r.type ? 'Daño ' : 'Tirar ') + expr + (r.type ? ' ' + r.type : ''), dmg: !!r.type, off: !!r.uses && uused >= umax,
              go: () => { if (r.uses) set({ uses: { ...c.uses, [name]: uused + 1 } }); roll({ label: label(), kind: r.type ? 'damage' : 'free', who, by: null, parts: [{ expr, type: r.type }] }); },
            });
          } else if (r.kind === 'temp') {
            const n = Math.max(1, c.level + m(r.plus));
            btns.push({ k: 't', t: 'Ganar ' + n + ' PG temporales', go: () => set({ temp: Math.max(c.temp, n) }) });
          }
          return (
            <li key={a.n[0]}>
              <details>
                <summary>
                  <b>{name}</b>
                  {a.save && <span className="chip-tag">CD {dcOf(a.save.dc)} {ABIL_N[a.save.abil]}</span>}
                  {r.kind === 'roll' && r.uses && <span className="muted small">vuelve en descanso {per(r.uses.per)}</span>}
                  {usesEl}
                  {btns.length > 0 && (
                    <span className="rollrow" onClick={(e) => e.preventDefault()}>
                      {btns.map((b) => <button key={b.k} className={b.dmg ? 'rollbtn dmg' : 'rollbtn'} disabled={b.off} onClick={b.go}>{b.t}</button>)}
                    </span>
                  )}
                </summary>
                {a.note && <p className="muted small" style={{ margin: '4px 0' }}>{a.note}</p>}
                {text ? <p className="pc-text">{text.d}</p> : <p className="muted small" style={{ margin: 0 }}>El texto de este rasgo sale de tu libro: impórtalo en «Biblioteca».</p>}
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
