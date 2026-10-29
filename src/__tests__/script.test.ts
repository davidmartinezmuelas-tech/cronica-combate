import { describe, expect, it } from 'vitest';
import { linkEncounters } from '../engine/script';
import { mergeImport, normalizeSaved, buildExport, emptySaved } from '../store/persist';

const enc = [{ id: 'e1', name: 'Emboscada goblin' }, { id: 'e2', name: 'Emboscada goblin en el puente' }, { id: 'e3', name: 'Ar' }];

describe('guion de sesión', () => {
  it('convierte en enlace el nombre de un encuentro, sin importar mayúsculas', () => {
    const p = linkEncounters('Al llegar, emboscada GOBLIN. Luego descansan.', enc);
    expect(p).toEqual([{ t: 'text', text: 'Al llegar, ' }, { t: 'enc', text: 'emboscada GOBLIN', id: 'e1' }, { t: 'text', text: '. Luego descansan.' }]);
  });
  it('gana el nombre más largo y no corta palabras ni usa nombres de menos de 3 letras', () => {
    expect(linkEncounters('Emboscada goblin en el puente', enc).filter((x) => x.t === 'enc')).toEqual([{ t: 'enc', text: 'Emboscada goblin en el puente', id: 'e2' }]);
    expect(linkEncounters('Un arbol, un Ar y la Emboscada goblinesca', enc).some((x) => x.t === 'enc')).toBe(false);
  });
  it('un nombre con signos de expresión regular no rompe la búsqueda', () => {
    expect(linkEncounters('Ver (jefe) [final]?', [{ id: 'x', name: '(jefe) [final]?' }]).filter((x) => x.t === 'enc')).toHaveLength(1);
  });
  it('se guarda, se repara y viaja en la copia', () => {
    const n = normalizeSaved({ scripts: [{ id: 's1', title: ' Sesión 1 ', text: 'hola' }, { title: 'sin texto' }, null] });
    expect(n.scripts).toEqual([{ id: 's1', title: 'Sesión 1', text: 'hola' }]);
    expect(normalizeSaved({}).scripts).toEqual([]); // copias antiguas
    const out = buildExport({ ...emptySaved(), scripts: n.scripts }, undefined, undefined);
    const r = mergeImport(JSON.stringify(out), { ...emptySaved(), scripts: [{ id: 's0', title: 'Otro', text: 'x' }] });
    expect(r.scripts!.map((s) => s.id)).toEqual(['s0', 's1']);
  });
});
