import type { Line } from './bookImport';
import type { ItemKind, ItemMod, LibItem } from './magicItems';
import { norm } from './util';

/**
 * Importa los objetos mágicos del capítulo «Magic Items A–Z» de la Guía del Dungeon Master 2024 (en inglés) que tenga el
 * usuario. Se ejecuta en su navegador y el resultado se guarda solo en su dispositivo. Cada objeto es un nombre, una
 * línea de tipo y rareza («Wondrous Item, Rare (Requires Attunement)») y su texto. De ese texto se leen los efectos
 * que la hoja puede aplicar sola; el resto queda como texto.
 */

const KINDS: [RegExp, ItemKind][] = [[/^armor\b/i, 'armor'], [/^weapon\b/i, 'weapon'], [/^wondrous item\b/i, 'wondrous'], [/^ring\b/i, 'ring'], [/^potion\b/i, 'potion'], [/^(rod|staff|wand)\b/i, 'staff'], [/^scroll\b/i, 'other']];
const RARITY: [RegExp, string][] = [[/very rare/i, 'muy raro'], [/uncommon/i, 'poco común'], [/\bcommon\b/i, 'común'], [/\brare\b/i, 'raro'], [/legendary/i, 'legendario'], [/artifact/i, 'artefacto'], [/varies/i, 'varía']];
const HEAD = /^(Armor|Weapon|Wondrous Item|Ring|Potion|Rod|Staff|Wand|Scroll)\b[^.]{0,140}\b(Common|Uncommon|Rare|Very Rare|Legendary|Artifact|Rarity Varies|Varies)\b[^.]*$/;
const ABIL: Record<string, 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'> = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
const DMG_ES: Record<string, string> = { acid: 'ácido', cold: 'frío', fire: 'fuego', force: 'fuerza', lightning: 'relámpago', necrotic: 'necrótico', poison: 'veneno', psychic: 'psíquico', radiant: 'radiante', thunder: 'trueno' };

/** Líneas que no son del texto de un objeto: créditos de las ilustraciones, cabeceras de capítulo y letras de sección. */
const NOISE = (t: string) => /^ARTIST:/i.test(t) || /terms and conditions|^SUPPORT ABOUT|^Help Portal|^Support Forum|Don.t Sell or Share|^My Info|^Cookies$|^Coast$|FIND US ON|PRIVACY POLICY|^MEDIA$|WIZARDS OF THE COAST LLC|Wizards of the Coast|Dungeons & Dragons, D&D Beyond|product names, campaign/i.test(t) || /^CH\. \d+/.test(t) || /^Magic Items \([A-Z]\)$/.test(t) || /^RANDOM MAGIC ITEMS$/i.test(t) || /^MAGIC ITEMS A.Z$/i.test(t) || (t === t.toUpperCase() && /[A-Z]{4}/.test(t) && !/\d{2}/.test(t));

const slug = (s: string) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** El PDF parte las ligaduras («In fl uence»): se vuelven a unir. */
const fixLigatures = (t: string) => t.replace(/(\w) (fl|fi|ff|ffi|ffl) (?=[a-z])/g, '$1$2');

/** Efectos que se leen del texto del objeto (los que la hoja sabe aplicar). */
export function guessMods(text: string, kind: ItemKind): { mods: ItemMod[]; charges?: LibItem['charges']; roll?: string } {
  const mods: ItemMod[] = [];
  const t = text.replace(/\s+/g, ' ');
  const sc = /Your (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)(?: score)? (?:is|changes to) (\d+) while/i.exec(t);
  if (sc) mods.push({ k: 'abilSet', abil: ABIL[sc[1].toLowerCase()], v: Number(sc[2]) });
  const ac = /\+(\d+) bonus to (?:Armor Class|AC)( and saving throws)?( if you are wearing no armor)?/i.exec(t);
  if (ac) { mods.push({ k: 'ac', v: Number(ac[1]), ...(ac[3] ? { when: 'noArmor' as const } : {}) }); if (ac[2]) mods.push({ k: 'saves', v: Number(ac[1]) }); }
  const luck = /\+(\d+) bonus to ability checks and saving throws/i.exec(t);
  if (luck) mods.push({ k: 'saves', v: Number(luck[1]) }, { k: 'checks', v: Number(luck[1]) });
  const wp = kind === 'weapon' ? /gain a \+(\d+) bonus to attack rolls and damage rolls made with this/i.exec(t) : null;
  if (wp) mods.push({ k: 'wBonus', v: Number(wp[1]) });
  const sp = /\+(\d+) bonus to spell attack rolls( and the saving throw DCs)?/i.exec(t);
  if (sp) { mods.push({ k: 'spellAtk', v: Number(sp[1]) }); if (sp[2]) mods.push({ k: 'spellDc', v: Number(sp[1]) }); }
  const res = /you have Resistance to (\w+) damage/i.exec(t);
  if (res && DMG_ES[res[1].toLowerCase()]) mods.push({ k: 'resist', type: DMG_ES[res[1].toLowerCase()] });
  const ch = /(?:has|with) (\d+) charges/i.exec(t);
  const dawn = /at dawn/i.test(t);
  let charges: LibItem['charges'];
  if (ch) charges = { max: Number(ch[1]), per: dawn ? 'lr' : '' };
  let roll: string | undefined;
  if (kind === 'potion') {
    const heal = /regain (\d+d\d+(?: ?\+ ?\d+)?) Hit Points/i.exec(t);
    if (heal) { roll = heal[1].replace(/\s+/g, ''); charges = { max: 1, per: '' }; }
  }
  return { mods, ...(charges ? { charges } : {}), ...(roll ? { roll } : {}) };
}

