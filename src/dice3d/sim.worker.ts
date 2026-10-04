/// <reference lib="webworker" />
import { simulate, type SimInput } from './sim';

// La física se calcula fuera del hilo principal para que la interfaz no se trabe.
self.onmessage = (e: MessageEvent<{ id: number; input: SimInput }>) => {
  const out = simulate(e.data.input);
  (self as unknown as Worker).postMessage({ id: e.data.id, out }, [out.frames.buffer]);
};
