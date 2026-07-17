# Runbook de despliegue

1. Crear base dedicada y roles administrados.
2. Inyectar secretos; nunca copiar `.env.example` con claves reales al repositorio.
3. Ejecutar `yarn install --frozen-lockfile`, lint, typecheck, tests y build.
4. Ejecutar migraciones como job con credencial migrator.
5. Ejecutar boot seeds dos veces y comprobar idempotencia.
6. Desplegar API no root detrás de NGINX.
7. Verificar `/health`, `/ready`, un endpoint protegido y métricas internas.
8. Mantener Swagger deshabilitado en producción salvo acceso controlado.

`docker-compose.yml` es una topología local/de revisión. En producción, PostgreSQL debe preferentemente ser administrado y privado.
