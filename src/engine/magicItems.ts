import { ABILS, type Abil } from '../data/player';

/** Qué cambia un objeto mágico en la hoja. Cada efecto se aplica solo mientras el objeto esté puesto (y sintonizado si lo pide). */
export type ModKey = 'ac' | 'saves' | 'speed' | 'hp' | 'init' | 'spellDc' | 'spellAtk' | 'abilSet' | 'abilAdd' | 'resist';

export interface ItemMod {
  k: ModKey;
  v?: number; // cantidad (o el valor fijo de la característica)
  abil?: Abil; // en abilSet y abilAdd
  type?: string; // en resist: el tipo de daño
}

export const MOD_LABEL: Record<ModKey, string> = {
  ac: 'Clase de armadura', saves: 'Todas las salvaciones', speed: 'Velocidad (pies)', hp: 'PG máximos', init: 'Iniciativa',
  spellDc: 'CD de tus conjuros', spellAtk: 'Ataque de tus conjuros', abilSet: 'Característica fija', abilAdd: 'Sube una característica (máx. 30)', resist: 'Resistencia al daño',
};

export type ItemKind = 'armor' | 'weapon' | 'ring' | 'wondrous' | 'potion' | 'staff' | 'other';
export const KIND_LABEL: Record<ItemKind, string> = { armor: 'Armadura o escudo', weapon: 'Arma', ring: 'Anillo', wondrous: 'Objeto maravilloso', potion: 'Poción o consumible', staff: 'Vara, bastón o varita', other: 'Otro' };
export const RARITIES = ['común', 'poco común', 'raro', 'muy raro', 'legendario', 'artefacto'];

export interface MagicItem {
  id: string;
  n: string;
  kind: ItemKind;
  rarity: string;
  attune: boolean; // requiere sintonización
  attuned: boolean; // está sintonizado
  worn: boolean; // lo llevas puesto o empuñado
  d: string; // texto del objeto
  mods: ItemMod[];
  charges?: { max: number; per: 'lr' | 'sr' | '' }; // cargas o usos; '' = no se recargan (una poción)
  roll?: string; // lo que tira al usarlo (2d4+2): se gasta una carga
}

/** Máximo de objetos sintonizados a la vez. */
export const ATTUNE_MAX = 3;

/** Clave de los usos gastados de un objeto en la hoja. */
export const itemKey = (i: Pick<MagicItem, 'id'>) => 'item.' + i.id;

/** El objeto está en vigor: puesto y, si lo pide, sintonizado. */
export const isActive = (i: MagicItem) => i.worn && (!i.attune || i.attuned);

export const attunedCount = (items: MagicItem[] | undefined) => (items || []).filter((i) => i.attune && i.attuned).length;

export interface ItemFx {
  ac: number;
  saves: number;
  speed: number;
  hp: number;
  init: number;
  spellDc: number;
  spellAtk: number;
  abilSet: Partial<Record<Abil, number>>;
  abilAdd: Partial<Record<Abil, number>>;
  resist: { type: string; why: string }[];
}

/** Lo que suman juntos los objetos en vigor (los bonificadores se acumulan; una característica fija toma el mayor valor). */
export function itemEffects(items: MagicItem[] | undefined): ItemFx {
  const fx: ItemFx = { ac: 0, saves: 0, speed: 0, hp: 0, init: 0, spellDc: 0, spellAtk: 0, abilSet: {}, abilAdd: {}, resist: [] };
  for (const it of items || []) {
    if (!isActive(it)) continue;
    for (const m of it.mods) {
      const v = Number(m.v) || 0;
      if (m.k === 'abilSet' && m.abil) fx.abilSet[m.abil] = Math.max(fx.abilSet[m.abil] || 0, v);
      else if (m.k === 'abilAdd' && m.abil) fx.abilAdd[m.abil] = (fx.abilAdd[m.abil] || 0) + v;
      else if (m.k === 'resist') { if (m.type) fx.resist.push({ type: m.type, why: it.n }); }
      else if (m.k in fx) (fx as unknown as Record<string, number>)[m.k] += v;
    }
  }
  return fx;
}

/** Las puntuaciones con los objetos: primero las fijas (solo suben), luego los aumentos, con tope 30. */
export function itemAbilities(abil: Record<Abil, number>, fx: ItemFx): Record<Abil, number> {
  return Object.fromEntries(ABILS.map((a) => {
    let v = abil[a];
    if (fx.abilSet[a]) v = Math.max(v, fx.abilSet[a]!);
    if (fx.abilAdd[a]) v = Math.max(v, Math.min(30, v + fx.abilAdd[a]!));
    return [a, v];
  })) as Record<Abil, number>;
}

