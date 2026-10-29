// Añade a public/data/reglas_es.json los «Atajos de reglas» (reglas que existen dentro de otras entradas pero cuesta encontrar:
// Empujar, Combate con dos armas…) y nombres alternativos para buscar. Todo el texto sale de las propias entradas del SRD:
// no se inventa ninguna regla. Es idempotente: se puede ejecutar varias veces. Si se regenera el JSON con rules.py, hay que volver a ejecutarlo.
//
// Uso: node scripts/data/rules_extra.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const file = resolve(dirname(fileURLToPath(import.meta.url)), '../../public/data/reglas_es.json');
const data = JSON.parse(readFileSync(file, 'utf8'));
const CAT = 'Reglas rápidas';
data.e = data.e.filter((e) => e.cat !== CAT);

const find = (n, cat) => {
  const e = data.e.find((x) => x.n === n && (!cat || x.cat === cat));
  if (!e) throw new Error('no existe la entrada: ' + n + (cat ? ' (' + cat + ')' : ''));
  return e;
};
const chunks = (e) => e.t.split(/\n{2,}/);
/** Apartado «### título» hasta el siguiente título, sin el título. */
const section = (e, title) => {
  const cs = chunks(e);
  const i = cs.findIndex((c) => c.trim() === '### ' + title || c.startsWith('### ' + title + '\n'));
  if (i < 0) throw new Error('no existe el apartado «' + title + '» en ' + e.n);
  const out = [];
  const first = cs[i].replace(/^### [^\n]*\n?/, '');
  if (first.trim()) out.push(first);
  for (let j = i + 1; j < cs.length && !cs[j].startsWith('### '); j++) out.push(cs[j]);
  return out.join('\n\n');
};
/** Párrafo que empieza con «**Etiqueta.**». */
const para = (e, label) => {
  const p = chunks(e).find((c) => c.startsWith('**' + label + '**'));
  if (!p) throw new Error('no existe el párrafo «' + label + '» en ' + e.n);
  return p;
};
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const G = (n) => find(n, 'Glosario');
const defs = [
  ['Empujar', 'Shove', ['Empujón', 'Apartar', 'Tirar al suelo'], [[() => para(G('Golpe sin armas'), 'Empujar.')]], ['Golpe sin armas']],
  ['Combate con dos armas', 'Two-Weapon Fighting', ['Dos armas', 'Arma en cada mano', 'Atacar con dos armas', 'Doble arma', 'Ligera'], [[() => section(find('Propiedades', 'Equipo'), 'Ligera')], [() => section(find('Propiedades de maestría', 'Equipo'), 'Mella (Nick)')]], ['Propiedades', 'Propiedades de maestría']],
  ['Disparar con un enemigo cerca', 'Ranged Attacks in Close Combat', ['Ataque a distancia cuerpo a cuerpo', 'Arco con enemigo adyacente', 'Ataque a distancia en combate cercano'], [[() => section(find('Ataques a distancia', 'Combate'), 'Ataques a distancia en combate cercano')]], ['Ataques a distancia']],
  ['Alcance normal y largo', 'Normal and Long Range', ['Distancia', 'Alcance largo', 'Alcance normal', 'Desventaja por distancia'], [[() => section(find('Ataques a distancia', 'Combate'), 'Alcance')]], ['Ataques a distancia']],
  ['Atacar a quien no ves', 'Unseen Attackers and Targets', ['Atacante invisible', 'Objetivo oculto', 'Atacantes y objetivos no vistos', 'Ataque a ciegas', 'Atacar sin ver'], [[() => section(find('Cobertura', 'Combate'), 'Atacantes y objetivos no vistos')]], ['Cobertura']],
  ['Levantarse del suelo', 'Standing Up', ['Levantarse', 'Estar tumbado', 'Tirado en el suelo', 'Prone'], [[() => para(find('Derribado', 'Estados'), 'Movimiento limitado.')]], ['Derribado']],
  ['Muerte instantánea y daño masivo', 'Instant Death', ['Daño masivo', 'Morir de golpe', 'Muerte de monstruo', 'Morir'], [[() => section(find('Caer a 0 puntos de golpe'), 'Muerte instantánea')]], ['Caer a 0 puntos de golpe']],
  ['Montar y desmontar', 'Mounting and Dismounting', ['Montura', 'Jinete', 'Caballo', 'Caerse de la montura', 'Controlar una montura'], [[() => section(find('Combate montado'), 'Montar y desmontar'), () => section(find('Combate montado'), 'Controlar una montura'), () => section(find('Combate montado'), 'Caerse')]], ['Combate montado']],
  ['Un conjuro con espacio por turno', 'One Spell with a Spell Slot per Turn', ['Conjuro de acción adicional', 'Dos conjuros en un turno', 'Acción adicional y conjuro', 'Lanzar dos conjuros'], [[() => section(find('Tiempo de lanzamiento'), 'Un conjuro con espacio de conjuro por turno')]], ['Tiempo de lanzamiento']],
  ['Interacción con objetos en combate', 'Object Interaction', ['Interacción gratuita', 'Desenvainar', 'Sacar un arma', 'Abrir una puerta', 'Equipar un arma', 'Cambiar de arma'], [[() => section(find('Interactuar con objetos'), 'Interacciones con objetos con tiempo limitado'), () => para(G('Ataque'), 'Equipar y desequipar armas.')]], ['Interactuar con objetos', 'Ataque']],
  ['Ventaja y desventaja no se acumulan', 'Advantage and Disadvantage Do Not Stack', ['Acumular ventaja', 'Ventaja y desventaja a la vez', 'Ventaja doble'], [[() => section(find('Ventaja/Desventaja'), 'No se acumulan'), () => section(find('Ventaja/Desventaja'), 'Interacciones con repeticiones')]], ['Ventaja/Desventaja']],
  ['Escapar de un agarre', 'Escaping a Grapple', ['Zafarse', 'Soltarse', 'Agarre', 'Arrastrar a una criatura'], [[() => para(G('Agarrar'), 'Escapar.'), () => para(G('Agarrar'), 'Moverse.'), () => para(G('Agarrar'), 'Un agarre por mano.')]], ['Agarrar']],
];

const out = defs.map(([n, en, al, groups, links]) => {
  const body = groups.flat().map((f) => f()).join('\n\n');
  const see = links.map((l) => { const e = data.e.find((x) => x.n === l && x.cat !== CAT); return '[[' + e.id + '|' + e.n + ']]'; }).join(', ');
  return { id: 'x-' + slug(n), n, en, cat: CAT, al, t: body + '\n\n*Véase también* ' + see + '.' };
});
data.e.unshift(...out);

// nombres alternativos para buscar entradas que ya existen
const ALIAS = [
  ['Golpe sin armas', 'Glosario', ['Ataque desarmado', 'Puñetazo', 'Patada', 'Pelea', 'Unarmed Strike']],
  ['Agarrar', 'Glosario', ['Placar', 'Grapple']],
  ['Dejar inconsciente a una criatura', 'Glosario', ['Noquear', 'Dejar K.O.', 'Primeros auxilios']],
  ['Estable', 'Glosario', ['Estabilizar']],
  ['Combate montado', 'Combate', ['Montura', 'Montar', 'Desmontar', 'Jinete']],
];
for (const [n, cat, add] of ALIAS) {
  const e = find(n, cat);
  e.al = [...new Set([...(e.al || []), ...add])];
}

writeFileSync(file, JSON.stringify(data));
console.log('atajos:', out.length, '| entradas:', data.e.length);
