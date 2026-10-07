import { DMG_TYPES } from '../data/constants';
import type { ClassData, PlayerData } from '../data/player';
import type { LibSubclass } from './bookImport';
import type { DiceResource } from './subclassActions';
import type { Character } from './character';
import { norm } from './util';

/**
 * Elecciones de subclase (maniobras, habilidades, opciones de un rasgo…). Aquí solo va la regla: qué subclase,
 * cuántas a cada nivel y de dónde salen las opciones. Los textos de las opciones salen del SRD o de la biblioteca
 * propia del usuario (su libro), nunca del repositorio.
 */
export interface ChoiceOption { n: string; d: string }

export type ChoiceFrom =
  | { skills: 'class' | 'any' } // habilidades: de la lista de la clase o cualquiera
  | { list: string[] } // lista fija de términos de juego (tipos de daño, terrenos…)
  | { feature: string[] } // las opciones que describe un rasgo de la subclase («**Nombre.** texto»)
  | { section: string } // un apartado de opciones del libro («Opciones de maniobras»)
  | { text: true } // texto libre
  | { spells: { classes: string[]; school?: string; minLevel: number } }; // conjuros de esas listas (y escuela), hasta el nivel que puede lanzar

export interface ChoiceDef {
  id: string;
  cls: string;
  subs: string[]; // nombres de la subclase (SRD, libro en español y en inglés)
  label: string;
  at: Record<number, number>; // nivel -> cuántas en total
  rest?: 'sr' | 'lr'; // se puede cambiar tras un descanso: también se elige desde la hoja
  from: ChoiceFrom;
  res?: DiceResource; // las opciones gastan dados de este recurso y se tiran desde la hoja
  prepared?: boolean; // conjuros elegidos que siempre tiene preparados (si no, gratis en su libro de conjuros)
}

const DAMAGE = DMG_TYPES;