const ABIL_ES: Record<Abil, string> = { str: 'Fuerza', dex: 'Destreza', con: 'Constitución', int: 'Inteligencia', wis: 'Sabiduría', cha: 'Carisma' };
const sgn = (n: number) => (n >= 0 ? '+' : '') + n;

/** Una línea legible de un efecto («+1 a la CA», «Fuerza 19», «resistencia: fuego»). */
export function modText(m: ItemMod): string {
  const v = Number(m.v) || 0;
  switch (m.k) {
    case 'ac': return sgn(v) + ' a la CA';
    case 'saves': return sgn(v) + ' a todas las salvaciones';
    case 'speed': return sgn(v) + ' pies de velocidad';
    case 'hp': return sgn(v) + ' PG máximos';
    case 'init': return sgn(v) + ' a la iniciativa';
    case 'spellDc': return sgn(v) + ' a la CD de conjuros';
    case 'spellAtk': return sgn(v) + ' al ataque de conjuros';
    case 'abilSet': return (m.abil ? ABIL_ES[m.abil] : 'Característica') + ' ' + v;
    case 'abilAdd': return (m.abil ? ABIL_ES[m.abil] : 'Característica') + ' ' + sgn(v);
    case 'resist': return 'resistencia: ' + (m.type || '—');
  }
}

/** Objetos de ejemplo para empezar (se pueden editar): reglas habituales, sin texto del libro. */
export const ITEM_PRESETS: Omit<MagicItem, 'id' | 'worn' | 'attuned'>[] = [
  { n: 'Anillo de protección', kind: 'ring', rarity: 'raro', attune: true, d: '+1 a la CA y a las tiradas de salvación.', mods: [{ k: 'ac', v: 1 }, { k: 'saves', v: 1 }] },
  { n: 'Capa de protección', kind: 'wondrous', rarity: 'poco común', attune: true, d: '+1 a la CA y a las tiradas de salvación.', mods: [{ k: 'ac', v: 1 }, { k: 'saves', v: 1 }] },
  { n: 'Piedra de la buena suerte', kind: 'wondrous', rarity: 'poco común', attune: true, d: '+1 a las pruebas de característica y a las tiradas de salvación (aquí, solo las salvaciones).', mods: [{ k: 'saves', v: 1 }] },
  { n: 'Guanteletes de Fuerza de ogro', kind: 'wondrous', rarity: 'poco común', attune: true, d: 'Tu Fuerza pasa a ser 19 si era menor.', mods: [{ k: 'abilSet', abil: 'str', v: 19 }] },
  { n: 'Cinto de gigante de las colinas', kind: 'wondrous', rarity: 'raro', attune: true, d: 'Tu Fuerza pasa a ser 21 si era menor.', mods: [{ k: 'abilSet', abil: 'str', v: 21 }] },
  { n: 'Diadema de intelecto', kind: 'wondrous', rarity: 'poco común', attune: true, d: 'Tu Inteligencia pasa a ser 19 si era menor.', mods: [{ k: 'abilSet', abil: 'int', v: 19 }] },
  { n: 'Amuleto de salud', kind: 'wondrous', rarity: 'raro', attune: true, d: 'Tu Constitución pasa a ser 19 si era menor.', mods: [{ k: 'abilSet', abil: 'con', v: 19 }] },
  { n: 'Varita del mago de guerra +1', kind: 'staff', rarity: 'poco común', attune: true, d: '+1 a las tiradas de ataque de tus conjuros.', mods: [{ k: 'spellAtk', v: 1 }] },
  { n: 'Cetro del guardián del pacto +1', kind: 'staff', rarity: 'poco común', attune: true, d: '+1 a las tiradas de ataque y a la CD de tus conjuros.', mods: [{ k: 'spellAtk', v: 1 }, { k: 'spellDc', v: 1 }] },
  { n: 'Anillo de resistencia', kind: 'ring', rarity: 'raro', attune: true, d: 'Resistencia a un tipo de daño (elige cuál).', mods: [{ k: 'resist', type: 'fuego' }] },
  { n: 'Botas de elfo', kind: 'wondrous', rarity: 'poco común', attune: false, d: 'Tus pasos no hacen ruido. Aquí no cambia números.', mods: [] },
  { n: 'Poción de curación', kind: 'potion', rarity: 'común', attune: false, d: 'Recuperas 2d4+2 puntos de golpe al beberla.', mods: [], charges: { max: 1, per: '' }, roll: '2d4+2' },
  { n: 'Poción de curación mayor', kind: 'potion', rarity: 'poco común', attune: false, d: 'Recuperas 4d4+4 puntos de golpe al beberla.', mods: [], charges: { max: 1, per: '' }, roll: '4d4+4' },
];
