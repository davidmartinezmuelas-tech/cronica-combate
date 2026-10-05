# Generación del bestiario

Scripts que producen `public/data/srd52_es.json` a partir de fuentes con licencia CC-BY-4.0:

1. `build.py` combina [5e-database](https://github.com/5e-bits/5e-database) (`src/2024/en/5e-SRD-Monsters.json`), los actores 2024 del sistema [dnd5e de Foundry VTT](https://github.com/foundryvtt/dnd5e) (`packs/_source/actors24`) y la traducción [translate-dnd5e-sdr2-es](https://github.com/foundryvtt-sinregistrar/translate-dnd5e-sdr2-es), resolviendo las plantillas de Foundry.
2. `post.py` aplica las traducciones propias de `trans.py` a los textos que quedaban en inglés y corrige los metadatos de conjuros con `5e-SRD-Spells.json` (2024).

3. `fixdmg.py` separa el daño fijo del condicional (`alt`) en las acciones de los monstruos.

# Generación de las reglas

`rules.py` produce `public/data/reglas_es.json` (pestaña Reglas): capítulos y conjuros en español de translate-dnd5e-sdr2-es (`compendium/dnd5e.content24.json` y `dnd5e.spells24.json`), metadatos de conjuros y estructura del glosario de Foundry dnd5e (`packs/_source/spells24` y `content24/appendices/rules-glossary.yml`) y la traducción propia del glosario en `glossary_es*.py`.

```
python rules.py <dir_con_los_json_de_la_traduccion> <dnd5e/packs/_source> ../../public/data/reglas_es.json
```

Requieren Python 3 y PyYAML. Las rutas de entrada están al principio de cada script.
