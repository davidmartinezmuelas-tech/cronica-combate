import { CR_LIST, XP_BY_CR } from '../data/constants';
import type { Feature, Monster, SectionKey, Spell } from '../data/types';
import { modOf } from './dice';
import type { Line, TextItem } from './bookImport';
import { spellKeyByName } from './forge';
import { abilIndex } from './saveEffect';
import { norm, pbOf } from './util';
import { ABIL } from '../data/constants';

/**
 * Importa fichas de monstruo de libros en inglés (formato 2024: «Name» / «Large Undead (Elf, Vampire), Lawful Evil» /
 * «AC 16 Initiative +18 (28)» / «HP 315 (30d10 + 150)» / «Speed …» / tabla de características / «CR 23 (XP 50,000; PB +7)»
 * y los apartados Traits, Actions…). Los datos se guardan en español, como los del SRD; el texto de los rasgos y las
 * acciones se queda en inglés (con `en: 1`).
 */

const SIZE: Record<string, string> = { tiny: 'Diminuto', small: 'Pequeño', medium: 'Mediano', large: 'Grande', huge: 'Enorme', gargantuan: 'Gargantuesco' };
const TYPE: Record<string, string> = {
  aberration: 'aberración', construct: 'constructo', beast: 'bestia', celestial: 'celestial', ooze: 'cieno', dragon: 'dragón', elemental: 'elemental',
  fey: 'feérico', giant: 'gigante', humanoid: 'humanoide', fiend: 'infernal', monstrosity: 'monstruosidad', undead: 'muerto viviente', plant: 'planta',
};
const TYPE_PLURAL: Record<string, string> = { beast: 'bestias', undead: 'muertos vivientes', plant: 'plantas', ooze: 'cienos', construct: 'constructos', aberration: 'aberraciones', elemental: 'elementales', fey: 'feéricos', fiend: 'infernales', monstrosity: 'monstruosidades', humanoid: 'humanoides', dragon: 'dragones', giant: 'gigantes', celestial: 'celestiales' };
const SIZE_PLURAL: Record<string, string> = { tiny: 'diminutos', small: 'pequeños', medium: 'medianos', large: 'grandes', huge: 'enormes', gargantuan: 'gargantuescos' };
const ALIGN_WORD: Record<string, string> = { lawful: 'legal', chaotic: 'caótico', neutral: 'neutral', good: 'bueno', evil: 'malvado' };
const DMG: Record<string, string> = { acid: 'ácido', bludgeoning: 'contundente', slashing: 'cortante', cold: 'frío', fire: 'fuego', force: 'fuerza', necrotic: 'necrótico', piercing: 'perforante', psychic: 'psíquico', radiant: 'radiante', lightning: 'relámpago', thunder: 'trueno', poison: 'veneno' };
const COND: Record<string, string> = { blinded: 'cegado', charmed: 'hechizado', deafened: 'ensordecido', exhaustion: 'agotamiento', frightened: 'asustado', grappled: 'agarrado', incapacitated: 'incapacitado', paralyzed: 'paralizado', petrified: 'petrificado', poisoned: 'envenenado', restrained: 'apresado', stunned: 'aturdido', unconscious: 'inconsciente', prone: 'derribado' };
const SKILL: Record<string, string> = {
  acrobatics: 'Acrobacias', 'animal handling': 'Trato con animales', arcana: 'Arcanos', athletics: 'Atletismo', deception: 'Engaño', history: 'Historia', insight: 'Perspicacia',
  intimidation: 'Intimidación', investigation: 'Investigación', medicine: 'Medicina', nature: 'Naturaleza', perception: 'Percepción', performance: 'Interpretación',
  persuasion: 'Persuasión', religion: 'Religión', 'sleight of hand': 'Juego de manos', stealth: 'Sigilo', survival: 'Supervivencia',
};
const MOVE: Record<string, string> = { walk: '', burrow: 'excavar', climb: 'trepar', fly: 'volar', swim: 'nadar' };
const SENSE: Record<string, string> = { darkvision: 'visión en la oscuridad', blindsight: 'vista ciega', tremorsense: 'sentido de la vibración', truesight: 'visión verdadera' };

