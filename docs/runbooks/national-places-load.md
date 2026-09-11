# Carga del registro nacional de lugares

Cómo se construye y se carga el corpus de lugares de toda Bolivia (`NATIONAL_POI`),
entregado el 2026-09-11 como nueve partes ZIP firmadas con 80 lotes de candidatos.

El corpus de tres ciudades (`CITY_POI`, 26.671 lugares, migración 0070) **no se toca**.
Éste entra en su propia categoría de dato y lo lee su propio modelo (migración 0073).

## Lo que hay que saber antes de tocar nada

| Hecho medido | Cifra |
| --- | --- |
| Registros candidatos en la entrega | 76.412 |
| De ellos, ya presentes en la base | 24.563 |
| Realmente nuevos | 51.849 |
| Familias que la entrega usa | 731 |
| Familias distintas entre los 51.849 nuevos | 567 |
| De ésas, definidas por el catálogo de 201 | 143 |
| Sin definir (7.773 registros) | 424 |

**Los 24.563 repetidos no los detecta el cargador.** Es idempotente por huella del
payload, y el payload nacional tiene otra forma que el de tres ciudades, así que la
misma farmacia hashea distinto y entraría dos veces. Quien los quita es el
constructor de la siembra, cruzando el identificador de Overture. Por eso la
siembra se construye con este script y no a mano.

## Procedimiento

### 1. Verificar la entrega

```sh
cd bolivia_nacional_completo
# las nueve partes contra metadatos/manifest_partes_sha256.json
# y, dentro de cada parte, manifest_sha256.json contra sus lotes
```

Verificado el 2026-09-11: las nueve partes y los 98 archivos internos coinciden.

### 2. Descomprimir

```sh
mkdir -p /ruta/entrega
for z in partes/*.zip; do unzip -oq "$z" -d /ruta/entrega; done
```

Queda `/ruta/entrega/parte_01..09/candidatos/*.json`. El constructor lee de ahí y
nunca abre los ZIP, para que el paso que comprueba las firmas siga a la vista.

### 3. Construir la siembra

```sh
node scripts/places/build-national-poi-seed.mjs \
  --delivery  /ruta/entrega \
  --metadata  bolivia_nacional_completo/metadatos \
  --catalogue <catálogo de familias, CSV o JSON>
```

**No escribe nada si el catálogo no define todas las familias de la entrega.** Deja
en su lugar `artifacts/national-poi-missing-families.json` con los códigos que
faltan, cuántos registros afecta cada uno y de qué categorías del publicador vienen.
Eso es el encargo del catálogo, no un error del script: `is_regulated` dice si un
regulador boliviano licencia la actividad, y adivinarlo publicaría un estado de
licencia inventado sobre lugares que nadie comprobó.

### 4. Cargar

```sh
yarn db:seed:boot --only=bolivia-national-poi
```

Recordatorio de `CLAUDE.md`: **`db:*` apunta a Neon por `.env`**. Para una base local,
pasa las `DATABASE_*_URL` en la misma línea. No se ejecuta contra producción sin plan,
respaldo y aprobación.

### 5. Leer

Migración 0073, en `read_models`:

- `national_place` — una fila por lugar.
- `national_place_family` — cuántos lugares por familia, cuántos regulados, cuántos
  con familia refinada, cuántos situados en una localidad y cuántos de cada publicador.

## Lo que el corpus no dice

- **No hay ciudad ni departamento.** La entrega no los publica: `region` viene vacío
  en 36.991 de los 37.278 registros de Overture y trae `S`, `L` o `H` en casi todo el
  resto, y la mitad de OpenStreetMap no trae localidad alguna. Lo que sí se conserva
  es `locality`, el nombre de población que Overture escribió en la dirección. No es
  un municipio. Derivar el departamento exigiría polígonos que no están en la entrega.
- **La mitad no trae confianza.** OpenStreetMap no publica ese número. `confidence`
  es nulo en 39.134 filas y eso no es una confianza baja.
- **8.132 coordenadas son centroides**, no puertas: el rasgo original era un polígono.
  Lo dice `position_method`.
- **Nada está verificado en campo.** La entrega lo declara: `operacion_actual_verificada`
  y `existencia_actual_verificada_en_campo` son falsos en los 76.412 registros.
- **Dos licencias.** Overture llega bajo CDLA-Permissive-2.0 y OpenStreetMap bajo
  ODbL-1.0. La segunda obliga a atribuir; cada fila lleva la suya en `licence`.
