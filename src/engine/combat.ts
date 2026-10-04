import { CONDITIONS, SECTIONS, XP_BUDGET } from '../data/constants';
import type { Combatant, ConcPrompt, Condition, DmgPart, LogEntry, Monster, RosterEntry, SectionKey, TurnEvent } from '../data/types';
import { rollFormula, type RollKind, type Rng } from './dice';
import { uid } from './util';

export type LogDraft = Omit<LogEntry, 'id'>;

/** Orden de iniciativa: mayor primero; empates por bonificador y luego por nombre. Sin iniciativa al final. */
export function sortCombatants(cs: Combatant[]): Combatant[] {
  return cs.slice().sort((a, b) => {
    const ai = a.init == null ? -999 : a.init;
    const bi = b.init == null ? -999 : b.init;
    return bi - ai || (b.initBonus || 0) - (a.initBonus || 0) || a.name.localeCompare(b.name, 'es');
  });
}

/** Puede recibir turno: tiene iniciativa y no está fuera de combate. */
export function canAct(c: Combatant): boolean {
  if (c.init == null) return false;
  if (c.kind === 'lair') return true;
  if (c.kind === 'monster') return c.hp > 0;
  return !c.dead;
}

/** Devuelve "Base N" con el primer N libre, continuando la numeración existente. */
export function uniqueName(base: string, taken: Set<string>): string {
  const esc = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('^' + esc + ' (\\d+)$');
  let n = 1;
  taken.forEach((t) => {
    const m = re.exec(t);
    if (m) n = Math.max(n, parseInt(m[1], 10) + 1);
  });
  while (taken.has(base + ' ' + n)) n++;
  return base + ' ' + n;
}

export function addCondition(conds: Condition[], k: string, r: number | null = null): Condition[] {
  if (conds.some((x) => x.k === k)) return conds;
  return conds.concat([{ k, r }]);
}

export function hasCond(c: Combatant, k: string) {
  return c.conds.some((x) => x.k === k);
}

export function makeMonsterCombatant(m: Monster, opts: { name: string; inLair: boolean; rollHp: boolean; grp: string; rng?: Rng }): Combatant {
  const hp = opts.rollHp ? Math.max(1, rollFormula(m.hd, opts.rng)) : m.hp;
  const inLair = opts.inLair && !!m.lair;
  return {
    id: 'k' + uid(), kind: 'monster', monsterId: m.id, name: opts.name, init: null, initBonus: m.ini || 0,
    hp, maxHp: hp, temp: 0, ac: m.ac, conds: [], conc: false, exh: 0, react: false, inLair,
    lrMax: m.lr ? (inLair && m.lrl ? m.lrl : m.lr) : 0, lrUsed: 0,
    laMax: m.la ? m.la + (inLair ? 1 : 0) : 0, laUsed: 0,
    used: {}, spent: {}, spUsed: {}, grp: opts.grp,
  };
}

export function makePcCombatant(r: RosterEntry, name: string): Combatant {
  const hp = parseInt(r.hp, 10) || 10;
  return {
    id: 'p' + uid(), kind: 'pc', rosterId: r.id, name, init: null, initBonus: parseInt(r.initb, 10) || 0,
    hp, maxHp: hp, temp: 0, ac: parseInt(r.ac, 10) || 10, conds: [], conc: false, exh: 0, react: false,
    lrMax: 0, lrUsed: 0, laMax: 0, laUsed: 0, used: {}, spent: {}, spUsed: {},
    death: { s: 0, f: 0 }, stable: false, dead: false, level: parseInt(r.level, 10) || 1, res: r.res || [],
  };
}

export function makeLair(): Combatant {
  return {
    id: 'lair-' + uid(), kind: 'lair', name: 'Acciones de guarida', init: 20, initBonus: -99, hp: 0, maxHp: 0, temp: 0, ac: '—',
    conds: [], conc: false, exh: 0, react: false, lrMax: 0, lrUsed: 0, laMax: 0, laUsed: 0, used: {}, spent: {}, spUsed: {}, note: '',
  };
}

