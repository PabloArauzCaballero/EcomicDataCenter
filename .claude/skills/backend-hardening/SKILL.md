---
name: backend-hardening
description: Auditoría de endurecimiento por fases de este backend (inventario, correctitud, seguridad, integridad de datos, observabilidad, rendimiento, pruebas, despliegue, documentación, verificación). Cada conclusión exige evidencia ejecutada. Úsala para revisar y endurecer, no para construir features.
---

# Skill: backend-hardening

## Propósito

Detectar y corregir debilidades de producción con hallazgos trazables y evidencia, en la línea de
`docs/hardening/` y `ECONOMIC_DATACENTER_PRODUCTION_READINESS.md`.

## Cuándo usarla

Antes de una entrega, tras cambios grandes, o para cerrar bloqueos de producción.

## Cuándo NO usarla

Para implementar una feature nueva (usa `backend-production`).

## Fuentes obligatorias

`docs/hardening/*`, `docs/decisions/*`, `docs/runbooks/*`, `.claude/rules/`, el código y los gates.

## Entradas requeridas

Alcance (todo el repo o un módulo) y si hay entorno para ejecutar base/Docker.

## Detente si

Un hallazgo exige tocar Neon/producción, secretos, o `git push`: propón la corrección y detente.

## Flujo por fases

1. Inventario (stack, módulos, esquemas, gates). 2. Correctitud (tipos, lint, pruebas).
2. Seguridad (usa `security-audit`). 4. Integridad de datos (inmutabilidad, revisiones, auditoría,
   contradicciones, idempotencia). 5. Observabilidad (usa `observability-audit`). 6. Rendimiento (usa
   `performance-audit`). 7. Pruebas (unit + integración + concurrencia + SQL ejecutable). 8. Despliegue
   (Docker, migraciones, backups, apagado). 9. Documentación. 10. Verificación final.

## Comandos permitidos

`yarn quality:all`, `yarn test`, `yarn test:integration`, `yarn security:audit`,
`yarn db:verify:migrations`, `yarn db:verify:privileges`, `yarn build`, `yarn soak`, arranque local
y drill de restauración en instancias **desechables**.

## Comandos prohibidos

Cualquier acción contra Neon/producción, `git push`, borrado de históricos.

## Evidencia requerida

Cada hallazgo con: severidad, archivo/componente, evidencia reproducible, corrección propuesta y, si
se aplica, verificación ejecutada. Matriz de hallazgos con estado.

## Entregables

Matriz de hallazgos (ID, categoría, severidad, evidencia, corrección, estado), correcciones aplicadas
con su verificación, y actualización del informe de preparación cuando corresponda.

## Formato de respuesta

Resumen ejecutivo · matriz de hallazgos · correcciones y evidencia · bloqueos que requieren humano.

## Lista de verificación final

- [ ] Todos los gates verdes o el fallo justificado. - [ ] Garantías de base verificadas contra
      PostgreSQL real. - [ ] Restauración probada (RTO/RPO) si el alcance lo pide. - [ ] Bloqueos
      operativos declarados sin maquillar.

## Limitaciones

No declara "apto para producción" si un control crítico no se pudo ejecutar; lo deja explícito.

## Trazabilidad

`docs/hardening/findings.md`, `ECONOMIC_DATACENTER_PRODUCTION_READINESS.md`, ADR 0003/0004/0009,
todos los gates `quality:*` y `db:verify:*`.
