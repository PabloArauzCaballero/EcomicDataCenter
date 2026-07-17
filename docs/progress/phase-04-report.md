# Informe de fase 4 — boot/mock seeds e idempotencia

## Cabecera

```text
Fase actual: 4 de 10
Fases completadas: 3
Fases restantes al iniciar: 6
Objetivo: validar exactamente dos catálogos persistentes, su formato, seguridad e idempotencia.
Gate de entrada: aprobado
Gate de salida: aprobado estáticamente; ejecución PostgreSQL bloqueada
```

## Avance realizado

- Se mantuvieron exactamente dos categorías: `boot` y `mock`.
- Tres JSON boot y un JSON mock pasan schemas Zod especializados.
- Se centralizaron 32 UUID estables para reconciliación repetible.
- El catálogo mock exige marcadores sintéticos y está bloqueado en producción.
- La verificación de idempotencia compara snapshots lógicos completos mediante SHA-256, no solo conteos.
- Se añadieron validadores de archivos y pruebas unitarias de schemas.

## Riesgos detectados

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Validar únicamente conteos ocultaba cambios | Falso positivo de idempotencia | Hash del estado lógico completo |
| Datos mock confundibles con reales | Riesgo operativo y reputacional | Marcadores sintéticos + rechazo en producción |
| UUID dispersos | Duplicados o relaciones inestables | Registro único de identificadores |
| Seeds no ejecutados en PostgreSQL | Drift runtime no detectado | Gate CI sobre base vacía y doble ejecución |

## Decisiones

- No crear un tercer catálogo persistente.
- No usar SQL puro como seed.
- No sobrescribir campos administrados por usuarios.
- Fixtures unitarias permanecen fuera de seeds.

## Desviaciones

Los seeds existían adelantados, pero su comprobación se limitaba a conteos. Se reforzó el mecanismo antes de aprobar la fase.

## Estado

**Aprobada estáticamente.** Falta ejecutar migraciones y doble seed sobre PostgreSQL real.
