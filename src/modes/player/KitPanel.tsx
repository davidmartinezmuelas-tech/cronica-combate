import { useState, type JSX } from 'react';
import type { Abil } from '../../data/player';
import { fmt, rollDie, sgn } from '../../engine/dice';
import { usesMax, type Character, type Derived } from '../../engine/character';
import { firstSentence } from '../../engine/actionKind';
import { activeKits, atLevel, KITS, resourceMax, resourcePer, type KitAction, type SubclassKit } from '../../engine/subclassActions';
import { optionItems, subclassText, type SubclassText } from '../../engine/subclassChoices';
import { norm } from '../../engine/util';
import Card from '../../shared/Card';
import InfoPop from '../../shared/InfoPop';
import Pips from '../../shared/Pips';
import type { LibraryData } from '../../store/library';
import { usePlayer } from '../../store/player';
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
    const o = optionItems(f.d).find((x) => want.includes(norm(x.n).replace(/\s*\(.*\)$/, '')));
    if (o) return o;
  }
  return null;
}

/** Valor de una tabla por nivel (la última entrada que ya se alcanza). */
const atLevel2 = (t: Record<number, string>, level: number, first: string) => Object.entries(t).reduce((e, [lv, x]) => (parseInt(lv, 10) <= level ? x : e), first);

const FOCUS_COST = 'Concentración del monje';
const COST_LABEL: Record<string, string> = { 'Concentración del monje': 'concentración', 'Fuente de magia': 'punto de hechicería', 'Canalizar Divinidad': 'Canalizar divinidad', 'Canalización divina': 'Canalización divina', Furia: 'Furia' };

/** Un daño extra al impactar que se puede marcar en la ventana de daño del arma. `why`: por qué no se puede usar ahora (vacío si se puede). `pay`: gasta lo que cuesta. */
export interface HitOption { key: string; n: string; src: string; expr: string; type?: string; unarmed: boolean; why: string; pay: (u: Record<string, number>) => Record<string, number> }

/** Los extras al impactar de los rasgos de clase y subclase del personaje (con su dado, tipo y coste a su nivel). */
export function hitOptions(c: Character, d: Derived, lib: LibraryData, rage: boolean): HitOption[] {
  const sub = subclassText(c, d.cls, lib.subclasses);
  const src = { f: [...(sub?.f || []), ...(d.cls?.f || [])], x: sub?.x || [] };
  const out: HitOption[] = [];
  for (const { kit, actions } of activeKits(c)) {
    const res = kit.res;
    const max = res ? resourceMax(res, c.level, d.mods) : 0;
    const sides = res ? atLevel(res.die, c.level) : 0;
    for (const a of actions) {
      const h = a.hit;
      if (!h || (h.die && !sides)) continue;
      const name = kitText(src, a.n)?.n || a.n[0];
      const base = h.die ? '1d' + sides : h.exprAt ? atLevel2(h.exprAt, c.level, h.expr || '') : h.expr || '';
      const plus = (h.plus ? d.mods[h.plus] : 0) + (h.plusHalfLevel ? Math.floor(c.level / 2) : 0);
      let why = '';
      let pay = (u: Record<string, number>): Record<string, number> => u;
      if (h.need === 'rage' && !rage) why = 'requiere Furia';
      const sp = h.spend;
      if (sp === 'res' && res) {
        if (max - Math.min(max, c.uses[res.key] || 0) < 1) why = 'sin ' + res.n.toLowerCase();
        pay = (u) => ({ ...u, [res.key]: Math.min(max, (u[res.key] || 0) + 1) });
      } else if (sp && typeof sp === 'object' && 'use' in sp) {
        const umax = typeof sp.use.max === 'number' ? sp.use.max : Math.max(1, d.mods[sp.use.max]);
        if (Math.min(umax, c.uses[name] || 0) >= umax) why = 'sin usos';
        pay = (u) => ({ ...u, [name]: (u[name] || 0) + 1 });
      } else if (sp && typeof sp === 'object' && 'cost' in sp) {
        const key = sp.cost;
        const cmax = usesMax(d.cls?.f.find((f) => f.n === key)?.u, c, d.cls) || 0;
        if (cmax - Math.min(cmax, c.uses[key] || 0) < 1) why = 'sin ' + (COST_LABEL[key] || key);
        pay = (u) => ({ ...u, [key]: (u[key] || 0) + 1 });
      }
      out.push({ key: kit.id + ':' + a.n[0], n: name, src: h.src || name, expr: base + (plus ? sgn(plus) : ''), type: h.type, unarmed: !!h.unarmed, why, pay });
    }
  }
  return out;
}