export const CHOICES: ChoiceDef[] = [
  { id: 'battle-master.maneuvers', cls: 'fighter', subs: ['Maestro del combate', 'Battle Master'], label: 'Maniobras', at: { 3: 3, 7: 5, 10: 7, 15: 9 }, from: { section: 'maniobras' },
    res: { key: 'Dados de supremacía', n: 'Dados de supremacía', per: 'sr', count: { 3: 4, 7: 5, 15: 6 }, die: { 3: 8, 10: 10, 18: 12 }, dc: ['str', 'dex'] } },
  { id: 'battle-master.skill', cls: 'fighter', subs: ['Maestro del combate', 'Battle Master'], label: 'Estudioso de la guerra: habilidad', at: { 3: 1 }, from: { skills: 'class' } },
  { id: 'battle-master.tool', cls: 'fighter', subs: ['Maestro del combate', 'Battle Master'], label: 'Estudioso de la guerra: herramientas de artesano', at: { 3: 1 }, from: { text: true } },
  { id: 'lore.skills', cls: 'bard', subs: ['Colegio del conocimiento', 'Colegio del Saber', 'College of Lore'], label: 'Competencias adicionales', at: { 3: 3 }, from: { skills: 'any' } },
  { id: 'beast-master.beast', cls: 'ranger', subs: ['Señor de las bestias', 'Beast Master'], label: 'Bestia primigenia', at: { 3: 1 }, from: { list: ['Bestia de tierra firme', 'Bestia de los mares', 'Bestia del cielo'] } },
  { id: 'hunter.prey', cls: 'ranger', subs: ['Cazador', 'Hunter'], label: 'Presa del cazador', at: { 3: 1 }, rest: 'sr', from: { feature: ['El cazador y la presa', 'Presa del cazador'] } },
  { id: 'hunter.tactics', cls: 'ranger', subs: ['Cazador', 'Hunter'], label: 'Tácticas defensivas', at: { 7: 1 }, rest: 'sr', from: { feature: ['Tácticas defensivas'] } },
  { id: 'wild-heart.aspect', cls: 'barbarian', subs: ['Senda del corazón salvaje', 'Path of the Wild Heart'], label: 'Aspecto de lo salvaje', at: { 6: 1 }, rest: 'lr', from: { feature: ['Aspecto de lo salvaje'] } },
  { id: 'land.terrain', cls: 'druid', subs: ['Círculo de la tierra', 'Circle of the Land'], label: 'Tipo de terreno', at: { 3: 1 }, rest: 'lr', from: { list: ['Árido', 'Polar', 'Templado', 'Tropical'] } },
  { id: 'draconic.affinity', cls: 'sorcerer', subs: ['Hechicería dracónica', 'Draconic Sorcery'], label: 'Afinidad elemental', at: { 6: 1 }, from: { list: ['ácido', 'frío', 'fuego', 'relámpago', 'veneno'] } },
  ...([['Abjurador', 'Abjurer', 'abjuracion'], ['Adivino', 'Diviner', 'adivinacion'], ['Evocador', 'Evoker', 'evocacion'], ['Ilusionista', 'Illusionist', 'ilusi']] as const).map(([es, en, school]): ChoiceDef => ({
    id: 'school.' + school, cls: 'wizard', subs: [es, en], label: 'Conjuros de tu escuela (gratis en tu libro)', at: { 3: 2, 5: 3, 7: 4, 9: 5, 11: 6, 13: 7, 15: 8, 17: 9 },
    from: { spells: { classes: ['wizard'], school, minLevel: 1 } },
  })),
  { id: 'lore.discoveries', cls: 'bard', subs: ['Colegio del conocimiento', 'Colegio del Saber', 'College of Lore'], label: 'Descubrimientos mágicos', at: { 6: 2 }, prepared: true, from: { spells: { classes: ['cleric', 'druid', 'wizard'], minLevel: 0 } } },
  { id: 'cleric.blessed', cls: 'cleric', subs: [], label: 'Golpes benditos', at: { 7: 1 }, from: { list: ['Golpe divino', 'Lanzamiento de conjuros potente'] } },
  { id: 'druid.fury', cls: 'druid', subs: [], label: 'Furia elemental', at: { 7: 1 }, from: { list: ['Golpe primordial', 'Lanzamiento de conjuros potente'] } },
  { id: 'fiend.resistance', cls: 'warlock', subs: ['Patrón infernal', 'Fiend Patron'], label: 'Resistencia infernal', at: { 10: 1 }, rest: 'sr', from: { list: DAMAGE.filter((t) => t !== 'fuerza') } },
];

/** Cuántas opciones lleva a su nivel (0 si aún no tiene la elección). */
export function choiceCount(def: ChoiceDef, level: number): number {
  let n = 0;
  for (const [lv, v] of Object.entries(def.at)) if (parseInt(lv, 10) <= level) n = v;
  return n;
}

/** Elecciones que tiene el personaje con su clase, subclase y nivel. */
export function activeChoices(c: Pick<Character, 'classId' | 'subclass' | 'level'>): ChoiceDef[] {
  const sub = norm(c.subclass || '');
  // `subs` vacío: elección de la clase (Golpes benditos, Furia elemental)
  return CHOICES.filter((d) => d.cls === c.classId && (!d.subs.length || (sub && d.subs.some((s) => norm(s) === sub))) && choiceCount(d, c.level) > 0);
}

/** Rasgos y apartados de la subclase elegida: la del SRD o la de la biblioteca propia. */
export interface SubclassText { f: { n: string; d: string }[]; x: { n: string; d: string }[] }
export function subclassText(c: Pick<Character, 'classId' | 'subclass'>, cls: ClassData | undefined, libSubs: LibSubclass[]): SubclassText | null {
  if (cls?.sub && norm(c.subclass) === norm(cls.sub.n)) return { f: cls.sub.f, x: [] };
  const lib = libSubs.find((s) => s.cls === c.classId && norm(s.n) === norm(c.subclass));
  return lib ? { f: lib.f, x: lib.x || [] } : null;
}

/**
 * Opciones con nombre de un texto: párrafos que empiezan por «**Nombre.**» (SRD) o «Nombre. » (libro). Un párrafo que
 * no empieza así continúa la opción anterior. Si el texto avisa de que van en orden alfabético, un párrafo que lo
 * rompe (una frase corta como «Tira el dado.») también es continuación.
 */
