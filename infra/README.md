# Infraestructura local

- `nginx/nginx.conf`: única entrada pública del Compose, límites y proxy.
- `postgres/init-local.sh`: crea roles de grupo y logins de mínimo privilegio en la primera inicialización.
- `postgres/roles.sql`: referencia administrativa sin contraseñas.

PostgreSQL y la API solo están en la red interna. Las contraseñas se inyectan por `.env` y no se incluyen en la imagen ni en el repositorio.
