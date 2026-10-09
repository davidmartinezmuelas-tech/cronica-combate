import { ABIL, CONDITION_IMMUNITIES, CR_LIST, DMG_TYPES, XP_BY_CR } from '../data/constants';
import type { Feature, Monster, SectionKey, Spell } from '../data/types';
import { avgOf, modOf } from './dice';
import { isCaps, titleCase, type Line } from './bookImport';
import { spellKeyByName } from './forge';
import { abilIndex } from './saveEffect';
import { norm, pbOf } from './util';

/**
 * Importa las fichas del Manual de Monstruos 2024 en español desde el PDF del usuario (con texto, aunque sea de OCR).
 * Se ejecuta en su navegador y el resultado se guarda solo en su dispositivo. Cada ficha empieza con el nombre en
 * mayúsculas y la línea «Tipo Tamaño (etiqueta), alineamiento»; luego CA, PG, la tabla de características, VD y los
 * apartados (Atributos, Acciones…). El OCR confunde letras («Id10» por «1d10», «PC» por «PG»): los daños se
 * comprueban con la media que da el propio texto.
 */

const TYPES = ['aberracion', 'automata', 'bestia', 'celestial', 'cieno', 'dragon', 'elemental', 'enjambre', 'feerico', 'gigante', 'humanoide', 'infernal', 'monstruosidad', 'muerto viviente', 'planta'];
const SIZE_RE = /^(Diminut[oa]s?|Pequeñ[oa]s?|Median[oa]s?|Grandes?|Enormes?|Gargantuesc[oa]s?)$/i;

/** «Dragón Enorme (cromático), legal malvado» -> tipo, tamaño y alineamiento. */
export function parseTypeLine(t: string): { t: string; sz: string; al: string } | null {
  const comma = t.lastIndexOf(',');
  if (comma < 0) return null;
  const head = t.slice(0, comma).trim();
  const al = t.slice(comma + 1).trim().replace(/\/(?=\s|$)/g, 'l').replace(/[.,]$/, '');
  const tag = /\(([^)]*)\)\s*$/.exec(head);
  const words = head.replace(/\([^)]*\)\s*$/, '').trim().split(/\s+/);
  const si = words.findIndex((w) => SIZE_RE.test(w));
  if (si < 1) return null;
  const type = words.slice(0, si).join(' ');
  if (!TYPES.some((k) => norm(type).startsWith(k))) return null;
  // «Humanoide Mediano o Pequeño», «Enjambre Mediano de bestias Diminutas»
  const rest = words.slice(si).join(' ');
  const sizeTxt = /^(\S+(?: o \S+)?)/.exec(rest)?.[1] || words[si];
  const extra = rest.slice(sizeTxt.length).trim();
  const sz = sizeTxt.charAt(0).toUpperCase() + sizeTxt.slice(1);
  const tt = (norm(type) === 'enjambre' && extra ? 'enjambre ' + extra : type).toLowerCase();
  return { t: tt + (tag ? ' (' + tag[1].trim() + ')' : ''), sz, al: al.toLowerCase() };
}

const isTypeLine = (t: string) => /^[A-ZÁÉÍÓÚ]/.test(t) && !!parseTypeLine(t) && t.length < 90;

/** Título de ficha: en mayúsculas, aunque el OCR lea alguna en minúscula («ARPíA», «Oso PARDO»). */
const isName = (t: string) => {
  const letters = t.replace(/[^\p{L}]/gu, '');
  return letters.length >= 2 && t.split(/\s+/).length <= 7 && !/[.:;]$/.test(t) && letters.replace(/[^\p{Lu}]/gu, '').length / letters.length >= 0.6;
};

