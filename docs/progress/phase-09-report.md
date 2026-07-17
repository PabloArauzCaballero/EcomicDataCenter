# Informe de fase 9 — observabilidad, rendimiento y operación

## Cabecera

```text
Fase actual: 9 de 10
Objetivo: endurecer métricas, límites, backup, Docker y baseline de carga.
Gate de entrada: aprobado
Gate de salida: aprobado estáticamente; runtime operativo bloqueado
```

## Avance realizado

- Métrica de resultados de ingestión por modo y resultado, sin cardinalidad por actor o entidad.
- Métricas HTTP y de operaciones de base conservan etiquetas normalizadas.
- Variables de backup validadas con Zod.
- Servicio Compose one-shot de backup, separado del API y activado por perfil operativo.
- Scripts de backup custom, checksum, retención y restore drill read-only.
- Migración `0016` concede solo lectura al rol de backup y revoca DDL/DML.
- NGINX permanece como única entrada pública y oculta `/metrics`.
- API no root, read-only, sin capabilities y en red interna.
- Escenario k6 parametrizado para baseline de consultas.
- Documento que separa presupuestos técnicos de SLO contractuales.

## Bloqueos

- Falta `yarn.lock`, por lo que la instalación no es reproducible.
- RPO/RTO, cifrado y retención final siguen pendientes.
- No se ejecutaron Docker, k6, backup ni restauración.

## Estado

**Aprobada estáticamente; no aprobada operativamente.**
