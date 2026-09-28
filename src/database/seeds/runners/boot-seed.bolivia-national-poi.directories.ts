/**
 * Los directorios que carga `boot-seed.bolivia-national-poi.ts`, uno por entrega.
 *
 * Viven aparte porque la lista crece con cada entrega y el cargador no.
 */

/*
 * Dos entregas, un solo corpus. La nacional lee todo el pais desde Overture y
 * OpenStreetMap; la ampliacion lee Cochabamba y La Paz de OpenStreetMap en
 * vivo. Comparten esquema, categoria de dato y modelo de lectura, y cada una
 * trae su propia procedencia, asi que cada una registra su propio artefacto.
 * Se listan por separado para que anadir una tercera no obligue a tocar nada
 * mas que esta constante.
 */
export const PLACE_DIRECTORIES = [
  'boot/bolivia-national-poi',
  'boot/bolivia-expansion-poi',
  'boot/bolivia-capitals-poi',
  /*
   * El registro mercantil va aparte del resto y no por orden: es la unica
   * entrega que no llega bajo licencia abierta, y tenerla en su propio
   * directorio hace que retirarla sea borrar una carpeta y volver a desplegar.
   */
  'boot/bolivia-registry-poi',
  'boot/bolivia-registry-additional-poi',
  /*
   * La entrega de establecimientos recuperados llega partida por la misma
   * razon: lo que viene de OpenStreetMap trae licencia abierta y lo que viene
   * del registro sanitario y de los directorios de las propias entidades no
   * trae ninguna. Separadas, retirar las segundas es borrar una carpeta.
   */
  'boot/bolivia-establishments-poi',
  'boot/bolivia-establishments-registry-poi',
  /*
   * Farmacias, hospitales, postas y demas establecimientos de salud que
   * ninguna entrega anterior traia, leidos de OpenStreetMap y clasificados
   * por `read-health-osm.mjs` porque esta vez nadie los entrego ya
   * clasificados. Abierta bajo ODbL-1.0, como el resto de lo cartografico.
   */
  'boot/bolivia-health-poi',
  /*
   * Tres fuentes oficiales propias, cada una en su directorio porque cada una
   * tiene su propio publicador, su propia licencia declarada y su propio
   * regulador: el Ministerio de Educacion, la ANH y un directorio privado que
   * ningun regulador respalda.
   */
  'boot/bolivia-sie-poi',
  'boot/bolivia-anh-poi',
  'boot/bolivia-cajeros-poi',
  /*
   * La primera que no entrego nadie: la descargo el observatorio de
   * OpenStreetMap, por departamento, para los rubros que el corpus casi no
   * tenia —agro, industria, mineria, oficinas financieras, gobierno, turismo,
   * cultura y deporte—. Ver `scripts/places/build-osm-expansion-poi-seed.mjs`.
   */
  'boot/bolivia-osm-expansion-poi',
  /*
   * Puertos, aeropuertos, terminales, paradas y estaciones, leidos en vivo de
   * OpenStreetMap por `build-transport-poi-seed.mjs`. Misma licencia abierta
   * que el resto de OpenStreetMap en este corpus, asi que va en su propio
   * directorio por trazabilidad de la entrega y no por licencia distinta.
   */
  'boot/bolivia-transport-poi',
  /*
   * Comercio y servicios de Santa Cruz de la Sierra leidos en vivo de
   * OpenStreetMap (minoristas, gastronomia, oficios), para el 34% de la
   * ciudad que quedaba en `OTRA_ENTIDAD` u `OV_SERVICES_AND_BUSINESS`. Ver
   * `scripts/places/build-scz-enrichment-poi-seed.mjs` y
   * `docs/runbooks/santa-cruz-commerce-enrichment.md`.
   */
  'boot/bolivia-scz-enrichment-poi',
  'boot/bolivia-overture-refresh-poi',
  'boot/bolivia-osm-sweep-poi',
  'boot/bolivia-asfi-poi', // sin licencia abierta, como SEPREC
  /*
   * La red de salud que el corpus no tenia: los puestos y centros de salud del
   * registro del Ministerio (estructura de establecimientos del SNIS-VE,
   * gestion 2026), con la coordenada del mapa del SUS del propio Ministerio, y
   * las farmacias publicas, municipales, de las cajas y privadas del registro
   * de AGEMED que la entrega del 2026-09-21 dejo fuera. Ver
   * `docs/runbooks/snis-health-load.md`.
   */
  'boot/bolivia-snis-health-poi',
  'boot/bolivia-agemed-pharmacies-poi',
  /*
   * Lo que Foursquare Open Source Places tenia de salud y el corpus no: directorio
   * colaborativo, Apache-2.0. Lo no actualizado desde antes de 2020 entra marcado.
   * Ver `docs/runbooks/fsq-health-load.md`.
   */
  'boot/bolivia-fsq-health-poi',
] as const;
