# Generación del bestiario

Scripts que producen `public/data/srd52_es.json` a partir de fuentes con licencia CC-BY-4.0:

1. `build.py` combina [5e-database](https://github.com/5e-bits/5e-database) (`src/2024/en/5e-SRD-Monsters.json`), los actores 2024 del sistema [dnd5e de Foundry VTT](https://github.com/foundryvtt/dnd5e) (`packs/_source/actors24`) y la traducción [translate-dnd5e-sdr2-es](https://github.com/foundryvtt-sinregistrar/translate-dnd5e-sdr2-es), resolviendo las plantillas de Foundry.
2. `post.py` aplica las traducciones propias de `trans.py` a los textos que quedaban en inglés y corrige los metadatos de conjuros con `5e-SRD-Spells.json` (2024).

Requieren Python 3 y PyYAML. Las rutas de entrada están al principio de cada script.