export function optionItems(text: string): ChoiceOption[] {
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const alpha = /orden alfab[ée]tico/i.test(text);
  const cands = paras.map((p) => {
    const m = /^\*\*(.+?)\.?\*\*\.?\s*([\s\S]*)$/.exec(p) || /^([A-ZÁÉÍÓÚÑ][^.\n]{1,40})\.\s+([\s\S]+)$/.exec(p);
    return m ? { n: m[1].replace(/\.$/, '').trim(), d: m[2].trim() } : null;
  });
  if (alpha) {
    const names = cands.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
    names.forEach((i, k) => {
      const prev = names[k - 1], next = names[k + 1];
      const cmp = (a: number, b: number) => norm(cands[a]!.n).localeCompare(norm(cands[b]!.n), 'es');
      // fuera de orden con la siguiente mientras la anterior y la siguiente sí van en orden: no es una opción
      if (next != null && cmp(i, next) > 0 && (prev == null || cmp(prev, next) <= 0)) cands[i] = null;
    });
  }
  const out: ChoiceOption[] = [];
  paras.forEach((p, i) => {
    const c = cands[i];
    if (c) out.push({ ...c });
    else if (out.length) out[out.length - 1].d += '\n\n' + p;
  });
  return out;
}

/** Opciones entre las que se elige. */
export function choiceOptions(def: ChoiceDef, src: SubclassText | null, data: PlayerData | null, cls: ClassData | undefined): ChoiceOption[] {
  const f = def.from;
  if ('list' in f) return f.list.map((n) => ({ n, d: '' }));
  if ('skills' in f) {
    const keys = f.skills === 'class' && cls && !cls.skills.pool.includes('*') ? cls.skills.pool : Object.keys(data?.skills || {});
    return keys.map((k) => ({ n: k, d: data?.skills[k] || k })).sort((a, b) => a.d.localeCompare(b.d, 'es'));
  }
  if ('feature' in f) {
    const ft = src?.f.find((x) => f.feature.some((n) => norm(x.n) === norm(n)));
    return ft ? optionItems(ft.d) : [];
  }
  if ('section' in f) {
    const sec = src?.x.find((x) => norm(x.n).includes(norm(f.section)));
    return sec ? optionItems(sec.d) : [];
  }
  return [];
}

/** Nivel de conjuro más alto que puede lanzar un lanzador completo de ese nivel. */
export const fullCasterMaxSpell = (level: number) => Math.min(9, Math.ceil(Math.max(1, level) / 2));

/** Conjuros entre los que se elige: de esas listas de clase (SRD y biblioteca), escuela y nivel que puede lanzar. */
export function spellOptions(from: { classes: string[]; school?: string; minLevel: number }, level: number, data: PlayerData | null, spells: { id: string; n: string; l?: number; esc?: string; classes?: string[] }[]): ChoiceOption[] {
  const ids = new Set(from.classes.flatMap((k) => data?.classes.find((x) => x.id === k)?.spells || []));
  const max = fullCasterMaxSpell(level);
  return spells
    .filter((s) => (ids.has(s.id) || s.classes?.some((k) => from.classes.includes(k))) && (s.l || 0) >= from.minLevel && (s.l || 0) <= max && (!from.school || norm(s.esc || '').startsWith(from.school)))
    .sort((a, b) => (a.l || 0) - (b.l || 0) || a.n.localeCompare(b.n, 'es'))
    .map((s) => ({ n: s.id, d: s.n + (s.l ? ' (' + s.l + ')' : ' (truco)') }));
}

/**
 * Subclases que lanzan conjuros de mago con Inteligencia (Caballero arcano, Embaucador arcano): un tercio de lanzador,
 * trucos y conjuros preparados según su tabla.
 */