export interface DamageResult {
  c: Combatant;
  logs: LogDraft[];
  conc: ConcPrompt | null;
  total: number;
}

/**
 * Aplica daño con resistencias/inmunidades/vulnerabilidades, PG temporales, concentración,
 * salvaciones de muerte y muerte instantánea (reglas 2024).
 */
export function applyDamage(c: Combatant, m: Monster | null, parts: DmgPart[], factor: 1 | 0.5, crit = false): DamageResult {
  let total = 0;
  const notes: string[] = [];
  const imm = m ? m.imm : [];
  const res = m ? m.res : c.res || [];
  const vul = m ? m.vul : [];
  const petrified = hasCond(c, 'Petrificado');
  for (const p of parts) {
    let a = factor === 0.5 ? Math.floor(p.amt / 2) : p.amt;
    const t = p.type;
    if (t && imm.includes(t)) { notes.push('inmune a ' + t); a = 0; }
    else {
      // 2024: primero la resistencia y después la vulnerabilidad; Petrificado resiste todo el daño
      if ((t && res.includes(t)) || petrified) { notes.push(t && res.includes(t) ? 'resiste ' + t : 'petrificado: resiste'); a = Math.floor(a / 2); }
      if (t && vul.includes(t)) { notes.push('vulnerable a ' + t); a = a * 2; }
    }
    total += a;
  }
  const absorbed = Math.min(c.temp || 0, total);
  const dmg = total - absorbed;
  const was = c.hp;
  const hp = Math.max(0, was - dmg);
  const out: Combatant = { ...c, hp, temp: (c.temp || 0) - absorbed };
  const logs: LogDraft[] = [{
    label: c.name + ' recibe ' + total + ' de daño',
    detail: parts.map((p) => p.amt + (p.type ? ' ' + p.type : '')).join(' + ') + (factor === 0.5 ? ' · mitad' : '') + (absorbed ? ' · ' + absorbed + ' a PG temporales' : '') + (notes.length ? ' · ' + notes.join(', ') : ''),
    total: hp + '/' + c.maxHp,
  }];
  let conc: ConcPrompt | null = null;
  if (c.kind === 'pc') {
    if (was === 0 && dmg > 0 && !c.dead && dmg >= c.maxHp) {
      out.dead = true;
      logs.push({ label: c.name + ' muere en el acto', detail: 'Recibe a 0 PG un daño igual o mayor que sus PG máximos', total: '†' });
    } else if (was === 0 && total > 0 && !c.dead) {
      const f = Math.min(3, (c.death?.f || 0) + (crit ? 2 : 1));
      out.death = { s: c.death?.s || 0, f };
      out.stable = false;
      if (f >= 3) { out.dead = true; logs.push({ label: c.name + ' muere', detail: 'Tercer fallo de salvación de muerte', total: '†' }); }
      else logs.push({ label: c.name + ': ' + (crit ? 'dos fallos' : 'un fallo') + ' de salvación de muerte', detail: 'Recibe daño estando a 0 PG', total: f + '/3' });
    } else if (hp === 0 && was > 0) {
      if (dmg - was >= c.maxHp) { out.dead = true; logs.push({ label: c.name + ' muere en el acto', detail: 'El daño sobrante iguala o supera sus PG máximos', total: '†' }); }
      else {
        out.death = { s: 0, f: 0 };
        out.stable = false;
        out.conds = addCondition(c.conds, 'Inconsciente');
        logs.push({ label: c.name + ' cae inconsciente', detail: 'Empieza a hacer salvaciones de muerte', total: '0' });
      }
    }
  }
  if (c.conc && total > 0) {
    if (hp === 0) { out.conc = false; logs.push({ label: c.name + ' pierde la concentración', detail: 'Ha caído a 0 PG', total: '—' }); }
    else conc = { pid: uid(), id: c.id, name: c.name, dc: Math.min(30, Math.max(10, Math.floor(total / 2))), save: m ? m.sv[2] : null };
  }
  return { c: out, logs, conc, total };
}

