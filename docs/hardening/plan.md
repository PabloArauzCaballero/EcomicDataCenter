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
- Los estándares internacionales se usarán como marco de control y trazabilidad; no se afirmará certificación.

## Fases automáticas

### Fase 1 — Baseline e inventario

- Confirmar rama aislada `HARDENING`.
- Inventariar arquitectura, módulos, contratos, infraestructura y controles existentes.
- Ejecutar el pipeline disponible y registrar fallos reproducibles.
- Clasificar hallazgos por severidad, probabilidad, impacto y evidencia.

### Fase 2 — Integridad del repositorio y build

- Corregir configuración inválida, archivos incompletos y scripts no reproducibles.
- Fijar rango compatible de Node y dependencias no deterministas.
- Asegurar que lint, typecheck, build, pruebas y validadores puedan ejecutarse en CI.

### Fase 3 — Memoria y eficiencia de recursos

- Auditar listeners, timers, streams, buffers, caches y conexiones.
- Acotar pools, timeouts, body limits, paginación, lotes y concurrencia.
- Evitar consultas sin límite, materialización innecesaria y transacciones largas.
- Añadir apagado controlado y pruebas de estabilidad cuando corresponda.

### Fase 4 — Seguridad de la información

- Revisar autenticación, autorización, claims, CORS, rate limiting y headers.
- Endurecer manejo de secretos, logs, errores, contenedores, red y PostgreSQL.
- Añadir controles de supply chain, escaneo y política de dependencias.
- Actualizar threat model y matriz de controles.

### Fase 5 — Clean Code y nomenclatura

- Renombrar identificadores no ingleses cuando existan.
- Reducir funciones o clases con responsabilidades múltiples.
- Eliminar duplicación y abstracciones genéricas sin valor.
- Documentar decisiones y funciones relevantes sin comentarios obvios.

### Fase 6 — Estándares internacionales aplicables

- Mapear controles técnicos y operativos contra ISO/IEC 27001:2022 e ISO/IEC 27002:2022.
- Incorporar criterios de ISO/IEC 22237 y EN 50600 solo donde apliquen al software, operación y evidencia del centro de datos.
- Usar ANSI/TIA-942 como referencia de disponibilidad física y operativa, sin afirmar rating ni certificación.
- Considerar ISO 22301 para continuidad e ISO/IEC 20000-1 para gestión del servicio.

### Fase 7 — Observabilidad, pruebas y operaciones

- Separar liveness/readiness y asegurar métricas seguras.
- Añadir pruebas de fallos, límites, autorización, idempotencia y migraciones.
- Verificar backup/restore, rollback y procedimientos de incidente.
- Generar evidencia de smoke, contratos y release gate.

### Fase 8 — Auditoría final

- Repetir auditoría de código, configuración, dependencias y documentación.
- Comparar contra `main` y clasificar riesgos residuales.
- Completar reporte final, checklist de producción y PR en estado revisable.

## Hallazgos preliminares confirmados

1. `docker-compose.yml` contiene una definición dañada del servicio `migrate`, claves `depends_on` duplicadas y dos claves `postgres`; el archivo no representa de forma confiable la topología declarada.
2. El rango de Node en `package.json` no tiene límite superior, aunque la documentación del proyecto exige compatibilidad controlada.
3. Existe al menos una dependencia con rango no fijado (`pino-http`), reduciendo reproducibilidad.
4. El workflow de CI solo ejecuta `push` sobre `main`; la rama se validará mediante pull request.
5. La documentación ya contiene controles valiosos, pero debe distinguir con precisión entre diseño, evidencia ejecutada y conformidad normativa.

## Definición de terminado

La rama estará lista para revisión específica cuando:

- el PR tenga checks verdes o cada bloqueo externo esté documentado;
- no existan hallazgos críticos o altos abiertos sin aceptación explícita;
- las optimizaciones tengan fundamento medible y no sean especulativas;
- el reporte final muestre cambios, evidencia, riesgos residuales y pasos exactos de despliegue.
