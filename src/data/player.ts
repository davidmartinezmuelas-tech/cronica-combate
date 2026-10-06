/** Datos del jugador (public/data/jugador_es.json, generado por scripts/data/player.py desde el SRD 5.2.1). */

export type Abil = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export const ABILS: Abil[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export interface Uses {
  max: string; // «2», «@scale.fighter.second-wind», «@prof», «@abilities.cha.mod»…
  per: string; // sr (descanso corto), lr (largo) o vacío
}

export interface ClassFeature {
  lv: number;
  n: string;
  d: string;
  u?: Uses;
}

export interface ClassData {
  id: string;
  n: string;
  en: string;
  hd: number;
  saves: Abil[];
  skills: { count: number; pool: string[] }; // pool ['*'] = cualquiera
  armor: string[]; // lgt, med, hvy, shl
  weapons: string[]; // sim, mar o armas concretas (baseItem)
  caster: 'none' | 'full' | 'half' | 'pact';
  spellAb: Abil | '';
  primary: Abil[];
  asi: number[];
  f: ClassFeature[];
  sc: Record<string, Record<string, number | string>>; // tablas por nivel («fighter.second-wind»: {1: 2, 4: 3…})
  sub: { id: string; n: string; en: string; d: string; lv: number; f: ClassFeature[] } | null;
  d: string;
  spells: string[]; // ids de conjuro (reglas_es.json) de su lista de clase
}

export interface SpeciesData {
  id: string;
  n: string;
  en: string;
  size: string[];
  speed: number;
  dv: number;
  res: string[];
  t: ClassFeature[];
}

export interface BackgroundData {
  id: string;
  n: string;
  en: string;
  abil: Abil[];
  skills: string[];
  tool: string;
  feat: string;
  d: string;
}

export interface FeatData {
  id: string;
  n: string;
  en: string;
  cat: string;
  d: string;
  u?: Uses;
}

export interface WeaponData {
  id: string;
  n: string;
  en: string;
  base: string;
  cat: 'sim' | 'mar';
  kind: 'melee' | 'ranged';
  dmg: string;
  type: string;
  ver: string;
  props: string[];
  range: string;
  mastery: string;
}

export interface ArmorData {
  id: string;
  n: string;
  en: string;
  type: 'lgt' | 'med' | 'hvy' | 'shl';
  ac: number;
  dex: number | null; // máximo de Destreza (null = sin límite)
  str: number;
  stealth: boolean;
}

export interface PlayerData {
  v: number;
  src: string;
  abil: Record<Abil, string>;
  skills: Record<string, string>;
  classes: ClassData[];
  species: SpeciesData[];
  backgrounds: BackgroundData[];
  feats: FeatData[];
  weapons: WeaponData[];
  armor: ArmorData[];
}

/** Característica de cada habilidad (reglas 2024). */
export const SKILL_ABIL: Record<string, Abil> = {
  acr: 'dex', ani: 'wis', arc: 'int', ath: 'str', dec: 'cha', his: 'int', ins: 'wis', itm: 'cha', inv: 'int',
  med: 'wis', nat: 'int', prc: 'wis', prf: 'cha', per: 'cha', rel: 'int', slt: 'dex', ste: 'dex', sur: 'wis',
};
