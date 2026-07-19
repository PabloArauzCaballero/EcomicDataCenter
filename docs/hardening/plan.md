# Plan de hardening previo a producción

## Objetivo

Llevar el backend a un estado verificable para revisión específica de producción, sin declarar conformidad final cuando no exista evidencia ejecutable.

## Criterios no negociables

- Corrección funcional antes de optimización.
- Seguridad por defecto y mínimo privilegio.
- Recursos acotados: pools, timeouts, tamaños, concurrencia y apagado controlado.
- TypeScript estricto y contratos runtime validados.
- Nombres de código en inglés; términos regulatorios o de dominio pueden conservar traducción documental.
- Archivos manuales menores a 300 líneas salvo excepción justificada.
- Cada afirmación de build, pruebas o seguridad debe quedar respaldada por CI o artefactos.
- Los estándares internacionales se usan como marco de control y trazabilidad; no se afirma certificación.

## Estado por fase

| Fase | Resultado | Estado |
|---|---|---|
| 1. Baseline e inventario | Rama y PR aislados, inventario técnico y hallazgos clasificados. | Completada |
| 2. Integridad del repositorio y build | Compose reparado, núcleo productivo aislado, Node acotado y gates reproducibles. | Completada; validación final en CI |
| 3. Memoria y eficiencia | Auditoría estática, límites HTTP/DB/paginación y documento de soak test. | Implementada; soak test externo pendiente |
| 4. Seguridad | Request ID seguro, errores redactados, contenedores/red endurecidos, CodeQL y Dependabot. | Implementada; auditoría de dependencias pendiente |
| 5. Clean Code y nomenclatura | Validadores acotados al núcleo y gate AST de identificadores en inglés. | Implementada; validación final en CI |
| 6. Estándares | Matriz ISO/IEC, TIA, continuidad y gestión del servicio con alcance explícito. | Completada documentalmente |
| 7. Pruebas y operaciones | CI ampliado, release script bloqueante, checklist y controles de imagen/Compose. | Implementada; restore/load/soak externos pendientes |
| 8. Auditoría final | Registro de hallazgos, bloqueos residuales y PR de revisión. | En cierre tras última ejecución de CI |

## Secuencia ejecutada

### Fase 1 — Baseline e inventario

- Confirmar rama aislada `HARDENING`.
- Inventariar arquitectura, módulos, contratos, infraestructura y controles existentes.
- Ejecutar el pipeline disponible y registrar fallos reproducibles.
- Clasificar hallazgos por severidad, probabilidad, impacto y evidencia.

### Fase 2 — Integridad del repositorio y build

- Corregir configuración inválida y topología de despliegue.
- Restringir el grafo productivo a los módulos registrados por `AppModule`.
- Fijar versiones soportadas de Node y conservar lockfile congelado.
- Alinear lint, typecheck, build, pruebas y validadores con el alcance desplegable.

### Fase 3 — Memoria y eficiencia de recursos

- Auditar listeners, timers, streams, buffers, caches y conexiones.
- Acotar pools, timeouts, body limits, paginación, lotes y concurrencia.
- Evitar consultas sin límite, materialización innecesaria y transacciones sin control.
- Documentar la prueba de estabilidad necesaria para cerrar el riesgo dinámico.

### Fase 4 — Seguridad de la información

- Revisar autenticación, autorización, claims, CORS, rate limiting y headers.
- Endurecer secretos, logs, errores, contenedores, red y PostgreSQL.
- Añadir CodeQL, Dependabot, auditoría de dependencias y build de imagen en CI.
- Mantener hallazgos no demostrables como bloqueos, no como afirmaciones de seguridad.

### Fase 5 — Clean Code y nomenclatura

- Limitar los validadores al código productivo mantenido.
- Aplicar límite de archivos y dependencias arquitectónicas.
- Añadir validación AST de identificadores en inglés.
- Documentar decisiones relevantes sin llenar el código de comentarios obvios.

### Fase 6 — Estándares internacionales aplicables

- Mapear ISO/IEC 27001:2022 e ISO/IEC 27002:2022.
- Separar el alcance de software de ISO/IEC 22237 y ANSI/TIA-942-C.
- Incorporar ISO 22301 e ISO/IEC 20000-1 para continuidad y gestión del servicio.
- Prohibir afirmaciones de Tier, Rated, Availability Class o certificación sin auditoría independiente.

### Fase 7 — Observabilidad, pruebas y operaciones

- Mantener liveness/readiness y métricas fuera del edge público.
- Añadir pruebas de límites y seguridad de logs/correlación.
- Hacer bloqueantes auditoría, Compose, migraciones, privilegios, seeds, build y contratos en `release:verify`.
- Documentar load, soak y restore como gates ejecutables fuera de CI estándar.

### Fase 8 — Auditoría final

- Comparar contra `main`.
- Registrar riesgos residuales en `findings.md`.
- Proporcionar `production-review-checklist.md`.
- Mantener el PR en borrador mientras existan bloqueos abiertos.

## Definición de terminado

La rama queda lista para revisión específica cuando:

- los checks del código y contratos estén verdes o el bloqueo tenga evidencia clara;
- no existan hallazgos críticos abiertos;
- todo hallazgo alto tenga corrección o aceptación formal;
- los resultados de carga, soak y restauración correspondan al commit candidato;
- el reporte final muestre cambios, evidencia, riesgos residuales y pasos exactos de despliegue.
