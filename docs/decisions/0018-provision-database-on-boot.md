# ADR-0018: aprovisionamiento de la base al arrancar y carga histórica versionada

- Estado: aceptado
- Fecha: 2026-08-23
- Responsables: arquitectura, datos y operación

## Contexto

La plataforma de despliegue arranca el proceso y nada más: el contenedor ejecuta
`node dist/main.js` y no existe un paso de release donde colgar `yarn db:migrate`. En consecuencia,
la migración `0031`, que crea los modelos de lectura del tablero, quedó fusionada en `main` sin
llegar nunca a la base real; un cambio de esquema solo alcanzaba producción si alguien se acordaba
de aplicarlo a mano.

Además, el colector diario solo conoce lo que ha visto desde que empezó a funcionar. Un tablero
abierto hoy mostraría el dólar paralelo a partir de agosto, sin forma de leer el año: precisamente
el periodo en que la brecha cambiaria se movió.

## Decisiones

### 1. El arranque deja la base como la espera el build

`provisionDatabase` corre antes de que nada escuche en un puerto: aplica migraciones pendientes y
reconcilia los catálogos boot. Un redespliegue pasa a ser el procedimiento completo.

Ambas mitades son idempotentes, así que el caso normal es que no encuentre nada que hacer y cueste
un advisory lock. Ese lock —`withMigrationLock`, ya existente— se sostiene durante toda la
secuencia, de modo que dos réplicas que arrancan a la vez no migran ni siembran una sobre otra: la
segunda espera y encuentra el trabajo hecho.

El fallo es deliberadamente fatal. Un proceso que no pudo alcanzar el esquema contra el que fue
construido respondería con errores que parecen problemas de datos, y es preferible que la
plataforma mantenga sirviendo la versión anterior. El interruptor `DATABASE_PROVISION_ON_BOOT`
—activo por omisión— permite desactivarlo sin tocar código.

**Consecuencia asumida:** si la base es inalcanzable al arrancar, la aplicación ya no levanta en
estado «no listo»; directamente no levanta.

### 2. La serie histórica se versiona, no se descarga al arrancar

La cotización diaria del dólar paralelo desde el 1 de enero de 2026 se obtuvo una vez del export
histórico de su editor y se conserva en `src/database/seeds/boot/fx-parallel-history.json` junto a
su procedencia: URL exacta con el rango, instante de obtención y sha256 del payload del que salió.

Un despliegue no debe depender de que un endpoint de terceros esté disponible en el arranque, y un
fichero versionado es revisable de una forma que una descarga en vivo nunca es. Cualquiera puede
pedir el mismo rango al editor y comparar el digest.

**No son datos de demostración.** Los seeds mock están bloqueados en producción por diseño y nunca
habrían llegado a la base real. Esta serie entra en las mismas tablas gobernadas que la recolección
diaria, con la misma procedencia —editor, URL, digest— y bajo una identidad propia
(`FX_PARALLEL_HISTORY_BACKFILL`, `trigger_type = 'BACKFILL'`, valores que el esquema ya contemplaba)
para que una lectura recogida se distinga siempre de una cargada de archivo.

La idempotencia usa el hash canónico del propio payload, el mismo que emplea la vía de ingesta: una
segunda ejecución encuentra las 235 filas presentes y no escribe nada.

### 3. Promedio diario y lectura puntual no se mezclan en silencio

El histórico se publica como promedio diario de las cotizaciones intradía; el colector registra el
precio en el momento en que miró. Ambos son legítimos y ambos pertenecen al mismo gráfico, pero son
estadísticos distintos: dibujarlos como una sola línea sin decirlo pondría una costura invisible en
mitad del año.

Los modelos de lectura arrastran `aggregation`, la serie diaria agrupa por ese campo —así que un día
cubierto por ambos produce dos filas, una por estadístico, en lugar de un número que no es ninguno—
y la brecha prefiere la lectura observada cuando existe, informando siempre cuál usó.

## Alternativas descartadas

- **Paso de release en el panel de la plataforma.** Más limpio conceptualmente, pero exige
  configurarlo fuera del repositorio: un commit dejaría de bastar, que era el requisito.
- **Descargar el histórico en cada arranque.** Ata el arranque a la disponibilidad de un tercero y
  hace que dos despliegues del mismo commit puedan cargar datos distintos.
- **Reconstruir el valor desde la prosa de las afirmaciones ya publicadas.** Es justamente lo que la
  medición estructurada existe para evitar.

## Evidencia

Contra PostgreSQL 17 en contenedor desechable: `yarn db:verify:migrations` **PASS** (install,
upgrade, rollback, reapply); `yarn db:seed:verify` **PASS**; el seed ejecutado tres veces deja 235
observaciones, 235 afirmaciones, 1 artefacto y 1 run, sin duplicados; y la aplicación construida,
arrancada contra una base vacía, aplicó 31 migraciones y dejó 470 lecturas entre 2026-01-01 y
2026-08-23 con `/ready` respondiendo `ready`. Un reinicio posterior no duplicó nada.
