---
paths:
  - 'package.json'
  - 'yarn.lock'
---

# Selección de librerías

- Gestor de paquetes: **yarn 1.22.22**. No usar npm ni pnpm para instalar dependencias del proyecto.
- No agregar una librería para una responsabilidad que ya cubre otra dependencia. Prohibido tener
  dos librerías para el mismo fin sin un ADR en `docs/decisions/`.
- Antes de añadir una dependencia, evalúa: responsabilidad, alternativas, versión compatible con el
  lockfile, mantenimiento, seguridad (advisories), licencia, rendimiento, costo de salida y lock-in.
  Usa la skill `library-selection` para dejar la matriz y la decisión.
- No cambiar versiones mayores sin autorización. Preferir parches para cerrar vulnerabilidades.
- Dependencias prohibidas por decisión de arquitectura: colas (`bullmq`, `bull`, `pg-boss`,
  `amqplib`, `kafkajs`) salvo ADR (gate `async-scope`); Express; ORM alterno a Sequelize.
- Fija versiones exactas para dependencias sensibles; usa `resolutions` **acotadas al camino
  vulnerable** cuando una transitiva tenga advisory, nunca resoluciones globales (rompen otras).
- Verifica tras instalar: `yarn install --frozen-lockfile`, `yarn typecheck`, `yarn security:audit`.