const THIRD_PREPARED = { 3: 3, 4: 4, 7: 5, 8: 6, 10: 7, 11: 8, 13: 9, 14: 10, 16: 11, 19: 12, 20: 13 };
export const SUB_CASTERS = [
  { cls: 'fighter', subs: ['Caballero arcano', 'Eldritch Knight'], cantrips: { 3: 2, 10: 3 }, prepared: THIRD_PREPARED },
  { cls: 'rogue', subs: ['Embaucador arcano', 'Arcane Trickster'], cantrips: { 3: 3, 10: 4 }, prepared: THIRD_PREPARED },
];
export function subclassCaster(c: Pick<Character, 'classId' | 'subclass' | 'level'>): { abil: 'int'; list: 'wizard'; cantrips: number; prepared: number } | null {
  if (c.level < 3) return null;
  const sc = SUB_CASTERS.find((x) => x.cls === c.classId && x.subs.some((s) => norm(s) === norm(c.subclass || '')));
  if (!sc) return null;
  const at = (t: Record<number, number>) => Object.entries(t).reduce((v, [lv, n]) => (parseInt(lv, 10) <= c.level ? n : v), 0);
  return { abil: 'int', list: 'wizard', cantrips: at(sc.cantrips), prepared: at(sc.prepared) };
}

/** Habilidades con competencia que dan las elecciones de su subclase (claves de habilidad). */
export function choiceSkills(c: Character): string[] {
  return activeChoices(c).filter((d) => 'skills' in d.from).flatMap((d) => (c.choices?.[d.id] || []).slice(0, choiceCount(d, c.level)));
}

/** Nivel de clase con el que se tiene un conjuro de subclase de cierto nivel (2024): lanzadores completos y de pacto 3/5/7/9, semilanzadores 3/5/9/13/17. */
export const subclassSpellLevel = (spellLevel: number, caster: ClassData['caster'] | undefined) =>
  caster === 'half' ? (spellLevel <= 1 ? 3 : 4 * spellLevel - 3) : spellLevel <= 2 ? 3 : 2 * spellLevel - 1;

const words = (t: string) => ' ' + norm(t).replace(/[^a-z0-9]+/g, ' ').trim() + ' ';

/**
 * Conjuros siempre preparados de la subclase (patrón, dominio, juramento, círculo…), sacados de la tabla de su rasgo
 * «Conjuros del …». Los nombres se buscan entre los conjuros conocidos (SRD y biblioteca) y el nivel al que se
 * obtienen sale del nivel del conjuro, porque el OCR estropea a menudo los números de la tabla. En el Círculo de la
 * tierra solo cuenta la tabla del terreno elegido.
 */
export function subclassSpells(c: Pick<Character, 'classId' | 'subclass' | 'level' | 'choices'>, cls: ClassData | undefined, src: SubclassText | null, spells: { id: string; n: string; l?: number }[]): { id: string; at: number }[] {
  const ft = src?.f.find((f) => norm(f.n).startsWith('conjuros') && /preparad/i.test(f.d));
  if (!ft) return [];
  // la tabla empieza en «Nivel de brujo…» (o en el primer terreno) y acaba donde vuelve la prosa («También…»)
  const terrains = [...ft.d.matchAll(/terreno (árido|arido|polar|templado|tropical)/gi)];
  const head = terrains.length > 1 ? terrains[0].index! : ft.d.search(/Nivel de (b|c|d|e|h|p|m)\p{L}+/u);
  let text = head >= 0 ? ft.d.slice(head) : ft.d;
  const prose = text.search(/ (También|Además) /);
  if (prose > 0) text = text.slice(0, prose);
  if (terrains.length > 1) {
    const pick = norm(c.choices?.['land.terrain']?.[0] || '');
    const i = terrains.findIndex((m) => norm(m[1]) === pick);
    if (i < 0) return [];
    text = ft.d.slice(terrains[i].index, terrains[i + 1]?.index ?? ft.d.length);
  }
  let t = words(text);
  const out: { id: string; at: number }[] = [];
  // los nombres largos primero, y se quitan del texto (así «luz» no sale de «luz del día»)
  for (const s of [...spells].sort((a, b) => b.n.length - a.n.length)) {
    const k = words(s.n);
    if (k.length < 5 || !t.includes(k)) continue;
    t = t.split(k).join(' ');
    if (!out.some((o) => o.id === s.id)) out.push({ id: s.id, at: subclassSpellLevel(s.l || 0, cls?.caster) });
  }
  return out.filter((o) => o.at <= c.level);
}
