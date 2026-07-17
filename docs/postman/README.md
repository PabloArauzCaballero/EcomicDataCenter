# Colección Postman

`collection.json` se genera desde `docs/endpoints/openapi.yaml`; no es una fuente contractual independiente.

## Uso

1. Importe `collection.json` en Postman.
2. Ajuste `rootUrl` y `apiBaseUrl` si no usa el NGINX local (`http://localhost:8080/api/v1`).
3. Configure `accessToken` con un JWT RS256 emitido por el proveedor externo.
4. Sustituya los UUID de ejemplo por identificadores existentes.

La colección no contiene credenciales, secretos ni datos personales reales. Para regenerarla:

```bash
python scripts/generate_postman.py
```