/** Arreglos del OCR que no cambian el sentido. */
export function cleanOcr(t: string): string {
  return t
    .replace(/\bEI\b/g, 'El').replace(/\beI\b/g, 'el').replace(/\baI\b/g, 'al').replace(/\bdeI\b/g, 'del')
    .replace(/(\d)\s*[Il|]\s*d[ií]a\b/g, '$1/día').replace(/\b[Il]\s*\/?\s*d[ií]a\b/g, '1/día').replace(/\/dia\b/g, '/día')
    .replace(/[—–]/g, '-')
    .replace(/CD\s*['‘’`]?\s*(\d)\s+(\d)\b/g, 'CD $1$2')
    // palabras de las fichas que el OCR suele pegar
    .replace(/\b(Resistencia|Ataque|Acciones|Tirada|Lanzamiento)(legendaria|múltiple|adicionales|de)\b/g, '$1 $2')
    .replace(/\s+/g, ' ').trim();
}

const SIDES = [4, 6, 8, 10, 12, 20, 100];

/**
 * Dados de un texto «13 (3d6 + 3)» con errores de OCR: «Id10», «1 Id 10» (11d10), «(Id4 +» (le falta el
 * modificador). Se elige la lectura cuya media coincide con el número que va delante.
 */
export function fixDice(avg: number, raw: string): string | null {
  const s = raw.replace(/[Il|!]/g, '1').replace(/[Oo]/g, '0').replace(/[gq]/g, '9').replace(/S/g, '5').replace(/B/g, '8').replace(/[−–—]/g, '-').replace(/\s+/g, '');
  const m = /^(\d*)d(\d+)(?:([+-])(\d*))?/.exec(s);
  if (!m) return null;
  const cnt = m[1] ? parseInt(m[1], 10) : 1;
  const bonus = m[4] ? (m[3] === '-' ? -1 : 1) * parseInt(m[4], 10) : null;
  let sides = parseInt(m[2], 10);
  // «d9» («dg» por «d8»), «d1O»…: el dado válido que cuadra con la media
  if (!SIDES.includes(sides)) {
    const k = SIDES.find((x) => avgOf(cnt + 'd' + x + (bonus ? (bonus > 0 ? '+' : '') + bonus : '')) === avg) ?? SIDES.find((x) => String(sides).startsWith(String(x)));
    if (!k) return null;
    sides = k;
  }
  const make = (n: number, b: number) => n + 'd' + sides + (b ? (b > 0 ? '+' : '') + b : '');
  const ok = (n: number, b: number) => avgOf(make(n, b)) === avg || (avg === 0 && n > 0);
  if (bonus != null && ok(cnt, bonus)) return make(cnt, bonus);
  // modificador ilegible: el que cuadra con la media
  if (bonus == null || !ok(cnt, bonus)) {
    const b = avg - Math.floor((cnt * (sides + 1)) / 2);
    if (bonus == null && m[3] && b !== 0 && Math.abs(b) <= 20) return make(cnt, b);
    if (bonus == null && !m[3] && ok(cnt, 0)) return make(cnt, 0);
  }
  // número de dados ilegible: el que cuadra con la media (con el modificador leído o sin él)
  for (let n = 1; n <= 40; n++) if (ok(n, bonus ?? 0)) return make(n, bonus ?? 0);
  return bonus != null ? make(cnt, bonus) : make(cnt, 0);
}

const pretty = (e: string) => e.replace(/([+-])/g, ' $1 ');

const DMG_N = DMG_TYPES.map((d) => [norm(d), d] as const);
const dmgType = (w: string) => DMG_N.find(([k]) => norm(w).startsWith(k))?.[1] || '';

/** Daños «N (dados) de daño (de) tipo» del texto, ya corregidos; devuelve también el texto arreglado. */
export function damageIn(text: string): { text: string; parts: { expr: string; type: string; cond: string }[] } {
  // primero se arreglan los dados («13 C3d6 + 3)», «II (2d6+ 4)», «(1d10)4 3)» con «+» leído como «4»)
  const fixed = text
    .replace(/(d\s*\d+)\)\s*4\s*(\d+)\)/g, '$1 + $2)')
    .replace(/(?<![\p{L}\d])([\dIl]{1,3})\s*[(C{]\s*([0-9Il|!Oogq ]*\s*d\s*[0-9Il|Oogq]+(?:\s*[+−–—-]\s*[0-9Il|Oo]*)?)\s*\)?/gu, (all, n: string, dice: string) => {
      const avg = parseInt(n.replace(/[Il]/g, '1'), 10);
      const e = isNaN(avg) ? null : fixDice(avg, dice);
      return e ? avg + ' (' + pretty(e) + ')' : all;
    });
  const parts: { expr: string; type: string; cond: string }[] = [];
  // «… de daño cortante», y si sigue «si …», es un daño condicional («si la tirada de ataque tenía ventaja»)
  // (una palabra suelta del OCR entre «de daño» y el tipo se salta: «de daño de SAV relámpago»)
  for (const m of fixed.matchAll(/\d+ \(([^)]+)\)\s*de daño (?:de )?(?:([A-Z]{2,4}) )?(\p{L}+)(?: (si [^,.;]+))?/gu)) {
    const type = dmgType(m[3]);
    if (type) parts.push({ expr: m[1].replace(/\s+/g, ''), type, cond: (m[4] || '').trim() });
  }
  return { text: fixed, parts };
}

