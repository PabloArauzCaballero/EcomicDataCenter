# Ownership, roles y grants PostgreSQL

## 1. Principio

La API no usa una cuenta propietaria ni una cuenta administrativa. DDL, escritura y lectura se separan por credenciales y roles de grupo.

## 2. Roles

| Rol | Login | Responsabilidad | Privilegios principales |
|---|---:|---|---|
| `backend_migrator` | No | Grupo administrativo de migraciones | `CONNECT`, `CREATE` en la base dedicada |
| `backend_writer` | No | Grupo del runtime de escritura | DML en tablas base y funciones de trigger aprobadas |
| `backend_reader` | No | Grupo del runtime de lectura | `SELECT` explícito y transacción read-only por defecto |
| `backup_operator` | No | Grupo reservado para respaldo | Se configura mediante IaC/runbook |
| `observatory_migrator` | Sí | Credencial local de migración | Miembro de `backend_migrator` |
| `observatory_writer` | Sí | Credencial local de escritura | Miembro de `backend_writer` |
| `observatory_reader` | Sí | Credencial local de lectura | Miembro de `backend_reader` |

Los nombres de login locales son de desarrollo. En entornos administrados, IaC puede usar otros nombres conservando las capacidades de grupo.

## 3. Endurecimiento

- Todos los roles se crean sin superusuario, creación de roles, creación de bases ni bypass de RLS.
- Se revoca `CREATE` a `PUBLIC` en la base y en el schema `public`.
- Los schemas funcionales revocan todos los privilegios a `PUBLIC`.
- Las funciones de aplicación revocan `EXECUTE` a `PUBLIC`.
- Los privilegios por defecto de nuevas funciones también quedan cerrados.
- Reader y writer no reciben `CREATE` en schemas funcionales.
- Reader no recibe secuencias ni DML.
- Writer no recibe acceso a `read_models` porque las consultas usan el pool reader.

## 4. Whitelist reader

La whitelist se deriva de los SQL actuales de `provenance`, `query`, `trace` y `quality`. Incluye exactamente las tablas requeridas y `read_models.current_observation_value`.

No incluye catálogos semánticos completos. Si una consulta futura los necesita, el cambio debe:

1. demostrar el caso de uso;
2. añadir el grant mediante migración;
3. incorporar una prueba negativa y positiva;
4. actualizar este documento.

## 5. Funciones y triggers

Los triggers de integridad se ejecutan durante escrituras. Se concede al writer `EXECUTE` solo sobre las funciones involucradas. El helper `statistics.assert_revision_has_measure(bigint)` requiere grant explícito porque es invocado desde otra función.

Las funciones usan nombres de tablas calificados por schema. Las funciones nuevas deben revocar `EXECUTE` a `PUBLIC` y declarar explícitamente el rol que las necesita.

## 6. Verificación

Ejecutar después de migraciones:

```bash
yarn db:verify:privileges
```

El script comprueba:

- DML permitido al writer;
- DDL rechazado al writer;
- acceso a funciones requerido por triggers;
- reader read-only por defecto;
- acceso reader a la proyección aprobada;
- ausencia de DML, DDL, catálogos no permitidos y funciones internas para reader.

No imprime credenciales ni activa trazas de shell.
