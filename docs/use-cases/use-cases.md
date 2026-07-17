# Casos de uso del core de datos

## Actores

| Actor | Responsabilidad |
|---|---|
| Técnico institucional de datos | Registra datos individuales o importa lotes autorizados. |
| Sistema fuente institucional | Entrega archivos, API o paquetes estructurados. |
| Analista o investigador | Consulta series, observaciones, revisiones y metadatos. |
| Responsable metodológico | Mantiene estructuras, clasificaciones y versiones metodológicas. |

## UC-01 — Registrar dato

### Objetivo
Incorporar una observación estadística con su contexto completo, sin perder procedencia ni revisiones anteriores.

### Precondiciones
- Existe un `dataset_version` publicado o habilitado.
- La estructura define dimensiones y medidas válidas.
- Existe un artefacto fuente o evidencia documental identificable.
- Los códigos utilizados existen y están vigentes.

### Flujo principal
1. El técnico selecciona el dataset y su versión.
2. Registra periodo, dimensiones, medidas y atributos.
3. El sistema valida la estructura.
4. El sistema construye la clave canónica de la serie.
5. Recupera o crea la serie.
6. Recupera o crea la observación del periodo.
7. Crea una nueva revisión.
8. Vincula la revisión al artefacto y al lote.
9. Ejecuta reglas de calidad.
10. Publica la revisión o la deja en estado no publicable si existe una falla crítica.

### Alternativas
- Si la estructura es inválida, no se modifica el core.
- Si la observación ya existe y el valor cambia, se crea una revisión N+1.
- Si el valor no cambia, no se duplica la revisión.
- Si una regla crítica falla, se abre una incidencia.

### Postcondición
La cifra puede reconstruirse con su fuente, metodología, versión y estado de calidad.

---

## UC-02 — Importar lote de datos

### Objetivo
Registrar múltiples observaciones desde un archivo, API, base externa o paquete SDMX.

### Flujo principal
1. Se recibe el artefacto.
2. Se calcula y verifica SHA-256.
3. Se crea `source_artifact`.
4. Se crea `data_entry_batch`.
5. Se valida formato y esquema.
6. Se normalizan códigos y periodos.
7. Se resuelven series.
8. Se crean observaciones o revisiones.
9. Se ejecutan controles individuales y agregados.
10. El lote termina como `COMMITTED`, `PARTIAL`, `REJECTED` o `FAILED`.

### Regla clave
El lote no es la fuente estadística; es la operación de ingreso. La fuente original queda preservada en `source_artifact`.

---

## UC-03 — Consultar datos

### Objetivo
Recuperar datos mediante indicador o dataset, filtros dimensionales y periodo.

### Flujo principal
1. El usuario selecciona indicador o dataset.
2. Define filtros dimensionales y temporales.
3. El sistema valida los filtros contra `data_structure`.
4. Localiza las series compatibles.
5. Recupera observaciones y revisión actual.
6. Adjunta unidad, atributos, fuente, metodología y estado de calidad.
7. Devuelve resultados paginados o exportables.

### Resultado mínimo
Cada valor debe incluir identificación de serie, periodo, medida, revisión, fuente y estado.

---

## UC-04 — Consultar revisión histórica

### Objetivo
Reconstruir la información disponible en una fecha de corte.

### Regla
Debe seleccionarse la revisión cuya vigencia incluía la fecha solicitada, no simplemente la revisión actual.

### Ejemplo
Consultar qué valor del PIB 2024 estaba publicado al 30 de junio de 2025.

---

## UC-05 — Consultar trazabilidad y calidad

### Objetivo
Explicar el origen y transformación de una cifra.

### Resultado
- organización productora;
- fuente;
- artefacto y hash;
- lote;
- metodología;
- dataset y versión;
- serie y dimensiones;
- revisión;
- evaluaciones de calidad;
- incidencias;
- relaciones de linaje;
- rupturas de serie.

---

## UC-06 — Mantener metadatos y clasificaciones

### Objetivo
Crear o versionar metodologías, datasets, estructuras, listas de códigos y clasificaciones.

### Regla
Una modificación metodológica relevante produce una nueva versión. No debe alterarse retroactivamente una versión publicada.
