/** Texto de las propiedades de arma y de maestría (Manual del Jugador 2024), para el desplegable de cada arma de la hoja. */
const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const PROPS: Record<string, string> = {
  municion: 'Solo atacas a distancia con ella si tienes munición; cada ataque gasta una pieza. Sacarla forma parte del ataque (necesitas una mano libre para recargar un arma de una mano). Tras un combate, en 1 minuto recuperas la mitad (redondeando hacia abajo); el resto se pierde.',
  sutil: 'Para el ataque y el daño usas el modificador de Fuerza o de Destreza, el que elijas, pero el mismo para ambas tiradas.',
  pesada: 'Tienes desventaja en los ataques si es cuerpo a cuerpo y tu Fuerza es menor de 13, o si es a distancia y tu Destreza es menor de 13.',
  ligera: 'Al atacar con ella en tu acción de Atacar, puedes hacer un ataque adicional como acción adicional con otra arma Ligera distinta. A ese ataque no sumas tu modificador al daño, salvo que sea negativo.',
  carga: 'Solo puedes disparar una pieza de munición por acción, acción adicional o reacción, sin importar cuántos ataques tengas.',
  alcance: 'Suma 5 pies a tu alcance al atacar con ella y al calcular tus ataques de oportunidad.',
  arrojadiza: 'Puedes lanzarla para hacer un ataque a distancia y desenfundarla como parte del ataque. Si es cuerpo a cuerpo, usa el mismo modificador que usarías cuerpo a cuerpo.',
  'a dos manos': 'Necesitas las dos manos para atacar con ella.',
  versatil: 'Se puede usar con una o con dos manos; el daño entre paréntesis es el de usarla con dos manos en cuerpo a cuerpo.',
};

const MASTERY: Record<string, string> = {
  hender: 'Si impactas cuerpo a cuerpo, puedes hacer otro ataque con ella contra una segunda criatura a 5 pies o menos de la primera y dentro de tu alcance. Si impacta, recibe el daño del arma sin sumar tu modificador (salvo que sea negativo). Una vez por turno.',
  rozar: 'Si fallas el ataque, infliges igualmente tanto daño como el modificador de característica que usaste, del mismo tipo que el arma.',
  mella: 'El ataque extra de la propiedad Ligera puedes hacerlo dentro de la acción de Atacar, en vez de como acción adicional. Una vez por turno.',
  empujar: 'Si impactas, puedes empujar al objetivo hasta 10 pies en línea recta alejándolo de ti, si es de tamaño Grande o menor.',
  debilitar: 'Si impactas, el objetivo tiene desventaja en su siguiente tirada de ataque antes del inicio de tu siguiente turno.',
  ralentizar: 'Si impactas y causas daño, reduces su Velocidad en 10 pies hasta el inicio de tu siguiente turno (no se acumula).',
  derribar: 'Si impactas, el objetivo hace una salvación de Constitución (CD 8 + el modificador que usaste en el ataque + tu competencia); si falla, queda Derribado.',
  acosar: 'Si impactas y causas daño, tienes ventaja en tu siguiente ataque contra esa criatura antes del final de tu siguiente turno.',
};

const base = (s: string) => strip(s.replace(/\(.*$/, ''));
/** Explicación de una propiedad de arma («Versátil (1d10)» también vale), o '' si no se conoce. */
export const weaponPropText = (p: string) => PROPS[base(p)] || '';
/** Explicación de una propiedad de maestría, o '' si no se conoce. */
export const masteryText = (m: string) => MASTERY[base(m)] || '';
