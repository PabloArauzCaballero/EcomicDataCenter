# Registro de hallazgos de hardening

## Convenciones

- **Severidad** combina impacto técnico, exposición y probabilidad.
- **Resuelto** significa corregido en la rama y sujeto a los gates de CI.
- **Mitigado** significa que el riesgo fue reducido, pero conserva trabajo residual.
- **Bloqueante** impide aprobar una entrega productiva.

## Hallazgos

| ID | Severidad | Área | Hallazgo | Estado | Evidencia o corrección |
|---|---|---|---|---|---|
| HD-001 | Crítica | Despliegue | `docker-compose.yml` contenía servicios duplicados, dependencias repetidas y una topología de migración inválida. | Resuelto | Compose reconstruido con migrador de una sola ejecución, API dependiente de migraciones, red interna y validación en CI. |
| HD-002 | Alta | Alcance | El repositorio mezclaba el núcleo económico con módulos heredados de otros productos, ampliando análisis, compilación y superficie de revisión. | Mitigado | Alcance explícito en TypeScript, Jest, ESLint, Prettier y validadores; detalle en `legacy-quarantine.md`. Extracción física queda recomendada. |
| HD-003 | Alta | Recursos | HTTP y conexión inicial a PostgreSQL carecían de límites explícitos en la configuración de aplicación. | Resuelto | Timeouts validados para request, conexión HTTP, keep-alive y conexión PostgreSQL. |
| HD-004 | Alta | Seguridad | Los errores inesperados podían registrar mensajes crudos de infraestructura, incluyendo SQL o valores sensibles proporcionados por dependencias. | Resuelto | Metadatos seguros de error, eliminación del mensaje crudo y pruebas de no exposición. |
| HD-005 | Alta | Seguridad | El `x-request-id` externo no estaba normalizado, lo que permitía valores excesivos o caracteres de control en correlación y logs. | Resuelto | Allowlist de caracteres, máximo de 128 y UUID generado por servidor para entradas inválidas. |
| HD-006 | Alta | Supply chain | No existía análisis CodeQL ni actualización automática de dependencias. | Resuelto | CodeQL fijado por SHA y Dependabot para npm y GitHub Actions. |
| HD-007 | Alta | Dependencias | `yarn audit` reporta una condición de severidad alta/crítica o un fallo de registro que todavía requiere diagnóstico y resolución. | **Bloqueante** | CI lo registra como warning para permitir descubrir otros defectos; `release:verify` lo mantiene bloqueante. |
| HD-008 | Media | Configuración | Swagger podía habilitarse accidentalmente en producción. | Resuelto | Validación de entorno rechaza `SWAGGER_ENABLED=true` en producción. |
| HD-009 | Media | Consultas | La paginación por offset aceptaba páginas arbitrariamente profundas, generando trabajo excesivo en PostgreSQL. | Mitigado | `pageSize <= 200` y `page <= 10000`; cursor estable queda como evolución si el consumo real lo exige. |
| HD-010 | Media | Recursos | No había evidencia ejecutada de estabilidad prolongada de memoria y conexiones. | **Bloqueante** | No se confirmó fuga estática; se exige soak test con RSS, heap, event-loop lag y pools. |
| HD-011 | Media | Continuidad | Existen scripts y runbooks de backup, pero no evidencia firmada de restauración aislada ni medición de RTO/RPO. | **Bloqueante** | Ejecutar restore drill en entorno aislado y conservar artefacto. |
| HD-012 | Media | Operación | Los límites de CPU y memoria dependen de la plataforma real y no están demostrados en este repositorio. | Pendiente de entorno | Configurar requests/limits o equivalentes en la plataforma de despliegue y validar bajo carga. |
| HD-013 | Media | Nomenclatura | No existía una comprobación automática de identificadores en inglés. | Resuelto | Gate AST `quality:naming` sobre el alcance productivo. |
| HD-014 | Media | Estándares | La documentación podía confundirse con una afirmación de certificación o nivel de disponibilidad físico. | Resuelto documentalmente | Matriz de estándares separa controles de software, organización e infraestructura física; prohíbe afirmar Tier, Rated o certificación sin auditoría. |
| HD-015 | Alta | Recursos | Un fallo del reader durante el arranque podía dejar abierto el pool writer antes de completar la aplicación Nest. | Resuelto | Writer y reader se crean y autentican como un grupo atómico; cualquier fallo cierra todos los pools creados y tiene prueba unitaria. |

## Conclusión técnica

La rama elimina defectos estructurales y reduce de forma material la superficie de ataque y el consumo no acotado. No se declara lista para desplegar mientras permanezcan abiertos HD-007, HD-010 y HD-011. Esos tres hallazgos requieren evidencia ejecutada, no una corrección documental.
