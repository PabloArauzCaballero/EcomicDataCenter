---
name: performance-audit
description: Auditoría de rendimiento con medición obligatoria antes de optimizar (baseline, p50/p95/p99, memoria, event-loop, pools, N+1, índices, paginación, payloads, soak). Úsala para detectar y corregir cuellos de botella con comparación antes/después; nunca aceptes una optimización sin medición.
---

# Skill: performance-audit

## Propósito

Localizar cuellos de botella reales y verificar mejoras con evidencia comparativa, sin degradar
correctitud.

## Cuándo usarla

Ante latencia/consumo observados, antes de escalar, o al tocar consultas/persistencia.

## Cuándo NO usarla

Para microoptimizar sin medición ni síntoma. Para features nuevas.

## Fuentes obligatorias

`.claude/rules/50-performance.md`, `scripts/soak-test.mjs`,
`docs/architecture/performance-baseline.md`, `src/modules/query/`, `src/common/persistence/`.

## Entradas requeridas

App arrancable y base con datos; una consulta/proceso objetivo.

## Detente si

La medición exige datos de producción o Neon: usa una base **desechable** representativa; no toques
producción.

## Flujo por fases

1. Baseline reproducible (soak: media por mitades, no muestras sueltas). 2. Perfil de carga y
   p50/p95/p99. 3. RSS/heap/event-loop/pools. 4. N+1 e índices (plan de la consulta; cobertura de FK).
2. Paginación (cursor keyset; evitar `OFFSET` profundo y `COUNT(*)` de ventana en cursor). 6. Payloads
   y serialización. 7. Transacciones cortas y reintentos acotados. 8. Optimiza y **re-mide**; compara.

## Comandos permitidos

`yarn soak`, arranque local, `yarn test:integration` (SQL ejecutable), `EXPLAIN` en base desechable,
`yarn quality:physical-model`.

## Comandos prohibidos

Optimizar sin baseline; aceptar mejora sin re-medición; probar contra Neon/producción.

## Evidencia requerida

Baseline y post-cambio con la misma metodología; deriva de heap (fuga vs. oscilación), latencias, y
que las pruebas siguen en verde.

## Entregables

Hallazgos con medición, correcciones, y comparación antes/después firmada (evidencia en
`docs/runbooks/evidence/` si es soak formal).

## Formato de respuesta

Baseline · cuellos detectados · cambios · comparación · regresiones descartadas.

## Lista de verificación final

- [ ] Baseline registrado. - [ ] Mejora demostrada, no supuesta. - [ ] Sin regresión funcional
      (`test`/`test:integration` verdes). - [ ] Índices/plan revisados.

## Limitaciones

El soak de 10 min descarta degradación aguda, no fuga lenta: el ciclo 8–24 h es requisito aparte.

## Trazabilidad

`prompt/programacionGeneral.md` §12; `docs/architecture/performance-baseline.md`; gate
`physical-model`; `scripts/soak-test.mjs`.
