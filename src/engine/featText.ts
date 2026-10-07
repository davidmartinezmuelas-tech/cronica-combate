import { norm } from './util';

/** Nombres de los estilos de combate y dotes de origen (solo los nombres, para clasificar lo que viene escrito a mano). */
const STYLES = ['Arquería', 'Defensa', 'Duelo', 'Combate con armas grandes', 'Intercepción', 'Protección', 'Lucha sin armas', 'Combate con dos armas', 'Lucha a ciegas', 'Combate con armas arrojadizas',
  'Archery', 'Defense', 'Dueling', 'Great Weapon Fighting', 'Interception', 'Protection', 'Unarmed Fighting', 'Two-Weapon Fighting', 'Blind Fighting', 'Thrown Weapon Fighting'].map(norm);
const ORIGIN = ['Alerta', 'Artesano', 'Curandero', 'Afortunado', 'Iniciado en la magia', 'Músico', 'Atacante salvaje', 'Habilidoso', 'Camorrista de taberna', 'Duro',
  'Alert', 'Crafter', 'Healer', 'Lucky', 'Magic Initiate', 'Musician', 'Savage Attacker', 'Skilled', 'Tavern Brawler', 'Tough'].map(norm);

export type FeatCatGuess = 'fighting-style' | 'origin' | null;

/** Estilo de combate o dote de origen por su nombre (null si no se reconoce). */
export function featCatOf(name: string): FeatCatGuess {
  const k = norm(name.replace(/\(.*?\)/g, ''));
  return STYLES.includes(k) ? 'fighting-style' : ORIGIN.includes(k) ? 'origin' : null;
}

/**
 * Un texto con varias dotes en lista («- Duro: +2 PG por nivel - Protección: reacción…», en una línea o en varias)
 * separado en una por elemento. Si no parece una lista de al menos dos, devuelve null.
 */
export function splitFeatText(text: string): { n: string; d: string }[] | null {
  // «… - Nombre: …» dentro de una línea pasa a ser otra línea de la lista
  const t = text.replace(/\s+[-•]\s+(?=[^\s:\-•][^:\n]{0,40}:)/g, '\n- ');
  const blocks: string[][] = [];
  for (const line of t.split(/\r?\n/)) {
    const m = /^\s*[-•*]\s*(.+)$/.exec(line);
    if (m) blocks.push([m[1].trim()]);
    else if (blocks.length && line.trim()) blocks[blocks.length - 1].push(line.trim());
    else if (line.trim()) return null; // texto antes de la lista: no se toca
  }
  if (blocks.length < 2) return null;
  return blocks.map(([first, ...rest]) => {
    const i = first.indexOf(':');
    const head = i > 0 && i <= 40 ? first.slice(0, i).trim() : first;
    const body = i > 0 && i <= 40 ? first.slice(i + 1).trim() : '';
    return { n: head, d: [body, ...rest].filter(Boolean).join('\n') };
  });
}
