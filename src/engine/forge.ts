import { ABIL_INDEX, ABIL_LONG, CONDITION_IMMUNITIES, DMG_PHRASE, DMG_TYPES, SECTIONS, XP_BY_CR } from '../data/constants';
import type { Feature, Monster, SectionKey, Spell } from '../data/types';
import { avgOf, fmt, modOf, parseExpr, prettyExpr } from './dice';
import { norm, pbOf, uid } from './util';

export type FeatKind = 'melee' | 'ranged' | 'save' | 'spells' | 'text';
export type Usage = 'none' | 'rc6' | 'rc5' | 'rc4' | 'day1' | 'day2' | 'day3';

export interface ForgeFeat {
  k: string;
  sec: SectionKey;
  name: string;
  kind: FeatKind;
  atk: string;
  reach: string;
  d1: string;
  t1: string;
  d2: string;
  t2: string;
  sab: string;
  dc: string;
  half: boolean;
  area: string;
  usage: Usage;
  cost: string;
  desc: string;
  raw: boolean;
  spAb: string;
  spDc: string;
  spAtk: string;
  spWill: string;
  spDay1: string;
  spDay2: string;
  spDay3: string;
}

export interface ForgeState {
  name: string;
  size: string;
  type: string;
  align: string;
  ac: string;
  hpDice: string;
  speed: string;
  ini: string;
  abil: string[];
  saveProf: boolean[];
  cr: string;
  skills: string;
  senses: string;
  pp: string;
  langs: string;
  dmg: Record<string, 'resist' | 'immune' | 'vuln' | 'none'>;
  condImm: Record<string, boolean>;
  lr: string;
  la: string;
  lair: boolean;
  feats: ForgeFeat[];
}

export const newFeat = (sec: SectionKey = 'ac_'): ForgeFeat => ({
  k: uid(), sec, name: '', kind: sec === 'tr' ? 'text' : 'melee', atk: '', reach: 'alcance 5 pies', d1: '', t1: 'cortante', d2: '', t2: 'fuego',
  sab: 'DES', dc: '', half: true, area: '', usage: 'none', cost: '1', desc: '', raw: false, spAb: 'Carisma', spDc: '', spAtk: '', spWill: '', spDay1: '', spDay2: '', spDay3: '',
});

export const blankForge = (): ForgeState => ({
  name: '', size: 'Mediano', type: 'monstruosidad', align: 'sin alineamiento', ac: '12', hpDice: '4d8+4', speed: '30 pies', ini: '',
  abil: ['10', '10', '10', '10', '10', '10'], saveProf: [false, false, false, false, false, false], cr: '1', skills: '', senses: '', pp: '10', langs: '—',
  dmg: {}, condImm: {}, lr: '0', la: '0', lair: false, feats: [newFeat('ac_')],
});

export const dmgText = (parts: [string, string][]) => parts.map(([d, t]) => avgOf(d) + ' (' + prettyExpr(d) + ') de daño ' + (DMG_PHRASE[t] || t || '')).join(' más ');

export function spellKeyByName(name: string, spells: Record<string, Spell>): string {
  const n = norm(String(name).replace(/\(.*?\)/g, ''));
  for (const k in spells) {
    if (norm(spells[k].n) === n || norm(spells[k].en) === n) return k;
  }
  return 'x:' + String(name).trim();
}

