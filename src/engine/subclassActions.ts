import type { Abil } from '../data/player';
import { norm } from './util';

/**
 * Opciones de subclase que se usan en la mesa (maniobras…): un recurso de dados (cuántos, de qué tamaño, cuándo se
 * recuperan) y, para cada opción, qué tirada hace. Lo que hace cada opción se deduce de su texto (el del libro del
 * usuario), no se escribe aquí: «suma el dado … a la tirada de daño», «prueba de Destreza (Sigilo)», «tirada de
 * salvación de Fuerza», «más tu modificador por Fuerza o Destreza»…
 */
export interface DiceResource {
  key: string; // clave de usos gastados (c.uses)
  n: string;
  per: 'sr' | 'lr' | 'sr1'; // sr1: el descanso corto recupera uno; el largo, todos
  srFrom?: number; // desde este nivel el descanso corto lo recupera todo (Fuente de inspiración)
  count: Record<number, number> | 'level+1' | { abil: Abil }; // nivel -> dados, nivel + 1 o el modificador (mínimo 1)
  die: Record<number, number>; // nivel -> caras
  dc: Abil[]; // la CD es 8 + competencia + la mejor de estas características
  bonus?: Record<number, number>; // se suma al número de usos desde estos niveles
}

/** Usos o dados del recurso a un nivel (con el modificador si dependen de él). */
export function resourceMax(res: DiceResource, level: number, mods?: Partial<Record<Abil, number>>): number {
  if (res.count === 'level+1') return level + 1;
  if ('abil' in res.count) return Math.max(1, mods?.[res.count.abil as Abil] ?? 0) + (res.bonus ? atLevel(res.bonus, level) : 0);
  return atLevel(res.count as Record<number, number>, level);
}

/** Cuándo se recupera a ese nivel. */
export const resourcePer = (res: DiceResource, level: number): DiceResource['per'] => (res.srFrom && level >= res.srFrom ? 'sr' : res.per);

/** Valor de una tabla por nivel («a partir del nivel N»). */
export function atLevel(table: Record<number, number>, level: number): number {
  let v = 0;
  for (const [lv, n] of Object.entries(table)) if (parseInt(lv, 10) <= level) v = n;
  return v;
}

export interface OptionAction {
  damage: boolean; // suma el dado al daño de tu ataque
  checks: string[]; // habilidades a cuya prueba se suma (claves)
  init: boolean; // se suma a la iniciativa
  save: Abil | null; // el objetivo hace una salvación (se muestra la CD)
  plus: 'str-dex' | 'half-level' | null; // se suma algo más al dado
}

const ABIL_ES: Record<string, Abil> = { fuerza: 'str', destreza: 'dex', constitucion: 'con', inteligencia: 'int', sabiduria: 'wis', carisma: 'cha' };

/** Qué tirada hace una opción, según su texto. `skills`: clave -> nombre de cada habilidad. */
export function optionAction(text: string, skills: Record<string, string>): OptionAction {
  const t = norm(text).replace(/\s+/g, ' ');
  const sentences = t.split(/\.\s/);
  // a tu daño (no al de otra criatura a la que das la orden: «esa criatura podrá … sumar el dado …»)
  const damage = sentences.some((s) => /\bsuma\w*\b.{0,50}\b(a la|ala|al) (tirada de )?dano/.test(s) && !/esa criatura/.test(s));
  const byName = new Map(Object.entries(skills).map(([k, n]) => [norm(n), k]));
  const checks: string[] = [];
  for (const s of sentences.filter((x) => /prueba de /.test(x))) {
    for (const m of s.matchAll(/\(([^)]+)\)/g)) {
      for (const name of m[1].split(/,| o | y /)) {
        const k = byName.get(name.trim());
        if (k && !checks.includes(k)) checks.push(k);
      }
    }
  }
  const save = /tirada de salvacion de (fuerza|destreza|constitucion|inteligencia|sabiduria|carisma)/.exec(t);
  return {
    damage, checks,
    init: /tirada de iniciativa/.test(t),
    save: save ? ABIL_ES[save[1]] : null,
    plus: /mas tu modificador por fuerza o destreza/.test(t) ? 'str-dex' : /mitad de tu nivel/.test(t) ? 'half-level' : null,
  };
}

/**
 * Rasgos de subclase que se usan en la mesa (no son elecciones): qué tiran y qué gastan. Solo la mecánica; el texto
 * de cada rasgo se muestra desde el SRD o desde la biblioteca propia. `n`: nombres del rasgo o de la opción dentro de
 * un rasgo (libro y SRD).
 */
/**
 * Botón de una acción con varias tiradas. «{rage}» en la expresión es el daño de Furia (el número de dados).
 * `pay`: este botón gasta un uso de la acción (`uses`) o de su coste; `res`: gasta tantos usos del recurso de la subclase.
 */
export interface KitBtn {
  t: string;
  as?: 'attack' | 'damage' | 'free' | 'heal-self' | 'temp' | 'none';
  expr?: string; exprAt?: Record<number, string>;
  plus?: Abil; plusLevel?: boolean; plusPb?: boolean;
  atk?: Abil | 'spell'; // ataque: competencia + esta característica (o la de conjuros)
  type?: string;
  pay?: boolean; res?: number;
  selfHeal?: boolean; // te curas el total de la tirada
}

