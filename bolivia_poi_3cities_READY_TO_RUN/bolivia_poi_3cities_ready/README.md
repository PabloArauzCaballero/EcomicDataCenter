# Bolivia POI — Santa Cruz, La Paz y Cochabamba

Paquete listo para generar un dataset real de POI para:

- Santa Cruz de la Sierra
- La Paz
- Cochabamba

Fuente base: Overture Maps.
El extractor no genera registros falsos para completar una cuota.

## Incluye

- 201 familias de entidades.
- Salud.
- Farmacias.
- Hospitales.
- Clínicas.
- Consultorios.
- Educación.
- Colegios.
- Universidades.
- Academias.
- Peluquerías.
- Barberías.
- Supermercados.
- Mercados.
- Restaurantes.
- Comercios.
- Ferreterías.
- Tecnología.
- Automotor.
- Repuestos.
- Talleres.
- Surtidores.
- Bancos.
- Cajeros.
- Cooperativas.
- Seguros.
- Telecomunicaciones.
- Logística.
- Transporte.
- Hoteles.
- Turismo.
- Gobierno.
- Justicia.
- Policía.
- Bomberos.
- Cultura.
- Deportes.
- Parques.
- Plazas.
- Industrias.
- Servicios profesionales.
- Y muchas otras categorías.

## Opción 1 — macOS / Ubuntu / Linux

Descomprimir y ejecutar:

```bash
chmod +x run.sh
./run.sh
```

Los archivos aparecerán en:

```text
output/bolivia-3cities-poi.json
output/bolivia-3cities-poi.ndjson
output/bolivia-3cities-poi.manifest.json
```

## Opción 2 — Docker

```bash
chmod +x run-docker.sh
./run-docker.sh
```

## Opción 3 — Manual

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

python extract_bolivia_3cities_poi.py   --catalog entity_catalog.json   --output output/bolivia-3cities-poi.json   --min-confidence 0.60   --also-ndjson
```

## Windows PowerShell

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\run.ps1
```

## Calidad

El extractor:

- No hace muestreo aleatorio.
- Intenta limitar por polígonos reales de ciudad.
- Excluye registros marcados como permanentemente cerrados.
- Conserva `confidence`.
- Conserva taxonomía original.
- Conserva fuentes upstream.
- No inventa barrios.
- No inventa superficies físicas.
- Marca entidades reguladas para posterior validación con fuentes oficiales.
- Conserva POI no clasificados como `OTRA_ENTIDAD` en lugar de descartarlos.

## Archivos

- `extract_bolivia_3cities_poi.py` — extractor.
- `entity_catalog.json` — catálogo de 201 familias.
- `poi_schema.json` — JSON Schema.
- `requirements.txt` — dependencias.
- `run.sh` — ejecución directa Linux/macOS.
- `run.ps1` — ejecución directa Windows.
- `Dockerfile` — ejecución aislada.
- `run-docker.sh` — build + run Docker.

## Nota importante

El primer arranque requiere conexión a Internet porque DuckDB consulta los Parquet públicos de Overture Maps.
