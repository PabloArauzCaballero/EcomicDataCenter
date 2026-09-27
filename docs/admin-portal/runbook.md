# Runbook del portal administrativo

Cuatro situaciones que la consola señala y qué hacer con cada una. En todas, el primer
paso es el mismo: abrir la tarjeta del resumen y seguir el enlace, porque cada cifra del
resumen abre el listado que la reproduce.

---

## Una fuente aparece atrasada

**Qué significa exactamente.** No que su dato más nuevo sea viejo. Significa que no hubo
una consulta con éxito dentro del intervalo que la fuente declara más su tolerancia. Una
serie anual publicada cada marzo no está atrasada en febrero, y una fuente diaria que
respondió hoy con la misma cifra de ayer no está atrasada: no tuvo novedades, que es un
resultado.

1. `/admin/ingestion` → la columna **Estado** lleva el motivo en su `title`.
2. Si dice **«Sin calendario declarado»**, no es un atraso: es que nadie declaró qué
   promete esa fuente. Se arregla añadiendo la entrada en
   `src/database/seeds/boot/source-schedules.json`, subiendo la versión del paquete
   `source-schedules` y reconciliándolo desde `/admin/seeds`.
3. Si dice **«Sin consulta exitosa en N h»**, mirar «Última consulta con éxito» frente a
   «Último dato». Si la consulta es reciente y el dato no, la fuente respondió sin
   novedades. Si ninguna es reciente, el recolector no está llegando.
4. Abrir la ejecución más reciente de esa fuente y leer sus **etapas**. Una recolección
   correcta con una entrega fallida es una fila distinta de una recolección que no ocurrió.

---

## Un sembrador falla o diverge

**Conflicto de checksum.** Una misma versión aplicada con dos contenidos. No se resuelve
volviendo a aplicar: se resuelve subiendo la versión del paquete. Absorberlo en silencio
destruiría la única constancia de cuál de los dos contenidos está en la base.

**Faltan metadatos obligatorios.** El resumen lo marca en rojo. `/admin/seeds` → validar
el paquete → leer la diferencia → aplicar. La validación no escribe nada.

**Una ejecución quedó `FAILED`.**

1. `/admin/seeds/runs/<id>` → **Pasos completados** dice hasta dónde llegó.
2. Volver a pedir la reconciliación: hereda ese checkpoint y sigue desde ahí. Un corpus
   cuyo sexto paso falló no vuelve a pagar los cinco primeros.
3. Si el detalle dice **«Otra ejecución tiene el candado»**, el estado es `CANCELLED` y no
   hay nada que reparar: otra está haciendo el trabajo.

**Una ejecución quedó `ABANDONED`.** El latido se detuvo más tiempo que el arrendamiento
(`SEED_RUN_LEASE_SECONDS`, por defecto 900 s). El proceso murió. Es seguro volver a
pedirla: reanuda por checkpoint y los sembradores son idempotentes.

**Una ejecución quedó `PARTIAL`.** Los datos están; la publicación no. Ver abajo.

---

## Datos aplicados y publicación pendiente

Es el estado que un pipeline en verde escondía durante dos semanas.

1. `/admin/health` → **Publicación por conjunto**. Un conjunto en `PENDING` o `FAILED`
   lleva el motivo.
2. **Copias guardadas**: «Nunca construida» significa que la migración la creó vacía y
   nadie la llenó. Una copia sin construir **falla en cualquier lectura**; no es una copia
   vacía.
3. Reconstruir:

   ```bash
   yarn snapshots:refresh
   ```

   La API también lo hace sola al arrancar, pero solo para las copias que nunca se
   construyeron: reconstruirlas todas en cada arranque es una carga que este servidor se
   midió incapaz de sostener.
4. Si el error es `permission denied for schema read_models`, la base no tiene la función
   `read_models.refresh_snapshot` que añade la migración 0075. Aplicar las migraciones.
   `REFRESH MATERIALIZED VIEW` exige ser dueño de la vista y ningún `GRANT` lo sustituye.

---

## El monitor externo no dice nada

**`Sin telemetría` no es `en pie`.** Una comprobación que nunca corrió y un sitio que
nunca falló producen el mismo cero en un contador de errores, y solo una de las dos es
buena noticia.

1. `/admin/health` → si **Comprobaciones** está vacío, nadie ha mirado el sitio desde
   fuera.
2. Encender el monitor interno en el despliegue que deba tenerlo —y **solo en uno**:

   ```
   HEALTH_MONITOR_ENABLED=true
   HEALTH_MONITOR_TARGET_URL=https://…
   HEALTH_MONITOR_INTERVAL_MS=60000
   HEALTH_MONITOR_FAILURE_THRESHOLD=3
   HEALTH_MONITOR_RECOVERY_THRESHOLD=2
   ```
3. Un incidente abre tras tres fallos consecutivos y cierra tras dos éxitos. Las rachas se
   leen del registro, no de la memoria, así que un proceso que se reinicia a mitad de una
   caída no vuelve a empezar la cuenta.
4. **Entrega e incidente son estados distintos.** Un webhook que rechaza conexiones es un
   problema de entrega; informarlo como «sin incidente» sería la segunda caída tapando la
   primera. La columna **Avisos** dice cuántos intentos y cuántos llegaron.

---

## Aprovisionar una base nueva

```bash
yarn db:migrate
yarn db:seed:boot            # todos los catálogos y corpus
yarn db:seed:boot --only=press-archive   # o uno solo
```

La siembra abre su pool con un techo de sentencia propio de una hora. El techo del runtime
(15 s) protege una petición, no un aprovisionamiento: sobre una base ya cargada cancelaba
un `upsert` de catálogo y dejaba el arranque a medias.

Después, `/admin/seeds` debe mostrar `core-catalogues`, `collector-identities` y
`source-schedules` como **Aplicado**. Si no, el registro no se anotó y el arranque lo
habrá dicho por `stderr`.

---

## Qué mirar antes de creerle a una cifra

- **El entorno**, arriba a la izquierda en cada pantalla. Sale de la configuración del
  servidor y el navegador no puede cambiarlo.
- **`Observado`**, en la cabecera. Es cuándo se observó la evidencia, no cuándo se pintó
  la página.
- **El denominador.** Una pantalla de calidad que muestra «80 %» sin decir de cuántos no
  está diciendo nada.