/** Convierte el formulario de la Forja en un monstruo con el mismo formato que el SRD. */
export function forgeToMonster(f: ForgeState, id: string, spells: Record<string, Spell>): Monster {
  const ab = f.abil.map((v) => { const n = parseInt(v, 10); return isNaN(n) ? 10 : Math.max(1, Math.min(30, n)); });
  const pb = pbOf(f.cr);
  const mods = ab.map(modOf);
  const iniN = parseInt(f.ini, 10);
  const m: Monster = {
    id, custom: 1, n: (f.name || '').trim() || 'Sin nombre', en: '', sz: f.size, t: f.type || 'monstruosidad', al: f.align || 'sin alineamiento',
    ac: parseInt(f.ac, 10) || 10, hd: (f.hpDice || '1d8').replace(/\s+/g, ''), hp: avgOf(f.hpDice) || 1, ini: isNaN(iniN) ? mods[1] : iniN,
    spd: f.speed, ab, sv: mods.map((md, i) => md + (f.saveProf[i] ? pb : 0)), sk: f.skills, vul: [], res: [], imm: [],
    ci: CONDITION_IMMUNITIES.filter((c) => f.condImm[c]), sen: f.senses, pp: parseInt(f.pp, 10) || 10 + mods[4], lang: f.langs || '—',
    cr: f.cr, xp: XP_BY_CR[f.cr] || 0, pb,
  };
  DMG_TYPES.forEach((t) => {
    const md = f.dmg[t];
    if (md === 'resist') m.res.push(t);
    else if (md === 'immune') m.imm.push(t);
    else if (md === 'vuln') m.vul.push(t);
  });
  const lr = parseInt(f.lr, 10) || 0;
  const la = parseInt(f.la, 10) || 0;
  if (f.lair) m.lair = 1;
  if (lr > 0) { m.lr = lr; if (f.lair) m.lrl = lr + 1; }
  const secs: Record<SectionKey, Feature[]> = { tr: [], ac_: [], ba: [], re: [], lg: [] };
  if (lr > 0) secs.tr.push({ n: 'Resistencia legendaria', d: 'Si falla una tirada de salvación, puede elegir tener éxito en su lugar.', day: lr, ...(f.lair ? { dayl: lr + 1 } : {}), isLR: 1 });
  for (const ft of f.feats) {
    if (!ft.name.trim()) continue;
    const o: Feature = { n: ft.name.trim(), d: '' };
    const parts: [string, string][] = [];
    if (ft.kind !== 'spells') {
      if (parseExpr(ft.d1)) parts.push([ft.d1.replace(/\s+/g, ''), ft.t1]);
      if (parseExpr(ft.d2)) parts.push([ft.d2.replace(/\s+/g, ''), ft.t2]);
    }
    if (parts.length) o.dmg = parts;
    let auto = '';
    if (ft.kind === 'melee' || ft.kind === 'ranged') {
      const b = parseInt(ft.atk, 10) || 0;
      o.atk = b;
      auto = 'Tirada de ataque ' + (ft.kind === 'ranged' ? 'a distancia' : 'cuerpo a cuerpo') + ': ' + fmt(b) + ', ' + (ft.reach || 'alcance 5 pies') + '.' + (parts.length ? ' Impacto: ' + dmgText(parts) + '.' : '');
    } else if (ft.kind === 'save') {
      const dc = parseInt(ft.dc, 10) || 10;
      o.dc = [dc, ft.sab];
      if (ft.half) o.half = 1;
      auto = 'Tirada de salvación de ' + ABIL_LONG[ABIL_INDEX[ft.sab] ?? 0] + ': CD ' + dc + (ft.area ? ', ' + ft.area : '') + '.' + (parts.length ? ' Fallo: ' + dmgText(parts) + '.' : '') + (ft.half && parts.length ? ' Éxito: mitad de daño.' : '');
    } else if (ft.kind === 'spells') {
      const sp: [string, string, string][] = [];
      const lines: string[] = [];
      ([['spWill', 'a voluntad', 'A voluntad'], ['spDay1', '1/día', '1/día cada uno'], ['spDay2', '2/día', '2/día cada uno'], ['spDay3', '3/día', '3/día cada uno']] as const).forEach(([fk, us, lab]) => {
        const names = String(ft[fk] || '').split(',').map((x) => x.trim()).filter(Boolean);
        if (names.length) {
          lines.push(lab + ': ' + names.join(', '));
          names.forEach((nm) => sp.push([spellKeyByName(nm, spells), us, nm]));
        }
      });
      o.sp = sp;
      const sdc = parseInt(ft.spDc, 10);
      const sat = parseInt(ft.spAtk, 10);
      if (!isNaN(sdc)) o.sdc = sdc;
      if (!isNaN(sat)) o.satk = sat;
      auto = 'Lanza uno de los siguientes conjuros usando ' + (ft.spAb || 'Carisma') + ' como característica de lanzamiento de conjuros' +
        (isNaN(sdc) ? '' : ' (CD de salvación de conjuro ' + sdc + (isNaN(sat) ? ')' : ', ' + fmt(sat) + ' al ataque con conjuros)')) + ':\n' + lines.join('\n');
    }
    const d = ft.desc.trim();
    o.d = ft.kind === 'text' || ft.raw ? d || auto : (auto + (d ? ' ' + d : '')).trim();
    if (ft.usage === 'rc5') o.rc = 5;
    else if (ft.usage === 'rc6') o.rc = 6;
    else if (ft.usage === 'rc4') o.rc = 4;
    else if (ft.usage.startsWith('day')) o.day = parseInt(ft.usage.slice(3), 10);
    if (ft.sec === 'lg') { const c = parseInt(ft.cost, 10) || 1; if (c > 1) o.cost = c; }
    (secs[ft.sec] || secs.ac_).push(o);
  }
  (Object.keys(secs) as SectionKey[]).forEach((k) => { if (secs[k].length) m[k] = secs[k]; });
  if (m.lg) m.la = la || 3;
  return m;
}