export type KitRoll =
  | { kind: 'die'; plus?: Abil; type?: string; spend?: boolean; mult?: number; unit?: string } // tira un dado del recurso
  | { kind: 'spend'; label?: string; n?: number } // gasta un uso o dado del recurso (para usar el rasgo o recuperar su uso)
  | { kind: 'multi'; cost?: string; uses?: { max: Abil | number; per: 'sr' | 'lr'; plusHalfLevel?: boolean }; buttons: KitBtn[] } // varios botones, cada uno con su tirada; gastan un uso propio o un recurso de clase (Canalización divina, Furia…)
  | { kind: 'regain'; label: string } // recupera un uso del recurso (p. ej. gastando un espacio de conjuro)
  | { kind: 'unarmed'; abil: Abil } // ataque sin armas que hace el dado del recurso + característica (no lo gasta)
  | { kind: 'extra'; expr: string; exprAt?: Record<number, string>; type?: string } // daño adicional con cada arma (por nivel; con su tipo o el del arma)
  | { kind: 'blade'; dmg: string; second: string; type: string } // arma que crea el rasgo (sutil): ataque, daño y segundo ataque
  | { kind: 'pool'; perUse: Abil | 'all' } // gasta varios dados de la reserva a la vez (hasta el modificador, o los que queden)
  | { kind: 'roll'; times?: Abil; expr: string; exprAt?: Record<number, string>; plus?: Abil; plusLevel?: boolean; plusHalfLevel?: boolean; type?: string; uses?: { max: Abil | number; per: 'sr' | 'lr' }; spend?: boolean; heal?: boolean; cost?: string; freeAlt?: string }
  | { kind: 'temp'; plus?: Abil } // PG temporales: nivel + modificador (mínimo 1)
  | { kind: 'bastion' } // Bastión de la ley: 1 a 5 d8 que se crean con puntos de hechicería y se gastan para restar daño
  | { kind: 'overchannel' } // Sobrecanalizar del evocador: daño máximo; el daño necrótico crece con cada uso sin descansar
  | { kind: 'ward' } // reserva de PG que absorbe daño (Salvaguarda arcana): 2 × nivel + Inteligencia, hasta el descanso largo
  | { kind: 'portent' } // Presagio del adivino: 2 d20 (3 desde el nivel 14) tras el descanso largo; cada uno se gasta una vez
  | { kind: 'info' }; // sin tirada (solo la CD y el texto)

export interface KitAction {
  n: string[];
  lv: number;
  roll: KitRoll;
  save?: { abil: Abil; dc: Abil | 'spell' };
  when?: { choice: string; is: string[] }; // solo con esta opción elegida
  subs?: string[]; // en un rasgo de clase: solo con estas subclases
  tag?: (x: { level: number; pb: number; mods: Record<Abil, number> }) => string; // número que se muestra al lado
  selfHeal?: (level: number) => number; // reparte curación que te puede incluir, hasta la mitad de tus PG máximos (Preservar vida)
  note?: string;
  react?: boolean; // se usa con la reacción: sale en la tarjeta Reacción y no en la de su subclase
}

/** `subs` vacío: rasgos de la clase (con acciones que pueden ser de una subclase concreta). */
export interface SubclassKit { id: string; cls: string; subs: string[]; title: string; res?: DiceResource; actions: KitAction[] }

const LORE = ['Colegio del conocimiento', 'Colegio del Saber', 'College of Lore'];
const VALOR = ['Colegio del valor', 'College of Valor'];
const DANCE = ['Colegio de la danza', 'College of Dance'];
const GLAMOUR = ['Colegio del glamour', 'College of Glamour'];
const GLORY = ['Juramento de gloria', 'Oath of Glory'];

const psionic = (dc: Abil, key = 'Dados de energía psiónica'): DiceResource => ({ key, n: 'Dados de energía psiónica', per: 'sr1', count: { 3: 4, 5: 6, 9: 8, 13: 10, 17: 12 }, die: { 3: 6, 5: 8, 11: 10, 17: 12 }, dc: [dc] });

/** Clave de los Puntos de concentración del monje (la misma que usa su tarjeta de clase). */
const FOCUS = 'Concentración del monje';

/** Dado de Artes marciales del monje por nivel. */
const MARTIAL: Record<number, string> = { 1: '1d6', 5: '1d8', 11: '1d10', 17: '1d12' };

