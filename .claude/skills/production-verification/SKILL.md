---
name: production-verification
description: Verifica de extremo a extremo que el backend está listo para producción (instalación, typecheck, lint, formato, unit, integración, contratos, migraciones, seguridad, build, arranque, health, smoke, restauración, soak). No afirma "listo" si un control crítico no pudo ejecutarse.
---

# Skill: production-verification

## Propósito

Reunir evidencia ejecutada que permita una decisión de despliegue informada.

## Cuándo usarla

Antes de aprobar una entrega o cerrar una fase de hardening.

## Cuándo NO usarla

Como sustituto de implementar o corregir; solo verifica.

## Fuentes obligatorias

`ECONOMIC_DATACENTER_PRODUCTION_READINESS.md`, `docs/hardening/production-review-checklist.md`,
`docs/runbooks/`, `package.json` (comandos reales).

## Entradas requeridas

Commit exacto a verificar; disponibilidad de Docker/PostgreSQL para migraciones/integración/arranque.

## Detente si

Un control exige Neon/producción o secretos reales: márcalo como "no ejecutable aquí", no lo simules.

## Flujo por fases (ejecuta y registra cada resultado)

1. `yarn install --frozen-lockfile`. 2. `yarn typecheck`. 3. `yarn lint`. 4. `yarn format:check`.
2. `yarn quality:all`. 6. `yarn test`. 7. `yarn test:integration` (base desechable). 8. `yarn
security:audit`. 9. `yarn db:verify:migrations` + `db:verify:privileges` (base desechable).
3. `yarn build`. 11. Arranque real desde `dist/`: `/health`, `/ready`, `/metrics` (404 sin token /
   200 con token). 12. Smoke del flujo de agentes (publicar/revisar/cuarentena/idempotencia).
4. Restauración probada (RTO/RPO) y soak si el alcance lo pide.

## Comandos permitidos

Todos los `yarn` de verificación anteriores, arranque local, drill de restauración en instancias
**desechables**, `yarn soak`.

## Comandos prohibidos

Ejecutar contra Neon/producción, `git push`, migraciones en prod.

## Evidencia requerida

Resultado (exit code / conteo de pruebas) de cada paso; salidas clave (health/ready/metrics, ciclo de
migraciones, restauración). Marca lo no ejecutable con su motivo.

## Entregables

Tabla de evidencia por control + veredicto: apto / apto con observaciones / apto tras corregir
bloqueos / no apto, sustentado en la evidencia.

## Formato de respuesta

Tabla control→resultado · bloqueos · no ejecutables · veredicto fundamentado.

## Lista de verificación final

- [ ] Cada control ejecutado o justificado. - [ ] Sin fallos ocultos. - [ ] Veredicto atado a la
      evidencia, no a impresión.

## Limitaciones

El soak de 10 min y una restauración de bajo volumen no fijan el RTO productivo ni descartan fuga
lenta; se declaran como requisitos operativos pendientes.

## Trazabilidad

`ECONOMIC_DATACENTER_PRODUCTION_READINESS.md` §9,§10,§14; `docs/hardening/production-review-checklist.md`.