const SECTION_OF: [RegExp, SectionKey][] = [
  [/^ATRIBUTOS$/, 'tr'], [/^ACCIONESADICIONALES$/, 'ba'], [/^ACCIONESLEGENDARIAS$/, 'lg'], [/^ACCIONES$/, 'ac_'], [/^REACCIONES$/, 're'],
];
const sectionOf = (t: string): SectionKey | null => {
  const k = t.toUpperCase().replace(/[^A-ZÁÉÍÓÚÑ]/g, '').replace(/[ÁÉÍÓÚ]/g, (c) => 'AEIOU'['ÁÉÍÓÚ'.indexOf(c)]);
  return SECTION_OF.find(([re]) => re.test(k))?.[1] ?? null;
};

/** Inicio de un rasgo o acción: «Nombre. …» o «Nombre (recarga 5-6). …». */
const FEAT_START = /^(?!CD\s)([A-ZÁÉÍÓÚÑ¿][^.:;,()]{1,55}?)\s*(\([^)]{1,60}\))?\s*[.,]\s+(?=\S)/u;
const featStart = (t: string) => {
  const m = FEAT_START.exec(t);
  if (!m || m[1].trim().split(/\s+/).length > 7) return null;
  return m;
};

/** Pie de página («80 DRAGONES AZULES», «GOBLINS 3») o número suelto. */
const isFooter = (t: string) => /^\d{1,3}\s+[A-ZÁÉÍÓÚÑ ,'-]+$/.test(t) || /^[A-ZÁÉÍÓÚÑ ,'-]+\s+\d{1,3}$/.test(t) || /^\d{1,3}$/.test(t);

const LABEL = /(?:^|\s)(CA|Iniciativa|P[GCc]|pc|pg|Velocidad|Habilidades|Vulnerabilidades|Resistencias|Inmunidades|Equipo|Sentidos|Idiomas|VD)\s*[:;]/g;

