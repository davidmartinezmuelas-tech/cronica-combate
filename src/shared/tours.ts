import type { TourStep } from './Tour';

/** Visita del modo jugador. `goSheet` abre la pestaña de la hoja y `goLibrary` la de la biblioteca. */
export const playerTour = (goSheet: () => void, goLibrary: () => void): TourStep[] => [
  { target: '[data-tour="pc-tabs"]', before: goSheet, title: 'Tus personajes', text: 'Cada personaje es una pestaña. Crea uno nuevo paso a paso o importa tu hoja en PDF rellenable: la app reconoce clase, características, armas, conjuros y dotes. ¿Primera vez? Con la lista vacía, «Probar con un ejemplo» crea una clériga de nivel 3 ya hecha para trastear.' },
  { target: '[data-tour="edit"]', title: 'Editar la hoja', text: 'Aquí eliges especie, clase (y multiclase), subclase, armas, conjuros y dotes. Todo lo que se puede calcular (CA, PG, salvaciones, ataques) se calcula solo.' },
  { target: '[data-tour="rolls"]', title: 'Pulsa para tirar', text: 'Pruebas, salvaciones, habilidades, iniciativa y ataques se tiran pulsándolos, con tus bonificadores. Una «V» verde indica ventaja por un rasgo (Furia, Sentir el peligro…).' },
  { target: '[data-tour="traits"]', title: 'Rasgos, dotes y conjuros', text: 'Pulsa el nombre de cualquier rasgo o conjuro para leer su texto completo. Los círculos llevan la cuenta de sus usos; los descansos los recuperan.' },
  { target: '[data-tour="hp"]', title: 'Daño y curación', text: 'Escribe los PG y pulsa Daño, Curación o PG temporales. Si eliges el tipo de daño, tus resistencias lo reducen a la mitad solas.' },
  { target: '[data-tour="library"]', before: goLibrary, title: 'Tu Manual del Jugador 2024', text: 'El SRD trae una subclase por clase y cuatro trasfondos. Si tienes el Manual del Jugador 2024 en PDF, impórtalo aquí y tendrás todas sus subclases, trasfondos, dotes y conjuros al crear y subir de nivel. Se lee en tu navegador y se queda solo en tu dispositivo.' },
  { target: '[data-tour="table"]', before: goSheet, title: 'Mesa de dados y sala', text: 'Aquí caen tus tiradas. Con el código de tu máster entras en su sala: ve tus tiradas y tus PG, y el daño que te ponga llega a tu hoja.' },
  { target: '[data-tour="header-end"]', title: 'Ajustes y apoyo', text: 'En «Ajustes» tienes la cuenta (tus personajes en la nube y en todos tus dispositivos), la copia de seguridad, el modo, las preferencias y esta visita para repetirla. «Apoyar» lleva a Ko-fi si quieres echar una mano.' },
];

/** Visita del modo máster. `tab` abre una pestaña. */
export const dmTour = (tab: (t: 'combat' | 'bestiary' | 'group' | 'forge') => void): TourStep[] => [
  { target: '.app-nav', title: 'Tu mesa de máster', text: 'Combate, Bestiario (todo el SRD 2024), Grupo (tus jugadores), Forja (tus monstruos) y Reglas, siempre a un clic.' },
  { target: 'section.col-left', before: () => tab('bestiary'), title: 'Bestiario', text: 'Busca en español o en inglés, filtra por tipo o desafío, elige cuántos y pulsa «Al combate». Con «Forjar» creas tus propias criaturas.' },
  { target: 'section.col-left', before: () => tab('group'), title: 'Tu grupo', text: 'Guarda a tus jugadores una vez (con su hoja en PDF si quieres) y añádelos a cada combate con un clic.' },
  { target: 'section.col-center', before: () => tab('combat'), title: 'Prepara y lleva el combate', text: 'Antes del combate, la guía te lleva paso a paso y propone encuentros. Durante el combate, aquí está el turno de quien juega con «Siguiente turno», su tarjeta (daño, estados) y la ficha del monstruo. ¿Primera vez? «Probar con un ejemplo» monta un combate de muestra en un clic.' },
  { target: 'section.col-left', title: 'Iniciativa', text: 'La lista se ordena sola. Tira la de los monstruos (en grupo o individual) y escribe la de los jugadores. Pulsa a alguien para ver su tarjeta.' },
  { target: '.statblock, section.col-center', title: 'Fichas de monstruo', text: 'Sus ataques y daños se tiran pulsándolos. Los efectos con salvación (alientos, conjuros) dejan elegir objetivos, tiran sus salvaciones y aplican daño y estados.' },
  { target: 'section.col-right', title: 'Sala y dados', text: 'Crea una sala y pasa el código a tus jugadores: verás sus tiradas y sus PG en directo, y les puedes pedir salvaciones.' },
  { target: '.hdr-actions', title: 'Deshacer, ajustes y apoyo', text: 'La flecha deshace el último cambio (Ctrl+Z). En «Ajustes» están la cuenta (tus criaturas, encuentros y grupo en la nube), la copia de seguridad de todo, el modo, las preferencias, esta visita y los atajos de teclado. «Apoyar» lleva a Ko-fi.' },
];