/** Convierte un monstruo (del SRD o propio) en un formulario editable. */
export function monsterToForge(m: Monster, spells: Record<string, Spell>): ForgeState {
  const dmg: ForgeState['dmg'] = {};
  m.res.forEach((t) => { dmg[t] = 'resist'; });
  m.imm.forEach((t) => { dmg[t] = 'immune'; });
  m.vul.forEach((t) => { dmg[t] = 'vuln'; });
  const condImm: Record<string, boolean> = {};
  m.ci.forEach((c) => { condImm[c] = true; });
  const feats: ForgeFeat[] = [];
  SECTIONS.forEach(([sec]) => (m[sec] || []).forEach((f) => {
    if (f.isLR || /^Resistencia legendaria/.test(f.n)) return;
    const ft = newFeat(sec);
    ft.name = f.n;
    ft.desc = f.d || '';
    ft.raw = true;
    if (f.sp) {
      ft.kind = 'spells';
      const g: Record<string, string[]> = { 'a voluntad': [], '1/día': [], '2/día': [], '3/día': [] };
      f.sp.forEach(([k, us, nm]) => { (g[us] || g['a voluntad']).push(spells[k]?.n || nm || k); });
      ft.spWill = g['a voluntad'].join(', ');
      ft.spDay1 = g['1/día'].join(', ');
      ft.spDay2 = g['2/día'].join(', ');
      ft.spDay3 = g['3/día'].join(', ');
      ft.spDc = f.sdc != null ? String(f.sdc) : '';
      ft.spAtk = f.satk != null ? String(f.satk) : '';
    } else if (f.atk != null) {
      ft.kind = /a distancia/.test(f.d || '') && !/cuerpo a cuerpo/.test(f.d || '') ? 'ranged' : 'melee';
      ft.atk = String(f.atk);
    } else if (f.dc) {
      ft.kind = 'save';
      ft.dc = String(f.dc[0]);
      ft.sab = f.dc[1];
      ft.half = !!f.half;
    } else ft.kind = 'text';
    if (f.dmg?.[0]) {
      ft.d1 = f.dmg[0][0];
      ft.t1 = f.dmg[0][1] || 'cortante';
      if (f.dmg[1]) { ft.d2 = f.dmg[1][0]; ft.t2 = f.dmg[1][1] || 'fuego'; }
    }
    ft.usage = (f.rc ? 'rc' + f.rc : f.day ? 'day' + Math.min(3, f.day) : 'none') as Usage;
    ft.cost = String(f.cost || 1);
    feats.push(ft);
  }));
  return {
    name: m.n, size: m.sz, type: m.t, align: m.al, ac: String(m.ac), hpDice: m.hd, speed: m.spd || '', ini: String(m.ini || 0),
    abil: m.ab.map(String), saveProf: m.ab.map((s, i) => (m.sv ? m.sv[i] : modOf(s)) !== modOf(s)), cr: m.cr, skills: m.sk || '', senses: m.sen || '',
    pp: String(m.pp || 10), langs: m.lang || '—', dmg, condImm, lr: String(m.lr || 0), la: String(m.la || 0), lair: !!m.lair, feats,
  };
}