/** Etiquetas de tipo que aparecen entre paréntesis («Elf, Vampire»); las que no se conocen se dejan como vienen. */
const TAG: Record<string, string> = {
  elf: 'elfo', human: 'humano', dwarf: 'enano', gnome: 'gnomo', halfling: 'mediano', orc: 'orco', goblin: 'goblin', goblinoid: 'goblinoide', kobold: 'kobold', gnoll: 'gnoll',
  lizardfolk: 'hombre lagarto', merfolk: 'tritón', troll: 'trol', ogre: 'ogro', titan: 'titán', demon: 'demonio', devil: 'diablo', vampire: 'vampiro', lich: 'liche', angel: 'ángel',
  shapechanger: 'cambiaformas', wizard: 'mago', cleric: 'clérigo', warlock: 'brujo', paladin: 'paladín', rogue: 'pícaro', fighter: 'guerrero', warrior: 'guerrero', ranger: 'explorador',
  druid: 'druida', monk: 'monje', bard: 'bardo', sorcerer: 'hechicero', barbarian: 'bárbaro', priest: 'sacerdote', mage: 'mago', 'death knight': 'caballero de la muerte', 'demon hunter': 'cazador de demonios',
  nerubian: 'nerubiano', 'any race': 'cualquier raza', yuanti: 'yuan-ti', 'yuan-ti': 'yuan-ti', sahuagin: 'sahuagin', grimlock: 'grimlock', naga: 'naga', murloc: 'múrloc', satyr: 'sátiro', centaur: 'centauro', dragon: 'dragón', ghoul: 'necrófago',
};
const tagEs = (t: string) => t.split(',').map((x) => x.trim()).filter(Boolean).map((x) => TAG[x.toLowerCase()] || x).join(', ');
const ABIL_EN = ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'];
const num = (s: string) => parseInt(s.replace(/[−–—]/g, '-').replace(/,/g, ''), 10);

/**
 * La tabla de características de las fichas en inglés está en columnas sueltas («Str» / «22» / «+6» / «+13»). Cada fila
 * se junta en un solo texto («STATS Str 22 +6 +13») para que la lectura por líneas no la pierda.
 */
export function foldAbilityTable(items: TextItem[]): TextItem[] {
  const labels = items.filter((i) => ABIL_EN.includes(i.str.trim()));
  if (labels.length < 3) return items;
  const used = new Set<TextItem>();
  const out: TextItem[] = [];
  for (const lb of labels) {
    // lo que hay a la derecha en la misma fila, hasta la siguiente etiqueta
    const row = items.filter((i) => i !== lb && !used.has(i) && Math.abs(i.y - lb.y) <= 10 && i.x > lb.x && /^[+−–—-]?\d+$/.test(i.str.trim())).sort((a, b) => a.x - b.x);
    const nextLabel = labels.filter((o) => o !== lb && Math.abs(o.y - lb.y) <= 10 && o.x > lb.x).sort((a, b) => a.x - b.x)[0];
    const mine = row.filter((i) => !nextLabel || i.x < nextLabel.x).slice(0, 3);
    if (mine.length < 2) continue;
    mine.forEach((i) => used.add(i));
    used.add(lb);
    out.push({ ...lb, str: 'STATS ' + lb.str.trim() + ' ' + mine.map((i) => i.str.trim()).join(' ') });
  }
  return [...items.filter((i) => !used.has(i)), ...out];
}

const SECTION_EN: [RegExp, SectionKey | 'lair'][] = [
  [/^Traits$/i, 'tr'], [/^Actions$/i, 'ac_'], [/^Bonus Actions$/i, 'ba'], [/^Reactions$/i, 're'], [/^Legendary Actions$/i, 'lg'], [/^Lair Actions$/i, 'lair'],
];
const sectionOf = (t: string) => SECTION_EN.find(([re]) => re.test(t.trim()))?.[1] ?? null;

