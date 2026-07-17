# Límites de confianza y seguridad

## 1. Zonas

| Zona | Confianza | Responsabilidad |
|---|---|---|
| Cliente institucional | No confiable | Envía tokens, filtros y datos que siempre deben validarse. |
| NGINX/borde | Parcial | Límite de tamaño, rate limit, headers de forwarding y exposición de rutas. |
| API NestJS | Confiable condicionada | Valida identidad, autorización, contratos y reglas de negocio. |
| Proveedor de identidad | Externo confiable | Emite JWT y publica JWKS; no administra datos estadísticos. |
| PostgreSQL writer | Alta | Persistencia transaccional y constraints. |
| PostgreSQL reader | Alta, solo lectura | Consultas y proyecciones autorizadas. |
| Almacenamiento de artefactos | Externo pendiente | Guarda archivos; el core conserva URI y hash, no controla su seguridad física. |
| Observabilidad | Confiable restringida | Recibe logs y métricas redactados. |

## 2. Cruces de frontera

1. Cliente → NGINX: TLS obligatorio en producción.
2. NGINX → API: red privada, forwarding controlado y request ID.
3. API → JWKS: HTTPS, timeout, caché y rate limit.
4. API → PostgreSQL: TLS cuando sea remoto, credencial por función y statement timeout.
5. API → observabilidad: solo metadatos técnicos sin payloads sensibles.
6. API → almacenamiento: fuera del alcance de esta fase; requiere adapter y ADR antes de automatizar transferencias.

## 3. Datos que no deben cruzar límites

- tokens completos;
- cookies o headers de autorización;
- contraseñas y claves;
- payloads estadísticos completos en logs;
- stack traces al cliente;
- URI internas de almacenamiento a roles no autorizados;
- modelos ORM en respuestas.

## 4. Bloqueos previos a exposición pública

- contrato firmado de claims JWT;
- matriz de confidencialidad;
- TLS y secretos administrados por plataforma;
- pruebas negativas de permisos;
- revisión de CORS con orígenes reales;
- prueba de rate limit detrás del proxy configurado.
