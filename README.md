# Crónica de Combate

Gestor de combate para la mesa del máster, pensado para la **5.ª edición (reglas de 2024)**: bestiario completo del SRD 5.2.1 en español, hojas de monstruo interactivas, iniciativa automática, seguimiento de turnos y dados animados.

Funciona en el navegador, se puede **instalar como app** (PWA) y sigue funcionando **sin conexión**. Todos los datos se guardan en tu dispositivo.

## Qué hace

- **Bestiario**: las 341 criaturas del SRD 5.2.1 traducidas, con búsqueda en español o inglés y filtros por tipo, desafío y legendarios.
- **Forja**: crea tus propios monstruos o parte de uno oficial («Usar de base»), con ataques, salvaciones, recargas, usos por día, conjuros y acciones legendarias.
- **Iniciativa**: tirada automática para los monstruos (con opción de grupo y de sorpresa), casilla para la tirada de cada jugador y orden automático.
- **Turnos**: tarjeta de inicio de turno con recordatorios (recargas tiradas solas, regeneración, legendarias, estados que caducan, salvaciones de muerte).
- **Daño y curación**: resistencias, inmunidades y vulnerabilidades por tipo, PG temporales, concentración, daño a varios objetivos con mitad por salvación, muerte instantánea.
- **Estados**: con duración en rondas; las tiradas de los monstruos aplican solas la desventaja, los fallos automáticos y el agotamiento.
- **Grupo**: guarda a tus jugadores una vez y añádelos a cada combate.
- **Dificultad**: presupuesto de PX de 2024 según el nivel del grupo.
- **Deshacer** casi cualquier acción y **atajos de teclado** (pulsa `?`).
- **Copias de seguridad** en archivo `.json` que se fusionan al cargarlas.

## Desarrollo

Requisitos: Node 20 o superior.

```bash
npm install
npm run dev        # servidor de desarrollo en http://localhost:5173
npm test           # tests (motor de reglas, guardado y flujo completo)
npm run build      # build de producción en dist/
npm run preview    # sirve el build
```

### Estructura

```
src/
  engine/      reglas puras y testeadas: dados, combate, forja, utilidades
  store/       estado (Zustand) con deshacer, guardado en IndexedDB, import/export
  components/  interfaz (React)
  hooks/       atajos de teclado
  data/        tipos y constantes del reglamento
public/data/   bestiario SRD 5.2.1 en español (JSON)
```

El motor de reglas (`src/engine`) no depende de React: se puede reutilizar en una app móvil o en un servidor.

## Publicar

El repositorio incluye un flujo de GitHub Actions (`.github/workflows/deploy.yml`) que pasa los tests, compila y publica en **GitHub Pages** en cada push a `main`. Actívalo en *Settings → Pages → Source: GitHub Actions*.

Para otro alojamiento (Netlify, Vercel, Cloudflare Pages) basta con publicar la carpeta `dist/`. Si se sirve en una subruta, compila con `BASE_PATH=/subruta/ npm run build`.

## Licencias y atribución

El código de la aplicación es del autor del repositorio.

This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

La traducción al español se basa en [translate-dnd5e-sdr2-es](https://github.com/foundryvtt-sinregistrar/translate-dnd5e-sdr2-es) de foundryvtt-sinregistrar (CC-BY-4.0), con cambios: plantillas resueltas, textos que faltaban traducidos y metadatos de conjuros corregidos a partir de [5e-database](https://github.com/5e-bits/5e-database). Los datos estructurados de monstruos combinan 5e-database y el sistema dnd5e de Foundry VTT.

Las fuentes Alegreya, Alegreya Sans e IM Fell English SC se distribuyen con la app bajo la SIL Open Font License 1.1 (ver `src/fonts/OFL-*.txt`); se sirven desde la propia app, sin peticiones a Google Fonts.

Aplicación no oficial, sin afiliación ni respaldo de Wizards of the Coast. «Dungeons & Dragons» y «D&D» son marcas de Wizards of the Coast y no se usan en esta app.
