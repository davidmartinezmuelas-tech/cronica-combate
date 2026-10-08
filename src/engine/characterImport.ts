import { ABILS, type Abil, type ClassData, type PlayerData } from '../data/player';
import { blankCharacter, derive, mod, profBonus, weaponFromData, type Character, type CustomFeat } from './character';
import type { SheetData, SheetField } from './sheetImport';
import { featCatOf, splitFeatText } from './featText';
import { norm, uid } from './util';

export interface SpellRef {
  id: string;
  n: string;
  en: string;
  classes?: string[]; // conjuros de la biblioteca: las clases que lo tienen en su lista
}

const isShield = (s: SpellRef) => ['shield', 'escudo'].includes(norm(s.en)) || ['shield', 'escudo'].includes(norm(s.n));

/**
 * Conjuros escritos en la hoja, reconocidos por su nombre: `inList`, los de la lista de su clase (o todos si su clase
 * no tiene lista); `offList`, los que no son de su lista (por una dote, su especie…), para preguntar antes de añadirlos.
 * «Escudo» puede ser el del equipo: fuera de la lista no se propone.
 */
function matchSpells(tidyLines: string[], cls: ClassData | undefined, spells: SpellRef[]): { inList: SpellRef[]; offList: SpellRef[] } {
  const found = spells.filter((s) => tidyLines.includes(norm(s.n)) || (!!s.en && tidyLines.includes(norm(s.en))));
  if (!cls?.spells.length) return { inList: found.filter((s) => !isShield(s)), offList: [] };
  const ok = (s: SpellRef) => cls.spells.includes(s.id) || !!s.classes?.includes(cls.id);
  return { inList: found.filter(ok), offList: found.filter((s) => !ok(s) && !isShield(s)) };
}

/** Los conjuros de la hoja que no son de la lista de su clase (para preguntar si se añaden). */
export function offListSpells(fields: SheetField[], sheet: SheetData, data: PlayerData, spells: SpellRef[]): SpellRef[] {
  const clsName = sheet.classes && sheet.classes.length > 1 ? sheet.classes[0].cls : sheet.cls.replace(/\s*\d+\s*$/, '');
  const cls = data.classes.find((k) => norm(clsName) === norm(k.n) || norm(clsName) === norm(k.en));
  const lines = fields.flatMap((f) => String(f.value || '').split(/\r?\n|,/)).map((l) => l.trim()).filter((l) => l && l !== 'Yes' && l !== 'Off');
  return matchSpells([...new Set(lines.map(tidy))].filter((l) => l.length > 1), cls, spells).offList;
}

/** Nombre limpio de una línea de la hoja: sin «S/P», sin paréntesis finales ni signos sueltos. */
const tidy = (s: string) => norm(s.replace(/\bS\/P\b/gi, '').replace(/\(.*?\)\s*$/, '').replace(/[*•·:]+$/, '')).replace(/\s+/g, ' ').trim();

/**
 * Convierte una hoja PDF leída en un personaje: datos básicos, características, competencias (deducidas de los
 * bonificadores escritos en la hoja), y reconoce por su nombre, en inglés o español, el trasfondo, la subclase,
 * las armas, la armadura, el escudo, los conjuros y las dotes del SRD. Lo que no reconoce va a las notas o como
 * dote propia.
 */
