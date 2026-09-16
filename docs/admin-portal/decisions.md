# Decisiones del portal administrativo

Una decisión por apartado: qué se eligió, contra qué se decidió y qué haría falta
para revertirla. Las decisiones de arquitectura de todo el núcleo siguen viviendo
en `docs/decisions/`; aquí solo están las que este trabajo tomó.

## 1. El portal extiende el núcleo; no monta un segundo backend

**Elegido.** Consultas y operaciones administrativas dentro del núcleo
(`src/modules/admin`), y un área privada en el tablero que las consume.

**Contra.** Un servicio administrativo aparte con su propia conexión a
PostgreSQL. Se descartó porque habría duplicado autorización, auditoría y
lectura: dos implementaciones de «quién puede hacer qué» se contradicen el día
que una cambia, y la contradicción no la ve nadie hasta que alguien la explota.

**Coste de revertir.** Alto. Las pantallas hablan con rutas versionadas del
núcleo; mover esas rutas a otro proceso obliga a reemitir credenciales y a
replicar el RBAC.

## 2. El tablero público conserva su conexión de solo lectura

**Elegido.** El área privada no usa la conexión pública. Cada llamada privada se
hace en el servidor con un JWT RS256 acuñado por petición, y el núcleo lo
verifica contra el JWKS que el tablero publica.

**Contra.** Elevar la conexión existente del tablero y leer las tablas de
operación directamente. Se descartó por la restricción explícita del plan y
porque una conexión con más permisos en el proceso que sirve la portada pública
convierte cualquier fallo de renderizado en un incidente de datos.

**Coste de revertir.** Bajo en código y alto en riesgo; no debería revertirse.

## 3. La telemetría de exportación se espera, con techo

**Elegido.** `/api/export` espera el registro de cada etapa (`REQUESTED`,
`GENERATED`, `FAILED`) con un techo de 2 s por llamada.

**Contra.** Dejar la llamada suelta (`void`) o programarla con `after()` de
Next.js. Ambas se probaron y ambas pierden etapas: con `void` se perdieron las
ocho de ocho exportaciones medidas; con `after()`, dos de doce, sin dejar ni
siquiera un aviso en el registro del servidor. Un registro que pierde etapas es
peor que no tenerlo, porque los huecos se leen como exportaciones que nadie
pidió. Con la espera acotada, catorce de catorce quedaron completas.

El techo es lo que impide que esto convierta un registro roto en una descarga
rota: `EXP-05` apaga el receptor y comprueba que el archivo llega igual, íntegro,
y que el hueco es visible como hueco.

**Coste de revertir.** Bajo. Es un `await` y una constante.

## 4. Los sembradores se aplican por paquete, con cerrojo y punto de control

**Elegido.** Un cerrojo consultivo por (base, paquete) sobre una conexión fijada,
y un punto de control que solo se amplía **después** del `COMMIT` de la unidad
que describe.

**Contra.** Un punto de control ampliado dentro de la misma transacción. Se
descartó porque un fallo entre la escritura del punto y el commit deja al
registro afirmando que se aplicó una unidad que no existe, y la reanudación se la
salta. El caso `SEED-06` inyecta exactamente ese fallo.

**Coste de revertir.** Bajo, pero reintroduce la pérdida silenciosa.

## 5. El modelo físico se genera; la 0075 lleva su SQL dentro

**Elegido.** Todo el SQL de la migración `0075` está en el propio archivo de
migración, no en `migration-sql/`.

**Contra.** Separar el SQL como hacen otras migraciones. No se pudo: el analizador
del modelo físico (`scripts/physical_model_parser.py`) solo lee
`src/database/migrations/*.ts`, de modo que el SQL externo era invisible para él y
la puerta `quality:physical-model` reportaba deriva de claves foráneas contra
tablas que sí existían.

**Coste de revertir.** Requiere enseñar al analizador a seguir los archivos
externos. Es la corrección de fondo y queda anotada como pendiente, no como
hecho.

## 6. El refresco de vistas materializadas pasa por una función `SECURITY DEFINER`

**Elegido.** `read_models.refresh_snapshot(name, concurrently)`, con
`search_path` fijado y validación del nombre contra `pg_class`.

**Contra.** Conceder al escritor permiso sobre `read_models`. Se descartó porque
la 0014 se lo revoca a propósito: el escritor no debe poder tocar las copias
publicadas. La función da exactamente una capacidad —refrescar una copia que
existe— sin abrir el esquema.

Esto cierra el CI en rojo que arrastraba el proyecto desde el 2026-09-08.

**Coste de revertir.** Bajo, pero devuelve el rojo.

## 7. La evidencia de auditoría se referencia por resultado y, si no, por ruta

**Elegido.** `extractReference` lee el resultado a través de `toJSON` cuando lo
hay, y el interceptor cae a la ruta (`referenceFromPath`) cuando el resultado no
nombra nada —incluidas las respuestas rechazadas.

**Contra.** Dejarlo como estaba. No era viable: una instancia de Sequelize guarda
sus atributos en `dataValues`, así que leer sus propiedades propias no encontraba
ningún identificador y **toda** escritura quedaba registrada como una acción
contra nada. La pantalla `/admin/quality/issues/{id}` mostraba historial vacío
por esta razón, y los rechazos no eran atribuibles a ninguna entidad.

**Coste de revertir.** Bajo, y deja el rastro sin poder unirse a lo que describe.

## 8. Las reglas de calidad declaran su población

**Elegido.** Cada evaluación guarda `numerator`, `denominator`, `not_evaluated`,
`evaluation_scope` y `rule_version`; una regla sin población es `NOT_EVALUATED`,
nunca `PASS`.

**Contra.** Guardar solo el veredicto. Se descartó porque «cumple» sobre cero
filas y «cumple» sobre cuarenta mil son la misma palabra y no la misma noticia.

**Coste de revertir.** Medio: hay columnas y una restricción de control.

## 9. `UNKNOWN` no abre ni cierra incidentes

**Elegido.** Un sondeo que no se pudo ejecutar se registra y no decide nada.

**Contra.** Tratarlo como fallo (infla incidentes con problemas del monitor) o
como éxito (un monitor caído cerraría una caída real). Ambas convierten un fallo
de observación en una afirmación sobre el sitio.

**Coste de revertir.** Bajo. Está en `SiteAvailabilityService` y cubierto por
`HLT-03`.

## 10. Sin infraestructura distribuida

**Elegido.** Ni colas, ni Redis, ni procesos trabajadores. La retención de
telemetría se aplica en la escritura, con un borrado acotado sobre una columna
indexada.

**Contra.** Un programador de tareas para la retención. Se descartó por el ADR
0003 y por la puerta `quality:async-scope`, y porque añadir una pieza cuyo único
trabajo es borrar filas es infraestructura que hay que operar.

**Coste de revertir.** Bajo, pero requiere un ADR.
