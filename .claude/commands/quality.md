Ejecuta la acción de calidad de código indicada según $ARGUMENTS:

- lint: Ejecuta mentalmente ESLint con reglas estrictas (max-lines, complexity, max-lines-per-function) sobre este archivo y dime qué problemas de tamaño y complejidad ves.
- lint-summary: Resume los principales problemas de lint relacionados con tamaño de componentes, complejidad y duplicación.
- repo-audit: Lee todos los archivos en src/ del proyecto. Detecta componentes y funciones demasiado grandes (>200 líneas), responsabilidades mezcladas, duplicación de lógica y violaciones de arquitectura (lógica en componentes React, imports cruzados, etc). Genera un informe priorizado por severidad con plan de refactor por fases.
- repo-plan: Lee la estructura actual de src/ y propón un plan de refactor por fases: qué extraer primero, qué dividir, qué renombrar, en qué orden para minimizar riesgo.
- check: Lee todos los archivos en src/ y aplica las reglas del archivo skills-check.md. Genera un informe de calidad con puntuación por archivo.
- refactor: Lee todos los archivos en src/ y usa las reglas de skills-check.md para proponer un refactor limpio y modular, priorizando los archivos con más problemas.
