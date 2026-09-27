# Catálogo de sembradores

## Por qué existe un manifiesto

«Los seeds» era una sola palabra para cuatro cosas distintas:

- ocho catálogos que son las filas a las que apunta todo lo demás, sin los cuales el
  entorno no puede admitir una observación;
- dos paquetes de identidades y calendarios técnicos que el producto necesita;
- diecisiete corpus que ocupan 155 MB y tardan minutos;
- un conjunto sintético que jamás debe llegar a producción.

Tratarlos como «los seeds» es lo que hacía de «el despliegue está sembrado» una frase sin
significado comprobable. El manifiesto (`src/database/seeds/manifest.ts`) los separa,
declara las dependencias y deja que el orden se derive en lugar de escribirse.

## Clases y perfiles

| Clase | Comportamiento |
| --- | --- |
| `REQUIRED_METADATA` | Debe estar antes de admitir las operaciones que dependen de ella. |
| `OBSERVATORY_BASELINE` | Identidades y calendarios no secretos que el producto necesita. |
| `HISTORICAL_DATA` | Corpus grandes; se aplican por pasos y se reanudan por checkpoint. |
| `DEMO_DATA` | Solo con activación explícita fuera de producción. Rechazo antes de escribir. |

`SEED_PROFILE` declara hasta dónde llega un despliegue: `metadata`, `baseline` o
`historical`. **Los datos de demostración no están en ningún perfil**: no son un grado de
completitud sino otra clase de contenido, y necesitan su propio interruptor
(`SEED_DEMO_ENABLED`) precisamente para que «cargarlo todo» no pueda significar nunca
«cargar también las filas falsas».

## Paquetes

| Código | Clase | Propiedad | Depende de | Cubre |
| --- | --- | --- | --- | --- |
| `core-catalogues` | REQUIRED_METADATA | `seed_owned` | — | frecuencias, unidades, monedas, territorio, países, dominios, dimensiones de calidad, CAEB |
| `collector-identities` | OBSERVATORY_BASELINE | `seed_owned` | core-catalogues | organización, fuente de agentes, 19 agentes |
| `source-schedules` | OBSERVATORY_BASELINE | `seed_owned` | collector-identities | calendario declarado por fuente |
| 17 paquetes históricos | HISTORICAL_DATA | `create_only` | core-catalogues, collector-identities | tipo de cambio, macro, mercados, BCB, UFV, BBV, índices, comercio exterior, hechos relevantes (×3), prensa (×2), lecturas sociales, panel mundial, lugares (×2) |
| `observatory-demo` | DEMO_DATA | `create_only` | core-catalogues | datos sintéticos |

## Checksum

Se calcula sobre: el código del paquete, su versión declarada y, por cada archivo en orden
de ruta, la ruta, el número de bytes y el SHA-256 de esos bytes.

Bytes y no JSON re-serializado: el corpus son 155 MB y canonicalizarlo convertiría cada
validación en un trabajo de minutos. El repositorio almacena y extrae LF para todo archivo
de texto (`.gitattributes`), así que los bytes son los mismos en cualquier máquina, y
Prettier ya rechaza la deriva de formato, que es de lo que la canonicalización tendría que
defender.

Incluir la versión declarada hace que subirla cambie la huella aunque no cambie ningún
archivo: una re-publicación siempre se distingue de la publicación que reemplaza.

**Mismo código y misma versión con checksum distinto es un conflicto, no una
actualización.** Cambiar contenido exige subir la versión.

## Política de diferencias

| Propiedad | Qué significa |
| --- | --- |
| `seed_owned` | El paquete gobierna esos campos; una diferencia es una reparación. |
| `create_only` | El paquete crea lo que falta y no sobrescribe lo que alguien cambió; una diferencia es un conflicto que se muestra. |
| `versioned` | Una evolución crea una versión nueva y conserva las referencias. |

Cuatro estados que **no** se mezclan en la pantalla:

- **Faltantes**: el paquete las declara y la tabla no las tiene.
- **Modificados**: los campos gestionados difieren.
- **Adicionales**: la tabla los tiene y el paquete no los declara. **No es una
  divergencia** y nunca se borran.
- Todo lo demás coincide.

Un corpus informa que no se comparó fila a fila, y dice por qué, en vez de informar cero
diferencias que nunca buscó.

## Algoritmo de aplicación

1. Resolver el manifiesto y sus dependencias **en el servidor**.
2. Rechazar demo en producción y paquetes fuera del perfil. El rechazo de demo es lo
   primero, para que no dependa de que ningún otro control pase.
3. Validar el JSON, las referencias y la versión mínima de esquema **de la base**, no del
   build: preguntarle al build qué migraciones existen responde otra pregunta.
4. Tomar el candado consultivo por base y paquete, en una conexión fijada. Nunca se abre
   un segundo candado exclusivo anidado, y este camino no toma el candado de migraciones,
   así que no puede formarse un ciclo.
5. Leer el registro. Si versión y checksum ya coinciden, es un no-op que igual deja
   constancia de que alguien comprobó.
6. Comparar los campos gestionados; no basarse en el número de filas.
7. Aplicar por pasos. Cada paso commitea con el checkpoint que lo registra, y el último
   commitea además la entrada del registro.
8. Un fallo se anota fuera de la transacción revertida; el latido durable hace que un
   proceso muerto siga siendo diagnosticable.
9. Reconstruir **solo** las copias que este paquete puede haber cambiado, más las que
   nunca se construyeron. Reconstruirlas todas cuesta minutos y fue lo que puso el
   servidor en carga 95 el 2026-09-09.
10. Liberar el candado y emitir un resultado auditable.

### Reanudación

Un reintento hereda el checkpoint de un intento anterior **solo** si ese intento quedó
`FAILED` o `ABANDONED` — los dos estados en que los pasos quedaron a medias. `PARTIAL` no
cuenta: sus pasos corrieron y lo único que faltó fue la publicación, así que heredar su
checkpoint dejaría cero pasos pendientes y convertiría una re-aplicación deliberada en un
no-op que además informaría éxito. Un checkpoint que ya cubre todos los pasos se descarta
por la misma razón.

## Qué escribe el registro, y quién

`operations.seed_application` lo escriben dos caminos y ambos cuentan:

- el aprovisionamiento de arranque (`runBootSeeds`), para que un despliegue sembrado
  correctamente no aparezca como «no aplicado»;
- la consola, cuando un operador reconcilia.

Un fallo al anotar deja el paquete leyéndose como ausente. Es la dirección conservadora:
declara de menos en vez de afirmar un catálogo que no está.
