# Runbook de incidente

1. Confirmar impacto con SLO, logs por requestId y métricas.
2. Proteger integridad: detener ingestión si existen revisiones corruptas; mantener consulta read-only cuando sea segura.
3. Preservar evidencia sin copiar tokens ni payloads sensibles.
4. Clasificar: autenticación, base, latencia, calidad, migración o proveedor externo.
5. Mitigar con rollback de aplicación, aislamiento del endpoint o reducción de concurrencia.
6. Validar recuperación mediante `/ready`, smoke y una consulta histórica.
7. Registrar causa raíz, datos afectados, ventana temporal y acciones preventivas.