export function applyHeal(c: Combatant, amt: number): { c: Combatant; log: LogDraft } | { error: string } {
  if (c.dead) return { error: c.name + ' está muerto: la curación normal no le afecta' };
  const hp = Math.min(c.maxHp, c.hp + amt);
  const out: Combatant = { ...c, hp };
  if (c.kind === 'pc' && c.hp === 0) {
    out.death = { s: 0, f: 0 };
    out.stable = false;
    out.conds = c.conds.filter((x) => x.k !== 'Inconsciente');
  }
  return { c: out, log: { label: c.name + ' se cura', detail: '+' + amt + ' PG', total: hp + '/' + c.maxHp } };
}

export interface RechargeCheck {
  key: string;
  name: string;
  min: number;
}

/** Efectos al inicio del turno de una criatura. */
export function turnStart(c: Combatant, m: Monster | null): { c: Combatant; events: TurnEvent[]; recharge: RechargeCheck[] } {
  const events: TurnEvent[] = [];
  const kept: Condition[] = [];
  for (const cd of c.conds) {
    if (cd.r != null) {
      const r = cd.r - 1;
      if (r <= 0) events.push({ text: 'Termina el estado «' + cd.k + '».' });
      else kept.push({ k: cd.k, r });
    } else kept.push(cd);
  }
  const out: Combatant = { ...c, react: false, conds: kept };
  if (c.laMax) {
    if (c.laUsed) events.push({ text: 'Recupera sus ' + c.laMax + ' usos de acción legendaria.' });
    out.laUsed = 0;
  }
  const recharge: RechargeCheck[] = [];
  if (m) {
    SECTIONS.forEach(([sec]) => (m[sec] || []).forEach((f, i) => {
      if (f.rc && c.spent[sec + i]) recharge.push({ key: sec + i, name: f.n, min: f.rc });
    }));
  }
  return { c: out, events, recharge };
}

/** Calcula el siguiente (o anterior) turno. Devuelve null si nadie puede actuar. */
export function stepTurn(cs: Combatant[], activeId: string | null, round: number, dir: 1 | -1): { id: string; round: number } | null {
  const list = sortCombatants(cs).filter(canAct);
  if (!list.length) return null;
  let idx = list.findIndex((c) => c.id === activeId);
  let r = round;
  if (dir > 0) {
    if (idx < 0) {
      // el activo ya no actúa (eliminado o derrotado): siguiente por orden de iniciativa
      const active = cs.find((c) => c.id === activeId);
      const sorted = sortCombatants(cs);
      const pos = active ? sorted.indexOf(active) : -1;
      const nextAfter = pos >= 0 ? sorted.slice(pos + 1).find(canAct) : undefined;
      if (nextAfter) return { id: nextAfter.id, round: r };
      return { id: list[0].id, round: activeId ? r + 1 : r };
    }
    idx++;
    if (idx >= list.length) { idx = 0; r++; }
  } else {
    if (idx < 0) idx = 0;
    else {
      idx--;
      if (idx < 0) {
        if (r > 1) { idx = list.length - 1; r--; } else idx = 0;
      }
    }
  }
  return { id: list[idx].id, round: r };
}

export interface RollMods {
  adv: boolean;
  dis: boolean;
  flat: number;
  autoFail: boolean;
  reasons: string[];
}

/**
 * Efecto de estados y agotamiento sobre las tiradas d20 de una criatura (reglas 2024).
 * `ability` es el índice de característica (0 FUE … 5 CAR) para salvaciones y pruebas.
 */
