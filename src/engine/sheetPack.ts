import type { PlayerData } from '../data/player';
import type { LibBackground, LibFeat, LibSpell, LibSubclass } from './bookImport';
import { asClass, classEntries, type Character } from './character';
import { featureUses } from './featureUses';
import { spellRoll } from './spellRoll';
import { subclassSpells, subclassText } from './subclassChoices';
import { norm } from './util';

/**
 * Lo que el jugador manda a la sala para que el máster vea su hoja (reducida y de solo lectura): el personaje (sin
 * sus notas, que son personales), sus creaciones propias que usa y, de lo importado de su libro, solo datos de juego
 * sin el texto (nombres, niveles, usos, tiradas, conjuros siempre preparados). El texto del libro no sale del dispositivo.
 */
export interface SheetPack { char: Character; subs: LibSubclass[]; spells: LibSpell[]; bgs: LibBackground[]; feats: LibFeat[] }

interface Lib { subclasses: LibSubclass[]; spells: LibSpell[]; backgrounds: LibBackground[]; feats: LibFeat[] }

export function buildPack(c: Character, data: PlayerData | null, lib: Lib, spellList: { id: string; n: string; l?: number }[]): SheetPack {
  const subs: LibSubclass[] = [];
  const subSpellIds: string[] = [];
  for (const e of classEntries(c)) {
    const s = lib.subclasses.find((x) => x.cls === e.classId && norm(x.n) === norm(e.subclass || ''));
    if (!s || subs.some((x) => x.id === s.id)) continue;
    if (s.own) {
      subs.push(s);
      s.f.forEach((f) => (f.sp || []).forEach((id) => subSpellIds.push(id.split('|')[0])));
      continue;
    }
    // del libro: sin texto; los usos y los conjuros siempre preparados (con su nivel) ya calculados
    const cls = data?.classes.find((x) => x.id === e.classId);
    const v = asClass(c, e);
    const always = subclassSpells(v, cls, subclassText(v, cls, lib.subclasses), spellList);
    always.forEach((o) => subSpellIds.push(o.id));
    const f = s.f.map((x) => {
      const u = x.u || featureUses(x.n, x.d, e.level) || undefined;
      return { lv: x.lv, n: x.n, d: '', ...(u ? { u } : {}) };
    });
    if (always.length && f.length) f[0] = { ...f[0], sp: always.map((o) => o.id + '|' + o.at) } as (typeof f)[number];
    subs.push({ id: s.id, n: s.n, cls: s.cls, d: '', f, ...(s.x ? { x: s.x.map((o) => ({ n: o.n, d: '' })) } : {}) });
  }
  // conjuros de la biblioteca que usa: los suyos, los de su subclase y los elegidos en rasgos (Iniciado en la magia…)
  const ids = new Set([...c.spells, ...subSpellIds, ...Object.values(c.choices || {}).flat()]);
  const spells = lib.spells.filter((s) => ids.has(s.id)).map((s) => {
    if (s.own) return s;
    const sr = spellRoll(s.t);
    return { ...s, t: '', ...(sr ? { sr } : {}) };
  });
  const bgs = lib.backgrounds.filter((b) => b.id === c.backgroundId).map((b) => ({ ...b, d: '', equip: '' }));
  const feats = lib.feats.filter((f) => c.feats.includes(f.n)).map((f) => ({ ...f, d: '' }));
  return { char: { ...c, notes: '' }, subs, spells, bgs, feats };
}
