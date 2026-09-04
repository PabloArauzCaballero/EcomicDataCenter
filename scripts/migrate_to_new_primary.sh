#!/bin/sh
# Migra la base del Observatorio desde Neon hacia el nuevo primario.
#
# Se ejecuta EN EL SERVIDOR que hospeda la base destino (pablo-h310), porque el
# host destino es un nombre interno de la red Docker de Coolify y no resuelve
# desde fuera de ese servidor.
#
# Es idempotente. Guarda una huella del origen en `migration_control.state` del
# destino; si al reejecutarse la huella coincide, no vuelve a copiar nada. El
# restore corre en una transaccion unica, asi que una ejecucion interrumpida no
# deja el destino a medio migrar: o entra todo, o no entra nada.
#
# Uso:
#   SOURCE_DATABASE_URL='postgresql://...neon.tech/neondb?sslmode=require' \
#   TARGET_DATABASE_URL='postgres://postgres:PASS@ldoldmry9wloazymtyiwqymh:5432/postgres' \
#   sh scripts/migrate_to_new_primary.sh
#
# Variables opcionales:
#   PG_IMAGE        imagen con cliente PostgreSQL >= al origen (def. postgres:18)
#   DOCKER_NETWORK  red Docker del destino                     (def. autodeteccion)
#   WORKDIR         directorio para el volcado                 (def. /tmp/obs-migration)
#   FORCE=1         recopia aunque la huella ya coincida
#   CHECK_ONLY=1    solo informa el estado, no migra nada

set -eu

: "${SOURCE_DATABASE_URL:?SOURCE_DATABASE_URL es requerida (la base Neon actual)}"
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL es requerida (el nuevo primario)}"

PG_IMAGE=${PG_IMAGE:-postgres:18}
WORKDIR=${WORKDIR:-/tmp/obs-migration}
FORCE=${FORCE:-0}
CHECK_ONLY=${CHECK_ONLY:-0}

log()  { printf '%s  %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$1"; }
fail() { printf 'FALLO: %s\n' "$1" >&2; exit 1; }

# ---------------------------------------------------------------- preflight ---

command -v docker >/dev/null 2>&1 || fail "docker no esta disponible en este servidor."

target_host=$(printf '%s' "$TARGET_DATABASE_URL" | sed -E 's#^[^:]+://[^@]*@([^:/?]+).*#\1#')
[ -n "$target_host" ] || fail "no pude extraer el host de TARGET_DATABASE_URL."
log "Host destino: $target_host"

# El cliente corre en un contenedor: sin estar en la red del destino no resuelve
# el hostname interno. Se deduce del contenedor que lo publica.
if [ -z "${DOCKER_NETWORK:-}" ]; then
  container=$(docker ps --format '{{.Names}}' | grep -F "$target_host" | head -n 1 || true)
  [ -n "$container" ] || fail "no encontre un contenedor cuyo nombre contenga '$target_host'. Indica la red con DOCKER_NETWORK=<red>."
  DOCKER_NETWORK=$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}' "$container" | head -n 1)
  [ -n "$DOCKER_NETWORK" ] || fail "el contenedor $container no expone ninguna red Docker."
  log "Red Docker autodetectada: $DOCKER_NETWORK (contenedor $container)"
else
  log "Red Docker indicada: $DOCKER_NETWORK"
fi

mkdir -p "$WORKDIR"

if ! docker image inspect "$PG_IMAGE" >/dev/null 2>&1; then
  log "Descargando $PG_IMAGE ..."
  docker pull "$PG_IMAGE" >/dev/null || fail "no pude descargar $PG_IMAGE."
fi

# --------------------------------------------------------------- consultas ---
# Las consultas viven en archivos para no anidar comillas dentro del contenedor.

