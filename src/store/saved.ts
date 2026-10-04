import { SCHEMA_VERSION } from '../data/constants';
import type { SavedState } from '../data/types';
import type { State } from './state';

/** La parte del estado que se guarda en el dispositivo y va en las copias. */
export const savedSlice = (s: State): SavedState => ({
  v: SCHEMA_VERSION, custom: s.custom, roster: s.roster, combatants: s.combatants, round: s.round, activeId: s.activeId, started: s.started,
  log: s.log.slice(0, 30), diceTheme: s.diceTheme, turnEvents: s.turnEvents, encounters: s.encounters, dice3d: s.dice3d,
});
