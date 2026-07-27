---
paths:
  - 'src/**/*.ts'
  - 'src/main.ts'
  - 'src/config/**/*.ts'
---

# Seguridad

- AuthN por JWT externo RS256/JWKS con issuer/audience/expiración; AuthZ por rol, default-deny
  (`quality:security`, ADR 0002). El backend aplica permisos; nunca confiar en el cliente.
- Separación de deberes: un token de agente de ingesta no puede portar roles humanos. La consulta
  filtra por confidencialidad y organización (aislamiento institucional).
- Entrada no confiable (incluye salida de agentes de IA): validar con Zod, límites de longitud,
  listas de campos permitidos (`strict()`), sanitizar, aislar contenido. Anti-SSRF en localizadores
  (rechazar loopback/privados/metadata). Detectar prompt injection y enviar a cuarentena, no borrar.
- SQL siempre parametrizado. Ninguna interpolación de entrada de usuario en SQL.
- Secretos: nunca en código, git ni logs. `.env` fuera de control de versiones. Redacción en Pino.
- Errores: no exponer stack traces, SQL, secretos ni valores ligados (`toSafeErrorLog`). Respuestas
  consistentes con código interno y correlation ID.
- Auditoría append-only de toda acción sensible (privilegio + trigger); el rol writer no borra.
- `helmet`, rate limit por identidad, CORS por allowlist, límites de body. Producción exige
  `AUTH_MODE=jwks`, Swagger off, credencial de migrador separada (validación de entorno).
- Dependencias: `yarn security:audit` sin advisories high/critical antes de release. Preferir
  actualización de parche; resoluciones acotadas al camino vulnerable, nunca globales.
- Detente antes de: OAuth, uso de secretos, acceso a producción, DDL en Neon.
