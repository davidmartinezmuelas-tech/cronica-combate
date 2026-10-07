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
}

/** Usos o dados del recurso a un nivel (con el modificador si dependen de él). */
export function resourceMax(res: DiceResource, level: number, mods?: Partial<Record<Abil, number>>): number {
  if (res.count === 'level+1') return level + 1;
  if ('abil' in res.count) return Math.max(1, mods?.[res.count.abil as Abil] ?? 0);
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
export type KitRoll =
  | { kind: 'die'; plus?: Abil; type?: string; spend?: boolean; mult?: number; unit?: string } // tira un dado del recurso
  | { kind: 'spend'; label?: string } // gasta un uso o dado del recurso (para usar el rasgo o recuperar su uso)
  | { kind: 'regain'; label: string } // recupera un uso del recurso (p. ej. gastando un espacio de conjuro)
  | { kind: 'unarmed'; abil: Abil } // ataque sin armas que hace el dado del recurso + característica (no lo gasta)
  | { kind: 'extra'; expr: string } // daño adicional con cada arma
  | { kind: 'blade'; dmg: string; second: string; type: string } // arma que crea el rasgo (sutil): ataque, daño y segundo ataque
  | { kind: 'pool'; perUse: Abil } // gasta varios dados de la reserva a la vez (hasta el modificador)
  | { kind: 'roll'; expr: string; exprAt?: Record<number, string>; plus?: Abil; plusLevel?: boolean; type?: string; uses?: { max: Abil | number; per: 'sr' | 'lr' }; spend?: boolean; heal?: boolean }
  | { kind: 'temp'; plus: Abil } // PG temporales: nivel + modificador (mínimo 1)
  | { kind: 'info' }; // sin tirada (solo la CD y el texto)

export interface KitAction {
  n: string[];
  lv: number;
  roll: KitRoll;
  save?: { abil: Abil; dc: Abil | 'spell' };
  when?: { choice: string; is: string[] }; // solo con esta opción elegida
  subs?: string[]; // en un rasgo de clase: solo con estas subclases
  tag?: (x: { level: number; pb: number; mods: Record<Abil, number> }) => string; // número que se muestra al lado
  note?: string;
}

/** `subs` vacío: rasgos de la clase (con acciones que pueden ser de una subclase concreta). */
export interface SubclassKit { id: string; cls: string; subs: string[]; title: string; res?: DiceResource; actions: KitAction[] }

const LORE = ['Colegio del conocimiento', 'Colegio del Saber', 'College of Lore'];
const VALOR = ['Colegio del valor', 'College of Valor'];
const DANCE = ['Colegio de la danza', 'College of Dance'];
const GLAMOUR = ['Colegio del glamour', 'College of Glamour'];
const GLORY = ['Juramento de gloria', 'Oath of Glory'];

const psionic = (dc: Abil): DiceResource => ({ key: 'Dados de energía psiónica', n: 'Dados de energía psiónica', per: 'sr1', count: { 3: 4, 5: 6, 9: 8, 13: 10, 17: 12 }, die: { 3: 6, 5: 8, 11: 10, 17: 12 }, dc: [dc] });

export const KITS: SubclassKit[] = [
  {
    id: 'psi-warrior', cls: 'fighter', subs: ['Guerrero psiónico', 'Psi Warrior'], title: 'Poder psiónico', res: psionic('int'),
    actions: [
      { n: ['Golpe psiónico'], lv: 3, roll: { kind: 'die', plus: 'int', type: 'fuerza' }, note: 'Una vez por turno, tras acertar y dañar con un arma.' },
      { n: ['Campo protector'], lv: 3, roll: { kind: 'die', plus: 'int' }, note: 'Reduce el daño en el resultado (mínimo 1).' },
      { n: ['Movimiento telequinético'], lv: 3, roll: { kind: 'spend' } },
      { n: ['Empujón telequinético'], lv: 7, roll: { kind: 'info' }, save: { abil: 'str', dc: 'int' } },
      { n: ['Salto psiónico'], lv: 7, roll: { kind: 'spend' } },
      { n: ['Mente robusta'], lv: 10, roll: { kind: 'spend' } },
      { n: ['Bastión de fuerza'], lv: 15, roll: { kind: 'spend' } },
      { n: ['Maestro telequinético'], lv: 18, roll: { kind: 'spend' } },
    ],
  },
  {
    id: 'soulknife', cls: 'rogue', subs: ['Rebanaalmas', 'Soulknife'], title: 'Poder psiónico', res: psionic('dex'),
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
      { n: ['Palabras cortantes', 'Palabras hirientes'], lv: 3, subs: LORE, roll: { kind: 'die' }, note: 'Reacción: resta el resultado a la tirada de la criatura.' },
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
      { n: ['Preservar vida'], lv: 3, subs: ['Dominio de la vida', 'Life Domain'], roll: { kind: 'spend' }, tag: (x) => 'reparte ' + 5 * x.level + ' PG', note: 'Entre criaturas maltrechas a 9 m, sin pasar de la mitad de sus PG máximos.' },
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
    id: 'hunter', cls: 'ranger', subs: ['Cazador', 'Hunter'], title: 'Cazador',
    actions: [
      { n: ['Azote de colosos', 'Matacolosos'], lv: 3, roll: { kind: 'extra', expr: '1d8' }, when: { choice: 'hunter.prey', is: ['Azote de colosos', 'Matacolosos'] }, note: 'Una vez por turno, si al objetivo le faltan PG.' },
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
