# Informe de fase 7 — API, autenticación, permisos y OpenAPI

## Cabecera

```text
Fase actual: 7 de 10
Objetivo: cerrar default-deny, claims, errores y contrato HTTP.
Gate de entrada: aprobado
Gate de salida: aprobado estáticamente; pruebas JWT/E2E bloqueadas
```

## Avance realizado

- Parser de claims valida `sub`, roles reconocidos y organización UUID.
- `DATA_OFFICER` requiere claim de organización.
- JWT conserva RS256, issuer, audience, JWKS cacheado, rate limit y timeout.
- Producción rechaza autenticación deshabilitada.
- Errores HTTP normalizan 400, 401, 403, 404, 409, 413, 429 y 503.
- Registro individual devuelve 200 idempotente.
- OpenAPI exige `batchCode`, define resultados de registro/bulk y documenta 429/503.
- Colección Postman regenerada con 37 requests.
- Se agregaron pruebas unitarias negativas de claims.

## Riesgos abiertos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Nombre final de claims no ratificado | Tokens válidos podrían no mapear | Variables de entorno + contrato institucional pendiente |
| Revocación externa | Token revocado puede seguir válido hasta expirar | Access token corto y política del IdP |
| Confidencialidad no aprobada | Acceso insuficientemente granular | Mantener release bloqueado |

## Estado

**Aprobada estáticamente.** Requiere tokens reales de prueba y casos 401/403 E2E.