# Huella estable del contenido: conteo exacto por tabla ordinaria, ordenado y
# resumido en md5, mas el total de filas. `migration_control` queda excluido
# porque es del destino y no existe en el origen.
cat > "$WORKDIR/fingerprint.sql" <<'SQL'
SELECT coalesce(md5(string_agg(t || ':' || n, ',' ORDER BY t)), 'vacio') || ' ' || coalesce(sum(n), 0)
FROM (
  SELECT n.nspname || '.' || c.relname AS t,
         (xpath('/row/c/text()',
                query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname),
                             false, true, '')))[1]::text::bigint AS n
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'r'
     AND n.nspname NOT LIKE 'pg\_%'
     AND n.nspname NOT IN ('information_schema', 'migration_control')
) s;
SQL

# El marcador vive en su propio esquema, ausente del volcado, para que el
# `pg_restore --clean` no lo borre junto con los objetos de la aplicacion.
cat > "$WORKDIR/init_marker.sql" <<'SQL'
CREATE SCHEMA IF NOT EXISTS migration_control;
CREATE TABLE IF NOT EXISTS migration_control.state (
  id                 boolean PRIMARY KEY DEFAULT true CHECK (id),
  source_fingerprint text        NOT NULL,
  source_rows        bigint      NOT NULL,
  completed_at       timestamptz NOT NULL DEFAULT now()
);
SQL

# Las vistas materializadas se restauran vacias y pg_restore emite su REFRESH;
# si alguna quedara sin poblar, las lecturas del tablero saldrian vacias.
cat > "$WORKDIR/matviews.sql" <<'SQL'
SELECT count(*) FILTER (WHERE relispopulated) || '/' || count(*) FROM pg_class WHERE relkind = 'm';
SQL

cat > "$WORKDIR/read_marker.sql" <<'SQL'
SELECT source_fingerprint || ' ' || source_rows || ' ' || completed_at FROM migration_control.state;
SQL

cat > "$WORKDIR/write_marker.sql" <<'SQL'
INSERT INTO migration_control.state (id, source_fingerprint, source_rows, completed_at)
VALUES (true, :'fp', :'rows', now())
ON CONFLICT (id) DO UPDATE
   SET source_fingerprint = EXCLUDED.source_fingerprint,
       source_rows        = EXCLUDED.source_rows,
       completed_at       = EXCLUDED.completed_at;
SQL

# Ejecuta una herramienta del cliente PostgreSQL dentro de la red del destino.
# Las URL viajan como variables de entorno, nunca en la linea de comandos, para
# que las credenciales no queden visibles en `ps` ni en los logs de Docker.
run_pg() {
  docker run --rm \
    --network "$DOCKER_NETWORK" \
    --volume "$WORKDIR:/work" \
    --env SRC="$SOURCE_DATABASE_URL" \
    --env TGT="$TARGET_DATABASE_URL" \
    --env PGCONNECT_TIMEOUT=20 \
    "$PG_IMAGE" sh -c "$1"
}