/** Un texto continuo: las líneas de un párrafo se unen, y las que acaban una frase corta abren otro. */
function body(lines: string[]): string {
  const out: string[] = [];
  let cur = '';
  for (const l of lines) {
    cur = cur ? cur + ' ' + l : l;
    if (/[.!?:]$/.test(l) && l.length < 110) { out.push(cur); cur = ''; }
  }
  if (cur) out.push(cur);
  return out.join('\n').replace(/ {2,}/g, ' ').trim();
}

export function parseItems(lines: Line[]): LibItem[] {
  const ts = lines.map((l) => fixLigatures(l.t.trim())).filter((t) => t && !NOISE(t));
  const heads: number[] = [];
  for (let i = 1; i < ts.length; i++) if (HEAD.test(ts[i]) && ts[i - 1].length < 70 && !/[.,;]$/.test(ts[i - 1]) && /^[A-Z0-9]/.test(ts[i - 1])) heads.push(i);
  const out: LibItem[] = [];
  heads.forEach((h, k) => {
    const n = ts[h - 1];
    const type = ts[h];
    const end = k + 1 < heads.length ? heads[k + 1] - 1 : ts.length;
    const d = body(ts.slice(h + 1, end));
    const kind = KINDS.find(([re]) => re.test(type))?.[1] || 'other';
    const attune = /requires attunement/i.test(type);
    const variants = /^(.*?),? \+1, \+2, or \+3$/.exec(n);
    if (variants && (kind === 'weapon' || kind === 'armor' || kind === 'staff')) {
      // «Weapon, +1, +2, or +3»: tres objetos, uno por bonificador y con su rareza
      const base = variants[1];
      const rar = [...type.matchAll(/((?:Very )?(?:Uncommon|Rare|Legendary))[^()]*\(\+(\d)\)/gi)].reduce<Record<string, string>>((acc, m) => ({ ...acc, [m[2]]: m[1] }), {});
      for (const b of [1, 2, 3]) {
        const rarity = RARITY.find(([re]) => re.test(rar[String(b)] || ''))?.[1] || ((kind === 'armor' ? ['raro', 'muy raro', 'legendario'] : ['poco común', 'raro', 'muy raro'])[b - 1]);
        const name = (base === 'Weapon' ? 'Arma' : base === 'Armor' ? 'Armadura' : base === 'Shield' ? 'Escudo' : base === 'Ammunition' ? 'Munición' : base) + ' +' + b;
        out.push({ id: 'lib-it-' + slug(base) + '-' + b, n: name, kind, rarity, attune, d, mods: [kind === 'weapon' ? { k: 'wBonus', v: b } : kind === 'staff' ? { k: 'spellAtk', v: b } : { k: 'ac', v: b }] });
      }
      return;
    }
    const rarity = RARITY.find(([re]) => re.test(type))?.[1] || 'poco común';
    const g = guessMods(d, kind);
    out.push({ id: 'lib-it-' + slug(n), n, kind, rarity, attune, d, ...g });
  });
  // nombres repetidos (tablas de variantes): el primero
  return out.filter((x, i) => out.findIndex((y) => y.id === x.id) === i);
}