export const KITS: SubclassKit[] = [
  {
    id: 'psi-warrior', cls: 'fighter', subs: ['Guerrero psiónico', 'Psi Warrior'], title: 'Poder psiónico', res: psionic('int'),
    actions: [
      { n: ['Golpe psiónico'], lv: 3, roll: { kind: 'die', plus: 'int', type: 'fuerza' }, note: 'Una vez por turno, tras acertar y dañar con un arma.' },
      { n: ['Campo protector'], lv: 3, react: true, roll: { kind: 'die', plus: 'int' }, note: 'Reduce el daño en el resultado (mínimo 1).' },
      { n: ['Movimiento telequinético'], lv: 3, roll: { kind: 'spend' } },
      { n: ['Empujón telequinético'], lv: 7, roll: { kind: 'info' }, save: { abil: 'str', dc: 'int' } },
      { n: ['Salto psiónico'], lv: 7, roll: { kind: 'spend' } },
      { n: ['Mente robusta'], lv: 10, roll: { kind: 'spend' } },
      { n: ['Bastión de fuerza'], lv: 15, roll: { kind: 'spend' } },
      { n: ['Maestro telequinético'], lv: 18, roll: { kind: 'spend' } },
    ],
  },
  {
    id: 'soulknife', cls: 'rogue', subs: ['Rebanaalmas', 'Soulknife'], title: 'Poder psiónico', res: psionic('dex', 'Dados de energía psiónica (Rebanaalmas)'),
    actions: [
      { n: ['Cuchillas psíquicas'], lv: 3, roll: { kind: 'blade', dmg: '1d6', second: '1d4', type: 'psíquico' } },
      { n: ['Don psirreforzado'], lv: 3, roll: { kind: 'die', spend: false }, note: 'El dado solo se gasta si la prueba tiene éxito: márcalo arriba.' },
      { n: ['Susurros psíquicos'], lv: 3, roll: { kind: 'die', spend: false }, note: 'Horas de enlace = resultado. La primera vez tras un descanso largo no gasta dado.' },
      { n: ['Golpes teledirigidos'], lv: 9, roll: { kind: 'die', spend: false }, note: 'Se suma al ataque fallado; el dado solo se gasta si acierta.' },
      { n: ['Teletransporte psíquico'], lv: 9, roll: { kind: 'die', mult: 3 }, note: 'Distancia en metros = 3 × resultado.' },
      { n: ['Velo psíquico'], lv: 13, roll: { kind: 'spend' } },
      { n: ['Desgarro mental'], lv: 17, roll: { kind: 'info' }, save: { abil: 'wis', dc: 'dex' } },
    ],
  },
  {
    id: 'celestial', cls: 'warlock', subs: ['Patrón celestial', 'Celestial Patron'], title: 'Patrón celestial',
    res: { key: 'Luz sanadora', n: 'Dados de Luz sanadora', per: 'lr', count: 'level+1', die: { 1: 6 }, dc: ['cha'] },
    actions: [
      { n: ['Luz sanadora'], lv: 3, roll: { kind: 'pool', perUse: 'cha' } },
      { n: ['Resiliencia celestial'], lv: 10, roll: { kind: 'temp', plus: 'cha' }, note: 'Al usar Astucia mágica o tras un descanso. Hasta cinco criaturas: la mitad de tu nivel + Carisma.' },
      { n: ['Venganza ardiente'], lv: 14, roll: { kind: 'roll', expr: '2d8', plus: 'cha', type: 'radiante', uses: { max: 1, per: 'lr' } } },
    ],
  },
  {
    id: 'archfey', cls: 'warlock', subs: ['Patrón feérico', 'Patrón archifeérico', 'Archfey Patron'], title: 'Pasos feéricos',
    res: { key: 'Pasos feéricos', n: 'Paso brumoso sin espacio', per: 'lr', count: { abil: 'cha' }, die: {}, dc: ['cha'] },
    actions: [
      { n: ['Pasos feéricos', 'Steps of the Fey'], lv: 3, roll: { kind: 'spend', label: 'Lanzar paso brumoso gratis' }, note: 'Acción adicional. Al lanzarlo puedes elegir uno de sus efectos.' },
      { n: ['Paso refrescante', 'Refreshing Step'], lv: 3, roll: { kind: 'roll', expr: '1d10' }, note: 'PG temporales para ti o una criatura que veas a 3 m.' },
      { n: ['Paso burlón', 'Taunting Step'], lv: 3, roll: { kind: 'info' }, save: { abil: 'wis', dc: 'spell' }, note: 'Las criaturas a 1,5 m del espacio que dejas: si fallan, desventaja al atacar a otros que no seas tú.' },
      { n: ['Escape brumoso', 'Misty Escape'], lv: 6, react: true, roll: { kind: 'spend', label: 'Paso brumoso' }, note: 'Como reacción al recibir daño.' },
      { n: ['Paso aterrador', 'Dreadful Step'], lv: 6, roll: { kind: 'roll', expr: '2d10', type: 'psíquico' }, save: { abil: 'wis', dc: 'spell' } },
      { n: ['Paso desvanecedor', 'Disappearing Step'], lv: 6, roll: { kind: 'info' }, note: 'Invisible hasta el principio de tu siguiente turno o hasta que ataques, hagas daño o lances un conjuro.' },
    ],
  },
  {
    id: 'fiend', cls: 'warlock', subs: ['Patrón infernal', 'Fiend Patron'], title: 'Patrón infernal',
    actions: [
      { n: ['Bendición del oscuro'], lv: 3, roll: { kind: 'temp', plus: 'cha' }, note: 'Al reducir a 0 PG a un enemigo (o si otro lo hace a 3 m de ti).' },
      { n: ['La suerte del oscuro', 'Suerte propia del Oscuro'], lv: 6, roll: { kind: 'roll', expr: '1d10', uses: { max: 'cha', per: 'lr' } }, note: 'Súmalo a una prueba o salvación.' },
      { n: ['Arrastrar por el infierno', 'Arrojar a través del Infierno'], lv: 14, roll: { kind: 'roll', expr: '8d10', type: 'psíquico', uses: { max: 1, per: 'lr' } }, save: { abil: 'cha', dc: 'spell' } },
    ],
  },
  {
    id: 'bard', cls: 'bard', subs: [], title: 'Inspiración bárdica',
    res: { key: 'Inspiración bárdica', n: 'Inspiración bárdica', per: 'lr', srFrom: 5, count: { abil: 'cha' }, die: { 1: 6, 5: 8, 10: 10, 15: 12 }, dc: ['cha'] },
    actions: [
      { n: ['Inspiración bárdica'], lv: 1, roll: { kind: 'spend', label: 'Dar un dado a un aliado' }, note: 'Acción adicional: una criatura a 18 m que te vea u oiga obtiene un dado; lo tira y lo suma cuando falle una prueba con d20.' },
      { n: ['Fuente de inspiración'], lv: 5, roll: { kind: 'regain', label: 'Recuperar un uso (gasta un espacio de conjuro)' }, note: 'Marca el espacio de conjuro gastado en «Conjuros».' },
      { n: ['Palabras cortantes', 'Palabras hirientes'], lv: 3, react: true, subs: LORE, roll: { kind: 'die' }, note: 'Reacción: resta el resultado a la tirada de la criatura.' },
      { n: ['Habilidad sin parangón', 'Habilidad sin par'], lv: 14, subs: LORE, roll: { kind: 'die', spend: false }, note: 'Súmalo a tu prueba o ataque fallado; si aun así fallas, no se gasta (márcalo arriba si se gasta).' },
      { n: ['Inspiración en combate'], lv: 3, subs: VALOR, roll: { kind: 'info' }, note: 'Quien tenga tu dado puede sumarlo a su CA contra un ataque o al daño de un ataque que acierte.' },
      { n: ['Juego de pies deslumbrante'], lv: 3, subs: DANCE, roll: { kind: 'unarmed', abil: 'dex' }, note: 'Ataque sin armas con Destreza: dado de Inspiración bárdica + Destreza (no lo gasta). Al gastar un uso puedes hacer este ataque como parte de esa acción.' },
      { n: ['Juego de pies conjunto'], lv: 6, subs: DANCE, roll: { kind: 'die' }, note: 'Al tirar iniciativa: tú y tus aliados a 9 m sumáis el resultado a la iniciativa.' },
      { n: ['Movimiento inspirador'], lv: 6, subs: DANCE, roll: { kind: 'spend' } },
      { n: ['Manto de inspiración'], lv: 3, subs: GLAMOUR, roll: { kind: 'die', mult: 2, unit: 'PG temporales a cada criatura' }, note: 'Hasta tu modificador de Carisma criaturas: cada una gana el doble del resultado en PG temporales.' },
      { n: ['Magia cautivadora'], lv: 3, subs: GLAMOUR, roll: { kind: 'spend', label: 'Gastar un uso (recuperar el beneficio)' }, save: { abil: 'wis', dc: 'spell' } },
      { n: ['Inspiración superior'], lv: 18, roll: { kind: 'info' }, note: 'Al tirar iniciativa, recuperas usos hasta tener dos.' },
    ],
  },
  {
    id: 'cleric', cls: 'cleric', subs: [], title: 'Canalizar divinidad',
    res: { key: 'Canalizar Divinidad', n: 'Usos de Canalizar divinidad', per: 'sr1', count: { 2: 2, 6: 3, 18: 4 }, die: {}, dc: ['wis'] },
    actions: [
      { n: ['Chispa divina'], lv: 2, roll: { kind: 'roll', expr: '1d8', exprAt: { 2: '1d8', 7: '2d8', 13: '3d8', 18: '4d8' }, plus: 'wis', type: 'radiante', spend: true, heal: true }, save: { abil: 'con', dc: 'spell' }, note: 'Cura esa cantidad o hace daño radiante o necrótico (mitad si supera la salvación).' },
      { n: ['Ahuyentar a los muertos vivientes', 'Ahuyentar muertos vivientes'], lv: 2, roll: { kind: 'spend' }, save: { abil: 'wis', dc: 'spell' } },
      { n: ['Preservar vida'], lv: 3, subs: ['Dominio de la vida', 'Life Domain'], roll: { kind: 'spend', label: 'Usar en otros (gasta un uso)' }, selfHeal: (lv) => 5 * lv, tag: (x) => 'reparte ' + 5 * x.level + ' PG', note: 'Entre criaturas maltrechas a 9 m, sin pasar de la mitad de sus PG máximos.' },
      { n: ['Resplandor del amanecer'], lv: 3, subs: ['Dominio de la luz', 'Light Domain'], roll: { kind: 'roll', expr: '2d10', plusLevel: true, type: 'radiante', spend: true }, save: { abil: 'con', dc: 'spell' }, note: 'Mitad de daño si superan la salvación.' },
      { n: ['Golpe guiado'], lv: 3, subs: ['Dominio de la guerra', 'War Domain'], roll: { kind: 'spend' }, tag: () => '+10 al ataque' },
      { n: ['Bendición del dios de la guerra'], lv: 6, subs: ['Dominio de la guerra', 'War Domain'], roll: { kind: 'spend' } },
      { n: ['Invocar duplicidad'], lv: 3, subs: ['Dominio del engaño', 'Trickery Domain'], roll: { kind: 'spend' } },
    ],
  },
  {
    id: 'paladin', cls: 'paladin', subs: [], title: 'Canalización divina',
    res: { key: 'Canalización divina', n: 'Usos de Canalización divina', per: 'sr1', count: { 3: 2, 11: 3 }, die: {}, dc: ['cha'] },
    actions: [
      { n: ['Sentido divino'], lv: 3, roll: { kind: 'spend' } },
      { n: ['Abjurar enemigos'], lv: 9, roll: { kind: 'spend' }, save: { abil: 'wis', dc: 'spell' } },
      { n: ['Arma sagrada'], lv: 3, subs: ['Juramento de devoción', 'Juramento de entrega', 'Oath of Devotion'], roll: { kind: 'spend' }, tag: (x) => '+' + Math.max(1, x.mods.cha) + ' al ataque' },
      { n: ['Castigo inspirador'], lv: 3, subs: GLORY, roll: { kind: 'roll', expr: '2d8', plusLevel: true, spend: true }, note: 'PG temporales en total, repartidos entre criaturas a 9 m (tras lanzar castigo divino).' },
      { n: ['Atleta sin parangón'], lv: 3, subs: GLORY, roll: { kind: 'spend' } },
      { n: ['Ira de la naturaleza'], lv: 3, subs: ['Juramento de los antiguos', 'Oath of the Ancients'], roll: { kind: 'spend' }, save: { abil: 'str', dc: 'spell' } },
      { n: ['Voto de enemistad'], lv: 3, subs: ['Juramento de venganza', 'Oath of Vengeance'], roll: { kind: 'spend' }, tag: () => 'ventaja 1 minuto' },
    ],
  },
  {
    id: 'berserker', cls: 'barbarian', subs: ['Senda del berserker', 'Path of the Berserker'], title: 'Senda del berserker',
    actions: [
      { n: ['Presencia intimidante', 'Intimidating Presence'], lv: 14, roll: { kind: 'info' }, save: { abil: 'wis', dc: 'str' }, note: 'Acción adicional, emanación de 9 m. Una vez por descanso largo, o gastando un uso de Furia.' },
    ],
  },
  {
    id: 'zealot', cls: 'barbarian', subs: ['Senda del fanático', 'Path of the Zealot'], title: 'Senda del fanático',
    res: { key: 'Guerrero de los dioses', n: 'Dados de Guerrero de los dioses', per: 'lr', count: { 3: 4, 6: 5, 12: 6, 17: 7 }, die: { 3: 12 }, dc: ['con'] },
    actions: [
      { n: ['Furia divina', 'Divine Fury'], lv: 3, roll: { kind: 'roll', expr: '1d6', plusHalfLevel: true, type: 'radiante' }, note: 'Con la Furia activa, al primer objetivo que impactes en tu turno: daño radiante o necrótico, a tu elección.' },
      { n: ['Guerrero de los dioses', 'Warrior of the Gods'], lv: 3, roll: { kind: 'pool', perUse: 'all' }, note: 'Acción adicional: gasta los dados que quieras y recuperas esos PG.' },
    ],
  },
  {
    id: 'open-hand', cls: 'monk', subs: ['Guerrero de la mano abierta', 'Warrior of the Open Hand'], title: 'Guerrero de la mano abierta',
    actions: [
      { n: ['Plenitud de cuerpo', 'Plenitud del cuerpo', 'Wholeness of Body'], lv: 6, roll: { kind: 'roll', expr: '1d6', exprAt: MARTIAL, plus: 'wis', uses: { max: 'wis', per: 'lr' } }, note: 'Acción adicional: recuperas los PG del resultado (mínimo 1).' },
      { n: ['Palma estremecedora', 'Palma vibrante', 'Quivering Palm'], lv: 17, roll: { kind: 'roll', expr: '10d12', type: 'fuerza' }, save: { abil: 'con', dc: 'wis' }, note: 'Cuesta 4 Puntos de concentración al golpear. La mitad si supera la salvación.' },
    ],
  },
  {
    id: 'mercy', cls: 'monk', subs: ['Guerrero de la misericordia', 'Warrior of Mercy'], title: 'Guerrero de la misericordia',
    actions: [
      { n: ['Mano de curación', 'Mano curativa', 'Hand of Healing'], lv: 3, roll: { kind: 'roll', expr: '1d6', exprAt: MARTIAL, plus: 'wis', cost: FOCUS, freeAlt: 'gratis en Ráfaga' }, note: 'Acción de Magia, 1 Punto de concentración (o sustituye un golpe de la Ráfaga sin coste).' },
      { n: ['Mano de aflicción', 'Mano dañina', 'Hand of Harm'], lv: 3, roll: { kind: 'roll', expr: '1d6', exprAt: MARTIAL, plus: 'wis', type: 'necrótico', cost: FOCUS }, note: 'Una vez por turno al impactar con un Golpe sin armas: 1 Punto de concentración.' },
    ],
  },
  {
    id: 'fey-wanderer', cls: 'ranger', subs: ['Errante feérico', 'Fey Wanderer'], title: 'Errante feérico',
    actions: [
      { n: ['Golpes pavorosos', 'Golpes aterradores', 'Dreadful Strikes'], lv: 3, roll: { kind: 'extra', expr: '1d4', exprAt: { 3: '1d4', 11: '1d6' }, type: 'psíquico' }, note: 'Una vez por turno al impactar con un arma.' },
    ],
  },
  {
    id: 'diviner', cls: 'wizard', subs: ['Adivino', 'Diviner'], title: 'Presagio',
    actions: [
      { n: ['Presagio', 'Portent'], lv: 3, roll: { kind: 'portent' }, note: 'Tras un descanso largo, tira los d20 y anótalos. Sustituye una tirada de d20 tuya o de una criatura que veas, antes de tirar y solo una vez por turno. Los que no uses se pierden en el siguiente descanso largo (3 d20 desde el nivel 14).' },
    ],
  },
  {
    id: 'wild-magic', cls: 'sorcerer', subs: ['Hechicería de magia salvaje', 'Wild Magic Sorcery'], title: 'Magia salvaje',
    actions: [
      { n: ['Sobrecarga de magia salvaje', 'Wild Magic Surge'], lv: 3, roll: { kind: 'roll', expr: '1d20' }, note: 'Una vez por turno, justo después de lanzar un conjuro de hechicero con espacio: con un 20, tira en la tabla de Sobrecarga de magia salvaje.' },
      { n: ['Doblegar la suerte', 'Bend Luck'], lv: 6, react: true, roll: { kind: 'roll', expr: '1d4', cost: 'Fuente de magia' }, note: 'Tras la tirada de d20 de otra criatura: sumas o restas el resultado, a tu elección.' },
    ],
  },
  {
    id: 'world-tree', cls: 'barbarian', subs: ['Senda del árbol del mundo', 'Path of the World Tree'], title: 'Árbol del Mundo',
    actions: [
      { n: ['Vitalidad del árbol', 'Vitality of the Tree'], lv: 3, roll: { kind: 'temp' }, note: 'Al enfurecerte: PG temporales igual a tu nivel de bárbaro. Cada turno, otra criatura a 3 m recibe tantos d6 como tu daño de furia en PG temporales.' },
      { n: ['Ramas del árbol', 'Branches of the Tree'], lv: 6, react: true, roll: { kind: 'info' }, save: { abil: 'str', dc: 'str' } },
    ],
  },
  {
    id: 'stars', cls: 'druid', subs: ['Círculo de las estrellas', 'Circle of the Stars'], title: 'Círculo de las estrellas',
    actions: [
      { n: ['Presagio cósmico', 'Cosmic Omen'], lv: 6, react: true, roll: { kind: 'roll', expr: '1d6' }, note: 'Desdicha (resta) si tiraste impar, Fortuna (suma) si tiraste par: la reacción especial dura hasta el siguiente descanso largo.' },
    ],
  },
  {
    id: 'gloom-stalker', cls: 'ranger', subs: ['Acechador en la penumbra', 'Gloom Stalker'], title: 'Acechador en la penumbra',
    actions: [
      { n: ['Emboscador pavoroso', 'Dread Ambusher'], lv: 3, roll: { kind: 'roll', expr: '2d6', type: 'psíquico', uses: { max: 'wis', per: 'lr' } }, note: 'Golpe pavoroso: una vez por turno, al acertar con un arma.' },
    ],
  },
  {
    id: 'clockwork', cls: 'sorcerer', subs: ['Hechicería mecánica', 'Clockwork Sorcery'], title: 'Hechicería mecánica',
    actions: [
      { n: ['Bastión de la ley', 'Bastion of Law'], lv: 6, roll: { kind: 'bastion' }, note: 'Acción de magia: gastas de 1 a 5 puntos de hechicería para crear tantos d8. Quien protejas puede gastar varios al recibir daño y restar la tirada. Dura hasta el descanso largo o hasta que lo uses de nuevo.' },
    ],
  },
  {
    id: 'aberrant', cls: 'sorcerer', subs: ['Hechicería aberrante', 'Aberrant Sorcery'], title: 'Hechicería aberrante',
    actions: [
      { n: ['Implosión deformadora', 'Warping Implosion'], lv: 18, roll: { kind: 'roll', expr: '3d10', type: 'fuerza', uses: { max: 1, per: 'lr' } }, save: { abil: 'str', dc: 'spell' }, note: 'Te teletransportas a 36 m; quien esté a 9 m del espacio que dejas es arrastrado a él (mitad de daño si supera la salvación). Restablecer el uso cuesta 5 puntos de hechicería.' },
    ],
  },
  {
    id: 'evoker', cls: 'wizard', subs: ['Evocador', 'Evoker'], title: 'Evocación',
    actions: [
      { n: ['Sobrecanalizar', 'Overchannel'], lv: 14, roll: { kind: 'overchannel' }, note: 'Conjuro de mago con daño y espacio de nivel 1 a 5: daño máximo. La primera vez no sufres nada; las siguientes, sin descansar, recibes necrótico (ignora resistencias).' },
    ],
  },
  {
    id: 'sea', cls: 'druid', subs: ['Círculo del mar', 'Circle of the Sea'], title: 'Círculo del mar',
    actions: [
      { n: ['Ira de los mares', 'Wrath of the Sea'], lv: 3, roll: { kind: 'roll', expr: '1d6', times: 'wis', type: 'frío' }, save: { abil: 'con', dc: 'spell' }, note: 'Acción adicional, gastando un uso de Forma salvaje. Daño: tantos d6 como tu modificador de Sabiduría (mínimo 1).' },
    ],
  },
  {
    id: 'abjurer', cls: 'wizard', subs: ['Abjurador', 'Abjurer'], title: 'Salvaguarda arcana',
    actions: [
      { n: ['Salvaguarda arcana', 'Arcane Ward'], lv: 3, roll: { kind: 'ward' }, note: 'Al lanzar un conjuro de Abjuración con un espacio la creas o la recuperas en el doble del nivel del espacio. Absorbe el daño que recibes; dura hasta un descanso largo.' },
    ],
  },
  {
    id: 'hunter', cls: 'ranger', subs: ['Cazador', 'Hunter'], title: 'Cazador',
    actions: [
      { n: ['Azote de colosos', 'Matacolosos'], lv: 3, roll: { kind: 'extra', expr: '1d8' }, when: { choice: 'hunter.prey', is: ['Azote de colosos', 'Matacolosos'] }, note: 'Una vez por turno, si al objetivo le faltan PG.' },
    ],
  },
  // ---- World of Warcraft (libro del usuario): las subclases se reconocen por su nombre en inglés ----
  {
    id: 'wow-demon-hunter', cls: 'ranger', subs: ['Demon Hunter', 'Cazador de demonios'], title: 'Cazador de demonios',
    res: { key: 'Soul Fragments', n: 'Fragmentos de alma', per: 'lr', count: { abil: 'wis' }, bonus: { 13: 1, 17: 2 }, die: {}, dc: ['wis'] },
    actions: [
      { n: ['Soul Fragments'], lv: 3, roll: { kind: 'regain', label: 'Recuperar un fragmento (reacción: muere un enemigo a 9 m)' }, note: 'Los ganas al acabar un descanso largo y duran hasta el siguiente.' },
      { n: ['Double Jump'], lv: 3, roll: { kind: 'spend', label: 'Lanzar Caída de pluma o Salto (gasta un fragmento)' } },
      {
        n: ['Soul Cleave'], lv: 3, save: { abil: 'dex', dc: 'spell' }, note: 'Una vez por turno, en lugar de uno de tus ataques: emanación de 3 m. Si fallan, el daño; tú recuperas tu modificador de Sabiduría en PG.',
        roll: { kind: 'multi', buttons: [{ t: 'Daño', as: 'damage', expr: '1d12', exprAt: { 3: '1d12', 15: '2d12' }, plus: 'wis', type: 'psíquico', res: 1 }, { t: 'Curarme', as: 'heal-self', plus: 'wis' }] },
      },
      { n: ['Torment'], lv: 7, roll: { kind: 'multi', buttons: [{ t: 'Chaos Strike', as: 'damage', expr: '1d8', type: 'fuego' }, { t: 'Aura of Pain: resta', as: 'free', expr: '1d4' }] }, note: 'Una vez por turno, al impactar a la criatura marcada con Marca del cazador.' },
      { n: ['Disrupt'], lv: 11, roll: { kind: 'spend', n: 2, label: 'Lanzar Contraconjuro (gasta dos fragmentos)' } },
      { n: ['Warglaive Mastery'], lv: 11, roll: { kind: 'spend', label: 'Lanzar Throw Glaive (gasta un fragmento)' }, note: 'Acción adicional.' },
      { n: ['Soul Shatter'], lv: 15, roll: { kind: 'info' }, note: 'Soul Cleave hace 2d12 + Sabiduría. Al tirar iniciativa recuperas un fragmento si no tienes ninguno.' },
    ],
  },
  {
    id: 'wow-mystic-brews', cls: 'monk', subs: ['Warrior of Mystic Brews', 'Guerrero de los brebajes místicos'], title: 'Brebajes místicos',
    actions: [
      { n: ['Cinnamon Dragon'], lv: 6, roll: { kind: 'roll', expr: '4d6', exprAt: { 1: '4d6', 5: '4d8', 11: '4d10', 17: '4d12' }, type: 'fuego' }, save: { abil: 'dex', dc: 'wis' }, note: 'Acción de Magia, cono de 9 m: cuatro dados de Artes marciales; mitad si superan la salvación. Y Envenenado hasta el final de su siguiente turno si fallan.' },
      { n: ['Refreshing Dip'], lv: 6, roll: { kind: 'multi', uses: { max: 'wis', per: 'lr', plusHalfLevel: true }, buttons: [{ t: 'Curación extra: dado de Artes marciales', as: 'free', expr: '1d6', exprAt: MARTIAL, pay: true }] }, note: 'Cuando recuperes PG, gasta un dado de la reserva y suma lo que salga.' },
      { n: ['Redirect Attack'], lv: 6, react: true, roll: { kind: 'multi', cost: FOCUS, buttons: [{ t: 'Redirigir el ataque', as: 'none', pay: true }] } },
      { n: ['Intoxicated Frenzy'], lv: 17, roll: { kind: 'info' }, save: { abil: 'dex', dc: 'wis' } },
    ],
  },
  {
    id: 'wow-holy', cls: 'paladin', subs: ['Oath of the Holy', 'Juramento de lo Sagrado'], title: 'Juramento de lo Sagrado',
    actions: [
      { n: ['Beacon of Light'], lv: 3, roll: { kind: 'multi', cost: 'Canalización divina', buttons: [{ t: 'Usar (acción de Magia)', as: 'none', pay: true }] } },
      { n: ['Lightbringer’s Aura', "Lightbringer's Aura"], lv: 7, roll: { kind: 'roll', expr: '1d6' }, note: 'Curación extra a una criatura maltrecha dentro de tu aura al curarla con un conjuro o Imposición de manos.' },
      { n: ['Infusion of Light'], lv: 15, roll: { kind: 'info' }, note: 'Tras un conjuro de daño radiante, tu reserva de Imposición de manos recupera PG igual al total tirado (máximo 5 × tu nivel). Súmalos a mano en la tarjeta de Imposición de manos.' },
      { n: ['Holy Deliverance'], lv: 20, roll: { kind: 'multi', uses: { max: 1, per: 'lr' }, buttons: [{ t: 'Activar (acción adicional)', as: 'none', pay: true }, { t: 'Curación al empezar su turno un aliado maltrecho', as: 'free', plus: 'cha', plusPb: true }] }, note: 'Restaurar el uso cuesta un espacio de nivel 5.' },
    ],
  },
  {
    id: 'wow-discipline', cls: 'cleric', subs: ['Discipline Domain', 'Dominio de Disciplina'], title: 'Dominio de Disciplina',
    actions: [
      {
        n: ['Holy Bolt'], lv: 3, note: 'Acción adicional: ataque de conjuro a distancia a 18 m. Si impacta, daño radiante; además, una criatura que veas a 18 m recupera PG.',
        roll: { kind: 'multi', cost: 'Canalizar Divinidad', buttons: [{ t: 'Ataque de conjuro', as: 'attack', atk: 'spell', pay: true }, { t: 'Daño', as: 'damage', expr: '2d10', plus: 'wis', type: 'radiante' }, { t: 'Curar', as: 'free', expr: '1d10', plus: 'wis' }] },
      },
      { n: ['Atonement'], lv: 3, roll: { kind: 'info' } },
      { n: ['Luminous Barrier'], lv: 6, roll: { kind: 'multi', cost: 'Canalizar Divinidad', buttons: [{ t: 'PG temporales para ti (nivel + Sabiduría)', as: 'temp', plusLevel: true, plus: 'wis', pay: true }] }, note: 'Cada criatura bendecida por Atonement los gana, con resistencia a todo el daño mientras los conserve.' },
      { n: ['Ultimate Penitence'], lv: 17, roll: { kind: 'info' } },
    ],
  },
  {
    id: 'wow-shadow', cls: 'cleric', subs: ['Shadow Domain', 'Dominio de las Sombras'], title: 'Dominio de las Sombras',
    actions: [
      { n: ['Shadowform'], lv: 3, roll: { kind: 'multi', cost: 'Canalizar Divinidad', buttons: [{ t: 'Adoptar Shadowform (acción adicional)', as: 'none', pay: true }, { t: 'Void Empowerment', as: 'free', expr: '1d6' }] }, note: 'Dura 1 minuto. El d6 se suma al daño psíquico o necrótico de un conjuro con espacio.' },
      { n: ['Devouring Plague'], lv: 3, roll: { kind: 'multi', uses: { max: 'wis', per: 'lr' }, buttons: [{ t: 'Daño', as: 'damage', expr: '1d10', type: 'necrótico', pay: true, selfHeal: true }] }, note: 'Cuando una criatura a 9 m falla una salvación. Tú recuperas los PG del daño necrótico hecho.' },
      { n: ['Dispersion'], lv: 6, react: true, roll: { kind: 'multi', uses: { max: 1, per: 'sr' }, buttons: [{ t: 'Usar', as: 'none', pay: true }] }, note: 'Al terminar puedes gastar hasta la mitad de tus dados de golpe.' },
      { n: ['Vampiric Embrace'], lv: 17, roll: { kind: 'info' }, note: 'Con Shadowform activa, cada d6 de Void Empowerment cura esa cantidad a una criatura a 9 m.' },
    ],
  },
  {
    id: 'wow-swashbuckler', cls: 'rogue', subs: ['Swashbuckler', 'Espadachín'], title: 'Espadachín',
    actions: [
      { n: ['Rakish Audacity'], lv: 3, roll: { kind: 'info' }, tag: (x) => (x.mods.cha >= 0 ? '+' : '') + x.mods.cha + ' a la iniciativa' },
      { n: ['Goad'], lv: 9, roll: { kind: 'info' }, save: { abil: 'wis', dc: 'dex' }, tag: () => 'coste 1d6', note: 'Opción de Golpe astuto: resta esos dados al daño del Ataque furtivo.' },
      { n: ['Awe'], lv: 9, roll: { kind: 'info' }, save: { abil: 'wis', dc: 'dex' }, tag: () => 'coste 3d6', note: 'Opción de Golpe astuto: resta esos dados al daño del Ataque furtivo.' },
      { n: ['Invigorate'], lv: 13, roll: { kind: 'roll', expr: '1d6' }, tag: () => 'coste 2d6', note: 'Opción de Golpe astuto. Quien reciba el efecto suma ese dado a un ataque o salvación.' },
      { n: ['Parrying Stance'], lv: 13, roll: { kind: 'roll', expr: '1d6' }, tag: () => 'coste 2d6', note: 'Opción de Golpe astuto. Bonificador a tu CA hasta el principio de tu siguiente turno.' },
      { n: ['Master Duelist'], lv: 17, roll: { kind: 'info' } },
    ],
  },
  {
    id: 'wow-elements', cls: 'barbarian', subs: ['Path of the Elements', 'Senda de los Elementos'], title: 'Senda de los Elementos',
    actions: [
      { n: ['Icefury'], lv: 3, roll: { kind: 'multi', buttons: [{ t: 'Ataque de conjuro (Constitución)', as: 'attack', atk: 'con' }, { t: 'Daño', as: 'damage', expr: '{rage}d8', type: 'frío' }, { t: 'Extra si recibe fuego', as: 'damage', expr: '1d10', type: 'fuego' }] }, note: 'Al activar la Furia (o con una acción adicional mientras dure): tira tantos d8 como tu daño de Furia.' },
      { n: ['Lava Burst'], lv: 3, save: { abil: 'dex', dc: 'con' }, roll: { kind: 'multi', buttons: [{ t: 'Daño', as: 'damage', expr: '{rage}d4', type: 'fuego' }, { t: 'Extra si recibe relámpago', as: 'damage', expr: '1d8', type: 'relámpago' }] }, note: 'Tantos d4 como tu daño de Furia. Mitad si supera la salvación.' },
      { n: ['Lightning Bolt'], lv: 3, save: { abil: 'dex', dc: 'con' }, roll: { kind: 'multi', buttons: [{ t: 'Daño', as: 'damage', expr: '{rage}d6', type: 'relámpago' }, { t: 'Extra si recibe frío', as: 'damage', expr: '1d6', type: 'frío' }] }, note: 'Tantos d6 como tu daño de Furia. Mitad si supera la salvación.' },
      { n: ['Echo of the Elements'], lv: 6, roll: { kind: 'multi', cost: 'Furia', buttons: [{ t: 'Lanzar Daylight, Water Walk o Wind Wall', as: 'none', pay: true }] } },
      { n: ['Primordial Bond'], lv: 10, roll: { kind: 'info' } },
      { n: ['Elemental Overload'], lv: 14, roll: { kind: 'info' }, note: 'Tus opciones de Raging Elements ganan efectos extra, con o sin impacto o fallo de la salvación.' },
    ],
  },
  {
    id: 'wow-spiritual-guardian', cls: 'barbarian', subs: ['Path of the Spiritual Guardian', 'Senda del Guardián espiritual'], title: 'Senda del Guardián espiritual',
    actions: [
      { n: ['Strike'], lv: 3, roll: { kind: 'extra', expr: '1d4', type: 'frío' }, note: 'Con la Furia activa, al impactar: 1d4 extra de frío, fuego o relámpago a tu elección (aquí se cuenta como frío).' },
      { n: ['Spirit Shield'], lv: 6, react: true, roll: { kind: 'multi', buttons: [{ t: 'Reducir el daño', as: 'free', expr: '{rage}d6' }] }, note: 'Con la Furia activa: otra criatura a 9 m recibe daño.' },
      { n: ['Consult the Spirits'], lv: 10, roll: { kind: 'multi', uses: { max: 1, per: 'sr' }, buttons: [{ t: 'Usar (Augury o Clairvoyance)', as: 'none', pay: true }] } },
      { n: ['Spirits’ Fury', "Spirits' Fury"], lv: 14, roll: { kind: 'info' }, note: 'Con un 18-20 en el d20 de un ataque cuerpo a cuerpo de la acción de Atacar: un ataque adicional con la misma arma. Una vez por turno.' },
    ],
  },
];

type KitChar = { classId: string; subclass: string; level: number; choices?: Record<string, string[]> };

/** Rasgos de su clase y de su subclase que se usan en la mesa, a su nivel (y con la opción elegida si depende de ella). */
export function activeKits(c: KitChar): { kit: SubclassKit; actions: KitAction[] }[] {
  const sub = norm(c.subclass || '');
  const kits = KITS.filter((k) => k.cls === c.classId && (!k.subs.length || (sub && k.subs.some((s) => norm(s) === sub))));
  return kits.map((kit) => ({
    kit,
    actions: kit.actions.filter((a) => a.lv <= c.level
      && (!a.subs || a.subs.some((s) => norm(s) === sub))
      && (!a.when || (c.choices?.[a.when.choice] || []).some((x) => a.when!.is.some((n) => norm(n) === norm(x))))),
  })).filter((k) => k.actions.length);
}

/** La de su subclase (o null). */
export const activeKit = (c: KitChar) => activeKits(c).find((k) => k.kit.subs.length) || null;