# Devuelve la primera linea util de una consulta, sin espacios ni retornos.
scalar() { run_pg "$1" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' | grep -v '^$' | head -n 1; }

# ------------------------------------------------------------ conectividad ---

log "Verificando el origen ..."
src_version=$(scalar 'psql "$SRC" -tAc "select version()"') || fail "no pude conectar al ORIGEN."
log "  origen  OK: $(printf '%s' "$src_version" | cut -d, -f1)"

log "Verificando el destino ..."
tgt_version=$(scalar 'psql "$TGT" -tAc "select version()"') \
  || fail "no pude conectar al DESTINO ($target_host) desde la red $DOCKER_NETWORK."
log "  destino OK: $(printf '%s' "$tgt_version" | cut -d, -f1)"

# pg_restore no acepta un volcado producido por un servidor mas nuevo que el
# cliente, y Neon corre PostgreSQL 18.
src_major=$(printf '%s' "$src_version" | sed -E 's/^PostgreSQL ([0-9]+).*/\1/')
cli_major=$(scalar 'pg_dump --version' | sed -E 's/.* ([0-9]+).*/\1/')
if ! [ "$cli_major" -ge "$src_major" ] 2>/dev/null; then
  fail "el origen es PostgreSQL $src_major y $PG_IMAGE trae pg_dump $cli_major. Usa PG_IMAGE=postgres:$src_major."
fi
log "Cliente pg_dump $cli_major sobre origen $src_major: compatible."

# ---------------------------------------------------------------- huellas ---

log "Calculando la huella del origen (conteo exacto por tabla) ..."
src_fp=$(scalar 'psql "$SRC" -tAf /work/fingerprint.sql') || fail "no pude calcular la huella del origen."
src_hash=$(printf '%s' "$src_fp" | awk '{print $1}')
src_rows=$(printf '%s' "$src_fp" | awk '{print $2}')
log "  origen: $src_rows filas, huella $(printf '%s' "$src_hash" | cut -c1-12)"

run_pg 'psql "$TGT" -v ON_ERROR_STOP=1 -q -f /work/init_marker.sql' >/dev/null \
  || fail "no pude preparar migration_control.state en el destino."

prev=$(scalar 'psql "$TGT" -tAf /work/read_marker.sql' || true)
prev_fp=$(printf '%s' "$prev" | awk '{print $1}')
prev_rows=$(printf '%s' "$prev" | awk '{print $2}')

if [ -n "$prev_fp" ]; then
  log "Migracion previa registrada: $prev_rows filas, huella $(printf '%s' "$prev_fp" | cut -c1-12)"
else
  log "No hay migracion previa registrada en el destino."
fi

if [ "$CHECK_ONLY" = "1" ]; then
  if [ "$prev_fp" = "$src_hash" ]; then log "ESTADO: sincronizado."; else log "ESTADO: pendiente de migrar."; fi
  exit 0
fi

if [ "$prev_fp" = "$src_hash" ] && [ "$FORCE" != "1" ]; then
  log "El destino ya coincide con el origen. Nada que hacer (usa FORCE=1 para recopiar)."
  exit 0
fi

# ------------------------------------------------------------------- dump ---

log "Volcando el origen ..."
run_pg 'pg_dump --format=custom --no-owner --no-privileges --no-tablespaces --file=/work/source.dump "$SRC"' \
  || fail "el volcado del origen fallo."
log "  volcado listo ($(du -h "$WORKDIR/source.dump" | cut -f1))."

# ---------------------------------------------------------------- restore ---
# --clean --if-exists lo hace reejecutable sobre una base ya poblada, y sobre una
# vacia los DROP son inocuos. --single-transaction garantiza que un fallo a mitad
# revierta todo en lugar de dejar el destino inconsistente.

log "Restaurando en el destino (transaccion unica) ..."
run_pg 'pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction --exit-on-error --dbname "$TGT" /work/source.dump' \
  || fail "el restore fallo. El destino quedo intacto: la transaccion se revirtio."
log "  restore completado."

# ------------------------------------------------------------ verificacion ---

log "Verificando: comparando conteos tabla por tabla ..."
tgt_fp=$(scalar 'psql "$TGT" -tAf /work/fingerprint.sql') || fail "no pude calcular la huella del destino."
tgt_hash=$(printf '%s' "$tgt_fp" | awk '{print $1}')
tgt_rows=$(printf '%s' "$tgt_fp" | awk '{print $2}')

if [ "$src_hash" != "$tgt_hash" ]; then
  printf 'FALLO: el destino NO coincide con el origen.\n  origen : %s filas (%s)\n  destino: %s filas (%s)\n' \
    "$src_rows" "$src_hash" "$tgt_rows" "$tgt_hash" >&2
  exit 1
fi
log "  coinciden: $tgt_rows filas en origen y destino."

matviews=$(scalar 'psql "$TGT" -tAf /work/matviews.sql' 2>/dev/null || true)
[ -n "$matviews" ] && log "  vistas materializadas pobladas: $matviews"

# El marcador se escribe solo despues de verificar, para que un fallo nunca
# quede registrado como exito y la siguiente ejecucion vuelva a intentarlo.
run_pg 'psql "$TGT" -v ON_ERROR_STOP=1 -q -v fp='"$src_hash"' -v rows='"$src_rows"' -f /work/write_marker.sql' >/dev/null \
  || fail "la migracion termino bien pero no pude registrar el marcador."

log "LISTO. $tgt_rows filas migradas y verificadas. Reejecutar este script no hara nada."
