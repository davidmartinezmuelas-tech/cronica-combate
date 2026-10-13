import type { Abil } from '../data/player';
import { classLevel, type Character } from './character';
import { hasInvocation } from './subclassChoices';

/**
 * Conjuros que dan los rasgos sin ser de la clase (reglas 2024 del SRD): invocaciones del brujo, el linaje o legado de
 * la especie y la dote Iniciado en la magia. Se lanzan sin gastar espacio: a voluntad o una vez por descanso largo.
 */
export type GrantHow = 'will' | 'lr' | 'pb' | 'ritual';
export interface Grant {
  en: string; // conjuro (nombre en inglés del SRD)
  src: string; // de dónde sale (para la etiqueta)
  how: GrantHow | 'known'; // known: truco o conjuro que se conoce (sin uso gratis aparte)
  abil?: Abil; // característica para lanzarlo (si no es la de la clase)
  self?: boolean; // solo sobre ti
  max?: boolean; // Vigor infernal: los PG temporales al máximo, sin tirar
  noFx?: boolean; // su efecto ya está en la hoja (Armadura de sombras)
}

const INVOCATIONS: [string, Omit<Grant, 'src'>][] = [
  ['Armadura de sombras', { en: 'Mage Armor', how: 'will', self: true, noFx: true }],
  ['Máscara de muchas caras', { en: 'Disguise Self', how: 'will' }],
  ['Salto de otro mundo', { en: 'Jump', how: 'will', self: true }],
  ['Vigor infernal', { en: 'False Life', how: 'will', self: true, max: true }],
  ['Visiones brumosas', { en: 'Silent Image', how: 'will' }],
  ['Pacto de la cadena', { en: 'Find Familiar', how: 'will' }],
  ['Don de las profundidades', { en: 'Water Breathing', how: 'lr' }],
  ['Maestro de las formas infinitas', { en: 'Alter Self', how: 'will' }],
  ['Paso ascendente', { en: 'Levitate', how: 'will', self: true }],
  ['Uno con las sombras', { en: 'Invisibility', how: 'will', self: true }],
  ['Susurros de la tumba', { en: 'Speak with Dead', how: 'will' }],
  ['Visiones de reinos lejanos', { en: 'Arcane Eye', how: 'will' }],
];

/** Linaje o legado de la especie: truco desde el nivel 1 y conjuros a nivel 3 y 5 (una vez por descanso largo). */
const SPECIES: Record<string, { n: string; at: [number, string, GrantHow | 'known'][] }> = {
  'elf-drow': { n: 'Linaje drow', at: [[1, 'Dancing Lights', 'known'], [3, 'Faerie Fire', 'lr'], [5, 'Darkness', 'lr']] },
  'elf-high': { n: 'Linaje alto elfo', at: [[1, 'Prestidigitation', 'known'], [3, 'Detect Magic', 'lr'], [5, 'Misty Step', 'lr']] },
  'elf-wood': { n: 'Linaje elfo silvano', at: [[1, 'Druidcraft', 'known'], [3, 'Longstrider', 'lr'], [5, 'Pass without Trace', 'lr']] },
  'gnome-forest': { n: 'Linaje gnomo del bosque', at: [[1, 'Minor Illusion', 'known'], [1, 'Speak with Animals', 'pb']] },
  'gnome-rock': { n: 'Linaje gnomo de las rocas', at: [[1, 'Mending', 'known'], [1, 'Prestidigitation', 'known']] },
  'tiefling-abyssal': { n: 'Legado abisal', at: [[1, 'Thaumaturgy', 'known'], [1, 'Poison Spray', 'known'], [3, 'Ray of Sickness', 'lr'], [5, 'Hold Person', 'lr']] },
  'tiefling-chthonic': { n: 'Legado ctónico', at: [[1, 'Thaumaturgy', 'known'], [1, 'Chill Touch', 'known'], [3, 'False Life', 'lr'], [5, 'Ray of Enfeeblement', 'lr']] },
  'tiefling-infernal': { n: 'Legado infernal', at: [[1, 'Thaumaturgy', 'known'], [1, 'Fire Bolt', 'known'], [3, 'Hellish Rebuke', 'lr'], [5, 'Darkness', 'lr']] },
};

/** Clase de la lista de Iniciado en la magia que fija el trasfondo (Acólito: clérigo; Sabio: mago). */
export const MI_FROM_BACKGROUND: Record<string, string> = { acolyte: 'cleric', sage: 'wizard' };
export const MI_KEY = 'feat.magic-initiate'; // elección: [clase de la lista, característica, truco, truco, conjuro de nivel 1]
export const TOME_KEY = 'warlock.tome'; // Pacto del tomo: [truco, truco, truco, ritual, ritual]

export const hasMagicInitiate = (c: Pick<Character, 'feats'>) => c.feats.some((f) => /^iniciado en la magia|^magic initiate/i.test(f));

/** Los conjuros que dan los rasgos de este personaje (con el id del conjuro en la lista). */
export function grantedSpells(c: Character, list: { id: string; en?: string }[], mods: Record<Abil, number>): (Grant & { id: string; key: string })[] {
  const out: Grant[] = [];
  if (classLevel(c, 'warlock')) for (const [n, g] of INVOCATIONS) if (hasInvocation(c, n)) out.push({ ...g, src: n, abil: 'cha' });
  // Pacto del tomo: tres trucos y dos rituales de nivel 1 de cualquier clase, que cuentan como de brujo (Carisma)
  const tome = c.choices?.[TOME_KEY];
  if (classLevel(c, 'warlock') && hasInvocation(c, 'Pacto del tomo') && tome?.length) {
    tome.slice(0, 3).filter(Boolean).forEach((id) => out.push({ en: '#' + id, how: 'known', src: 'Pacto del tomo', abil: 'cha' }));
    tome.slice(3, 5).filter(Boolean).forEach((id) => out.push({ en: '#' + id, how: 'ritual', src: 'Pacto del tomo', abil: 'cha' }));
  }
  const sp = SPECIES[c.speciesId];
  if (sp) {
    // característica de lanzamiento: la mejor entre Inteligencia, Sabiduría y Carisma
    const abil = (['int', 'wis', 'cha'] as Abil[]).reduce((a, b) => (mods[b] > mods[a] ? b : a), 'int');
    for (const [lv, en, how] of sp.at) if (c.level >= lv) out.push({ en, how, src: sp.n, abil });
  }
  const mi = c.choices?.[MI_KEY];
  if (hasMagicInitiate(c) && mi?.length) {
    const abil = (['int', 'wis', 'cha'].includes(mi[1]) ? mi[1] : 'int') as Abil;
    mi.slice(2, 4).filter(Boolean).forEach((id) => out.push({ en: '#' + id, how: 'known', src: 'Iniciado en la magia', abil }));
    if (mi[4]) out.push({ en: '#' + mi[4], how: 'lr', src: 'Iniciado en la magia', abil });
  }
  // «#id»: elegidos por id (Iniciado en la magia); el resto, por su nombre en inglés
  return out.flatMap((g) => {
    const s = g.en.startsWith('#') ? list.find((x) => x.id === g.en.slice(1)) : list.find((x) => x.en === g.en);
    return s ? [{ ...g, id: s.id, key: 'conjuro: ' + g.src + ' · ' + s.id }] : [];
  });
}
