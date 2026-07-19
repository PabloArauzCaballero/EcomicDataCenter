# Controles de seguridad aplicados

## Identidad y autorización

- JWT asimétrico RS256 validado contra JWKS, issuer y audience.
- Cache JWKS, solicitudes por minuto y timeout acotados.
- Autenticación deshabilitada prohibida en producción.
- Roles de dominio validados y organización obligatoria para `DATA_OFFICER`.
- Swagger prohibido por configuración en producción.

## Entrada y transporte

- Body, lotes, dimensiones, medidas, atributos y paginación tienen límites runtime.
- CORS usa allowlist; no habilita credenciales.
- Helmet aplica headers; CSP solo se relaja cuando Swagger está habilitado fuera de producción.
- Rate limiting se aplica por IP; `TRUST_PROXY` debe activarse únicamente detrás de un proxy confiable.
- Los request IDs externos se aceptan solo con caracteres y longitud seguros; los demás se reemplazan.

## Persistencia

- Credenciales separadas para migrador, writer, reader y backup.
- Reader configurado como solo lectura y consultas dentro de transacciones read-only.
- Objetos de aplicación fuera de `public` y grants versionados por migración.
- SQL dinámico limitado a fragmentos construidos desde enums o índices internos; valores externos via replacements.
- TLS de PostgreSQL disponible con validación de certificado.

## Logs y errores

- Authorization, cookies, tokens y passwords se redactan en Pino.
- Los errores inesperados no serializan mensajes crudos, SQL ni bind values.
- La API no devuelve stack traces ni errores de infraestructura.
- Las incidencias se correlacionan con request ID seguro.

## Contenedores y red

- API sin publicación directa, accesible mediante NGINX.
- Red `app` interna; solo NGINX publica puerto.
- `/metrics` bloqueado en el edge y disponible únicamente en red interna.
- API y tareas operativas usan filesystem read-only, tmpfs, usuario no root, `no-new-privileges` y capacidades eliminadas.

## Pendientes que requieren entorno

- Secret manager y rotación efectiva de credenciales.
- TLS externo y certificados administrados por la plataforma.
- WAF cuando el análisis de exposición lo justifique.
- Prueba de restauración con destino aislado.
- Escaneo de imagen y dependencias en CI.
- Reglas de protección de rama y revisores obligatorios.