/** Fila de la tabla de características: «FUE 21 +5 +5 DES 9 -1 +3 CON 15 +2 +6». */
export function abilityRow(t: string, ab: (number | null)[], sv: (number | null)[]) {
  const toks = t.replace(/[−–—]/g, '-').split(/\s+/);
  for (let i = 0; i < toks.length; i++) {
    const k = ABIL.indexOf(toks[i].toUpperCase().replace(/[^A-Z]/g, ''));
    if (k < 0) continue;
    const nums: string[] = [];
    for (let j = i + 1; j < toks.length && nums.length < 3; j++) {
      if (ABIL.includes(toks[j].toUpperCase().replace(/[^A-Z]/g, ''))) break;
      const v = toks[j].replace(/[^\d+-]/g, '');
      if (/^[+-]?\d{1,2}$/.test(v)) nums.push(v);
    }
    let score: number | null = null;
    const signed: number[] = [];
    for (const v of nums) {
      if (/^[+-]/.test(v)) signed.push(parseInt(v, 10));
      else if (score == null && !signed.length && +v >= 1 && +v <= 30) score = +v;
      // «+» leído como «4»: «40» es «+0», «43» es «+3»
      else if (/^4\d$/.test(v)) signed.push(+v[1]);
      else signed.push(+v);
    }
    if (score == null && signed.length) score = 10 + 2 * signed[0];
    if (score != null) ab[k] = score;
    const mod = score != null ? modOf(score) : null;
    // con dos números con signo, el segundo es la salvación; con uno, si no es el modificador, es la salvación
    const save = signed.length >= 2 ? signed[1] : signed.length === 1 && mod != null && signed[0] !== mod ? signed[0] : mod;
    if (save != null && (mod == null || Math.abs(save - mod) <= 12)) sv[k] = save;
  }
}