const TYPE_LINE = /^(Tiny|Small|Medium|Large|Huge|Gargantuan)(?: [Oo]r (Tiny|Small|Medium|Large|Huge|Gargantuan))?\s+([A-Za-z][A-Za-z ]*?)(?:\s*\(([^)]*)\))?,\s*([A-Za-z ,]+?)\.?$/;
const AC_LINE = /^AC\s+(\d+)\b/;

export function parseTypeLineEn(t: string): { t: string; sz: string; al: string } | null {
  const m = TYPE_LINE.exec(t.trim());
  if (!m) return null;
  const size = m[1].toLowerCase();
  const rest = m[3].trim();
  let type: string;
  const swarm = /^Swarm of (Tiny|Small|Medium|Large|Huge|Gargantuan) (\w+?)s?$/i.exec(rest);
  if (swarm) type = 'enjambre de ' + (TYPE_PLURAL[swarm[2].toLowerCase()] || swarm[2].toLowerCase() + 's') + ' ' + SIZE_PLURAL[swarm[1].toLowerCase()].replace(/os$/, ['beast', 'plant', 'monstrosity', 'aberration'].includes(swarm[2].toLowerCase()) ? 'as' : 'os');
  else if (TYPE[rest.toLowerCase()]) type = TYPE[rest.toLowerCase()];
  else return null;
  const sz = SIZE[size] + (m[2] ? ' o ' + SIZE[m[2].toLowerCase()] : '');
  const alRaw = m[5].trim().toLowerCase();
  const al = alRaw === 'unaligned' ? 'sin alineamiento' : /^any/.test(alRaw) ? 'cualquier alineamiento' : alRaw.split(/\s+/).map((w) => ALIGN_WORD[w] || w).join(' ');
  return { t: type + (m[4] && !swarm ? ' (' + tagEs(m[4]) + ')' : ''), sz, al };
}

const LABELS = /^(HP|Speed|Skills|Saving Throws?|Resistances|Vulnerabilities|Immunities|Gear|Senses|Languages|CR)\b\s*(.*)$/;
const LABEL_KEY: Record<string, string> = { HP: 'hp', Speed: 'speed', Skills: 'skills', Resistances: 'res', Vulnerabilities: 'vul', Immunities: 'imm', Gear: 'gear', Senses: 'senses', Languages: 'lang', CR: 'cr' };

const splitList = (s: string) => s.split(/[;,]/).map((x) => x.replace(/[.]$/, '').trim()).filter(Boolean);
const dmgList = (s: string) => splitList(s).flatMap((w) => w.toLowerCase().split(/\s+/).map((x) => DMG[x]).filter(Boolean)).filter((v, i, a) => a.indexOf(v) === i);

function speedEs(s: string): string {
  return splitList(s.replace(/\s+hover\b/i, ' (flotar)').replace(/\s+see ([^,;]+)/i, ' (ver $1)'))
    .map((p) => {
      const m = /^(Walk|Burrow|Climb|Fly|Swim)?\s*(\d+)\s*ft\.?(.*)$/i.exec(p);
      if (!m) return p;
      const label = MOVE[(m[1] || 'walk').toLowerCase()];
      return (label ? label + ' ' : '') + m[2] + ' pies' + (m[3] ? ' ' + m[3].trim() : '');
    })
    .join(', ');
}
const sensesEs = (s: string) => splitList(s.replace(/\s*Passive Perception\s*\d+\s*$/i, ''))
  .map((p) => p.replace(/^(\w+)\s+(\d+)\s*ft\.?/i, (_, k: string, n: string) => (SENSE[k.toLowerCase()] || k.toLowerCase()) + ' ' + n + ' pies')).join(', ');
