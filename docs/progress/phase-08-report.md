# Informe de fase 8 — workers, outbox e integraciones

## Cabecera

```text
Fase actual: 8 de 10
Objetivo: determinar si el dominio requiere procesamiento asíncrono.
Gate de entrada: aprobado
Gate de salida: cerrado como no aplicable mediante ADR
```

## Resultado

No se implementó una cola ni un pseudo-worker. Los casos aprobados son síncronos, el bulk está limitado a 500 registros y no existen contratos de webhook, notificación, exportación diferida o consumidor externo.

Se documentaron:

- evidencia del alcance;
- criterios medidos para reabrir ADR-0003;
- diseño obligatorio futuro con outbox, entrega al menos una vez, idempotencia, retry, dead letter y proceso persistente separado.

## Riesgo evitado

Introducir BullMQ, pg-boss o Redis sin un trabajo real habría agregado infraestructura, fallos y reglas inventadas.

## Estado

**No aplicable y cerrado explícitamente.** Se reabre solo cuando exista un caso de uso asíncrono aprobado.
