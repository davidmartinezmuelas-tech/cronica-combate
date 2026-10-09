import type { SectionKey } from './types';

export const DMG_TYPES = ['ácido', 'contundente', 'cortante', 'frío', 'fuego', 'fuerza', 'necrótico', 'perforante', 'psíquico', 'radiante', 'relámpago', 'trueno', 'veneno'];

export const DMG_PHRASE: Record<string, string> = {
  ácido: 'de ácido', contundente: 'contundente', cortante: 'cortante', frío: 'de frío', fuego: 'de fuego', fuerza: 'de fuerza',
  necrótico: 'necrótico', perforante: 'perforante', psíquico: 'psíquico', radiante: 'radiante', relámpago: 'de relámpago', trueno: 'de trueno', veneno: 'de veneno',
};

/** Estados del reglamento 2024 con un resumen de su efecto. */
export const CONDITIONS: [string, string][] = [
  ['Agarrado', 'Velocidad 0. Desventaja en ataques contra cualquiera que no sea quien le agarra. El agarrador puede arrastrarlo.'],
  ['Apresado', 'Velocidad 0. Sus ataques tienen desventaja y los ataques contra él, ventaja. Desventaja en salvaciones de Destreza.'],
  ['Asustado', 'Desventaja en pruebas y ataques mientras vea la fuente del miedo. No puede acercarse a ella voluntariamente.'],
  ['Aturdido', 'Incapacitado. Falla las salvaciones de Fuerza y Destreza. Los ataques contra él tienen ventaja.'],
  ['Cegado', 'No ve y falla las pruebas que dependan de la vista. Sus ataques tienen desventaja y los ataques contra él, ventaja.'],
  ['Derribado', 'Solo puede arrastrarse o gastar la mitad de su velocidad en levantarse. Desventaja en sus ataques; los ataques contra él tienen ventaja a 5 pies o menos y desventaja más lejos.'],
  ['Ensordecido', 'No oye y falla las pruebas que dependan del oído.'],
  ['Envenenado', 'Desventaja en tiradas de ataque y pruebas de característica.'],
  ['Hechizado', 'No puede atacar ni dañar a quien le hechizó, que tiene ventaja en pruebas para interactuar socialmente con él.'],
  ['Incapacitado', 'No puede realizar acciones, acciones adicionales ni reacciones. Pierde la concentración y no puede hablar. Desventaja en iniciativa.'],
  ['Inconsciente', 'Incapacitado y derribado; suelta lo que sostiene. Falla salvaciones de Fuerza y Destreza. Ataques contra él con ventaja; los impactos a 5 pies o menos son críticos.'],
  ['Invisible', 'Ventaja en iniciativa. Sus ataques tienen ventaja y los ataques contra él, desventaja, salvo que algo permita verlo.'],
  ['Paralizado', 'Incapacitado y Velocidad 0. Falla salvaciones de Fuerza y Destreza. Ataques contra él con ventaja; los impactos a 5 pies o menos son críticos.'],
  ['Petrificado', 'Incapacitado y Velocidad 0. Resistencia a todo el daño e inmune al estado Envenenado. Ataques contra él con ventaja; falla salvaciones de Fuerza y Destreza.'],
];

export const CONDITION_IMMUNITIES = ['agarrado', 'agotamiento', 'apresado', 'asustado', 'aturdido', 'cegado', 'derribado', 'ensordecido', 'envenenado', 'hechizado', 'incapacitado', 'inconsciente', 'paralizado', 'petrificado'];

export const ABIL = ['FUE', 'DES', 'CON', 'INT', 'SAB', 'CAR'];
export const ABIL_LONG = ['Fuerza', 'Destreza', 'Constitución', 'Inteligencia', 'Sabiduría', 'Carisma'];
export const ABIL_INDEX: Record<string, number> = { FUE: 0, DES: 1, CON: 2, INT: 3, SAB: 4, CAR: 5 };

export const CR_LIST = ['0', '1/8', '1/4', '1/2', ...Array.from({ length: 30 }, (_, i) => String(i + 1))];

export const XP_BY_CR: Record<string, number> = {
  '0': 10, '1/8': 25, '1/4': 50, '1/2': 100, '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800, '6': 2300, '7': 2900, '8': 3900, '9': 5000, '10': 5900,
  '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000, '16': 15000, '17': 18000, '18': 20000, '19': 22000, '20': 25000,
  '21': 33000, '22': 41000, '23': 50000, '24': 62000, '25': 75000, '26': 90000, '27': 105000, '28': 120000, '29': 135000, '30': 155000,
};

/** PX totales para alcanzar cada nivel 1–20 (reglas 2024). */
export const XP_LEVELS = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];

/** Presupuesto de PX por personaje (reglas 2024): [baja, moderada, alta] por nivel 1–20. */
export const XP_BUDGET: [number, number, number][] = [
  [50, 75, 100], [100, 150, 200], [150, 225, 400], [250, 375, 500], [500, 750, 1100], [600, 1000, 1400], [750, 1300, 1700], [1000, 1700, 2100],
  [1300, 2000, 2600], [1600, 2300, 3100], [1900, 2900, 4100], [2200, 3700, 4700], [2600, 4200, 5400], [2900, 4900, 6200], [3300, 5400, 7800],
  [3800, 6100, 9800], [4500, 7200, 11700], [5000, 8700, 14200], [5500, 10700, 17200], [6400, 13200, 22000],
];

export const SECTIONS: [SectionKey, string][] = [['tr', 'Rasgos'], ['ac_', 'Acciones'], ['ba', 'Acciones adicionales'], ['re', 'Reacciones'], ['lg', 'Acciones legendarias']];

export const SIZES = ['Diminuto', 'Pequeño', 'Mediano', 'Grande', 'Enorme', 'Gargantuesco'];

export const STORAGE_KEY = 'cronica-combate';
export const SCHEMA_VERSION = 4;
