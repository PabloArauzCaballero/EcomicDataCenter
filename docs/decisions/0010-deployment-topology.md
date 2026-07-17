# ADR-0010: NGINX como entrada y procesos separados

- Estado: aceptado para topología Docker
- Fecha: 2026-07-16
- Responsables: arquitectura y operación

## Contexto

El API debe ser stateless, no ejecutar DDL al arrancar y no exponer PostgreSQL directamente.

## Decisión

- NGINX es el único contenedor con puerto publicado.
- API y migration job son procesos separados.
- PostgreSQL y API viven en red interna.
- La imagen ejecuta usuario no root y filesystem read-only cuando sea viable.
- Logs salen por stdout/stderr.

Kubernetes no se activa sin requerimiento de plataforma o disponibilidad. Si se adopta, se diseñará en `infra/k8s` mediante ADR separado, con Ingress/Gateway NGINX y servicios ClusterIP.

## Consecuencias

Compose sirve como entorno reproducible, no como garantía de alta disponibilidad. TLS, secret manager y backups dependen de la plataforma de producción.

## Validación

Docker build, smoke, prueba de puertos y graceful shutdown en una fase operativa.
