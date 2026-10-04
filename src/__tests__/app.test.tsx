import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { saveNow, useStore } from '../store/useStore';
import { loadSaved } from '../store/persist';

const json = readFileSync(resolve(process.cwd(), 'public/data/srd52_es.json'), 'utf8');

beforeAll(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(json, { status: 200, headers: { 'Content-Type': 'application/json' } })));
  window.matchMedia = ((q: string) => ({ matches: q.includes('reduced-motion'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
vi.mock('virtual:pwa-register', () => ({ registerSW: () => () => {} }));
afterEach(cleanup);

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

describe('flujo completo de un combate', () => {
  it('prepara, juega, deshace y guarda', async () => {
    render(<App />);
    await flush();
    await act(async () => { await vi.waitFor(() => expect(useStore.getState().loaded).toBe(true)); });
    expect(screen.getByText('Prepara el encuentro')).toBeTruthy();

    // 1. Añadir dos goblins y un dragón desde el bestiario
    fireEvent.click(screen.getByRole('button', { name: 'Bestiario' }));
    fireEvent.change(screen.getByLabelText('Buscar (español o inglés)'), { target: { value: 'dragón rojo adulto' } });
    const card = screen.getByText('Dragón rojo adulto', { selector: '.beast-name' }).closest('li')!;
    fireEvent.click(within(card).getByRole('button', { name: 'Al combate' }));
    const s = useStore.getState();
    const gob = s.srd.find((m) => m.id === 'goblin-warrior')!;
    act(() => s.addMonster(gob, 2));
    expect(useStore.getState().combatants.map((c) => c.name)).toEqual(['Dragón rojo adulto', 'Guerrero goblin 1', 'Guerrero goblin 2']);

    // 2. Iniciativa (movimiento reducido: sin animación)
    act(() => useStore.getState().rollInit());
    expect(useStore.getState().combatants.every((c) => c.init != null)).toBe(true);

    // 3. Jugador guardado
    fireEvent.click(screen.getByRole('button', { name: 'Grupo' }));
    fireEvent.change(screen.getByLabelText('Personaje'), { target: { value: 'Jimena' } });
    fireEvent.change(screen.getByLabelText('Nivel total'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('PG máx.'), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar jugador' }));
    fireEvent.click(screen.getByRole('button', { name: 'Al combate' }));
    const pc = useStore.getState().combatants.find((c) => c.kind === 'pc')!;
    act(() => useStore.getState().patchC(pc.id, { init: 14 }));

    // 4. Empezar
    fireEvent.click(screen.getByRole('button', { name: 'Combate' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Empezar combate' })[0]);
    expect(useStore.getState().started).toBe(true);
    expect(screen.getByText(/inicio de turno/)).toBeTruthy();

    // 5. Aliento de fuego a Jimena (mitad) y deshacer
    const dragon = useStore.getState().combatants.find((c) => c.monsterId === 'adult-red-dragon')!;
    act(() => useStore.getState().set({ selId: dragon.id }));
    fireEvent.click(screen.getByRole('button', { name: /Daño 17d6 fuego/ }));
    expect(useStore.getState().combatants.find((c) => c.id === dragon.id)!.spent['ac_2']).toBe(true);
    const total = useStore.getState().result!.parts[0].amt;
    fireEvent.click(screen.getByRole('button', { name: /^Jimena/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Jimena/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar daño' }));
    const hpAfter = useStore.getState().combatants.find((c) => c.kind === 'pc')!.hp;
    expect(hpAfter).toBe(Math.max(0, 60 - Math.floor(total / 2)));
    fireEvent.click(screen.getByRole('button', { name: /Deshacer: aplicar daño/ }));
    expect(useStore.getState().combatants.find((c) => c.kind === 'pc')!.hp).toBe(60);

    // 6. Pasar turnos dando la vuelta
    for (let i = 0; i < 5; i++) act(() => useStore.getState().step(1));
    expect(useStore.getState().round).toBe(2);

    // 7. Guardado en IndexedDB
    await act(async () => { await saveNow(); });
    const { data } = await loadSaved();
    expect(data.roster.map((r) => r.name)).toEqual(['Jimena']);
    expect(data.combatants).toHaveLength(4);
    expect(data.started).toBe(true);
  });

  it('herramientas del DM: CD del conjuro, daño alternativo y aviso de concentración', async () => {
    render(<App />);
    await flush();
    await act(async () => { await vi.waitFor(() => expect(useStore.getState().loaded).toBe(true)); });
    act(() => useStore.getState().set({ combatants: [], started: false, encounters: [], concPrompts: [] }));
    const gob = useStore.getState().srd.find((m) => m.id === 'goblin-warrior')!;
    act(() => useStore.getState().addMonster(gob, 1));
    const g = useStore.getState().combatants[0];
    act(() => useStore.getState().set({ selId: g.id, tab: 'combat' }));

    // salvación contra la CD del conjuro
    fireEvent.change(screen.getByLabelText('CD del conjuro del jugador'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvación de Destreza/ }));
    expect(useStore.getState().result!.note).toMatch(/^Falla la CD 30\./);
    fireEvent.change(screen.getByLabelText('CD del conjuro del jugador'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvación de Destreza/ }));
    expect(useStore.getState().result!.note).toMatch(/^Supera la CD 1\./);

    // botón de daño con ventaja
    fireEvent.click(screen.getAllByRole('button', { name: /^Daño con ventaja: 1d6 \+ 2 cortante \+ 1d4 cortante/ })[0]);
    expect(useStore.getState().result!.label).toBe('Guerrero goblin · Cimitarra: daño con ventaja');

    // aviso de concentración de un jugador (sin tirada)
    act(() => useStore.getState().set({ concPrompts: [{ pid: 'p1', id: 'x', name: 'Jimena', dc: 12, save: null }] }));
    expect(screen.getByRole('alert').textContent).toBe('Jimena ha recibido daño: tiene que sacar 12 o más en la salvación de Constitución para mantener la concentración.MantieneLa pierde');
    expect(screen.queryByRole('button', { name: /^Tirar \(CON/ })).toBeNull();
  });

  it('la ayuda de atajos se abre con ?', async () => {
    render(<App />);
    await flush();
    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
