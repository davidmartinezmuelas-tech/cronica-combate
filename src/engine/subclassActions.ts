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
  count: Record<number, number> | 'level+1'; // nivel -> dados, o nivel + 1
  die: Record<number, number>; // nivel -> caras
  dc: Abil[]; // la CD es 8 + competencia + la mejor de estas características
}

/** Dados del recurso a un nivel. */
export const resourceMax = (res: DiceResource, level: number) => (res.count === 'level+1' ? level + 1 : atLevel(res.count, level));

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
  | { kind: 'die'; plus?: Abil; type?: string; spend?: boolean; mult?: number } // tira un dado del recurso
  | { kind: 'spend' } // gasta un dado del recurso para recuperar el uso del rasgo
  | { kind: 'extra'; expr: string } // daño adicional con cada arma
  | { kind: 'blade'; dmg: string; second: string; type: string } // arma que crea el rasgo (sutil): ataque, daño y segundo ataque
  | { kind: 'pool'; perUse: Abil } // gasta varios dados de la reserva a la vez (hasta el modificador)
  | { kind: 'roll'; expr: string; plus?: Abil; type?: string; uses?: { max: Abil | number; per: 'sr' | 'lr' } }
  | { kind: 'temp'; plus: Abil } // PG temporales: nivel + modificador (mínimo 1)
  | { kind: 'info' }; // sin tirada (solo la CD y el texto)

export interface KitAction {
  n: string[];
  lv: number;
  roll: KitRoll;
  save?: { abil: Abil; dc: Abil | 'spell' };
  when?: { choice: string; is: string[] }; // solo con esta opción elegida
  note?: string;
}

export interface SubclassKit { id: string; cls: string; subs: string[]; title: string; res?: DiceResource; actions: KitAction[] }

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
    id: 'hunter', cls: 'ranger', subs: ['Cazador', 'Hunter'], title: 'Cazador',
    actions: [
      { n: ['Azote de colosos', 'Matacolosos'], lv: 3, roll: { kind: 'extra', expr: '1d8' }, when: { choice: 'hunter.prey', is: ['Azote de colosos', 'Matacolosos'] }, note: 'Una vez por turno, si al objetivo le faltan PG.' },
    ],
  },
];

/** Rasgos de su subclase que se usan en la mesa, a su nivel (y con la opción elegida si depende de ella). */
export function activeKit(c: { classId: string; subclass: string; level: number; choices?: Record<string, string[]> }): { kit: SubclassKit; actions: KitAction[] } | null {
  const sub = norm(c.subclass || '');
  const kit = sub ? KITS.find((k) => k.cls === c.classId && k.subs.some((s) => norm(s) === sub)) : undefined;
  if (!kit) return null;
  const actions = kit.actions.filter((a) => a.lv <= c.level && (!a.when || (c.choices?.[a.when.choice] || []).some((x) => a.when!.is.some((n) => norm(n) === norm(x)))));
  return actions.length ? { kit, actions } : null;
}