export function rollModifiers(c: Combatant | null, kind: RollKind, ability?: number): RollMods {
  const out: RollMods = { adv: false, dis: false, flat: 0, autoFail: false, reasons: [] };
  if (!c || kind === 'damage' || kind === 'free') return out;
  const has = (k: string) => hasCond(c, k);
  const dis = (why: string) => { out.dis = true; out.reasons.push('desventaja: ' + why); };
  const adv = (why: string) => { out.adv = true; out.reasons.push('ventaja: ' + why); };
  if (kind === 'attack') {
    ['Envenenado', 'Cegado', 'Apresado', 'Derribado', 'Asustado'].forEach((k) => { if (has(k)) dis(k.toLowerCase()); });
    if (has('Invisible')) adv('invisible');
  }
  if (kind === 'check') {
    if (has('Envenenado')) dis('envenenado');
    if (has('Asustado')) dis('asustado');
  }
  if (kind === 'init') {
    if (has('Incapacitado')) dis('incapacitado');
    if (has('Invisible')) adv('invisible');
  }
  if (kind === 'save') {
    if (ability === 1 && has('Apresado')) dis('apresado');
    if ((ability === 0 || ability === 1) && ['Paralizado', 'Aturdido', 'Inconsciente', 'Petrificado'].some(has)) {
      out.autoFail = true;
      out.reasons.push('falla automáticamente (' + ['Paralizado', 'Aturdido', 'Inconsciente', 'Petrificado'].filter(has).join(', ').toLowerCase() + ')');
    }
  }
  if (c.exh) {
    out.flat = -2 * c.exh;
    out.reasons.push('agotamiento ' + c.exh + ': ' + out.flat);
  }
  return out;
}

/** Cambia el nivel de agotamiento (0–6). El nivel 6 mata a la criatura (2024). */
export function setExhaustion(c: Combatant, n: number): { patch: Partial<Combatant>; log: LogDraft | null } {
  const exh = Math.max(0, Math.min(6, n));
  if (exh < 6 || c.kind === 'lair') return { patch: { exh }, log: null };
  const patch: Partial<Combatant> = c.kind === 'pc' ? { exh, dead: true } : { exh, hp: 0 };
  return { patch, log: { label: c.name + ' muere', detail: 'Agotamiento de nivel 6', total: '†' } };
}

/** Resuelve una salvación de muerte (2024). */
export function resolveDeathSave(c: Combatant, total: number, nat: number | null): { patch: Partial<Combatant>; msg: string } {
  const d = { s: 0, f: 0, ...(c.death || {}) };
  if (nat === 20) {
    return { patch: { hp: 1, death: { s: 0, f: 0 }, stable: false, conds: c.conds.filter((x) => x.k !== 'Inconsciente') }, msg: '¡20 natural! Recupera 1 PG.' };
  }
  let msg: string;
  if (nat === 1) { d.f = Math.min(3, d.f + 2); msg = '1 natural: dos fallos.'; }
  else if (total >= 10) { d.s = Math.min(3, d.s + 1); msg = 'Éxito.'; }
  else { d.f = Math.min(3, d.f + 1); msg = 'Fallo.'; }
  const patch: Partial<Combatant> = { death: d };
  if (d.s >= 3) { patch.stable = true; msg += ' Queda estable.'; }
  if (d.f >= 3) { patch.dead = true; msg += ' Muere.'; }
  return { patch, msg };
}

export interface Reminder {
  text: string;
  action?: { type: 'regen'; amt: number; src: string } | { type: 'death' };
  label?: string;
}

const conditionText = (k: string) => CONDITIONS.find((x) => x[0] === k)?.[1] || '';

