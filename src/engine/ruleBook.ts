import { norm } from './util';
import type { RuleEntry } from './rules';

/** Capítulos del libro de reglas, en orden de lectura. Los conjuros van al final. */
export const BOOK_CATS = [
  'Reglas rápidas', 'Pruebas de d20', 'Acciones', 'Combate', 'Daño y curación', 'Exploración', 'Interacción social', 'Lanzar conjuros', 'Equipo',
  'Monturas y vehículos', 'Objetos mágicos', 'Dirigir el combate', 'Caja de herramientas del DM', 'Estados', 'Glosario', 'Conjuros',
] as const;

/** Orden de las entradas dentro de cada capítulo (las que no salen aquí van después, por orden alfabético). Estados, glosario y conjuros: A-Z. */
const ORDER: Record<string, string[]> = {
  'Pruebas de d20': ['Resumen', 'Pruebas de característica', 'Tiradas de salvación', 'Tiradas de ataque', 'Ventaja/Desventaja', 'Competencia'],
  'Acciones': ['Visión general', 'Una cosa cada vez', 'Acciones adicionales', 'Reacciones'],
  'Combate': ['Visión general', 'El orden del combate', 'Iniciativa', 'Tu turno', 'Movimiento y posición', 'Realizar un ataque', 'Ataques cuerpo a cuerpo', 'Ataques a distancia', 'Cobertura', 'Combate montado', 'Combate bajo el agua', 'Finalizar el combate'],
  'Daño y curación': ['Visión general', 'Puntos de golpe', 'Tiradas de daño', 'Golpes críticos', 'Tiradas de salvación y daño', 'Tipos de daño', 'Resistencia y vulnerabilidad', 'Inmunidad', 'Caer a 0 puntos de golpe', 'Curación', 'Puntos de golpe temporales'],
  'Exploración': ['Visión general', 'Visión y luz', 'Esconderse', 'Interactuar con objetos', 'Peligros', 'Viaje', 'Ritmo de viaje', 'Vehículos', 'Equipo de aventurero'],
  'Interacción social': ['Visión general', 'Interpretación', 'Pruebas de característica'],
  'Lanzar conjuros': ['Lanzar conjuros', 'Adquirir conjuros', 'Nivel de conjuro', 'Listas de conjuros por clase', 'Tiempo de lanzamiento', 'Alcance', 'Componentes', 'Duración', 'Escuela de magia', 'Efectos'],
  'Equipo': ['Monedas', 'Armas', 'Propiedades', 'Propiedades de maestría', 'Tabla de armas', 'Armaduras', 'Tabla de armaduras', 'Herramientas', 'Herramientas de artesano', 'Otras herramientas', 'Equipo de aventurero', 'Lista de equipo de aventurero', 'Tabla de equipo de aventurero'],
  'Monturas y vehículos': ['Visión general', 'Monturas y carga', 'Vehículos grandes'],
  'Objetos mágicos': ['Introducción', 'Sintonía', 'Identificar un objeto mágico', 'Llevar y empuñar objetos'],
  'Dirigir el combate': ['Introducción', 'Tirar iniciativa', 'Llevar el registro de la iniciativa', 'Llevar el registro de los Puntos de Golpe de los monstruos', 'Usar y llevar el registro de las condiciones'],
  'Caja de herramientas del DM': ['Crear un trasfondo', 'Maldiciones y contagios mágicos', 'Miedo y estrés mental', 'Trampas', 'Veneno', 'Encuentros de combate', 'Efectos ambientales', 'Ritmo de viaje'],
};

export interface BookChapter { cat: string; id: string; entries: RuleEntry[] }

/** Identificador del capítulo en la página (para saltar a él). */
export const chapterId = (cat: string) => 'rule-cat-' + norm(cat).replace(/[^a-z0-9]+/g, '-');

/** Todas las reglas ordenadas como un libro: capítulos, apéndices (estados y glosario) y, al final, los conjuros. */
export function buildBook(rules: RuleEntry[]): BookChapter[] {
  const known = new Set<string>(BOOK_CATS);
  const cats = [...BOOK_CATS, ...[...new Set(rules.map((e) => e.cat))].filter((c) => !known.has(c))];
  return cats.map((cat) => {
    const list = rules.filter((e) => e.cat === cat);
    const order = ORDER[cat];
    const alpha = (a: RuleEntry, b: RuleEntry) => a.n.localeCompare(b.n, 'es');
    const idx = (e: RuleEntry) => { const i = order ? order.indexOf(e.n) : -1; return i < 0 ? order?.length ?? 0 : i; };
    // «Reglas rápidas» conserva el orden en que se escribieron
    const sorted = cat === 'Reglas rápidas' ? list : [...list].sort(order ? (a, b) => idx(a) - idx(b) || alpha(a, b) : alpha);
    return { cat, id: chapterId(cat), entries: sorted };
  }).filter((c) => c.entries.length);
}
