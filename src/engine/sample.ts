import type { PlayerData } from '../data/player';
import { blankCharacter, derive, weaponFromData, type Character } from './character';

/**
 * Personaje de ejemplo para quien llega nuevo: una clériga de nivel 3 con todo puesto (armadura, arma, conjuros y
 * subclase) para ver la hoja funcionando sin rellenar nada. Datos inventados; las reglas, del SRD 2024.
 */
export function sampleCharacter(data: PlayerData): Character {
  const c = blankCharacter();
  const cls = data.classes.find((x) => x.id === 'cleric');
  const mace = data.weapons.find((w) => w.en === 'Mace');
  const armor = data.armor.find((a) => a.en === 'Scale Mail');
  const out: Character = {
    ...c,
    name: 'Brenna (ejemplo)',
    player: 'Ejemplo',
    speciesId: 'human',
    classId: 'cleric',
    level: 3,
    subclass: cls?.sub?.n || '',
    backgroundId: 'acolyte',
    abil: { str: 14, dex: 10, con: 13, int: 8, wis: 16, cha: 12 },
    skills: ['ins', 'med', 'rel', 'per'],
    armorId: armor?.id || '',
    shield: true,
    weapons: mace ? [weaponFromData(mace, cls)] : [],
    // trucos: Llama sagrada, Guía, Salvar a los moribundos; preparados: Saeta guía, Escudo de fe, Arma espiritual
    spells: ['sp-phbsplSacredFlam', 'sp-phbsplGuidance00', 'sp-phbsplSparetheDy', 'sp-phbsplGuidingBol', 'sp-phbsplShieldofFa', 'sp-phbsplSpiritualW'],
    langs: 'Común, Celestial',
    notes: 'Personaje de ejemplo: pulsa en las tiradas, gasta espacios de conjuro, recibe daño o sube de nivel para ver cómo funciona la hoja. Bórralo cuando quieras desde «Editar hoja».',
  };
  return { ...out, hp: derive(out, data).hpMax };
}