const skillsEs = (s: string) => splitList(s).map((p) => p.replace(/^([A-Za-z ]+?)\s*([+−–-]\d+)$/, (_, k: string, v: string) => (SKILL[k.trim().toLowerCase()] || k.trim()) + ' ' + v.replace(/[−–]/g, '-'))).join(', ');

const USE_DAY = /(\d+)\s*\/\s*Day(?:\s*,?\s*or\s*(\d+)\s*\/\s*Day\s*in\s*(?:its\s*)?Lair)?/i;

/** Un rasgo o acción: «Nombre (usos). Texto». */
function feature(text: string, m: Monster, spells: Record<string, Spell>, sec: SectionKey | 'lair'): Feature | null {
  const t = text.replace(/(\p{L})- (\p{L})/gu, '$1$2').replace(/\s+/g, ' ').trim();
  const st = /^([A-Z][^.:;()]{1,60}?)\s*(\(([^)]{1,80})\))?\.\s+(?=\S)/u.exec(t);
  if (!st) return null;
  let n = st[1].trim();
  const paren = (st[3] || '').trim();
  const body = t.slice(st[0].length);
  const d = body.replace(/\s+(Failure or Success:|Failure:|Success:|Hit or Miss:|Failure|Success|At Will:|\d\/Day each:|\d\/Day:)(?=\s)/g, (all, k: string) => (/^(Failure|Success)$/.test(k) ? all : '\n' + k));
  const o: Feature = { n, d, en: 1 };
  if (paren) {
    const rc = /Recharge\s*(\d)/i.exec(paren);
    const day = USE_DAY.exec(paren);
    const cost = /Costs?\s*(\d)/i.exec(paren);
    if (rc) o.rc = +rc[1];
    else if (day) { o.day = +day[1]; if (day[2]) o.dayl = +day[2]; const extra = paren.replace(USE_DAY, '').replace(/^[\s,;]+|[\s,;]+$/g, ''); if (extra) o.n += ' (' + extra + ')'; }
    else if (cost && sec === 'lg') o.cost = +cost[1];
    else o.n += ' (' + paren + ')';
  }
  n = o.n;
  if (/^Legendary Resistance/i.test(n) && o.day) { o.isLR = 1; m.lr = o.day; if (o.dayl) m.lrl = o.dayl; }
  const atk = /Attack Roll:\s*([+−–-]\s*\d+)/.exec(d);
  if (atk) o.atk = num(atk[1].replace(/\s/g, ''));
  // daños «15 (2d8 + 6) Slashing damage»; los de una tirada de ataque o una salvación se aplican siempre
  const parts: [string, string][] = [];
  for (const dm of d.matchAll(/\d+\s*\(([\dd +−–-]+)\)\s*(\p{L}+)\s+damage/gu)) {
    const type = DMG[dm[2].toLowerCase()];
    if (type) parts.push([dm[1].replace(/\s+/g, '').replace(/[−–]/g, '-'), type]);
  }
  if (parts.length) o.dmg = parts;
  const sv = /(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw:\s*DC\s*(\d+)/i.exec(d);
  if (sv) {
    const i = abilIndex(sv[1]);
    if (i >= 0) o.dc = [+sv[2], ABIL[i]];
    if (/Success:\s*Half damage/i.test(d)) o.half = 1;
  }
  if (/^Spellcasting/i.test(n)) {
    const sdc = /spell save DC\s*(\d+)/i.exec(d);
    const sat = /([+−-]\d+) to hit with spell attacks/i.exec(d);
    if (sdc) o.sdc = +sdc[1];
    if (sat) o.satk = num(sat[1]);
    const sp: [string, string, string][] = [];
    for (const lm of d.matchAll(/(At Will|\d\/Day(?: each)?):\s*([^\n]+)/g)) {
      const use = /at will/i.test(lm[1]) ? 'a voluntad' : lm[1].toLowerCase().replace(' each', '').replace('/day', '/día');
      for (const raw of lm[2].split(',')) {
        const name = raw.replace(/\(.*?\)/g, '').replace(/\.$/, '').trim();
        if (name) sp.push([spellKeyByName(name, spells), use, name]);
      }
    }
    if (sp.length) o.sp = sp;
    delete o.dmg; delete o.dc; delete o.half;
  }
  return o;
}

