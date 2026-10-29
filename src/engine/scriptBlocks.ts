import { DMG_TYPES, XP_BY_CR } from '../data/constants';
import type { Encounter, Feature, Monster, Spell } from '../data/types';
import { validDice } from './homebrew';
import { norm } from './util';

/**
 * Bloques de combate dentro de un guion .md: «```encuentro» y «```criatura» (formato 1).
 * Lo que se lee es el texto de los bloques; la prosa del guion no se interpreta. Nada se guarda aquí: `planBlocks` solo
 * devuelve lo que se crearía o actualizaría, con sus avisos, para enseñarlo antes de cargarlo.
 */
export const BLOCK_FORMAT = 1;

export interface RawBlock { kind: 'encuentro' | 'criatura'; body: string; line: number }

/** Los bloques de código «encuentro» y «criatura» de un texto. */
export function extractBlocks(text: string): RawBlock[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: RawBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = /^(\s*)(`{3,})(encuentro|criatura)\s*$/i.exec(lines[i]);
    if (!open) continue;
    const body: string[] = [];
    let j = i + 1;
    for (; j < lines.length && !new RegExp('^\\s*' + open[2] + '\\s*$').test(lines[j]); j++) body.push(lines[j]);
    out.push({ kind: open[3].toLowerCase() as RawBlock['kind'], body: body.join('\n'), line: i + 1 });
    i = j;
  }
  return out;
}

export interface BlockCtx {
  spells: Record<string, Spell>;
  custom: Monster[]; // criaturas propias que ya hay
  all: Monster[]; // todo lo que hay en el bestiario (SRD, tu Manual de Monstruos y propias), para resolver nombres
  encounters: Encounter[];
}
export interface CreaturePlan { monster: Monster; action: 'crear' | 'actualizar'; warnings: string[] }
export interface EncounterPlan { enc: Encounter; action: 'crear' | 'actualizar'; warnings: string[] }
export interface ImportPlan { creatures: CreaturePlan[]; encounters: EncounterPlan[]; warnings: string[] }

const slug = (s: string) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sin-nombre';
const ABIL_KEYS = ['fue', 'des', 'con', 'int', 'sab', 'car'];
const ABIL_ALIAS: Record<string, string> = { str: 'fue', dex: 'des', wis: 'sab', cha: 'car' };
const abilKey = (s: string) => { const k = norm(s).slice(0, 3); return ABIL_ALIAS[k] || k; };
const mod = (v: number) => Math.floor((v - 10) / 2);
const none = (v: string) => !v || /^[-–—]$/.test(v.trim());
const list = (v: string) => (none(v) ? [] : v.split(/\s*[,;]\s*/).map((x) => x.trim().toLowerCase()).filter(Boolean));
const yes = (v: string) => /^(s[ií]|yes|true|1)$/i.test(v.trim());
const int = (s: string) => { const n = parseInt(String(s).replace(/[.\s]/g, '').replace(/[−–]/g, '-'), 10); return Number.isFinite(n) ? n : NaN; };

const SECTIONS_ES: Record<string, 'tr' | 'ac_' | 'ba' | 're' | 'lg' | 'lairActions'> = {
  rasgos: 'tr', acciones: 'ac_', 'acciones adicionales': 'ba', reacciones: 're', 'acciones legendarias': 'lg', 'acciones de guarida': 'lairActions',
};

/** Parte las etiquetas por «;» sin romper los paréntesis. */
function splitTags(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ';' && !depth) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

const dmgList = (v: string, warn: (w: string) => void): [string, string][] =>
  v.split(',').flatMap((p) => {
    const m = /^\s*(\S+)\s+(.+?)\s*$/.exec(p);
    if (!m) { warn('daño sin tipo: «' + p.trim() + '»'); return []; }
    const expr = m[1].replace(/\s+/g, '');
    const type = m[2].toLowerCase();
    if (!validDice(expr)) { warn('dados no válidos: «' + m[1] + '»'); return []; }
    if (!DMG_TYPES.includes(type)) { warn('tipo de daño desconocido: «' + m[2] + '»'); return []; }
    return [[expr, type] as [string, string]];
  });

const FEATURE_KEYS = new Set(['atk', 'dmg', 'alt', 'dc', 'half', 'rc', 'day', 'dayl', 'cost', 'sot', 'regen', 'isLR']);

/** Un rasgo o acción: líneas de la viñeta (la primera sin el «- ») con su etiqueta final y su `datos:`. */
function parseFeature(lines: string[], warn: (w: string) => void): Feature | null {
  let datos: Record<string, unknown> | null = null;
  const body = lines.filter((l, i) => {
    const m = i > 0 ? /^\s*datos:\s*(\{.*\})\s*$/.exec(l) : null;
    if (!m) return true;
    try { datos = JSON.parse(m[1]); } catch { warn('«datos:» no es un JSON válido'); }
    return false;
  });
  const head = /^\*\*(.+?)\*\*\s*(.*)$/.exec(body[0] || '');
  if (!head) { warn('línea sin «**Nombre.**»: «' + (body[0] || '').slice(0, 40) + '»'); return null; }
  let name = head[1].trim().replace(/[.:]\s*$/, '').trim();
  const desc = [head[2], ...body.slice(1)];
  // la etiqueta es el último grupo entre corchetes de la última línea
  let tagText = '';
  const last = desc.length - 1;
  const tm = /\s*\[([^[\]]*)\]\s*$/.exec(desc[last]);
  if (tm) { tagText = tm[1]; desc[last] = desc[last].slice(0, tm.index); }
  const f: Feature = { n: name, d: desc.map((l) => l.replace(/^ {2}/, '').trimEnd()).join('\n').trim() };
  // «Aliento (Recarga 5–6)»: la recarga va en su campo
  const par = /\s*\((?:recarga|recharge)\s*(\d)(?:\s*[-–]\s*6)?\)\s*$/i.exec(name);
  if (par) { f.rc = Number(par[1]); name = name.slice(0, par.index); f.n = name; }
  const w = (t: string) => warn(name + ': ' + t);
  for (const tok of splitTags(tagText)) {
    let m: RegExpExecArray | null;
    if ((m = /^atq\s*([+-]?\d+)$/i.exec(tok))) f.atk = int(m[1]);
    else if ((m = /^da[ñn]o\s+(.+)$/i.exec(tok))) { const d = dmgList(m[1], w); if (d.length) f.dmg = [...(f.dmg || []), ...d]; }
    else if ((m = /^alt\((.*?)\)\s*:\s*(.+)$/i.exec(tok))) { const d = dmgList(m[2], w); if (d.length) f.alt = [...(f.alt || []), { l: m[1].trim(), dmg: d }]; }
    else if ((m = /^cd\s+(\d+)\s+(\S+)$/i.exec(tok))) { const k = abilKey(m[2]); if (ABIL_KEYS.includes(k)) f.dc = [Number(m[1]), k.toUpperCase()]; else w('característica de la CD no válida: «' + m[2] + '»'); }
    else if (/^mitad$/i.test(tok)) f.half = 1;
    else if ((m = /^recarga\s+(\d)(?:\s*[-–]\s*6)?$/i.exec(tok))) f.rc = Number(m[1]);
    else if ((m = /^d[ií]a\s+(\d+)(?:\s*\(\s*guarida\s+(\d+)\s*\))?$/i.exec(tok))) { f.day = Number(m[1]); if (m[2]) f.dayl = Number(m[2]); }
    else if ((m = /^coste\s+(\d+)$/i.exec(tok))) f.cost = Number(m[1]);
    else if (/^inicio$/i.test(tok)) f.sot = 1;
    else if ((m = /^regen\s+(\d+)$/i.exec(tok))) f.regen = Number(m[1]);
    else w('etiqueta desconocida «' + tok + '»');
  }
  if (datos) {
    for (const [k, v] of Object.entries(datos as Record<string, unknown>)) {
      if (FEATURE_KEYS.has(k)) (f as unknown as Record<string, unknown>)[k] = v;
      else w('«datos» con un campo que la app no tiene: «' + k + '»');
    }
  }
  if (f.dmg && !f.dmg.length) delete f.dmg;
  return f;
}

/** «- a voluntad: rayo de escarcha, mano de mago» -> [clave de conjuro, uso, nombre]. */
function parseSpells(header: string, bullets: string[], spells: Record<string, Spell>, warn: (w: string) => void): Feature | null {
  const sp: [string, string, string][] = [];
  const lines: string[] = [];
  for (const b of bullets) {
    const m = /^-\s*(a voluntad|(\d+)\s*\/\s*d[ií]a(?:\s+cada\s+uno)?)\s*:\s*(.+)$/i.exec(b.trim());
    if (!m) { warn('conjuros: línea no reconocida «' + b.trim() + '»'); continue; }
    const use = /voluntad/i.test(m[1]) ? 'a voluntad' : m[2] + '/día';
    const names = m[3].split(',').map((x) => x.trim()).filter(Boolean);
    lines.push((use === 'a voluntad' ? 'A voluntad' : m[2] + '/día cada uno') + ': ' + names.join(', '));
    for (const nm of names) {
      const n = norm(nm.replace(/\(.*?\)/g, ''));
      const key = Object.keys(spells).find((k) => norm(spells[k].n) === n || norm(spells[k].en) === n);
      if (!key) warn('conjuro no encontrado, se deja como texto: «' + nm + '»');
      sp.push([key || 'x:' + nm, use, nm]);
    }
  }
  if (!sp.length) return null;
  const f: Feature = { n: 'Lanzamiento de conjuros', d: '', sp };
  const ab = /^([A-Za-zÁÉÍÓÚáéíóú]{3})\s*(?:;|$)/.exec(header.trim());
  const dc = /\bCD\s*(\d+)/i.exec(header);
  const atk = /ataque\s*([+-]?\d+)/i.exec(header);
  if (dc) f.sdc = Number(dc[1]);
  if (atk) f.satk = int(atk[1]);
  const abName: Record<string, string> = { fue: 'Fuerza', des: 'Destreza', con: 'Constitución', int: 'Inteligencia', sab: 'Sabiduría', car: 'Carisma' };
  f.d = 'Lanza uno de los siguientes conjuros' + (ab && abName[abilKey(ab[1])] ? ' usando ' + abName[abilKey(ab[1])] + ' como característica de lanzamiento de conjuros' : '') +
    (f.sdc != null || f.satk != null ? ' (' + [f.sdc != null ? 'CD de salvación ' + f.sdc : '', f.satk != null ? (f.satk >= 0 ? '+' : '') + f.satk + ' al ataque con conjuros' : ''].filter(Boolean).join(', ') + ')' : '') + ':\n' + lines.join('\n');
  return f;
}

type Fields = Map<string, string>;

/** Una ficha `criatura`: un monstruo con el formato de la app, o null (con el motivo en `warnings`). */
export function parseCreature(body: string, spells: Record<string, Spell>): { monster: Monster | null; warnings: string[] } {
  const warnings: string[] = [];
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const fields: Fields = new Map();
  const sections: Record<string, string[][]> = {};
  let conjHeader = '';
  const conjBullets: string[] = [];
  let mode: 'head' | 'conj' | string = 'head';
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { if (mode === 'conj') mode = 'head'; continue; }
    const sec = /^([a-záéíóúñ ]+):\s*$/i.exec(line);
    if (sec && SECTIONS_ES[norm(sec[1])]) { mode = SECTIONS_ES[norm(sec[1])]; sections[mode] ||= []; continue; }
    if (mode === 'conj') { if (/^\s*-/.test(line)) { conjBullets.push(line); continue; } mode = 'head'; }
    if (mode !== 'head' && mode !== 'conj') {
      if (/^-\s/.test(line)) sections[mode].push([line.replace(/^-\s+/, '')]);
      else if (sections[mode].length) sections[mode][sections[mode].length - 1].push(line);
      else warnings.push('texto suelto en «' + mode + '»: «' + line.trim().slice(0, 40) + '»');
      continue;
    }
    const m = /^([^:]+):\s*(.*)$/.exec(line);
    if (!m) { warnings.push('línea no reconocida: «' + line.trim().slice(0, 40) + '»'); continue; }
    const key = norm(m[1]);
    if (key === 'conjuros') { conjHeader = m[2]; mode = 'conj'; continue; }
    fields.set(key, m[2].trim());
  }
  const get = (k: string) => fields.get(k) ?? '';
  const name = get('nombre').trim();
  const fmt = int(get('formato'));
  if (!name) return { monster: null, warnings: ['una ficha no tiene «nombre»'] };
  const warn = (w: string) => warnings.push(w);
  if (fmt > BLOCK_FORMAT) return { monster: null, warnings: ['formato ' + fmt + ' no soportado (esta app entiende el ' + BLOCK_FORMAT + ')'] };
  if (!fields.has('formato')) warn('falta «formato:»; se asume ' + BLOCK_FORMAT);

  // características
  const ab = [10, 10, 10, 10, 10, 10];
  const abText = get('caracteristicas');
  let nAb = 0;
  for (const m of abText.matchAll(/([A-Za-zÁÉÍÓÚ]{3})\s*(\d+)/g)) { const i = ABIL_KEYS.indexOf(abilKey(m[1])); if (i >= 0) { ab[i] = int(m[2]); nAb++; } }
  if (nAb < 6) return { monster: null, warnings: ['«características» incompletas (hacen falta las seis)'] };
  const ac = int(get('ca'));
  const hpm = /^(\d[\d.]*)\s*(?:\(([^)]+)\))?/.exec(get('pg'));
  if (!Number.isFinite(ac) || !hpm) return { monster: null, warnings: ['faltan «CA» o «PG» (o no son números)'] };
  const hp = int(hpm[1]);
  const hd = (hpm[2] || '').replace(/\s+/g, '');
  if (!hd) warn('«PG» sin dados entre paréntesis');
  else if (!validDice(hd)) warn('dados de PG no válidos: «' + hd + '»');

  const cr = get('cr').trim() || '1';
  if (!get('cr')) warn('falta «CR»; se pone 1');
  const xp = get('xp') ? int(get('xp')) : (XP_BY_CR[cr] ?? 0);
  if (!get('xp')) warn('falta «XP»; se toma de la tabla del CR');
  const pbRaw = get('competencia') ? int(get('competencia')) : NaN;
  const pb = Number.isFinite(pbRaw) ? pbRaw : Math.max(2, 2 + Math.floor((Math.max(1, parseFloat(cr) || 1) - 1) / 4));
  if (!Number.isFinite(pbRaw)) warn('falta «competencia»; se calcula del CR');

  // salvaciones: las listadas llevan su bonificador; el resto, el modificador
  const sv = ab.map(mod);
  const svText = get('salvaciones');
  if (!none(svText)) for (const m of svText.matchAll(/([A-Za-zÁÉÍÓÚ]{3})\w*\s*([+-]?\d+)/g)) { const i = ABIL_KEYS.indexOf(abilKey(m[1])); if (i >= 0) sv[i] = int(m[2]); else warn('salvación desconocida: «' + m[1] + '»'); }

  const mon: Monster = {
    id: '', n: name, custom: 1,
    sz: get('tamano').trim() ? get('tamano').trim().replace(/^./, (c) => c.toUpperCase()) : 'Mediano',
    t: get('tipo').trim().toLowerCase() || 'monstruosidad', al: get('alineamiento').trim() || 'sin alineamiento',
    ac, hp: Math.max(1, hp), hd: hd || '1d8', ini: get('iniciativa') ? int(get('iniciativa')) : mod(ab[1]), spd: get('velocidad').trim() || '30 pies',
    ab, sv, vul: list(get('vulnerabilidades')), res: list(get('resistencias')), imm: list(get('inmunidades')), ci: list(get('inmunidades a estados')),
    pp: get('percepcion pasiva') ? int(get('percepcion pasiva')) : 10 + mod(ab[4]), cr, xp: Number.isFinite(xp) ? xp : 0, pb,
  };
  if (!get('velocidad')) warn('falta «velocidad»; se pone 30 pies');
  if (!Number.isFinite(mon.ini)) mon.ini = mod(ab[1]);
  if (!Number.isFinite(mon.pp)) mon.pp = 10 + mod(ab[4]);
  const sk = get('habilidades'); if (!none(sk)) mon.sk = sk;
  const sen = get('sentidos'); if (!none(sen)) mon.sen = sen;
  mon.lang = none(get('idiomas')) ? '—' : get('idiomas');
  for (const k of [...mon.vul, ...mon.res, ...mon.imm]) if (!DMG_TYPES.includes(k) && !/\s/.test(k)) warn('tipo de daño desconocido en resistencias/inmunidades: «' + k + '»');
  if (yes(get('guarida'))) mon.lair = 1;
  const xpl = get('xp en guarida'); if (xpl && !none(xpl)) { mon.xpl = int(xpl); if (!mon.lair) warn('«XP en guarida» sin «guarida: sí»'); }
  const lr = /^(\d+)(?:\s*\(\s*(\d+)\s*en guarida\s*\))?/i.exec(get('resistencia legendaria'));
  if (lr) { mon.lr = Number(lr[1]); if (lr[2]) mon.lrl = Number(lr[2]); }
  const la = get('acciones legendarias por turno'); if (la && int(la) > 0) mon.la = int(la);

  const known = new Set(['formato', 'nombre', 'tamano', 'tipo', 'alineamiento', 'ca', 'pg', 'iniciativa', 'velocidad', 'caracteristicas', 'salvaciones', 'habilidades', 'vulnerabilidades', 'resistencias', 'inmunidades', 'inmunidades a estados', 'sentidos', 'percepcion pasiva', 'idiomas', 'cr', 'xp', 'competencia', 'guarida', 'xp en guarida', 'resistencia legendaria', 'acciones legendarias por turno']);
  for (const k of fields.keys()) if (!known.has(k)) warn('campo desconocido, se ignora: «' + k + '»');

  const fw = (sec: string) => (w: string) => warn(sec + ': ' + w);
  const conj = conjHeader || conjBullets.length ? parseSpells(conjHeader, conjBullets, spells, fw('conjuros')) : null;
  for (const [sec, items] of Object.entries(sections)) {
    const feats = items.map((it) => parseFeature(it, fw(sec))).filter((f): f is Feature => !!f);
    if (sec === 'ac_' && conj) feats.unshift(conj);
    if (feats.length) (mon as unknown as Record<string, Feature[]>)[sec] = feats;
  }
  if (conj && !mon.ac_?.includes(conj)) mon.ac_ = [conj, ...(mon.ac_ || [])];
  // la resistencia legendaria también va como rasgo para poder gastarla desde la hoja
  if (mon.lr && !(mon.tr || []).some((f) => /^resistencia legendaria/i.test(f.n))) {
    mon.tr = [...(mon.tr || []), { n: 'Resistencia legendaria', d: 'Si falla una tirada de salvación, puede elegir tener éxito en su lugar.', day: mon.lr, ...(mon.lrl ? { dayl: mon.lrl } : {}) }];
  }
  if (mon.la && !mon.lg?.length) warn('«acciones legendarias por turno» sin ninguna acción legendaria');
  return { monster: mon, warnings };
}

/** Un bloque `encuentro`: nombre, guarida y criaturas con cantidad (las notas no se interpretan). */
export function parseEncounter(body: string): { name: string; lair: boolean; items: { name: string; qty: number }[]; warnings: string[] } | { error: string } {
  const warnings: string[] = [];
  let name = '';
  let lair = false;
  let fmt = NaN;
  const items: { name: string; qty: number }[] = [];
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  for (const line of lines) {
    if (!line.trim() || /^\s{2,}/.test(line)) continue; // sangría: sigue las notas
    const it = /^-\s*(\d+)\s*[x×]\s*(.+?)\s*$/i.exec(line);
    if (it) { const ex = items.find((x) => norm(x.name) === norm(it[2])); if (ex) ex.qty += Number(it[1]); else items.push({ name: it[2], qty: Number(it[1]) }); continue; }
    if (/^-/.test(line)) { warnings.push('línea de criatura no reconocida: «' + line.trim() + '» (usa «- N x Nombre»)'); continue; }
    const m = /^([^:]+):\s*(.*)$/.exec(line);
    if (!m) { warnings.push('línea no reconocida: «' + line.trim().slice(0, 40) + '»'); continue; }
    const k = norm(m[1]);
    if (k === 'nombre') name = m[2].trim();
    else if (k === 'guarida') lair = yes(m[2]);
    else if (k === 'formato') fmt = int(m[2]);
    else if (k !== 'notas') warnings.push('campo desconocido, se ignora: «' + m[1].trim() + '»');
  }
  if (Number.isFinite(fmt) && fmt > BLOCK_FORMAT) return { error: 'formato ' + fmt + ' no soportado (esta app entiende el ' + BLOCK_FORMAT + ')' };
  if (!Number.isFinite(fmt)) warnings.push('falta «formato:»; se asume ' + BLOCK_FORMAT);
  if (!name) return { error: 'un encuentro no tiene «nombre»' };
  if (!items.length) return { error: 'el encuentro «' + name + '» no tiene criaturas («- N x Nombre»)' };
  return { name, lair, items, warnings };
}

/** Lo que cargaría el guion: criaturas propias (nuevas o a sobrescribir por nombre) y encuentros, con sus avisos. */
export function planBlocks(text: string, ctx: BlockCtx): ImportPlan {
  const plan: ImportPlan = { creatures: [], encounters: [], warnings: [] };
  const blocks = extractBlocks(text);
  const byName = new Map<string, string>(); // nombre normalizado -> id, de lo que trae el guion
  const used = new Set(ctx.custom.map((m) => m.id));

  for (const b of blocks.filter((x) => x.kind === 'criatura')) {
    const { monster, warnings } = parseCreature(b.body, ctx.spells);
    if (!monster) { plan.warnings.push('Ficha de la línea ' + b.line + ': ' + warnings.join('; ') + '. No se carga.'); continue; }
    const key = norm(monster.n);
    if (byName.has(key)) { plan.warnings.push('«' + monster.n + '» está repetida en el guion; se usa la primera.'); continue; }
    const old = ctx.custom.find((m) => norm(m.n) === key);
    let id = old?.id || 'c-md-' + slug(monster.n);
    while (!old && used.has(id)) id += '-2';
    used.add(id);
    monster.id = id;
    byName.set(key, id);
    plan.creatures.push({ monster, action: old ? 'actualizar' : 'crear', warnings });
  }

  const resolve = (name: string): string | null => {
    const k = norm(name);
    const own = byName.get(k);
    if (own) return own;
    const hit = ctx.all.filter((m) => norm(m.n) === k || (!!m.en && norm(m.en) === k));
    return (hit.find((m) => m.custom) || hit[0])?.id || null;
  };

  const seen = new Set<string>();
  for (const b of blocks.filter((x) => x.kind === 'encuentro')) {
    const e = parseEncounter(b.body);
    if ('error' in e) { plan.warnings.push('Encuentro de la línea ' + b.line + ': ' + e.error + '. No se carga.'); continue; }
    const key = norm(e.name);
    if (seen.has(key)) { plan.warnings.push('El encuentro «' + e.name + '» está repetido en el guion; se usa el primero.'); continue; }
    seen.add(key);
    const warnings = [...e.warnings];
    const items: Encounter['items'] = [];
    for (const it of e.items) {
      const id = resolve(it.name);
      if (!id) { warnings.push('criatura no encontrada: «' + it.name + '». Defínela con un bloque «criatura» o escribe su nombre como en el bestiario.'); continue; }
      const ex = items.find((x) => x.monsterId === id);
      if (ex) ex.qty = Math.min(20, ex.qty + it.qty); else items.push({ monsterId: id, qty: Math.max(1, Math.min(20, it.qty)), inLair: false });
    }
    if (!items.length) { plan.warnings.push('Encuentro «' + e.name + '»: ninguna criatura se ha podido resolver. No se carga.'); plan.warnings.push(...warnings.map((w) => '«' + e.name + '»: ' + w)); continue; }
    const old = ctx.encounters.find((x) => norm(x.name) === key);
    const enc: Encounter = { id: old?.id || 'e-md-' + slug(e.name), name: e.name, items: items.map((i) => ({ ...i, inLair: e.lair && !!ctx.all.concat(plan.creatures.map((c) => c.monster)).find((m) => m.id === i.monsterId)?.lair })), lair: e.lair };
    plan.encounters.push({ enc, action: old ? 'actualizar' : 'crear', warnings });
  }
  if (!blocks.length) plan.warnings.push('El guion no tiene bloques «encuentro» ni «criatura».');
  return plan;
}
