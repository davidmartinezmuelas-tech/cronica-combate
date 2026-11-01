import { norm } from './util';

/**
 * Nombre en inglés de los conjuros del Manual del Jugador 2024 que no están en el SRD. El PDF del usuario solo trae
 * el nombre en español, y las hojas en inglés los escriben con el original: así se reconocen de las dos formas.
 */
const PHB_EN: [string, string][] = [
  ['Amistad', 'Friends'], ['Arma elemental', 'Elemental Weapon'], ['Armadura de Agathys', 'Armor of Agathys'], ['Aura de pureza', 'Aura of Purity'],
  ['Aura de vitalidad', 'Aura of Vitality'], ['Aura mágica de Nystul', "Nystul's Magic Aura"], ['Baile irresistible de Otto', "Otto's Irresistible Dance"],
  ['Brazos de Hadar', 'Arms of Hadar'], ['Caldero burbujeante de Tasha', "Tasha's Bubbling Cauldron"], ['Carcaj veloz', 'Swift Quiver'],
  ['Castigo abrumador', 'Staggering Smite'], ['Castigo atronador', 'Thunderous Smite'], ['Castigo cegador', 'Blinding Smite'],
  ['Castigo desterrador', 'Banishing Smite'], ['Castigo furioso', 'Wrathful Smite'], ['Círculo de poder', 'Circle of Power'],
  ['Cofre oculto de Leomund', "Leomund's Secret Chest"], ['Conjurar descarga de proyectiles', 'Conjure Barrage'], ['Conjurar lluvia de flechas', 'Conjure Volley'],
  ['Cordón de flechas', 'Cordon of Arrows'], ['Corona de la locura', 'Crown of Madness'], ['Duelo forzado', 'Compelled Duel'],
  ['Enlace telepático de Rary', "Rary's Telepathic Bond"], ['Enredadera', 'Grasping Vine'], ['Esfera congelante de Otiluke', "Otiluke's Freezing Sphere"],
  ['Esfera elástica de Otiluke', "Otiluke's Resilient Sphere"], ['Espada de Mordenkainen', "Mordenkainen's Sword"], ['Estática sináptica', 'Synaptic Static'],
  ['Excursión etérea', 'Etherealness'], ['Fingir muerte', 'Feign Death'], ['Flecha ácida de Melf', "Melf's Acid Arrow"], ['Flecha de relámpago', 'Lightning Arrow'],
  ['Fragmento mental', 'Mind Sliver'], ['Fuente de luz lunar', 'Fount of Moonlight'], ['Golpe apresador', 'Ensnaring Strike'], ['Golpe de viento acerado', 'Steel Wind Strike'],
  ['Guardia de cuchillas', 'Blade Ward'], ['Hambre de Hadar', 'Hunger of Hadar'], ['Invocación instantánea de Drawmij', "Drawmij's Instant Summons"],
  ['Invocar aberración', 'Summon Aberration'], ['Invocar autómata', 'Summon Construct'], ['Invocar bestia', 'Summon Beast'], ['Invocar celestial', 'Summon Celestial'],
  ['Invocar elemental', 'Summon Elemental'], ['Invocar feérico', 'Summon Fey'], ['Invocar infernal', 'Summon Fiend'], ['Invocar muerto viviente', 'Summon Undead'],
  ['Látigo de espinas', 'Thorn Whip'], ['Llamar al relámpago', 'Call Lightning'], ['Mal de ojo', 'Eyebite'], ['Mano de Bigby', "Bigby's Hand"],
  ['Mansión magnífica de Mordenkainen', "Mordenkainen's Magnificent Mansion"], ['Manto del cruzado', "Crusader's Mantle"], ['Mastín fiel de Mordenkainen', "Mordenkainen's Faithful Hound"],
  ['Nube de dagas', 'Cloud of Daggers'], ['Ola destructora', 'Destructive Wave'], ['Palabra de poder: fortalecer', 'Power Word Fortify'], ['Palabra de resplandor', 'Word of Radiance'],
  ['Pequeña choza de Leomund', "Leomund's Tiny Hut"], ['Perdición', 'Bane'], ['Presencia regia de Yolande', "Yolande's Regal Presence"], ['Puerta arcana', 'Arcane Gate'],
  ['Rayo de hechicería', 'Chaos Bolt'], ['Relámpago en cadena', 'Chain Lightning'], ['Risa horrible de Tasha', "Tasha's Hideous Laughter"], ['Saber druídico', 'Druidcraft'],
  ['De Mordenkainen', "Mordenkainen's Private Sanctum"], ['Santuario privado de Mordenkainen', "Mordenkainen's Private Sanctum"], ['Sentidos de la bestia', 'Beast Sense'], ['Tañido por los muertos', 'Toll the Dead'], ['Telepatía', 'Telepathy'],
  ['Tentáculos negros de Evard', "Evard's Black Tentacles"], ['Tormenta de espinas', 'Hail of Thorns'], ['Tormenta resplandeciente de Jallarzi', "Jallarzi's Storm of Radiance"], ['Tronar', 'Thunderclap'],
];
const EN = new Map(PHB_EN.map(([es, en]) => [norm(es), en]));

/** Nombre en inglés de un conjuro del libro del usuario, si se conoce y no es el de un conjuro del SRD (que ya lo lleva). */
export const libSpellEn = (nameEs: string, srdEn: Set<string>): string => {
  const en = EN.get(norm(nameEs)) || '';
  return en && !srdEn.has(norm(en)) ? en : '';
};
