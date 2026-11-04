import { norm } from './util';

/** Rasgos de clase del SRD: nombre en inglés (como lo escriben los libros) -> nombre en español de la app. */
const PAIRS: [string, string][] = [
  ['Rage', 'Furia'], ['Unarmored Defense', 'Defensa sin armadura'], ['Weapon Mastery', 'Maestría con armas'], ['Danger Sense', 'Sentir el peligro'], ['Reckless Attack', 'Ataque temerario'], ['Primal Knowledge', 'Conocimiento primordial'],
  ['Extra Attack', 'Ataque adicional'], ['Fast Movement', 'Movimiento rápido'], ['Feral Instinct', 'Instinto feroz'], ['Instinctive Pounce', 'Embestida instintiva'], ['Brutal Strike', 'Golpe brutal'], ['Relentless Rage', 'Furia implacable'],
  ['Persistent Rage', 'Furia persistente'], ['Indomitable Might', 'Poderío Indómito'], ['Primal Champion', 'Campeón primordial'],
  ['Bardic Inspiration', 'Inspiración bárdica'], ['Spellcasting', 'Lanzamiento de conjuros'], ['Expertise', 'Pericia'], ['Jack of All Trades', 'Aprendiz de todo'], ['Font of Inspiration', 'Fuente de inspiración'], ['Countercharm', 'Contracanto'],
  ['Magical Secrets', 'Secretos mágicos'], ['Superior Inspiration', 'Inspiración superior'], ['Words of Creation', 'Palabras de creación'],
  ['Divine Order', 'Orden divina'], ['Channel Divinity', 'Canalizar Divinidad'], ['Sear Undead', 'Abrasmar no muertos'], ['Blessed Strikes', 'Golpes benditos'], ['Divine Intervention', 'Intervención divina'],
  ['Improved Blessed Strikes', 'Golpes benditos mejorados'], ['Greater Divine Intervention', 'Intervención divina superior'],
  ['Druidic', 'Druídico'], ['Primal Order', 'Orden primordial'], ['Wild Shape', 'Forma salvaje'], ['Wild Companion', 'Compañero salvaje'], ['Wild Resurgence', 'Resurgimiento salvaje'], ['Elemental Fury', 'Furia elemental'],
  ['Improved Elemental Fury', 'Furia elemental mejorada'], ['Beast Spells', 'Conjuros bestiales'], ['Archdruid', 'Archidruida'],
  ['Fighting Style', 'Estilo de combate'], ['Second Wind', 'Segundo aliento'], ['Action Surge', 'Oleada de acción'], ['Tactical Mind', 'Mente táctica'], ['Tactical Shift', 'Cambio táctico'], ['Indomitable', 'Indomable'],
  ['Tactical Master', 'Maestro táctico'], ['Two Extra Attacks', 'Dos ataques adicionales'], ['Studied Attacks', 'Ataques estudiados'], ['Three Extra Attacks', 'Tres ataques adicionales'],
  ['Martial Arts', 'Artes marciales'], ['Unarmored Strike', 'Golpe sin armas'], ['Monk’s Focus', 'Concentración del monje'], ['Unarmored Movement', 'Movimiento sin armadura'], ['Uncanny Metabolism', 'Metabolismo insólito'],
  ['Deflect Attacks', 'Desviar ataques'], ['Slow Fall', 'Caída lenta'], ['Stunning Strike', 'Golpe aturdidor'], ['Empowered Strikes', 'Golpes potenciados'], ['Evasion', 'Evasión'], ['Acrobatic Movement', 'Movimiento acrobático'],
  ['Heightened Focus', 'Concentración intensificada'], ['Deflect Energy', 'Desviar energía'], ['Disciplined Survivor', 'Superviviente disciplinado'], ['Perfect Focus', 'Concentración perfecta'], ['Superior Defense', 'Defensa superior'], ['Body and Mind', 'Cuerpo y mente'],
  ['Lay On Hands', 'Imposición de manos'], ['Paladin’s Smite', 'Castigo del paladín'], ['Divine Smite', 'Castigo del paladín'], ['Smite', 'Castigo del paladín'], ['Faithful Steed', 'Corcel fiel'], ['Aura of Protection', 'Aura de protección'],
  ['Abjure Foes', 'Abjurar enemigos'], ['Aura of Courage', 'Aura de valor'], ['Radiant Strikes', 'Golpes radiantes'], ['Restoring Touch', 'Toque restaurador'], ['Aura Expansion', 'Expansión del aura'],
  ['Favored Enemy', 'Enemigo predilecto'], ['Deft Explorer', 'Explorador diestro'], ['Roving', 'Errante'], ['Tireless', 'Incansable'], ['Relentless Hunter', 'Cazador implacable'], ['Nature’s Veil', 'Velo de la naturaleza'],
  ['Precise Hunter', 'Cazador preciso'], ['Feral Senses', 'Sentidos ferales'], ['Foe Slayer', 'Azote de enemigos'],
  ['Sneak Attack', 'Ataque furtivo'], ['Thieves’ Cant', 'Jerga de ladrones'], ['Cunning Action', 'Acción astuta'], ['Steady Aim', 'Puntería firme'], ['Cunning Strike', 'Golpe astuto'], ['Uncanny Dodge', 'Esquiva asombrosa'],
  ['Reliable Talent', 'Talento fiable'], ['Improved Cunning Strike', 'Golpe astuto mejorado'], ['Devious Strikes', 'Golpes taimados'], ['Slippery Mind', 'Mente escurridiza'], ['Elusive', 'Escurridizo'], ['Stroke of Luck', 'Golpe de suerte'],
  ['Innate Sorcery', 'Hechicería innata'], ['Font of Magic', 'Fuente de magia'], ['Metamagic', 'Metamagia'], ['Sorcerous Restoration', 'Restauración hechiceril'], ['Sorcery Incarnate', 'Hechicería encarnada'], ['Arcane Apotheosis', 'Apoteosis arcana'],
  ['Eldritch Invocations', 'Invocaciones arcanas'], ['Pact Magic', 'Magia de pacto'], ['Magical Cunning', 'Astucia mágica'], ['Contact Patron', 'Contactar con el patrón'], ['Mystic Arcanum', 'Arcano místico'], ['Eldritch Master', 'Maestro arcano'],
  ['Ritual Adept', 'Adepto a los rituales'], ['Arcane Recovery', 'Recuperación arcana'], ['Scholar', 'Erudito'], ['Memorize Spell', 'Memorizar conjuro'], ['Spell Mastery', 'Maestría de conjuros'], ['Signature Spells', 'Conjuros característicos'],
];
const BY_EN = new Map(PAIRS.map(([en, es]) => [key(en), es]));
function key(s: string) { return norm(s).replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }

