import { classLevel, type Character } from './character';
import { norm } from './util';

/**
 * Opciones de metamagia (SRD 5.2.1, CC-BY-4.0), en corto: coste en puntos de hechicería y qué hacen.
 * `cost: 0`: cuesta tantos puntos como el nivel del conjuro (1 para un truco).
 */
export const METAMAGIC: { n: string; cost: number; what: string }[] = [
  { n: 'Conjuro cuidadoso', cost: 1, what: 'Hasta tu modificador de Carisma de criaturas superan solas la salvación; si con éxito reciben la mitad de daño, no reciben ninguno.' },
  { n: 'Conjuro distante', cost: 1, what: 'Dobla el alcance del conjuro, o lo pasa de toque a 30 pies.' },
  { n: 'Conjuro potenciado', cost: 1, what: 'Repite hasta tu modificador de Carisma de dados de daño (te quedas con los nuevos). Se puede sumar a otra metamagia.' },
  { n: 'Conjuro prolongado', cost: 1, what: 'Dobla la duración (máximo 24 horas) y tienes ventaja en sus salvaciones de concentración.' },
  { n: 'Conjuro intensificado', cost: 2, what: 'Un objetivo tiene desventaja en las salvaciones contra el conjuro.' },
  { n: 'Conjuro acelerado', cost: 2, what: 'Un conjuro de 1 acción se lanza como acción adicional (no si ya lanzaste uno de nivel 1 o más en este turno).' },
  { n: 'Conjuro buscador', cost: 1, what: 'Si fallas la tirada de ataque del conjuro, vuelves a tirar el d20 y usas el nuevo resultado. Se puede sumar a otra metamagia.' },
  { n: 'Conjuro sutil', cost: 1, what: 'Sin componentes verbales, somáticos ni materiales sin coste: nadie ve que lo lanzas.' },
  { n: 'Conjuro transmutado', cost: 1, what: 'Cambia el tipo de daño entre ácido, frío, fuego, relámpago, trueno y veneno.' },
  { n: 'Conjuro gemelo', cost: 1, what: 'Con un conjuro que pueda afectar a una criatura más con un espacio superior, sube su nivel efectivo en 1.' },
];

export const MM_KEY = 'metamagic'; // opciones del hechicero
export const MM_FEAT_KEY = 'feat.metamagic'; // las de la dote Adepto de metamagia
export const MM_FEAT_POOL = 'Puntos de Adepto de metamagia';
export const SORC_POOL = 'Fuente de magia'; // los usos del rasgo son los puntos de hechicería

export const hasMetamagicFeat = (c: Pick<Character, 'feats' | 'customFeats'>) =>
  [...c.feats, ...c.customFeats.map((f) => f.n)].some((f) => ['adepto de metamagia', 'adepto en metamagia', 'metamagic adept'].includes(norm(f)));

/** Opciones que puede conocer: el hechicero 2 a nivel 2, 4 a nivel 10 y 6 a nivel 17; la dote, 2 más. */
export function metamagicSlots(c: Character): { sorc: number; feat: number } {
  const lv = classLevel(c, 'sorcerer');
  return { sorc: lv >= 17 ? 6 : lv >= 10 ? 4 : lv >= 2 ? 2 : 0, feat: hasMetamagicFeat(c) ? 2 : 0 };
}

/** Adepto elemental: el tipo de daño elegido (ácido, frío, fuego, relámpago o trueno). */
export const ELEMENTAL_KEY = 'feat.elemental';
export const ELEMENTS = ['ácido', 'frío', 'fuego', 'relámpago', 'trueno'];
export const hasElementalAdept = (c: Pick<Character, 'feats' | 'customFeats'>) =>
  [...c.feats, ...c.customFeats.map((f) => f.n)].some((f) => ['adepto elemental', 'elemental adept'].includes(norm(f)));
export const elementalTypes = (c: Pick<Character, 'feats' | 'customFeats' | 'choices'>): string[] => (hasElementalAdept(c) ? (c.choices?.[ELEMENTAL_KEY] || []).filter((t) => ELEMENTS.includes(t)) : []);
