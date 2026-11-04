import { replacedFeatures } from './featureNames';
import type { Abil } from '../data/player';

/**
 * Qué hace un rasgo propio (subclase escrita en «Mis creaciones»), con las piezas que la app ya sabe usar:
 * - attack: tirada de ataque (Fuerza, Destreza, la mejor de las dos o tu característica de conjuros) y su daño.
 * - save: salvación con tu CD (8 + competencia + característica), daño (o mitad si la supera) y un estado si la falla.
 * - heal / temp: curación o PG temporales (dados y, si se quiere, tu modificador).
 * - hit: daño extra al golpear con un arma (sale como etiqueta en «Ataques», como un castigo).
 * - bonus: bonificador fijo a la CA o a la velocidad, o una resistencia al daño.
 */
export interface HbFx {
  kind: 'attack' | 'save' | 'heal' | 'temp' | 'hit' | 'bonus';
  abil?: Abil | 'spell' | 'best'; // la del ataque o la de la CD
  dmg?: string; // dados («2d6»): daño o cantidad curada
  type?: string; // tipo de daño
  addMod?: boolean; // sumar el modificador de la característica al daño o a la curación
  save?: Abil; // salvación que hace el objetivo
  half?: boolean; // mitad de daño si la supera
  cond?: string; // estado si la falla
  ac?: number;
  speed?: number;
  resist?: string;
}

/**
 * Cómo lanza conjuros una subclase de una clase que no los lanza (Caballero arcano, Embaucador arcano…): cuánto avanzan
 * sus espacios (un tercio, la mitad o todo el nivel), con qué característica, de la lista de qué clase salen sus conjuros
 * y cuántos trucos y conjuros preparados tiene a cada nivel de clase (una tabla «nivel: cantidad»).
 */
export interface CastingRule {
  progression: 'third' | 'half' | 'full';
  abil: Abil;
  list: string; // id de la clase de cuya lista salen los conjuros
  cantrips: Record<number, number>;
  prepared: Record<number, number>;
  from?: number; // nivel de clase desde el que lanza (3 si no se dice)
}

interface OwnSub { cls: string; n: string; own?: boolean; f: { lv: number; n: string; fx?: HbFx }[] }
interface OwnClass { id: string; n: string; own?: boolean; f: { lv: number; n: string; fx?: HbFx }[] }

// las subclases propias de la biblioteca de este dispositivo (la biblioteca las registra al cargarse o cambiar)
let own: OwnSub[] = [];
export const setOwnSubclasses = (list: OwnSub[]) => { own = list.filter((s) => s.own); };
// las clases propias: sus rasgos con efecto cuentan igual que los de una subclase
let ownCls: OwnClass[] = [];
export const setOwnClasses = (list: OwnClass[]) => { ownCls = list.filter((s) => s.own); };

// las reglas de lanzamiento de las subclases de la biblioteca (propias o importadas), por clase y nombre
let casting: { cls: string; n: string; rule: CastingRule }[] = [];
export const setCastingRules = (list: { cls: string; n: string; casting?: CastingRule }[]) => { casting = list.filter((s) => s.casting).map((s) => ({ cls: s.cls, n: s.n, rule: s.casting! })); };
export const libCastingRule = (cls: string, sub: string): CastingRule | undefined => casting.find((x) => x.cls === cls && norm(x.n) === norm(sub))?.rule;

// los rasgos de clase que sustituyen las subclases de la biblioteca («This feature replaces…»), para los cálculos de la hoja
let replaces: Parameters<typeof replacedFeatures>[1] = [];
export const setReplaceRules = (list: Parameters<typeof replacedFeatures>[1]) => { replaces = list.filter((s) => s.f.some((f) => f.rep)); };
/** ¿Alguna de sus clases tiene este rasgo de clase sustituido por su subclase? */
export const libReplaces = (entries: { classId: string; level: number; subclass?: string }[], feature: string): boolean => replacedFeatures(entries, replaces).some((g) => norm(g.feature) === norm(feature));

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Rasgos propios con efecto que tiene el personaje a su nivel en cada clase (por su subclase). */
export function ownFeatures(entries: { classId: string; level: number; subclass: string }[]): { n: string; lv: number; fx: HbFx; sub: string }[] {
  return entries.flatMap((e) => {
    const s = own.find((x) => x.cls === e.classId && norm(x.n) === norm(e.subclass || ''));
    const k = ownCls.find((x) => x.id === e.classId);
    return [
      ...(k ? k.f.filter((f) => f.fx && f.lv <= e.level).map((f) => ({ n: f.n, lv: f.lv, fx: f.fx!, sub: k.n })) : []),
      ...(s ? s.f.filter((f) => f.fx && f.lv <= e.level).map((f) => ({ n: f.n, lv: f.lv, fx: f.fx!, sub: s.n })) : []),
    ];
  });
}

/** Expresión de dados válida («2d6», «1d8+2», «5»). */
export const validDice = (s: string) => /^\s*(\d*d\d+|\d+)(\s*[+-]\s*(\d*d\d+|\d+))*\s*$/i.test(s);
