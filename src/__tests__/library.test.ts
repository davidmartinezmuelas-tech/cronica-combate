import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';

const cls = (id: string, n: string) => ({ id, n, en: n, hd: 10, saves: [], skills: { count: 2, pool: [] }, armor: [], weapons: [], caster: 'none' as const, spellAb: '' as const, primary: [], asi: [], f: [], sc: {}, sub: null, d: '', spells: [], own: true });

describe('biblioteca: clases', () => {
  it('guarda, exporta, importa y suma las clases a los datos del jugador', async () => {
    await useLibrary.getState().init();
    usePlayer.setState({ srd: { classes: [{ ...cls('fighter', 'Guerrero'), own: undefined }] } as never, data: { classes: [{ ...cls('fighter', 'Guerrero'), own: undefined }] } as never });
    await useLibrary.getState().save({ classes: [cls('dk', 'Caballero de la Muerte')] });
    expect(usePlayer.getState().data!.classes.map((c) => c.id)).toEqual(['fighter', 'dk']);
    const text = useLibrary.getState().exportText();
    expect(JSON.parse(text).classes).toHaveLength(1);
    // quitarla de la biblioteca la quita de los datos; importar el archivo la devuelve
    await useLibrary.getState().save({ classes: [] });
    expect(usePlayer.getState().data!.classes.map((c) => c.id)).toEqual(['fighter']);
    expect(await useLibrary.getState().importText(text)).toMatch(/1 clases/);
    expect(usePlayer.getState().data!.classes.map((c) => c.id)).toEqual(['fighter', 'dk']);
    // las del SRD mandan si coincide el id
    await useLibrary.getState().save({ classes: [cls('fighter', 'Otro Guerrero'), cls('dk', 'Caballero de la Muerte')] });
    expect(usePlayer.getState().data!.classes.find((c) => c.id === 'fighter')!.n).toBe('Guerrero');
  });
});
