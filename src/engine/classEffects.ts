import type { Abil } from '../data/player';
import { norm } from './util';

/** Lo que piden los efectos de clase al personaje: sus clases con nivel y subclase, elecciones y estados. */
interface FxChar { entries: { classId: string; level: number; subclass: string }[]; choices?: Record<string, string[]>; conds: string[]; cha: number }

/** Efectos de los rasgos de clase y subclase que cambian números o tiradas de la hoja (reglas 2024). */
export interface ClassFx {
  abil: Partial<Record<Abil, number>>; // +N a la puntuación (máximo 25): Campeón primordial, Cuerpo y mente
  saveProfAll: string; // competencia en todas las salvaciones (nombre del rasgo)
  saveProf: { abil: Abil; why: string }[]; // competencias en salvaciones concretas
  saveBonus: { n: number; why: string } | null; // +N a todas las salvaciones (Aura de protección)
  saveAdv: Partial<Record<Abil, string>>; // ventaja en salvaciones (motivo)
  checkAdv: Partial<Record<Abil, string>>; // ventaja en pruebas de característica (Furia: Fuerza)
  skillAdv: Record<string, string>; // ventaja en habilidades concretas
  initAdv: string; // ventaja en iniciativa (motivo)
  halfProf: string; // + mitad de competencia a pruebas sin competencia (Aprendiz de todo)
  reliable: string; // en habilidades con competencia el d20 cuenta como 10 como mínimo (Talento fiable)
  speed: { n: number; why: string; noHeavy: boolean }[];
  resist: { type: string; why: string }[];
  rage: boolean; // en Furia (estado «Furia»)
}

const B_P_S = ['contundente', 'cortante', 'perforante'];

/** Ascendencias dracónicas (2024): color y tipo de daño de su resistencia y su aliento. */
export const DRACONIC_ANCESTRY: [string, string][] = [
  ['Azul', 'relámpago'], ['Blanco', 'frío'], ['Bronce', 'relámpago'], ['Cobre', 'ácido'], ['Latón', 'fuego'],
  ['Negro', 'ácido'], ['Oro', 'fuego'], ['Plata', 'frío'], ['Rojo', 'fuego'], ['Verde', 'veneno'],
];

/** Resistencias de la especie: enano (veneno), tiefling según su legado y dracónido según su ascendencia elegida. */
export function speciesResist(speciesId: string, choices?: Record<string, string[]>): { type: string; why: string }[] {
  if (speciesId === 'dwarf') return [{ type: 'veneno', why: 'Resistencia enana' }];
  const tiefling: Record<string, string> = { 'tiefling-abyssal': 'veneno', 'tiefling-chthonic': 'necrótico', 'tiefling-infernal': 'fuego' };
  if (tiefling[speciesId]) return [{ type: tiefling[speciesId], why: 'Legado infernal' }];
  if (speciesId === 'dragonborn') {
    const t = DRACONIC_ANCESTRY.find(([n]) => n === choices?.['species.ancestry']?.[0])?.[1];
    return t ? [{ type: t, why: 'Resistencia dracónica' }] : [];
  }
  return [];
}

export function classEffects(c: FxChar): ClassFx {
  const fx: ClassFx = { abil: {}, saveProfAll: '', saveProf: [], saveBonus: null, saveAdv: {}, checkAdv: {}, skillAdv: {}, initAdv: '', halfProf: '', reliable: '', speed: [], resist: [], rage: false };
  const lv = (id: string) => c.entries.find((e) => e.classId === id)?.level || 0;
  const sub = (id: string, ...names: string[]) => names.some((n) => norm(n) === norm(c.entries.find((e) => e.classId === id)?.subclass || ''));
  const add = (k: Abil, n: number) => { fx.abil[k] = (fx.abil[k] || 0) + n; };

  // bárbaro
  if (lv('barbarian') >= 2) fx.saveAdv.dex = 'Sentir el peligro';
  if (lv('barbarian') >= 7) fx.initAdv = 'Instinto feroz';
  if (lv('barbarian') >= 20) { add('str', 4); add('con', 4); }
  fx.rage = lv('barbarian') > 0 && c.conds.includes('Furia');
  if (fx.rage) {
    B_P_S.forEach((t) => fx.resist.push({ type: t, why: 'Furia' }));
    fx.saveAdv.str = 'Furia';
    fx.checkAdv.str = 'Furia';
  }
  // bardo
  if (lv('bard') >= 2) fx.halfProf = 'Aprendiz de todo';
  // guerrero campeón
  if (lv('fighter') >= 3 && sub('fighter', 'Campeón', 'Champion')) { fx.initAdv = fx.initAdv || 'Atleta notable'; fx.skillAdv.ath = 'Atleta notable'; }
  // monje
  if (lv('monk') >= 14) fx.saveProfAll = 'Superviviente disciplinado';
  if (lv('monk') >= 20) { add('dex', 4); add('wis', 4); }
  // paladín: Aura de protección (también a sí mismo)
  if (lv('paladin') >= 6) fx.saveBonus = { n: Math.max(1, c.cha), why: 'Aura de protección' };
  // explorador
  if (lv('ranger') >= 6) fx.speed.push({ n: 10, why: 'Errante', noHeavy: true });
  // pícaro
  if (lv('rogue') >= 7) fx.reliable = 'Talento fiable';
  if (lv('rogue') >= 15) { fx.saveProf.push({ abil: 'wis', why: 'Mente escurridiza' }, { abil: 'cha', why: 'Mente escurridiza' }); }
  // brujo infernal y hechicero dracónico: la resistencia elegida
  if (lv('warlock') >= 10 && sub('warlock', 'Patrón infernal', 'Fiend Patron')) (c.choices?.['fiend.resistance'] || []).slice(0, 1).forEach((t) => fx.resist.push({ type: t, why: 'Resiliencia infernal' }));
  if (lv('sorcerer') >= 6 && sub('sorcerer', 'Hechicería dracónica', 'Draconic Sorcery')) (c.choices?.['draconic.affinity'] || []).slice(0, 1).forEach((t) => fx.resist.push({ type: t, why: 'Afinidad elemental' }));
  return fx;
}