interface Draft { name: string; type: { t: string; sz: string; al: string }; head: string[]; secs: Partial<Record<SectionKey | 'lair', string[][]>>; sec: SectionKey | 'lair' | null; la?: number; lastEnds: boolean }

function build(d: Draft, spells: Record<string, Spell>): Monster | null {
  const f: Record<string, string> = {};
  const ab: (number | null)[] = [null, null, null, null, null, null];
  const sv: (number | null)[] = [null, null, null, null, null, null];
  let key = '';
  let acTxt = '', iniTxt = '';
  for (const raw of d.head) {
    const t = raw.trim();
    const ac = /^AC\s+(\d+)\s*(.*)$/.exec(t);
    if (ac) { acTxt = ac[1]; iniTxt = /Initiative\s*([+−–-]\d+)/.exec(ac[2])?.[1] || ''; key = ''; continue; }
    if (/^STATS /.test(t)) {
      for (const sm of t.matchAll(/STATS (Str|Dex|Con|Int|Wis|Cha) (\d+)\s*([+−–-]\d+)?\s*([+−–-]\d+)?/g)) {
        const i = ABIL_EN.indexOf(sm[1]);
        ab[i] = +sm[2];
        sv[i] = sm[4] ? num(sm[4]) : sm[3] ? num(sm[3]) : modOf(+sm[2]);
      }
      key = '';
      continue;
    }
    if (/^(Mod|Save)\b/.test(t)) continue;
    const lb = LABELS.exec(t);
    if (lb) { key = LABEL_KEY[lb[1]] || (lb[1].startsWith('Saving') ? 'saves' : ''); f[key] = lb[2]; continue; }
    if (key) f[key] += ' ' + t;
  }
  const hpM = /^(\d[\d,]*)\s*(?:\(([^)]*)\))?/.exec(f.hp || '');
  const hp = hpM ? num(hpM[1]) : 0;
  const hd = (hpM?.[2] || '').replace(/\s+/g, '').replace(/[−–]/g, '-') || String(hp);
  if (!hp || !acTxt) return null;
  const crM = /^(\d+\/\d+|\d+)\s*(?:\(([^)]*)\))?/.exec(f.cr || '');
  const cr = crM && CR_LIST.includes(crM[1]) ? crM[1] : '1';
  const paren = crM?.[2] || '';
  const pbM = /PB\s*\+?(\d)/.exec(paren);
  const xpM = /XP\s*([\d,]+)/.exec(paren);
  const lairXp = /or\s*([\d,]+)\s*in\s*(?:its\s*)?lair/i.exec(paren);
  const mods = ab.map((v) => modOf(v ?? 10));
  const saves = sv.map((v, i) => v ?? mods[i]);
  const sens = f.senses || '';
  const pp = +(/Passive Perception\s*(\d+)/i.exec(sens)?.[1] || 0) || 10 + (/Perception\s*\+?(\d+)/.exec(f.skills || '') ? +/Perception\s*\+?(\d+)/.exec(f.skills || '')![1] : mods[4]);
  // inmunidades: «Cold, Necrotic; Charmed, Exhaustion»
  const imm: string[] = [], ci: string[] = [];
  for (const w of splitList(f.imm || '')) {
    for (const x of w.toLowerCase().split(/\s+/)) {
      if (DMG[x] && !imm.includes(DMG[x])) imm.push(DMG[x]);
      else if (COND[x] && !ci.includes(COND[x])) ci.push(COND[x]);
    }
  }
  const m: Monster = {
    id: 'mm-' + norm(d.name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    n: d.name, en: d.name, sz: d.type.sz, t: d.type.t, al: d.type.al, ac: +acTxt, hp, hd, ini: iniTxt ? num(iniTxt) : mods[1],
    spd: speedEs(f.speed || ''), ab: ab.map((v) => v ?? 10), sv: saves, sk: skillsEs(f.skills || ''), vul: dmgList(f.vul || ''), res: dmgList(f.res || ''), imm, ci,
    sen: sensesEs(sens), pp, lang: (f.lang || '—').trim().replace(/[.,]$/, ''), cr, xp: xpM ? num(xpM[1]) : XP_BY_CR[cr] || 0, pb: pbM ? +pbM[1] : pbOf(cr),
  };
  if (lairXp) { m.lair = 1; m.xpl = num(lairXp[1]); }
  for (const [sec, paras] of Object.entries(d.secs) as [SectionKey | 'lair', string[][]][]) {
    const feats = paras.map((p) => feature(p.join(' '), m, spells, sec)).filter((x): x is Feature => !!x);
    if (!feats.length) continue;
    if (sec === 'lair') m.lairActions = feats; else m[sec] = feats;
  }
  if (m.lg) m.la = d.la || 3;
  return m;
}

