import { describe, expect, it } from 'vitest';
import { linkEncounters, parseInline, parseMarkdown } from '../engine/script';
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
  it('Markdown: títulos, listas, citas, líneas y párrafos', () => {
    const b = parseMarkdown(['# Acto 1', 'Texto', 'en dos líneas', '', '- uno', '  - sub', '- dos', '1. a', '2. b', '> cita', '---', '```', '# no es título', '```'].join('\n'));
    expect(b.map((x) => x.t)).toEqual(['h', 'p', 'list', 'list', 'quote', 'hr', 'code']);
    expect(b[1]).toMatchObject({ t: 'p', inl: [{ text: 'Texto\nen dos líneas' }] });
    expect(b[2]).toMatchObject({ ordered: false, items: [{ depth: 0 }, { depth: 1 }, { depth: 0 }] });
    expect(b[3]).toMatchObject({ ordered: true });
    expect(b[6]).toEqual({ t: 'code', text: '# no es título' });
  });
  it('Markdown en línea: negrita, cursiva y código; lo que no cierra queda igual', () => {
    expect(parseInline('a **b** _c_ `d` *e*')).toEqual([{ text: 'a ' }, { text: 'b', b: true }, { text: ' ' }, { text: 'c', i: true }, { text: ' ' }, { text: 'd', code: true }, { text: ' ' }, { text: 'e', i: true }]);
    expect(parseInline('2 * 3 y snake_case_nombre y **sin cerrar')).toEqual([{ text: '2 * 3 y snake_case_nombre y **sin cerrar' }]);
    expect(parseInline('**negrita _y cursiva_**')).toEqual([{ text: 'negrita ', b: true }, { text: 'y cursiva', b: true, i: true }]);
  });
});
