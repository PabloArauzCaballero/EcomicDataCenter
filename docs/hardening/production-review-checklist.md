# Checklist para revisión específica de producción

## Regla de aprobación

La aprobación requiere evidencia del commit exacto que se desplegará. Un check documental no sustituye una ejecución. Cualquier excepción debe tener propietario, fecha de vencimiento, impacto, control compensatorio y aceptación formal.

## A. Código y contratos

- [ ] `yarn install --frozen-lockfile --non-interactive` finaliza correctamente.
- [ ] `yarn format:check` finaliza correctamente.
- [ ] `yarn lint` finaliza sin warnings.
- [ ] `yarn typecheck` finaliza correctamente con TypeScript estricto.
- [ ] `yarn quality:all` finaliza correctamente, incluido `quality:naming`.
- [ ] Pruebas unitarias y e2e críticas finalizan correctamente.
- [ ] Build NestJS finaliza correctamente.
- [ ] OpenAPI y Postman se regeneran sin drift.
- [ ] No existen cambios fuera del alcance aprobado del PR.

## B. Seguridad de software y supply chain

- [ ] CodeQL no presenta hallazgos altos o críticos abiertos.
- [ ] Auditoría de dependencias de producción no presenta advisories altos o críticos sin aceptación.
- [ ] Imagen de runtime construida desde Dockerfile endurecido.
- [ ] Imagen escaneada por vulnerabilidades del sistema operativo y paquetes.
- [ ] Acciones de GitHub fijadas por SHA y revisadas.
- [ ] Protección de rama exige CI y revisión de al menos una persona distinta al autor.
- [ ] Secretos reales proceden de un secret manager y no de `.env` versionado.
- [ ] Rotación inicial de credenciales y claves completada.
- [ ] JWT real verifica JWKS, issuer, audience y expiración.
- [ ] Matriz de roles y acceso por organización aprobada.

## C. Base de datos

- [ ] Ciclo completo install → upgrade → rollback de migraciones ejecutado.
- [ ] Migración productiva probada contra copia representativa y ventana estimada.
- [ ] Roles migrator, writer, reader y backup usan credenciales separadas.
- [ ] Matriz de privilegios verificada; reader no puede escribir ni ejecutar DDL.
- [ ] Seeds boot son idempotentes.
- [ ] Seeds mock son rechazados en producción.
- [ ] Índices y planes de consultas críticas revisados con volumen representativo.
- [ ] Límites de conexiones coherentes con capacidad PostgreSQL y número de réplicas de aplicación.

## D. Rendimiento y estabilidad

- [ ] Load test representa mezcla real de lecturas, registros y lotes.
- [ ] Soak test mínimo inicial de 60 minutos completado.
- [ ] RSS y heap se estabilizan después del calentamiento.
- [ ] No crecen listeners, handles, timers o conexiones activas de forma monotónica.
- [ ] Event-loop lag permanece dentro del SLO aprobado.
- [ ] p50, p95 y p99 documentados por endpoint crítico.
- [ ] Tasa de error y saturación permanecen dentro de guardrails.
- [ ] CPU/memoria y reinicio automático configurados en la plataforma real.

## E. Continuidad y operación

- [ ] Liveness y readiness validados durante arranque, migración, pérdida de DB y recuperación.
- [ ] Métricas accesibles solo desde la red de observabilidad.
- [ ] Logs centralizados, con retención y acceso aprobados.
- [ ] Alertas de disponibilidad, error, latencia, pools y backup configuradas.
- [ ] Backup cifrado fuera del dominio de falla principal.
- [ ] Restore drill aislado completado y verificado por consulta funcional.
- [ ] RPO y RTO medidos y aceptados.
- [ ] Rollback de aplicación y de migración documentado y ensayado.
- [ ] Runbook de incidente incluye contactos, escalamiento y preservación de evidencia.

## F. Infraestructura y estándares de data center

- [ ] Diagrama de despliegue real coincide con red, proxy, base de datos y observabilidad.
- [ ] TLS externo, firewall y segmentación validados.
- [ ] Proveedor o instalación evaluado contra el estándar físico seleccionado.
- [ ] Disponibilidad eléctrica, climatización, incendio, acceso físico y cableado cuentan con evidencia externa.
- [ ] No se afirma Tier, Rated, Availability Class ni certificación sin evaluación independiente.
- [ ] Riesgos y controles se incorporaron al SGSI o sistema institucional equivalente.
- [ ] BIA y continuidad se alinean con el servicio y sus dependencias.

## Artefactos mínimos de firma

1. SHA exacto y digest de imagen.
2. Resultado de backend-quality y CodeQL.
3. Reporte de dependencias e imagen.
4. Reporte de carga/soak.
5. Reporte de restore drill.
6. Matriz de accesos aprobada.
7. Registro de riesgos residuales.
8. Acta de aprobación o rechazo con responsables.
