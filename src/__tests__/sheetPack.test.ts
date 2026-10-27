import { describe, expect, it } from 'vitest';
import { blankCharacter } from '../engine/character';
import { buildPack } from '../engine/sheetPack';
import { useLibrary } from '../store/library';

const bookSub = { id: 'b1', n: 'Juramento de prueba', cls: 'paladin', d: 'Texto largo del libro.', f: [{ lv: 3, n: 'Voto', d: 'Una vez por descanso largo, haces algo con un texto con derechos.' }] };
const ownSub = { id: 'o1', n: 'Mía', cls: 'fighter', d: 'mi texto', f: [{ lv: 3, n: 'Golpe', d: 'mío', u: { max: '@prof', per: 'lr' } }], own: true };
const bookSpell = { id: 's1', n: 'Rayo del libro', l: 1, esc: 'Evocación', classes: ['paladin'], ct: 'Acción', r: '60 pies', cmp: 'V', du: 'Instantáneo', c: 0, rit: 0, t: 'Haz un ataque de conjuro a distancia. Si impacta, 2d8 de daño de fuego.' };

describe('la hoja que el jugador manda a la sala', () => {
  it('lleva su personaje sin notas, sus creaciones enteras y lo del libro sin texto (con usos y tiradas)', () => {
    const c = { ...blankCharacter(), name: 'Ana', classId: 'paladin', level: 3, subclass: 'Juramento de prueba', spells: ['s1'], notes: 'secreto' };
    const p = buildPack(c, null, { subclasses: [bookSub, ownSub], spells: [bookSpell], backgrounds: [], feats: [] }, []);
    expect(p.char.notes).toBe('');
    expect(p.subs).toHaveLength(1);
    expect(p.subs[0].d).toBe('');
    expect(p.subs[0].f[0].d).toBe('');
    expect(p.subs[0].f[0].n).toBe('Voto');
    expect(p.spells[0].t).toBe('');
    expect(p.spells[0].sr?.attack).toBe('a distancia');
    expect(p.spells[0].sr?.damage?.dice).toBe('2d8');
    expect(JSON.stringify(p)).not.toContain('derechos');
  });

  it('los objetos mágicos del libro salen sin texto ni traducción y los propios, enteros', () => {
    const base = { n: 'x', kind: 'ring' as const, rarity: 'raro', attune: true, attuned: true, worn: true, mods: [{ k: 'ac' as const, v: 1 }] };
    const c = { ...blankCharacter(), name: 'Ana', magicItems: [{ ...base, id: 'mi-1', n: 'Del libro', d: 'Texto con derechos.', dEn: 'English text', book: true }, { ...base, id: 'mi-2', n: 'Mío', d: 'Lo escribí yo.' }] };
    const p = buildPack(c, null, { subclasses: [], spells: [], backgrounds: [], feats: [] }, []);
    expect(p.char.magicItems![0]).toMatchObject({ n: 'Del libro', d: '', mods: [{ k: 'ac', v: 1 }] });
    expect(JSON.stringify(p)).not.toContain('derechos');
    expect(JSON.stringify(p)).not.toContain('English text');
    expect(p.char.magicItems![1].d).toBe('Lo escribí yo.');
  });

  it('en el máster, lo que llega de paso no se guarda ni se exporta y se va al quitarlo', async () => {
    await useLibrary.getState().init();
    await useLibrary.getState().save({ subclasses: [], spells: [] });
    useLibrary.getState().setGuest('u1', { subs: [ownSub], spells: [{ ...bookSpell, t: '' }], bgs: [], feats: [] });
    expect(useLibrary.getState().subclasses.map((s) => s.id)).toEqual(['o1']);
    expect(useLibrary.getState().subclasses[0].guest).toBe(true);
    expect(JSON.parse(useLibrary.getState().exportText()).subclasses).toEqual([]);
    // guardar otra cosa no se lleva lo de paso al disco
    await useLibrary.getState().save({ spells: useLibrary.getState().spells });
    expect(JSON.parse(useLibrary.getState().exportText()).spells).toEqual([]);
    useLibrary.getState().setGuest('u1', null);
    expect(useLibrary.getState().subclasses).toEqual([]);
  });
});
