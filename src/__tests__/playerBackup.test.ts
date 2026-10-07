import { beforeEach, describe, expect, it } from 'vitest';
import { blankCharacter } from '../engine/character';
import { usePlayer } from '../store/player';

const pj = (id: string, name: string, updatedAt: number) => ({ ...blankCharacter(), id, name, updatedAt });

describe('copia de seguridad de personajes', () => {
  beforeEach(async () => {
    await usePlayer.getState().init();
    usePlayer.setState({ characters: [pj('pj-a', 'Ana', 100), pj('pj-b', 'Bru', 500)], activeId: 'pj-a' });
  });

  it('exporta todos o solo los elegidos', () => {
    const all = JSON.parse(usePlayer.getState().exportText());
    expect([all.tipo, all.characters.map((c: { name: string }) => c.name)]).toEqual(['personajes', ['Ana', 'Bru']]);
    expect(JSON.parse(usePlayer.getState().exportText(['pj-b'])).characters.map((c: { name: string }) => c.name)).toEqual(['Bru']);
  });

  it('al cargar: añade los nuevos, actualiza los más recientes y no pisa cambios más nuevos del dispositivo', async () => {
    const file = JSON.stringify({ app: 'cronica-combate', tipo: 'personajes', v: 1, exportedAt: 1, characters: [pj('pj-a', 'Ana nueva', 200), pj('pj-b', 'Bru viejo', 300), pj('pj-c', 'Cai', 50)] });
    const msg = await usePlayer.getState().importText(file);
    expect(msg).toBe('Copia cargada: 1 personaje nuevo, 1 actualizado, 1 sin cambios (en este dispositivo ya estaba igual o más reciente).');
    expect(usePlayer.getState().characters.map((c) => c.name).sort()).toEqual(['Ana nueva', 'Bru', 'Cai']);
    // los campos que faltan en una copia antigua se completan
    expect(usePlayer.getState().characters.find((c) => c.id === 'pj-c')!.choices).toEqual({});
  });

  it('rechaza archivos que no son una copia de personajes', async () => {
    expect(await usePlayer.getState().importText('no es json')).toMatch(/no es una copia/);
    expect(await usePlayer.getState().importText(JSON.stringify({ tipo: 'biblioteca', characters: [] }))).toMatch(/no es una copia/);
  });
});