const splitList = (s: string) => {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if ((ch === ',' || ch === ';') && depth <= 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.flatMap((x) => x.split(/\s+y\s+/)).map((x) => x.trim().replace(/[.,]$/, '')).filter(Boolean);
};

interface Draft { name: string; type: { t: string; sz: string; al: string }; head: string[]; secs: Partial<Record<SectionKey, string[][]>>; sec: SectionKey | null; hab: string[]; la?: number }

/** Monta el monstruo a partir de las líneas de su cabecera y de sus apartados. */
function build(d: Draft, spells: Record<string, Spell>): Monster | null {
  const f: Record<string, string> = {};
  const ab: (number | null)[] = [null, null, null, null, null, null];
  const sv: (number | null)[] = [null, null, null, null, null, null];
  let key = '';
  for (const raw of d.head) {
    const t = raw.trim();
    // VD sin la etiqueta: «16 (15 000 px o 18 000 en la guarida; BC +5)»
    if (/^\d{1,2}(?:\/\d)?\s*\(\s*[\d .]+\s*px/i.test(t) && !f.vd) { f.vd = t; key = 'vd'; continue; }
    // PG sin la etiqueta: «54 (12d8)»
    if (!f.pg && /^\d+\s*[(C{]\s*\d*\s*[dI]/.test(t)) { f.pg = t; key = ''; continue; }
    if (/\b(FUE|DES|CON|INT|SAB|CAR)\b\s+[+-]?\d/i.test(t)) { abilityRow(t, ab, sv); key = ''; }
    const marks = [...t.matchAll(LABEL)];
    if (!marks.length) {
      if (key && !/^(MO[DO0]|SA[LI]V)/i.test(t) && !/\b(FUE|DES|CON|INT|SAB|CAR)\b/.test(t)) f[key] += ' ' + t;
      continue;
    }
    marks.forEach((m, i) => {
      const k = norm(m[1]).replace(/^p[gc]$/, 'pg');
      const from = (m.index || 0) + m[0].length;
      const to = i + 1 < marks.length ? marks[i + 1].index : t.length;
      f[k] = (f[k] ? f[k] + ' ' : '') + t.slice(from, to).trim();
      key = k;
    });
  }
  // «CX 16», «C4: 16»: la CA es lo primero de la cabecera
  const acTxt = f.ca || /^C\S{0,2}\s*[:;]?\s*(\d{1,2})\b/.exec(d.head[0] || '')?.[1] || '';
  const ac = parseInt(acTxt.replace(/[^\d].*$/, ''), 10) || 10;
  // «190 (20d10 + 80)»; sin la media («(18d8)») se calcula; sin los dados («26 + 4)») se queda la media
  const hpM = /(\d[\d ]*)?\s*[(C{]\s*([^)]*)\)?/.exec(f.pg || '');
  const hpN = parseInt(hpM?.[1]?.replace(/\s/g, '') || /^\s*(\d+)/.exec(f.pg || '')?.[1] || '', 10);
  const dice = hpM?.[2] || '';
  const hd = !isNaN(hpN) ? fixDice(hpN, dice) || '' : /^\s*\d*\s*d\s*\d+/.test(dice) ? dice.replace(/\s+/g, '') : '';
  const hp = !isNaN(hpN) ? hpN : avgOf(hd);
  if (!hp && !Object.keys(d.secs).length) return null;
  // VD, PX y bonificador
  const vd = f.vd || '';
  const crRaw = (/^\s*(\d{1,2}\s*\/\s*\d|\d{1,2})/.exec(vd)?.[1] || '').replace(/\s/g, '');
  const cr = CR_LIST.includes(crRaw) ? crRaw : '1';
  const pbM = /BC\s*\+?\s*(\d)/.exec(vd.replace(/8C/g, 'BC'));
  const pb = pbM ? parseInt(pbM[1], 10) : pbOf(cr);
  const lairXp = /(\d[\d ]{2,7})\s*en (?:la|su) guarida/i.exec(vd);
  const mods = ab.map((v) => modOf(v ?? 10));
  const abil = ab.map((v) => v ?? 10);
  const saves = sv.map((v, i) => v ?? mods[i]);
  const ini = parseInt((f.iniciativa || '').replace(/[−–—]/g, '-').replace(/[^\d+-].*$/, ''), 10);
  // sentidos y percepción pasiva
  const sens = (f.sentidos || '').replace(/\s+/g, ' ');
  const ppM = /Percepci[oó]n pasiva\s*(\d+)/i.exec(sens);
  const skill = (f.habilidades || '').trim().replace(/[.,]$/, '');
  const percSkill = /Percepci[oó]n\s*\+?(\d+)/i.exec(skill);
  const pp = ppM ? parseInt(ppM[1], 10) : 10 + (percSkill ? parseInt(percSkill[1], 10) : mods[4]);
  // daños e inmunidades a estados
  const imm: string[] = [], ci: string[] = [];
  for (const w of splitList(f.inmunidades || '')) {
    const t = dmgType(w);
    if (t) imm.push(t);
    else { const c = CONDITION_IMMUNITIES.find((k) => norm(w).startsWith(norm(k).slice(0, 6))); if (c) ci.push(c); }
  }
  const types = (s: string) => splitList(s).map(dmgType).filter(Boolean);
  const m: Monster = {
    id: 'mm-' + norm(d.name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    n: d.name, sz: d.type.sz, t: d.type.t, al: d.type.al, ac, hp: hp || 1, hd: hd || String(hp || 1), ini: isNaN(ini) ? mods[1] : ini,
    spd: (f.velocidad || '').replace(/\s+/g, ' ').replace(/[.,]$/, '').replace(/(\d) ,(\d)/g, '$1,$2'),
    ab: abil, sv: saves, sk: skill, vul: types(f.vulnerabilidades || ''), res: types(f.resistencias || ''), imm, ci,
    sen: sens.replace(/[;,]?\s*Percepci[oó]n pasiva\s*\d*\s*$/i, '').trim(), pp, lang: (f.idiomas || '—').trim().replace(/[.,]$/, ''),
    cr, xp: XP_BY_CR[cr] || 0, pb,
  };
  if (lairXp) { m.lair = 1; m.xpl = parseInt(lairXp[1].replace(/\s/g, ''), 10); }
  if (d.hab.length) m.hab = d.hab;
  for (const [sec, paras] of Object.entries(d.secs) as [SectionKey, string[][]][]) {
    const feats = paras.map((p) => feature(p.join(' '), m, spells, sec)).filter((x): x is Feature => !!x);
    if (feats.length) m[sec] = feats;
  }
  if (m.lg) m.la = d.la || 3;
  return m;
}

const USES = /^(?:recarga\s*(\d)(?:\s*-\s*6)?|(\d)\s*\/\s*d[ií]a(?:\s*cada uno)?(?:\s*[o0]\s*(\d)\s*\/\s*d[ií]a en la guarida)?)$/i;

/** Un rasgo o acción del texto, con su ataque, daño, salvación, usos y conjuros. */
function feature(text: string, m: Monster, spells: Record<string, Spell>, sec: SectionKey): Feature | null {
  const t = cleanOcr(text).replace(/(\p{L})- (\p{L})/gu, '$1$2');
  const st = featStart(t);
  let n: string, body: string, paren = '';
  if (st) { n = st[1].trim(); paren = (st[2] || '').slice(1, -1).trim(); body = t.slice(st[0].length); }
  else {
    // sin punto tras el nombre: hasta la primera palabra que empieza la frase
    const k = /^(.{3,50}?)\s+(?=(?:El|La|Los|Las|Un|Una|Tirada|Si|Mientras|Cuando)\b)/.exec(t);
    if (!k) return null;
    n = k[1]; body = t.slice(k[0].length);
  }
  // el OCR se comió el punto tras el nombre: «Recuperación sobrenatural Si es destruido, …»
  const glued = /^(.+?)\s+((?:Si|El|La|Los|Las|Un|Una|Mientras|Cuando)\s.*)$/.exec(n);
  if (glued) { n = glued[1]; body = glued[2] + (st ? st[0].slice(st[1].length).replace(/^\s*(\([^)]*\))?\s*/, ' ') : ' ') + body; }
  const { text: fixed, parts } = damageIn(body);
  // saltos de línea como en las fichas del SRD
  const d = fixed.replace(/\s+(Fallo o [ÉE]xito:|Fallo:|[ÉE]xito:|Primer fallo:|Segundo fallo:|A voluntad:|\d\/día(?: cada uno)?:|\d+: )/g, '\n$1');
  const o: Feature = { n: n.replace(/\s+/g, ' '), d };
  const u = USES.exec(paren);
  if (u) {
    if (u[1]) o.rc = parseInt(u[1], 10);
    else { o.day = parseInt(u[2], 10); if (u[3]) o.dayl = parseInt(u[3], 10); }
  } else if (paren) o.n += ' (' + paren + ')';
  // «Resistencia legendaria (4/día 0 en la 5/día guarida)»: el OCR desordena el paréntesis
  if (/^Resistencia legendaria/i.test(o.n) && !o.day) {
    const ds = [...(o.n + ' ' + paren).matchAll(/(\d)\s*\/\s*d[ií]a/gi)].map((x) => parseInt(x[1], 10));
    if (ds.length) { o.n = 'Resistencia legendaria'; o.day = ds[0]; if (ds[1]) o.dayl = ds[1]; }
  }
  if (/^Resistencia legendaria/i.test(o.n) && o.day) { o.isLR = 1; m.lr = o.day; if (o.dayl) m.lrl = o.dayl; }
  const atk = /Tirada de ataque [^:]{3,40}:\s*([+-]\s*\d+)/.exec(d);
  const base = parts.filter((p) => !p.cond);
  if (/Tirada de ataque/.test(d)) {
    if (atk) o.atk = parseInt(atk[1].replace(/\s/g, ''), 10);
    else {
      // bonificador ilegible: competencia + el modificador que suma al daño
      const b = /[+-]\d+$/.exec(base[0]?.expr || '');
      o.atk = m.pb + (b ? parseInt(b[0], 10) : Math.max(modOf(m.ab[0]), modOf(m.ab[1])));
    }
  }
  if (base.length) o.dmg = base.map((p) => [p.expr, p.type]);
  const cond = parts.filter((p) => p.cond);
  // «4 (1d4 + 2) de daño cortante o 9 (3d4 + 2) … si …»: con «o», el condicional sustituye al primero; con «más», se suma
  if (cond.length && base.length) {
    const instead = new RegExp('\\)\\s*de daño (?:de )?\\p{L}+ [o0] \\d+ \\(', 'u').test(d);
    o.alt = [{ l: cond[0].cond, dmg: [...(instead ? base.slice(1) : base).map((p) => [p.expr, p.type] as [string, string]), ...cond.map((p) => [p.expr, p.type] as [string, string])] }];
  }
  const sv = /Tirada de salvaci[oó]n de (\p{L}+)\s*:\s*CD\s*(\d)\s*(\d)?/u.exec(d);
  if (sv) {
    const i = abilIndex(sv[1]);
    if (i >= 0) o.dc = [parseInt(sv[2] + (sv[3] || ''), 10), ABIL[i]];
    if (/[ÉE]xito:\s*(solo )?la mitad/i.test(d)) o.half = 1;
  }
  // lanzamiento de conjuros
  if (/^Lanzamiento de conjuros/i.test(o.n)) {
    const sdc = /CD de salvaci[oó]n de conjuros?\s*(\d)\s*(\d)/.exec(d);
    const sat = /([+-]\d+) (?:al|a las tiradas de) ataque/.exec(d);
    if (sdc) o.sdc = parseInt(sdc[1] + sdc[2], 10);
    if (sat) o.satk = parseInt(sat[1], 10);
    const sp: [string, string, string][] = [];
    for (const lm of d.matchAll(/(A voluntad|\d\/día(?: cada uno)?):\s*([^\n]+)/g)) {
      const use = lm[1].toLowerCase().replace(' cada uno', '');
      for (const raw of lm[2].split(',')) {
        const name = raw.replace(/\(.*?\)/g, '').replace(/[.]$/, '').trim();
        if (name) sp.push([spellKeyByName(name, spells), use, name.charAt(0).toUpperCase() + name.slice(1)]);
      }
    }
    if (sp.length) o.sp = sp;
    delete o.dmg; delete o.dc; delete o.half;
  }
  if (sec === 'lg') { const c = /cuesta (\d) usos/i.exec(paren + ' ' + d); if (c) o.cost = parseInt(c[1], 10); }
  return o;
}

/** «Hábitat: bosque, colina, Infraoscuridad Tesoro: …» -> lista de hábitats. */
const habitatOf = (t: string) => splitList(t.replace(/^H[áa]bitat:\s*/i, '').replace(/\s*Tesoro:.*$/i, '')).map((h) => h.replace(/\s+/g, ' ').trim()).filter((h) => h.length > 2 && !/^\(/.test(h));

/**
 * Fichas de monstruo de las líneas del libro (todas las páginas en orden de lectura). Los pies de ilustración y de
 * página en medio de una ficha se saltan; el texto de ambientación que sigue a la ficha la cierra.
 */
export function parseMonsters(lines: Line[], spells: Record<string, Spell> = {}): Monster[] {
  const out: Monster[] = [];
  let cur: Draft | null = null;
  let hab: string[] = [];
  let habOpen = false;
  // `paused`: tras la ficha viene ambientación (o la ficha sigue en otra columna tras ella): se ignora hasta el
  // siguiente apartado de la ficha; `colBreak`: la línea anterior era la última de su columna
  let paused = false, colBreak = false;
  const flush = () => { if (cur) { const m = build(cur, spells); if (m) out.push(m); } cur = null; paused = false; };
  const kept = lines.map((l) => ({ ...l, t: cleanOcr(l.t) })).filter((l) => l.t && !isFooter(l.t));
  const L = kept.map((l) => l.t);
  for (let i = 0; i < L.length; i++) {
    const t = L[i];
    if (i > 0 && (kept[i].col !== kept[i - 1].col || kept[i].y > kept[i - 1].y)) colBreak = true;
    if (/^H[áa]bitat:/i.test(t)) { hab = habitatOf(t); habOpen = !/Tesoro:/i.test(t); continue; }
    if (habOpen) { habOpen = false; if (/^\(|^[a-zá-ú]/.test(t)) { hab = habitatOf('Hábitat: ' + L[i - 1].replace(/^H[áa]bitat:\s*/i, '') + ' ' + t); continue; } }
    const type = isTypeLine(t) ? parseTypeLine(t) : null;
    if (type && i > 0 && (isName(L[i - 1]) || /^\(tipo \d\)$/i.test(L[i - 1]))) {
      flush();
      // nombre en una o dos líneas («DRAGÓN» / «AZUL ADULTO»)
      let name = L[i - 1];
      // «YUAN-TI CORRUPTO» / «(Tipo 2)»
      if (/^\(tipo \d\)$/i.test(name)) name = (L[i - 2] || '') + ' ' + name;
      const before = L[i - 2] || '';
      // nombre partido en dos líneas («DRAGÓN» / «AZUL ADULTO»); la línea de arriba suele ser el título del grupo
      // («OGROS» / «OGRO»), así que solo se juntan si la de abajo no es un nombre completo
      if (isName(before) && !/[,.;:]/.test(before) && before.split(' ').length <= 3 && !sectionOf(before) && (/\b(dragon|de|del|cria)$/.test(norm(before)) || /^(joven|adult[oa]|ancian[oa]|cria)$/.test(norm(name)))) name = before + ' ' + name;
      cur = { name: titleCase(name), type, head: [], secs: {}, sec: null, hab };
      colBreak = false;
      continue;
    }
    if (!cur) continue;
    const sec = sectionOf(t) ?? (sectionOf(t + (L[i + 1] || '')) && /^ACCION/.test(norm(t).toUpperCase()) ? sectionOf(t + L[i + 1]) : null);
    if (sec) {
      if (sectionOf(t) == null) i++; // «ACCIONES» + «ADICIONALES» en dos líneas
      cur.sec = sec;
      (cur.secs[sec] ||= []);
      paused = false; colBreak = false;
      continue;
    }
    if (isCaps(t) && !/\d/.test(t)) {
      // en la cabecera: «MOD. SALV.» de la tabla; en cualquier caso, pies de ilustración y títulos de ambientación
      if (cur.sec && !paused) {
        let j = i;
        while (j < L.length && isCaps(L[j]) && !sectionOf(L[j]) && j - i < 6) j++;
        const next = L[j] || '';
        // tras el título viene texto que no es de la ficha: fin de la ficha (o pausa si luego sigue)
        if (!sectionOf(next) && !featStart(next)) paused = true;
      }
      continue;
    }
    if (paused) continue;
    if (!cur.sec) { cur.head.push(t); continue; }
    const paras = cur.secs[cur.sec]!;
    if (colBreak) {
      colBreak = false;
      const prev = paras[paras.length - 1]?.slice(-1)[0] || '';
      // la ficha sigue en la columna nueva si empieza un rasgo o termina una frase cortada; si no, es ambientación
      if (!featStart(t) && /[.,:!)]$/.test(prev)) { paused = true; continue; }
    }
    if (cur.sec === 'lg' && /^Usos de acciones legendarias/i.test(t)) { cur.la = parseInt(/:\s*(\d)/.exec(t)?.[1] || '3', 10); paras.push([]); continue; }
    // la explicación de las acciones legendarias va hasta la primera acción
    if (cur.sec === 'lg' && paras.length && !paras[paras.length - 1].length && !featStart(t)) continue;
    const last = paras[paras.length - 1];
    const prevEnd = last && last.length ? last[last.length - 1] : '';
    // un párrafo nuevo empieza tras un punto (o tras la cabecera del apartado)
    if (!last || !last.length || (featStart(t) && /[.,)!*]$/.test(prevEnd))) { if (last && !last.length) last.push(t); else paras.push([t]); }
    else last.push(t);
  }
  flush();
  // el mismo nombre dos veces (OCR repetido): se queda la primera
  const seen = new Set<string>();
  return out.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
}
