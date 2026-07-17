# Reglas de dependencias

## 1. Dirección permitida

```text
app/main
  -> módulos de dominio
      -> common/config/database abstractions
          -> librerías externas
```

Dentro de un módulo:

```text
controller -> service -> repository -> Sequelize/PostgreSQL
                     -> función de dominio pura
```

## 2. Reglas obligatorias

1. Un controller no importa modelos Sequelize ni ejecuta SQL.
2. Un controller no conoce `Transaction`, `QueryTypes` ni tokens de base de datos, salvo el controller técnico de health/readiness.
3. Un service no depende de objetos HTTP, request o response.
4. Un repository no decide roles, status HTTP ni mensajes de transporte.
5. Los módulos de dominio no importan internals de otro módulo.
6. Los contratos usados por dos módulos se extraen a una ubicación transversal con nombre de dominio explícito.
7. `common/` no contiene reglas propias de un caso de uso.
8. `database/models/` no depende de módulos de aplicación.
9. Las consultas dinámicas usan whitelists; nunca reciben columnas, tablas o SQL desde el cliente.
10. No se permiten dependencias circulares.

## 3. Excepciones aceptadas

- `HealthController` accede a los pools reader/writer para readiness. No procesa datos de dominio.
- Los scripts de migración y seed pueden importar modelos y conexión porque son entrypoints operativos separados.

## 4. Verificación

`scripts/validate_architecture.py` comprueba automáticamente:

- imports cruzados entre módulos;
- acceso directo a modelos desde controllers;
- uso de Sequelize desde controllers fuera de health;
- dependencias desde database hacia módulos;
- existencia de documentación mínima de fase 2.