export function sheetToCharacter(fields: SheetField[], sheet: SheetData, data: PlayerData, spells: SpellRef[], fileName = ''): Character {
  const extra = (label: string) => sheet.extras.find((e) => e.label === label)?.value || '';
  const same = (a: string, ...b: string[]) => b.some((x) => norm(x) === norm(a));
  // multiclase: la primera clase es la principal; las demás van a «multi»
  const mc = sheet.classes && sheet.classes.length > 1 ? sheet.classes : null;
  const clsName = mc ? mc[0].cls : sheet.cls.replace(/\s*\d+\s*$/, '');
  const cls = data.classes.find((k) => same(clsName, k.n, k.en));
  const level = Math.max(1, Math.min(20, mc ? mc[0].level : parseInt(sheet.level, 10) || 1));
  const total = mc ? Math.max(1, Math.min(20, mc.reduce((t, x) => t + x.level, 0))) : level;
  const subName = (k: (typeof data.classes)[number] | undefined, raw: string, lv: number) => (k?.sub && raw && same(raw, k.sub.n, k.sub.en) ? k.sub.n : raw || (k?.sub && lv >= k.sub.lv ? k.sub.n : ''));
  const multi = mc?.slice(1).map((x) => {
    const k = data.classes.find((y) => same(x.cls, y.n, y.en));
    return { classId: k?.id || '', className: k ? '' : x.cls, level: x.level, subclass: subName(k, x.sub, x.level) };
  });
  const species = data.species.find((s) => same(extra('Especie'), s.n, s.en)) || data.species.find((s) => norm(extra('Especie')).length > 2 && norm(s.n).startsWith(norm(extra('Especie'))));
  const bg = data.backgrounds.find((b) => same(extra('Trasfondo'), b.n, b.en));
  const subRaw = mc?.[0].sub || extra('Subclase');
  const subclass = cls?.sub && subRaw && same(subRaw, cls.sub.n, cls.sub.en) ? cls.sub.n : subRaw || (cls?.sub && level >= cls.sub.lv ? cls.sub.n : '');

  const abil = Object.fromEntries(ABILS.map((a) => [a, sheet.abil[a] ?? 10])) as Record<Abil, number>;
  const pb = profBonus(total);
  // competencia (y pericia) deducidas: bonificador escrito − modificador de la característica
  const skills: string[] = [];
  const expertise: string[] = [];
  const skillAbil: Record<string, Abil> = { acr: 'dex', ani: 'wis', arc: 'int', ath: 'str', dec: 'cha', his: 'int', ins: 'wis', itm: 'cha', inv: 'int', med: 'wis', nat: 'int', prc: 'wis', prf: 'cha', per: 'cha', rel: 'int', slt: 'dex', ste: 'dex', sur: 'wis' };
  for (const [k, b] of Object.entries(sheet.skillBonus)) {
    const diff = b - mod(abil[skillAbil[k]]);
    if (sheet.abil[skillAbil[k]] == null) continue;
    if (diff >= 2 * pb) { skills.push(k); expertise.push(k); } else if (diff >= pb) skills.push(k);
  }
  for (const s of bg?.skills || []) if (!skills.includes(s)) skills.push(s);
  const saveExtra = ABILS.filter((a) => sheet.saveBonus[a] != null && sheet.abil[a] != null && sheet.saveBonus[a]! - mod(abil[a]) >= pb && !cls?.saves.includes(a));

  // líneas de texto de toda la hoja, para reconocer armas, armaduras, conjuros y dotes por su nombre
  const lines = fields.flatMap((f) => String(f.value || '').split(/\r?\n|,/)).map((l) => l.trim()).filter((l) => l && l !== 'Yes' && l !== 'Off');
  const tidyLines = [...new Set(lines.map(tidy))].filter((l) => l.length > 1);

  const weapons = data.weapons.filter((w) => tidyLines.includes(norm(w.n)) || tidyLines.includes(norm(w.en))).map((w) => weaponFromData(w, cls));
  const armor = data.armor.find((a) => a.type !== 'shl' && (tidyLines.includes(norm(a.n)) || tidyLines.includes(norm(a.en))));
  const shield = fields.some((f) => /shield|escudo/i.test(f.name) && /^(yes|on|true|1)$/i.test(String(f.value))) || tidyLines.includes('shield') || tidyLines.includes('escudo');
  // conjuros: los de la lista de su clase (o de la biblioteca marcados para su clase); los de fuera se devuelven aparte
  const { inList } = matchSpells(tidyLines, cls, spells);
  const spellIds = inList.map((s) => s.id);

  // dotes: la primera línea de cada bloque («Savage Attacker (soldier)», «Protection (Fighting Style)»)
  const feats: string[] = bg?.feat ? [bg.feat] : [];
  const customFeats: CustomFeat[] = [];
  for (const f of fields) {
    const v = String(f.value || '').trim();
    // campos de dotes («FEATS», «Dotes»…; no «Class Features») o bloques que dicen ser un estilo de combate
    const featField = /(^|[^a-z])(feats?|dotes?)\s*\d*$/i.test(f.name.trim());
    if (!v || !(featField || /\((fighting style|estilo de combate)\)/i.test(v.split(/\r?\n/)[0]))) continue;
    // varias dotes escritas en lista en el mismo campo: cada una por separado
    const list = featField ? splitFeatText(v) : null;
    if (list) {
      for (const p of list) {
        const srd = data.feats.find((x) => norm(p.n).startsWith(norm(x.en)) || norm(p.n).startsWith(norm(x.n)));
        if (srd) { if (!feats.includes(srd.n)) feats.push(srd.n); continue; }
        if (!customFeats.some((x) => norm(x.n) === norm(p.n))) customFeats.push({ id: 'f-' + uid(), n: p.n, d: p.d, cat: featCatOf(p.n) || 'other', max: null, per: '' });
      }
      continue;
    }
    const [first, ...rest] = v.split(/\r?\n/);
    const title = tidy(first);
    const srd = data.feats.find((x) => title.startsWith(norm(x.en)) || title.startsWith(norm(x.n)));
    if (srd) { if (!feats.includes(srd.n)) feats.push(srd.n); continue; }
    const style = /^(.+?)\s*\((fighting style|estilo de combate)\)/i.exec(first.trim());
    if (style || featField) {
      const name = (style ? style[1] : first).trim();
      if (name && !customFeats.some((x) => norm(x.n) === norm(name))) customFeats.push({ id: 'f-' + uid(), n: name, d: rest.join('\n').trim(), cat: style ? 'fighting-style' : 'other', max: null, per: '' });
    }
  }

  const c: Character = {
    ...blankCharacter(), name: sheet.name, classId: cls?.id || '', className: cls ? '' : clsName, level, subclass, ...(multi?.length ? { multi } : {}),
    speciesId: species?.id || '', speciesName: species ? '' : extra('Especie'), backgroundId: bg?.id || '', backgroundName: bg ? '' : extra('Trasfondo'),
    abil, skills, expertise, saveExtra, weapons, armorId: armor?.id || '', shield, spells: spellIds, feats, customFeats, langs: extra('Idiomas'),
    notes: (fileName ? 'Importado de ' + fileName + '. ' : '') + 'Revisa la hoja: lo que no se ha podido reconocer está en el PDF original.',
  };
  // CA y PG: si lo calculado no coincide con lo escrito en la hoja, se respeta la hoja (objetos mágicos, rasgos…)
  const d = derive(c, data);
  const ac = parseInt(sheet.ac, 10);
  const hp = parseInt(sheet.hp, 10);
  if (ac && ac !== d.ac) c.ov.ac = ac;
  if (hp && hp !== d.hpMax) c.ov.hpMax = hp;
  c.hp = hp || d.hpMax;
  return c;
}