/**
 * El nombre en español del rasgo de clase que un rasgo de subclase sustituye («This feature replaces the Lay On Hands
 * feature»). Si ya viene en español o no se conoce, se devuelve tal cual.
 */
export const replacedName = (raw: string): string => BY_EN.get(key(raw.replace(/^[\p{L}]+[’']s\s+/u, ''))) || BY_EN.get(key(raw)) || raw;

/** Los rasgos de un `rep` que coinciden con este (nombre en español, sin tildes ni mayúsculas). */
export const isReplaced = (feature: string, rep: string[]): boolean => rep.some((r) => norm(replacedName(r)) === norm(feature));

/**
 * Los rasgos de clase (en español) que dejan de tener por una subclase de la biblioteca que los sustituye («This feature
 * replaces…»), cada uno con su clase: solo cuentan si ya tienen el rasgo que sustituye (su nivel).
 */
export function replacedFeatures(entries: { classId: string; level: number; subclass?: string }[], libSubs: { cls: string; n: string; f: { lv: number; rep?: string }[] }[]): { cls: string; feature: string }[] {
  return entries.flatMap((e) => {
    const sub = e.subclass ? libSubs.find((s) => s.cls === e.classId && norm(s.n) === norm(e.subclass)) : undefined;
    return (sub?.f || []).filter((f) => f.rep && f.lv <= e.level).map((f) => ({ cls: e.classId, feature: replacedName(f.rep!) }));
  });
}
