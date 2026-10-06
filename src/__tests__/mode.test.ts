import { afterEach, describe, expect, it } from 'vitest';
import { chooseMode, modeFromLocation } from '../app/mode';

describe('modo de la app', () => {
  afterEach(() => { localStorage.clear(); window.location.hash = ''; });

  it('la dirección manda: #/dm, #/jugador o #/inicio para elegir', () => {
    localStorage.setItem('cronica-modo', 'player');
    expect(modeFromLocation('#/dm')).toBe('dm');
    expect(modeFromLocation('#/jugador')).toBe('player');
    expect(modeFromLocation('#/inicio')).toBeNull();
  });

  it('sin dirección usa el último modo elegido; la primera vez, ninguno', () => {
    expect(modeFromLocation('')).toBeNull();
    chooseMode('dm');
    expect(window.location.hash).toBe('#/dm');
    expect(modeFromLocation('')).toBe('dm');
  });
});
