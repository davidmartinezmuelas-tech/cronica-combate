import type { ClassData, PlayerData } from '../data/player';
import { weaponFromData, type Character } from './character';

/**
 * Equipo inicial de cada clase (SRD 5.2.1, «Core Traits»): la opción con equipo y la de solo oro. Las armas y
 * armaduras van por su nombre en inglés (se buscan en los datos); lo demás, como texto para las notas.
 */
export interface GearOption { armor?: string; shield?: boolean; weapons: [string, number][]; gear: string[]; gp: number }
export const GEAR_KEY = 'gear.start'; // opción elegida («A», «B»…), para no aplicarla dos veces

const G: Record<string, GearOption[]> = {
  barbarian: [{ weapons: [['Greataxe', 1], ['Handaxe', 4]], gear: ['Mochila de explorador'], gp: 15 }, { weapons: [], gear: [], gp: 75 }],
  bard: [{ armor: 'Leather Armor', weapons: [['Dagger', 2]], gear: ['Instrumento musical a tu elección', 'Mochila de artista'], gp: 19 }, { weapons: [], gear: [], gp: 90 }],
  cleric: [{ armor: 'Chain Shirt', shield: true, weapons: [['Mace', 1]], gear: ['Símbolo sagrado', 'Mochila de sacerdote'], gp: 7 }, { weapons: [], gear: [], gp: 110 }],
  druid: [{ armor: 'Leather Armor', shield: true, weapons: [['Sickle', 1], ['Quarterstaff', 1]], gear: ['Foco druídico (el bastón)', 'Mochila de explorador', 'Útiles de herborista'], gp: 9 }, { weapons: [], gear: [], gp: 50 }],
  fighter: [
    { armor: 'Chain Mail', weapons: [['Greatsword', 1], ['Flail', 1], ['Javelin', 8]], gear: ['Mochila de explorador de mazmorras'], gp: 4 },
    { armor: 'Studded Leather Armor', weapons: [['Scimitar', 1], ['Shortsword', 1], ['Longbow', 1]], gear: ['20 flechas', 'Carcaj', 'Mochila de explorador de mazmorras'], gp: 11 },
    { weapons: [], gear: [], gp: 155 },
  ],
  monk: [{ weapons: [['Spear', 1], ['Dagger', 5]], gear: ['Herramientas de artesano o instrumento musical (el de tu competencia)', 'Mochila de explorador'], gp: 11 }, { weapons: [], gear: [], gp: 50 }],
  paladin: [{ armor: 'Chain Mail', shield: true, weapons: [['Longsword', 1], ['Javelin', 6]], gear: ['Símbolo sagrado', 'Mochila de sacerdote'], gp: 9 }, { weapons: [], gear: [], gp: 150 }],
  ranger: [{ armor: 'Studded Leather Armor', weapons: [['Scimitar', 1], ['Shortsword', 1], ['Longbow', 1]], gear: ['20 flechas', 'Carcaj', 'Foco druídico (ramita de muérdago)', 'Mochila de explorador'], gp: 7 }, { weapons: [], gear: [], gp: 150 }],
  rogue: [{ armor: 'Leather Armor', weapons: [['Dagger', 2], ['Shortsword', 1], ['Shortbow', 1]], gear: ['20 flechas', 'Carcaj', 'Herramientas de ladrón', 'Mochila de ladrón'], gp: 8 }, { weapons: [], gear: [], gp: 100 }],
  sorcerer: [{ weapons: [['Spear', 1], ['Dagger', 2]], gear: ['Foco arcano (cristal)', 'Mochila de explorador de mazmorras'], gp: 28 }, { weapons: [], gear: [], gp: 50 }],
  warlock: [{ armor: 'Leather Armor', weapons: [['Sickle', 1], ['Dagger', 2]], gear: ['Foco arcano (orbe)', 'Libro (saber oculto)', 'Mochila de erudito'], gp: 15 }, { weapons: [], gear: [], gp: 100 }],
  wizard: [{ weapons: [['Dagger', 2], ['Quarterstaff', 1]], gear: ['Foco arcano (el bastón)', 'Túnica', 'Libro de conjuros', 'Mochila de erudito'], gp: 5 }, { weapons: [], gear: [], gp: 55 }],
};

export const gearOptions = (classId: string): GearOption[] => G[classId] || [];
export const LETTERS = ['A', 'B', 'C'];

/** Texto de una opción con los nombres en español de los datos («Cota de malla, Escudo, Maza, 6 jabalinas… y 7 po»). */
export function gearText(o: GearOption, data: PlayerData): string {
  const armor = o.armor ? data.armor.find((a) => a.en === o.armor)?.n || o.armor : '';
  const ws = o.weapons.map(([en, n]) => { const w = data.weapons.find((x) => x.en === en)?.n || en; return n > 1 ? n + ' × ' + w : w; });
  const items = [armor, o.shield ? 'Escudo' : '', ...ws, ...o.gear].filter(Boolean);
  return (items.length ? items.join(', ') + ' y ' : '') + o.gp + ' po';
}

/** Aplica una opción: armadura y escudo puestos, las armas que no tenga ya y el resto (con el oro) en las notas. */
export function applyGear(c: Character, o: GearOption, letter: string, data: PlayerData, cls: ClassData | undefined): Partial<Character> {
  const armor = o.armor ? data.armor.find((a) => a.en === o.armor) : undefined;
  const have = new Set(c.weapons.map((w) => w.name));
  const weapons = [...c.weapons];
  for (const [en] of o.weapons) {
    const w = data.weapons.find((x) => x.en === en);
    if (w && !have.has(w.n)) { weapons.push(weaponFromData(w, cls)); have.add(w.n); }
  }
  const line = 'Equipo inicial (' + letter + '): ' + gearText(o, data) + '.';
  return {
    ...(armor ? { armorId: armor.id } : {}),
    ...(o.shield ? { shield: true } : {}),
    weapons,
    notes: c.notes ? c.notes.replace(/\s*$/, '') + '\n' + line : line,
    choices: { ...(c.choices || {}), [GEAR_KEY]: [letter] },
  };
}