interface Btn { k: string; t: string; dmg?: boolean; off?: boolean; plain?: boolean; go: () => void }

/** Rasgos de la subclase con sus tiradas: dados del recurso, usos propios, PG temporales, daño extra con las armas… */
export default function KitPanel({ c, d, lib, set, kit, actions: all, react, onUse, off }: { c: Character; d: Derived; lib: LibraryData; set: (patch: Partial<Character>) => void; kit: SubclassKit; actions: KitAction[]; react?: boolean; onUse?: () => void; off?: boolean }) {
  // react: solo los rasgos de reacción, en filas compactas dentro de la tarjeta Reacción; si no, la tarjeta de la subclase sin ellos
  const actions = all.filter((a) => !!a.react === !!react);
  const { roll } = useStore.getState();
  const who = c.name || 'Personaje';
  // textos: rasgos de la subclase y de la clase (Chispa divina va dentro de «Canalizar Divinidad»)
  const sub = subclassText(c, d.cls, lib.subclasses);
  const src = { f: [...(sub?.f || []), ...(d.cls?.f || [])], x: sub?.x || [] };
  const res = kit.res;
  const max = res ? resourceMax(res, c.level, d.mods) : 0;
  const sides = res ? atLevel(res.die, c.level) : 0;
  const die = sides ? 'd' + sides : '';
  const resPer = res ? resourcePer(res, c.level) : 'lr';
  const used = res ? Math.min(max, c.uses[res.key] || 0) : 0;
  const left = max - used;
  const spend = (n = 1) => { if (res) set({ uses: { ...c.uses, [res.key]: Math.min(max, (c.uses[res.key] || 0) + n) } }); };
  const dcOf = (a: Abil | 'spell') => (a === 'spell' ? d.spell?.dc ?? 8 + d.pb + d.mods.cha : 8 + d.pb + d.mods[a]);
  const m = (a?: Abil) => (a ? d.mods[a] : 0);
  // un recurso de clase que gasta una acción (Canalización divina, Furia, Concentración): sus usos y cuántos quedan
  const costInfo = (key: string) => {
    const k = KITS.find((x) => x.cls === c.classId && x.res?.key === key);
    const mx = k?.res ? resourceMax(k.res, c.level, d.mods) : usesMax(d.cls?.f.find((f) => f.n === key)?.u, c, d.cls) || 0;
    return { key, max: mx, left: mx - Math.min(mx, c.uses[key] || 0), label: COST_LABEL[key] || key };
  };
  const healSelf = (total: number) => {
    const cur = usePlayer.getState().characters.find((x) => x.id === c.id) || c;
    usePlayer.getState().update(c.id, { hp: Math.min(d.hpMax, cur.hp + Math.max(0, total)) });
    return { resultNote: 'Recuperas ' + Math.max(0, total) + ' PG.' };
  };
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [amt, setAmt] = useState('');

  if (!actions.length) return null;
  const rows = actions.map((a) => {
          const text = kitText(src, a.n);
          const name = text?.n || a.n[0];
          const r = a.roll;
          const label = (what = '') => who + ' · ' + name + (what ? ': ' + what : '');
          const btns: Btn[] = [];
          let usesEl: JSX.Element | null = null;
          const tag = a.tag?.({ level: c.level, pb: d.pb, mods: d.mods });
          if (a.selfHeal) {
            // solo si estás maltrecho (a la mitad de tus PG o menos) y sin pasar de la mitad
            const pool = a.selfHeal(c.level);
            const half = Math.floor(d.hpMax / 2);
            const heal = c.hp <= half ? Math.min(pool, half - c.hp) : 0;
            btns.push({
              k: 'self', t: 'Usar y curarme ' + heal + ' PG', plain: true, off: left <= 0 || heal <= 0,
              go: () => {
                set({ hp: c.hp + heal, death: { s: 0, f: 0 }, ...(res ? { uses: { ...c.uses, [res.key]: Math.min(max, (c.uses[res.key] || 0) + 1) } } : {}) });
                setMsg({ ...msg, [name]: 'Te curas ' + heal + ' PG; quedan ' + (pool - heal) + ' para repartir entre los demás.' });
              },
            });
          }
          if (r.kind === 'regain') {
            btns.push({ k: 'g', t: r.label, plain: true, off: used <= 0, go: () => { if (res) set({ uses: { ...c.uses, [res.key]: Math.max(0, (c.uses[res.key] || 0) - 1) } }); } });
          } else if (r.kind === 'unarmed') {
            const ab = d.mods[r.abil];
            btns.push({ k: 'a', t: 'Ataque ' + fmt(ab + d.pb), go: () => roll({ label: label('ataque sin armas'), kind: 'attack', who, parts: [{ expr: '1d20' + sgn(ab + d.pb) }] }) });
            btns.push({ k: 'b', t: 'Daño 1' + die + sgn(ab) + ' contundente', dmg: true, go: () => roll({ label: label('daño sin armas'), kind: 'damage', who, by: null, parts: [{ expr: '1' + die + sgn(ab), type: 'contundente' }] }) });
          } else if (r.kind === 'die') {
            const plus = m(r.plus);
            const expr = '1' + die + (plus ? sgn(plus) : '');
            btns.push({
              k: 'd', t: (r.type ? 'Daño ' : 'Tirar ') + die + (plus ? ' ' + sgn(plus) : '') + (r.type ? ' ' + r.type : ''), dmg: !!r.type, off: r.spend !== false && left <= 0,
              go: () => {
                if (r.spend !== false) spend();
                roll({ label: label(), kind: r.type ? 'damage' : 'free', who, by: null, parts: [{ expr, type: r.type }], after: r.mult ? (t) => ({ resultNote: t * r.mult! + ' ' + (r.unit || 'm') }) : undefined });
              },
            });
          } else if (r.kind === 'spend') {
            btns.push({ k: 's', t: r.label || (sides ? 'Gastar un dado (recuperar el uso)' : 'Usar (gasta un uso)'), plain: true, off: left < (r.n || 1), go: () => spend(r.n || 1) });
          } else if (r.kind === 'extra') {
            const xe = r.exprAt ? atLevel2(r.exprAt, c.level, r.expr) : r.expr;
            d.attacks.forEach(({ w, parts, verParts }) => {
              btns.push({ k: 'w' + w.id, t: 'Daño con ' + w.name + ' + ' + xe, dmg: true, go: () => roll({ label: label('daño con ' + w.name), kind: 'damage', who, by: null, parts: [...parts, { expr: xe, type: r.type || w.type }] }) });
              if (verParts.length) btns.push({ k: 'v' + w.id, t: 'Daño con ' + w.name + ' a dos manos + ' + xe, dmg: true, go: () => roll({ label: label('daño con ' + w.name + ' a dos manos'), kind: 'damage', who, by: null, parts: [...verParts, { expr: xe, type: r.type || w.type }] }) });
            });
          } else if (r.kind === 'blade') {
            // arma sencilla y sutil: la mejor entre Fuerza y Destreza, con competencia
            const ab = Math.max(d.mods.str, d.mods.dex);
            btns.push({ k: 'a', t: 'Ataque ' + fmt(ab + d.pb), go: () => roll({ label: label('ataque'), kind: 'attack', who, parts: [{ expr: '1d20' + sgn(ab + d.pb) }] }) });
            btns.push({ k: 'b', t: 'Daño ' + r.dmg + sgn(ab) + ' ' + r.type, dmg: true, go: () => roll({ label: label('daño'), kind: 'damage', who, by: null, parts: [{ expr: r.dmg + sgn(ab), type: r.type }] }) });
            btns.push({ k: 'c', t: 'Segunda cuchilla ' + r.second + sgn(ab), dmg: true, go: () => roll({ label: label('segunda cuchilla'), kind: 'damage', who, by: null, parts: [{ expr: r.second + sgn(ab), type: r.type }] }) });
          } else if (r.kind === 'pool') {
            const most = r.perUse === 'all' ? Math.max(1, max) : Math.max(1, m(r.perUse));
            for (let n = 1; n <= most; n++) {
              btns.push({ k: 'p' + n, t: 'Curar ' + n + die, off: left < n, go: () => { spend(n); roll({ label: label('curación'), kind: 'free', parts: [{ expr: n + die }] }); } });
            }
          } else if (r.kind === 'roll') {
            const plus = m(r.plus) + (r.plusLevel ? c.level : 0) + (r.plusHalfLevel ? Math.floor(c.level / 2) : 0);
            const base0 = r.exprAt ? atLevel2(r.exprAt, c.level, r.expr) : r.expr;
            const base = r.times ? Math.max(1, m(r.times)) + base0.replace(/^\d+/, '') : base0;
            const expr = base + (plus ? sgn(plus) : '');
            if (r.spend) {
              if (r.heal) btns.push({ k: 'h', t: 'Curar ' + expr, off: left <= 0, go: () => { spend(); roll({ label: label('curación'), kind: 'free', parts: [{ expr }] }); } });
              btns.push({
                k: 'r', t: (r.type ? 'Daño ' : 'Tirar ') + expr + (r.type ? ' ' + r.type : ''), dmg: !!r.type, off: left <= 0,
                go: () => { spend(); roll({ label: label(), kind: r.type ? 'damage' : 'free', who, by: null, parts: [{ expr, type: r.type }] }); },
              });
            }
            const umax = r.uses ? (typeof r.uses.max === 'number' ? r.uses.max : Math.max(1, m(r.uses.max))) : 0;
            const uused = r.uses ? Math.min(umax, c.uses[name] || 0) : 0;
            if (!r.spend && r.uses) usesEl = <span onClick={(e) => e.preventDefault()}><Pips max={umax} used={uused} label={'Usos de ' + name} onSet={(v) => set({ uses: { ...c.uses, [name]: Math.max(0, Math.min(umax, v)) } })} /></span>;
            // coste en un recurso de clase (Puntos de concentración): gasta uno, o la variante sin coste
            const costMax = r.cost ? usesMax(d.cls?.f.find((f) => f.n === r.cost)?.u, c, d.cls) || 0 : 0;
            const costLeft = r.cost ? costMax - Math.min(costMax, c.uses[r.cost] || 0) : 1;
            const what = (r.type ? 'Daño ' : 'Tirar ') + expr + (r.type ? ' ' + r.type : '');
            if (!r.spend) btns.push({
              k: 'r', t: what + (r.cost ? (r.cost === FOCUS_COST ? ' · −1 concentración' : ' · −1 punto de hechicería') : ''), dmg: !!r.type, off: (!!r.uses && uused >= umax) || costLeft < 1,
              go: () => { if (r.uses) set({ uses: { ...c.uses, [name]: uused + 1 } }); if (r.cost) set({ uses: { ...c.uses, [r.cost]: (c.uses[r.cost] || 0) + 1 } }); roll({ label: label(), kind: r.type ? 'damage' : 'free', who, by: null, parts: [{ expr, type: r.type }] }); },
            });
            if (r.freeAlt) btns.push({ k: 'f', t: what + ' · ' + r.freeAlt, go: () => roll({ label: label(r.freeAlt), kind: r.type ? 'damage' : 'free', who, by: null, parts: [{ expr, type: r.type }] }) });
          } else if (r.kind === 'multi') {
            const umax = r.uses ? (typeof r.uses.max === 'number' ? r.uses.max : Math.max(1, m(r.uses.max))) + (r.uses.plusHalfLevel ? Math.floor(c.level / 2) : 0) : 0;
            const uused = r.uses ? Math.min(umax, c.uses[name] || 0) : 0;
            const ci = r.cost ? costInfo(r.cost) : null;
            if (r.uses) usesEl = <span onClick={(e) => e.preventDefault()}><Pips max={umax} used={uused} label={'Usos de ' + name} onSet={(v) => set({ uses: { ...c.uses, [name]: Math.max(0, Math.min(umax, v)) } })} /></span>;
            else if (ci) usesEl = <span className="chip-tag">{ci.left} de {ci.max} {ci.label}</span>;
            // «{rage}»: el daño de Furia (el número de dados de las opciones de Furia)
            const rage = Math.max(1, Number(d.scale('barbarian.rage-damage')) || 2);
            r.buttons.forEach((b, i) => {
              const base0 = b.exprAt ? atLevel2(b.exprAt, c.level, b.expr || '') : b.expr || '';
              const base = base0.replace('{rage}', String(rage));
              const plus = m(b.plus) + (b.plusLevel ? c.level : 0) + (b.plusPb ? d.pb : 0);
              const expr = base ? base + (plus ? sgn(plus) : '') : plus ? String(plus) : '';
              const bonus = b.as === 'attack' ? (b.atk === 'spell' || !b.atk ? d.spell?.atk ?? d.pb + d.mods.cha : d.pb + d.mods[b.atk]) : 0;
              const text = b.t + (b.as === 'attack' ? ' ' + fmt(bonus) : expr ? ' ' + expr : '') + (b.type ? ' ' + b.type : '') + (b.pay ? ' · −1' + (ci ? ' ' + ci.label : '') : '') + (b.res ? ' · −' + b.res : '');
              const off = !!b.pay && ((!!r.uses && uused >= umax) || (!!ci && ci.left < 1)) || (!!b.res && left < b.res);
              const go = () => {
                const u = { ...c.uses };
                if (b.pay && r.uses) u[name] = uused + 1;
                if (b.pay && ci) u[ci.key] = (c.uses[ci.key] || 0) + 1;
                if (b.res && res) u[res.key] = Math.min(max, (c.uses[res.key] || 0) + b.res);
                const spent = !!b.pay || !!b.res;
                const n = parseInt(expr, 10) || 0;
                if (b.as === 'heal-self') { set({ ...(spent ? { uses: u } : {}), hp: Math.min(d.hpMax, c.hp + Math.max(0, n)) }); return; }
                if (b.as === 'temp') { set({ ...(spent ? { uses: u } : {}), temp: Math.max(c.temp, Math.max(1, n)) }); return; }
                if (spent) set({ uses: u });
                if (b.as === 'attack') roll({ label: label(b.t), kind: 'attack', who, parts: [{ expr: '1d20' + sgn(bonus) }] });
                else if (b.as === 'damage') roll({ label: label(b.t), kind: 'damage', who, by: null, parts: [{ expr, type: b.type }], ...(b.selfHeal ? { after: healSelf } : {}) });
                else if (b.as === 'free') roll({ label: label(b.t), kind: 'free', parts: [{ expr }] });
              };
              btns.push({ k: 'm' + i, t: text, dmg: b.as === 'damage', plain: b.as === 'none' || b.as === 'heal-self' || b.as === 'temp', off, go });
            });
          } else if (r.kind === 'ward') {
            const wmax = Math.max(0, 2 * c.level + d.mods.int);
            const cur = Math.min(wmax, c.uses[name] || 0);
            const n = Math.max(0, parseInt(amt, 10) || 0);
            usesEl = <><span className="chip-tag">{cur} de {wmax} PG</span><input className="input" style={{ width: 72 }} type="number" min={0} inputMode="numeric" aria-label="PG de la salvaguarda" placeholder="PG" value={amt} onChange={(e) => setAmt(e.target.value)} /></>;
            btns.push({ k: 'c', t: 'Crear (' + wmax + ' PG)', plain: true, go: () => set({ uses: { ...c.uses, [name]: wmax } }) });
            btns.push({
              k: 'a', t: 'Absorber ' + (n || ''), plain: true, off: !n || cur <= 0,
              go: () => { set({ uses: { ...c.uses, [name]: Math.max(0, cur - n) } }); setAmt(''); setMsg({ ...msg, [name]: n > cur ? 'Absorbe ' + cur + ' PG; te quedan ' + (n - cur) + ' de daño.' : 'Absorbe ' + n + ' PG.' }); },
            });
            btns.push({ k: 'r', t: 'Recuperar ' + (n || ''), plain: true, off: !n || wmax <= 0, go: () => { set({ uses: { ...c.uses, [name]: Math.min(wmax, cur + n) } }); setAmt(''); } });
          } else if (r.kind === 'bastion') {
            // d8 que quedan (se guardan en los usos con el nombre del rasgo); crearlos cuesta tantos puntos de hechicería como d8
            const dice = Math.min(5, c.uses[name] || 0);
            const pts = Math.min(5, Math.max(1, parseInt(amt, 10) || 1));
            const spMax = usesMax(d.cls?.f.find((f) => f.n === 'Fuente de magia')?.u, c, d.cls) || 0;
            const spLeft = spMax - Math.min(spMax, c.uses['Fuente de magia'] || 0);
            usesEl = <><span className="chip-tag">{dice} d8</span><input className="input" style={{ width: 72 }} type="number" min={1} max={5} inputMode="numeric" aria-label="Puntos de hechicería para el bastión" placeholder="Puntos" value={amt} onChange={(e) => setAmt(e.target.value)} /></>;
            btns.push({ k: 'c', t: 'Crear ' + pts + 'd8 · −' + pts + (pts === 1 ? ' punto' : ' puntos'), plain: true, off: spLeft < pts, go: () => set({ uses: { ...c.uses, [name]: pts, 'Fuente de magia': (c.uses['Fuente de magia'] || 0) + pts } }) });
            for (let k = 1; k <= dice; k++) btns.push({ k: 'g' + k, t: 'Restar ' + k + 'd8', go: () => { set({ uses: { ...c.uses, [name]: dice - k } }); roll({ label: label('daño que evitas'), kind: 'free', who, by: null, parts: [{ expr: k + 'd8' }] }); } });
          } else if (r.kind === 'overchannel') {
            // veces ya usado desde el último descanso largo (se guarda en los usos con el nombre del rasgo)
            const times = c.uses[name] || 0;
            const lvl = Math.min(5, Math.max(1, parseInt(amt, 10) || 1));
            const dice = (times + 1) * lvl;
            usesEl = <><span className="chip-tag">{times} {times === 1 ? 'uso' : 'usos'} sin descansar</span><input className="input" style={{ width: 72 }} type="number" min={1} max={5} inputMode="numeric" aria-label="Nivel del espacio" placeholder="Nivel" value={amt} onChange={(e) => setAmt(e.target.value)} /></>;
            btns.push({
              k: 'o', t: times ? 'Sobrecanalizar: ' + dice + 'd12 necrótico' : 'Sobrecanalizar (sin daño)', plain: !times, dmg: !!times,
              go: () => { set({ uses: { ...c.uses, [name]: times + 1 } }); if (times) roll({ label: label('daño necrótico por sobrecanalizar'), kind: 'damage', who, by: null, parts: [{ expr: dice + 'd12', type: 'necrótico' }] }); else setMsg({ ...msg, [name]: 'Daño máximo en tu conjuro; esta vez no sufres daño.' }); },
            });
            if (times) btns.push({ k: 'z', t: 'Reiniciar', plain: true, go: () => set({ uses: { ...c.uses, [name]: 0 } }) });
          } else if (r.kind === 'portent') {
            // los d20 presagiados se guardan en los usos (positivo: sin gastar; negativo: gastado); el descanso largo los borra
            const slots = Array.from({ length: c.level >= 14 ? 3 : 2 }, (_, i) => ({ key: name + ' ' + (i + 1), v: c.uses[name + ' ' + (i + 1)] || 0 }));
            const any = slots.some((x) => x.v !== 0);
            usesEl = <span className="rollrow" aria-label="Resultados presagiados">
              {!any && <span className="muted small">Sin tirar</span>}
              {slots.filter((x) => x.v !== 0).map((x) => x.v > 0
                ? <button key={x.key} className="rollbtn" title="Sustituye una tirada de d20 y se gasta" onClick={() => set({ uses: { ...c.uses, [x.key]: -x.v } })}>Usar {x.v}</button>
                : <span key={x.key} className="chip-tag" style={{ textDecoration: 'line-through' }} title="Gastado">{-x.v}</span>)}
            </span>;
            btns.push({ k: 'p', t: 'Tirar ' + slots.length + ' d20', plain: true, off: any, go: () => set({ uses: { ...c.uses, ...Object.fromEntries(slots.map((x) => [x.key, rollDie(20)])) } }) });
            if (any) btns.push({ k: 'x', t: 'Borrar', plain: true, go: () => set({ uses: { ...c.uses, ...Object.fromEntries(slots.map((x) => [x.key, 0])) } }) });
          } else if (r.kind === 'temp') {
            const n = Math.max(1, c.level + m(r.plus));
            btns.push({ k: 't', t: 'Ganar ' + n + ' PG temporales', plain: true, go: () => set({ temp: Math.max(c.temp, n) }) });
          }
          // los extras al impactar se marcan en la ventana de daño del arma: aquí no llevan botón de daño
          if (a.hit) { for (let i = btns.length - 1; i >= 0; i--) if (btns[i].dmg) btns.splice(i, 1); }
          if (react) {
            // fila compacta de la tarjeta Reacción: el nombre con su texto en una ventana, y los botones
            return (
              <li key={a.n[0]}>
                <InfoPop label={name} title={name}>{a.note && <p className="muted small">{a.note}</p>}{text ? <p>{text.d}</p> : <p className="muted small">El texto de este rasgo sale de tu libro: impórtalo en «Biblioteca».</p>}</InfoPop>
                {res && r.kind !== 'info' && <span className="chip-tag">{left} de {max}{die ? ' ' + die : ''}</span>}
                {a.save && <span className="chip-tag">CD {dcOf(a.save.dc)} {ABIL_N[a.save.abil]}</span>}
                {usesEl}
                <span className="rollrow">
                  {btns.map((b) => <button key={b.k} className={b.plain ? 'btn small' : b.dmg ? 'rollbtn dmg' : 'rollbtn'} disabled={b.off || off} onClick={() => { b.go(); onUse?.(); }}>{b.t}</button>)}
                  {!btns.length && <button className="btn small" disabled={off} onClick={onUse}>Usar</button>}
                </span>
              </li>
            );
          }
          return (
            <li key={a.n[0]}>
              <Card name={name} head={<>
                  {a.save && <span className="chip-tag">CD {dcOf(a.save.dc)} {ABIL_N[a.save.abil]}</span>}
                  {tag && <span className="chip-tag">{tag}</span>}
                  {!a.save && !tag && !btns.length && !usesEl && (a.note || text) && <span className="muted small">{a.note || firstSentence(text!.d)}</span>}
                  {r.kind === 'roll' && r.uses && <span className="muted small">vuelve en descanso {per(r.uses.per)}</span>}
                  {usesEl}
                  {btns.length > 0 && (
                    <span className="rollrow">
                      {btns.map((b) => <button key={b.k} className={b.plain ? 'btn small' : b.dmg ? 'rollbtn dmg' : 'rollbtn'} disabled={b.off} onClick={b.go}>{b.t}</button>)}
                    </span>
                  )}
                  {msg[name] && <span className="pc-attack-feat small" role="status" style={{ flexBasis: '100%' }}>{msg[name]}</span>}
                </>}>
                {a.selfHeal && <p className="muted small" style={{ margin: '4px 0' }}>{c.hp > Math.floor(d.hpMax / 2) ? 'Para curarte tienes que estar a la mitad de tus PG o menos (' + Math.floor(d.hpMax / 2) + ').' : 'Te curas hasta la mitad de tus PG máximos (' + Math.floor(d.hpMax / 2) + '); el resto lo repartes.'}</p>}
                {a.note && <p className="muted small" style={{ margin: '4px 0' }}>{a.note}</p>}
                {a.hit && <p className="muted small" style={{ margin: '4px 0' }}>Se suma al daño del arma: márcalo en la ventana que sale al pulsar su daño.</p>}
                {text ? <p className="pc-text">{text.d}</p> : <p className="muted small" style={{ margin: 0 }}>El texto de este rasgo sale de tu libro: impórtalo en «Biblioteca».</p>}
              </Card>
            </li>
          );
  });
  if (react) return <>{rows}</>;
  return (
    <section className="panel" aria-label={kit.title}>
      <div className="panel-head">
        <h3 className="eyebrow">{kit.title}</h3>
        {res && (
          // los contadores junto al título (cuándo se recuperan, al pasar el ratón)
          <span className="rollrow res-head" title={res.n + (resPer === 'sr1' ? ': uno vuelve en descanso corto, todos en largo' : ': vuelven en descanso ' + per(resPer))}>
            <Pips noTotal max={max} used={used} label={res.n} onSet={(v) => set({ uses: { ...c.uses, [res.key]: Math.max(0, Math.min(max, v)) } })} />
            <span className="muted small">{norm(res.n).includes(norm(kit.title)) ? '' : res.n + ': '}{left} de {max}{die ? ' (' + die + ')' : ''}</span>
          </span>
        )}
      </div>
      <ul className="pc-features grid acts">
        {rows}
      </ul>
    </section>
  );
}