/** Lo que el DM debe recordar al inicio del turno de una criatura. */
export function reminders(c: Combatant, m: Monster | null): Reminder[] {
  const out: Reminder[] = [];
  if (c.kind === 'lair') {
    out.push({ text: c.note ? c.note : 'Escribe en su ficha las acciones de guarida que vayas a usar.' });
    return out;
  }
  if (c.kind === 'pc' && c.hp === 0 && !c.dead && !c.stable) out.push({ text: 'Está a 0 PG: hace una tirada de salvación de muerte (CD 10).', action: { type: 'death' }, label: 'Tirar salvación de muerte' });
  if (c.kind === 'pc' && c.dead) out.push({ text: 'Ha muerto.' });
  if (m) {
    SECTIONS.forEach(([sec]) => (m[sec] || []).forEach((f, i) => {
      if (f.regen && c.hp > 0) out.push({ text: f.n + ': recupera ' + f.regen + ' PG al inicio de su turno (salvo que algo lo anule).', action: { type: 'regen', amt: f.regen, src: f.n }, label: 'Aplicar +' + f.regen });
      else if (f.sot) out.push({ text: f.n + ': ' + f.d });
      if (f.rc) out.push({ text: f.n + ' (' + (f.rc === 6 ? 'Recarga 6' : 'Recarga ' + f.rc + '–6') + '): ' + (c.spent[sec + i] ? 'gastada' : 'disponible') + '.' });
    }));
    if (c.laMax) out.push({ text: 'Acciones legendarias: ' + (c.laMax - c.laUsed) + '/' + c.laMax + '. Se usan justo después del turno de otra criatura.' });
    if (c.lrMax) out.push({ text: 'Resistencia legendaria: le quedan ' + (c.lrMax - c.lrUsed) + ' de ' + c.lrMax + '.' });
  }
  if (c.conc) out.push({ text: 'Mantiene la concentración en un conjuro.' });
  if (c.exh) out.push({ text: 'Agotamiento ' + c.exh + ': −' + 2 * c.exh + ' a tiradas d20 y −' + 5 * c.exh + ' pies de velocidad.' });
  c.conds.forEach((cd) => out.push({ text: cd.k + (cd.r != null ? ' (' + cd.r + ' ronda' + (cd.r > 1 ? 's' : '') + ' más)' : '') + ': ' + conditionText(cd.k) }));
  return out;
}

export interface Difficulty {
  has: boolean;
  text?: string;
  xp: number;
  label?: string;
  level?: 0 | 1 | 2 | 3 | 4;
  budget?: [number, number, number];
  party?: string;
}

/** Dificultad del encuentro según el presupuesto de PX de 2024. */
export function encounterDifficulty(cs: Combatant[], getMonster: (id: string) => Monster | undefined): Difficulty {
  const pcs = cs.filter((c) => c.kind === 'pc');
  const mons = cs.filter((c) => c.kind === 'monster');
  const xp = mons.reduce((t, c) => {
    const m = getMonster(c.monsterId || '');
    return t + (m ? (c.inLair && m.xpl ? m.xpl : m.xp || 0) : 0);
  }, 0);
  if (!pcs.length || !mons.length) return { has: false, xp, text: !pcs.length ? 'Añade a los jugadores (con su nivel en Grupo) para calcularla.' : 'Añade monstruos para calcularla.' };
  const lv = pcs.map((c) => Math.max(1, Math.min(20, c.level || 1)));
  const b: [number, number, number] = [0, 0, 0];
  lv.forEach((l) => { const r = XP_BUDGET[l - 1]; b[0] += r[0]; b[1] += r[1]; b[2] += r[2]; });
  let label = 'Por debajo de Baja';
  let level: Difficulty['level'] = 0;
  if (xp >= b[0]) { label = 'Baja'; level = 1; }
  if (xp >= b[1]) { label = 'Moderada'; level = 2; }
  if (xp >= b[2]) { label = 'Alta'; level = 3; }
  if (xp > b[2] * 1.5) { label = 'Muy por encima de Alta'; level = 4; }
  return { has: true, xp, label, level, budget: b, party: pcs.length + ' PJ (niv. ' + lv.join(', ') + ')' };
}

export function featureKeyList(m: Monster): { sec: SectionKey; i: number }[] {
  const out: { sec: SectionKey; i: number }[] = [];
  SECTIONS.forEach(([sec]) => (m[sec] || []).forEach((_, i) => out.push({ sec, i })));
  return out;
}
