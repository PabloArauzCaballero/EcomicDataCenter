# Revisión Clean Code — Fase 2

## Objetivo

Revisar que la arquitectura comunique intención, mantenga responsabilidades claras y evite dependencias ocultas. La revisión se centra en criterios verificables, no en preferencias estéticas.

## Hallazgo corregido

### Acoplamiento entre módulos

Antes:

```text
query -> ingestion/observation-input.schemas
```

El módulo de consulta importaba un schema y un tipo interno del módulo de ingestión. Aunque ambos necesitaban representar una dimensión, la dependencia hacía que un cambio de input de escritura pudiera afectar consultas.

Después:

```text
ingestion -> common/statistical/dimension-value.schema
query     -> common/statistical/dimension-value.schema
```

Se extrajo únicamente el concepto realmente compartido. No se creó un paquete genérico de utilidades ni una abstracción mayor.

## Criterios automatizados

`scripts/check_clean_code.py` bloquea en `src/`:

- `any` explícito;
- `console.*` en runtime;
- `@ts-ignore` y `@ts-nocheck`;
- `catch` vacío;
- marcadores TODO/FIXME/HACK;
- archivos o clases con nombres genéricos como `Utils`, `Helper`, `Manager` o `Processor`.

`scripts/validate_architecture.py` bloquea:

- imports internos entre módulos de dominio;
- controllers acoplados a modelos o Sequelize;
- base de datos dependiente de módulos de aplicación;
- ausencia de artefactos de arquitectura.

## Resultado

- El contrato compartido tiene un nombre de dominio específico.
- No se generalizó medida ni atributo porque no existen consumidores fuera de ingestión.
- Las dependencias quedan orientadas hacia contratos transversales pequeños.
- El refactor conserva el schema de validación y el tipo inferido.

## Límites

Los checks estáticos no reemplazan code review, type-check, pruebas ni medición de complejidad ciclomática. Esos gates siguen abiertos hasta instalar dependencias.
