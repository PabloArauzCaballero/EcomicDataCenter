# ADR-0003: no introducir cola ni workers inicialmente

- Estado: aceptado
- Fecha: 2026-07-15
- Responsables: arquitectura backend

## Contexto

Los casos de uso principales son registrar e importar un lote acotado, consultar datos y mantener gobierno. No se especifican notificaciones, webhooks, ETL diferido ni consumidores externos.

## Drivers

- KISS y ausencia de trabajo diferido real;
- transacción y respuesta inmediata al productor;
- evitar operar Redis/cola sin necesidad;
- lote máximo de 500 registros.

## Opciones

1. BullMQ/Redis: introduce infraestructura no respaldada por un caso de uso.
2. pg-boss: mantiene PostgreSQL como dependencia única, pero sigue siendo complejidad innecesaria hoy.
3. Flujo síncrono acotado: suficiente hasta que la carga demuestre lo contrario.

## Decisión

Ejecutar ingestión de forma síncrona y transaccional. El bulk usa `SAVEPOINT` por registro. No instalar una cola en esta versión.

## Criterio de revisión

Reabrir el ADR si un lote no cumple el timeout, aparece una integración diferida, se requiere reintento fuera del request o existe entrega de eventos. En ese caso, usar worker persistente separado e idempotencia al menos una vez.
