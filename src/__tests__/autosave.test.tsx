import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import App from '../App';
import { loadSaved } from '../store/persist';
import { useStore } from '../store/useStore';

// el bestiario SRD tarda en llegar (conexión lenta): la descarga no termina durante la prueba
beforeAll(() => {
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  window.location.hash = '#/dm';
});
vi.mock('virtual:pwa-register', () => ({ registerSW: () => () => {} }));
afterEach(cleanup);

it('lo que se cambia mientras se descarga el SRD también se guarda', async () => {
  render(<App />);
  await act(async () => { await vi.waitFor(() => expect(useStore.getState().hydrated).toBe(true)); });
  expect(useStore.getState().loaded).toBe(false);
  const pc = { ...useStore.getState().pcForm, id: 'pc-1', name: 'Jimena' };
  act(() => useStore.setState({ roster: [pc] }));
  await act(async () => {
    await vi.waitFor(async () => expect((await loadSaved()).data.roster.map((r) => r.name)).toEqual(['Jimena']), { timeout: 2000 });
  });
});