/** Una línea corta, con mayúscula y sin puntuación final: título de otra entrada (el texto de una ficha acaba en punto). */
const headingLike = (t: string) => t.length <= 60 && /^[A-ZÁÉÍÓÚÑ]/.test(t) && !/[.,:;)!?”]$/.test(t) && t.split(' ').length <= 8;
const RUNNING = /^(Appendix [A-Z]\b|Chapter \d+\b|Stat Blocks$)/i;

/** Fichas de monstruo de las líneas de un libro en inglés (todas las páginas en orden de lectura). */
export function parseMonstersEn(lines: Line[], spells: Record<string, Spell> = {}): Monster[] {
  const L = lines.filter((l) => l.t.trim() && !RUNNING.test(l.t.trim()));
  const out: Monster[] = [];
  const seen = new Set<string>();
  for (let i = 1; i + 1 < L.length; i++) {
    const type = parseTypeLineEn(L[i].t);
    if (!type || !AC_LINE.test(L[i + 1].t)) continue;
    const name = L[i - 1].t.trim();
    if (!/^[A-ZÁÉÍÓÚÑ]/.test(name) || name.length > 60) continue;
    const d: Draft = { name, type, head: [], secs: {}, sec: null, lastEnds: true };
    let j = i + 1;
    let para: string[] | null = null;
    for (; j < L.length; j++) {
      const t = L[j].t.trim();
      if (j > i + 1 && parseTypeLineEn(t) && AC_LINE.test(L[j + 1]?.t || '')) break;
      const sec = sectionOf(t);
      if (sec) { d.sec = sec; para = null; if (!d.secs[sec]) d.secs[sec] = []; continue; }
      if (!d.sec) { d.head.push(t); continue; }
      // un título de otra entrada cierra la ficha
      if (headingLike(t) && d.secs[d.sec]!.length > 0) {
        if (/^Legendary Action Uses/i.test(t)) { /* no es título */ } else break;
      }
      const lg = /^Legendary Action Uses:\s*(\d+)/i.exec(t);
      if (lg) { d.la = +lg[1]; para = null; continue; }
      if (d.sec === 'lg' && !d.secs.lg!.length && !para && !/^[A-Z][^.]{1,60}\.\s/.test(t)) continue; // introducción de las acciones legendarias
      const starts = /^[A-Z][^.:;]{1,60}?(?:\s*\([^)]{1,80}\))?\.\s+\S/.test(t) || /^[A-Z][^.:;]{1,60}?(?:\s*\([^)]{1,80}\))?\.$/.test(t);
      const prevEnds = !para || /[.!?”)]$/.test(para[para.length - 1]);
      if (starts && prevEnds) { para = [t]; d.secs[d.sec]!.push(para); } else if (para) para.push(t); else { para = [t]; d.secs[d.sec]!.push(para); }
    }
    const m = build(d, spells);
    if (m && !seen.has(m.id)) { seen.add(m.id); out.push(m); }
    i = j - 1;
  }
  return out;
}
