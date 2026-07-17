# Evaluación de procesamiento asíncrono — fase 8

## Decisión

No se activa una cola ni un worker en esta versión. La decisión ratifica ADR-0003 y evita introducir infraestructura sin un trabajo diferido definido por el dominio.

## Evidencia del alcance

Los casos de uso aprobados requieren:

- registro individual con respuesta inmediata;
- importación acotada a 500 registros;
- resultado parcial por registro;
- consulta corriente o histórica;
- mantenimiento de metadatos, calidad y trazabilidad.

No existe un contrato aprobado para notificaciones, webhooks, exportaciones diferidas, refresco de proyecciones, consumidores externos o publicación de eventos. Implementar un worker sin uno de esos contratos inventaría payloads, reintentos y políticas de idempotencia.

## Flujo vigente

```text
HTTP request
→ validación Zod
→ claim idempotente de batch
→ transacción serializable
→ SAVEPOINT por registro en bulk
→ persistencia de resultado replayable
→ HTTP response
```

## Criterios que obligan a reabrir ADR-0003

Se debe reabrir la decisión cuando ocurra al menos uno de estos hechos medidos:

1. El lote máximo no puede completarse dentro del timeout aprobado.
2. Se aprueba una integración externa que requiera entrega con reintentos.
3. Se necesita publicar eventos después del commit.
4. Aparece procesamiento que debe sobrevivir al cierre del request.
5. La carga exige backpressure y escalado independiente del API.

## Diseño obligatorio al activarse

Cuando exista un caso real:

- elegir **una** cola mediante ADR;
- escribir mutación y outbox en la misma transacción;
- usar entrega al menos una vez y consumidores idempotentes;
- ejecutar el worker como proceso persistente separado del API;
- validar el mensaje con Zod;
- configurar concurrencia, retry con jitter, dead letter y graceful shutdown;
- documentar métricas, runbook y estrategia de recuperación.

## Estado del gate

**No aplicable por alcance, cerrado mediante decisión explícita.** No se agregó deuda oculta ni un script manual presentado como worker de producción.
