import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Op, type Transaction } from 'sequelize';
import { RawObservationModel, SourceArtifactModel } from '../../models';
import { reconcileHistoryRun } from './boot-seed.history-provenance';
import { rawPayloadHash } from '../../../common/intelligence/claim-normalizer';
import { loadNationalPlaceBatch } from './boot-seed.bolivia-national-poi.batch';
import { reconcilePlaceMunicipalities } from './boot-seed.bolivia-place-municipality';
import {
  boliviaNationalPoiSchema,
  type BoliviaNationalPoi,
  type NationalPoiPlace,
} from '../schemas/bolivia-national-poi.schema';
import { readSeed } from './seed.utils';

/**
 * Loads the places of Bolivia, from Overture and OpenStreetMap together.
 *
 * The three-city corpus stays where it is. This one is filed under its own
 * data category and read by its own model, so that loading the country does
 * not silently change what the report about three cities has been saying.
 *
 * The corpus that reaches this loader has already had every place the
 * observatory holds removed from it, by identifier, when the seed was built.
 * That is deliberate and it is not something this loader could have done: it
 * is idempotent by payload hash, and the national payload has a different
 * shape from the three-city one, so a place present in both would hash
 * differently and land twice. The build step is where the two corpora are
 * compared; this step only refuses to load the same delivery twice.
 */

const AGENT_CODE = 'NATIONAL_POI';
const CHUNK = 500;
/*
 * El corpus viaja partido por la misma razon medida que el de tres ciudades:
 * entero son mas de cincuenta megabytes que `JSON.parse` y Zod sostienen en
 * memoria a la vez, dentro de la misma carga que ya lleva prensa y lugares.
 * En piezas de mil doscientos el pico es el de una pieza y la carga sigue
 * siendo una sola transaccion.
 */
/*
 * Dos entregas, un solo corpus. La nacional lee todo el pais desde Overture y
 * OpenStreetMap; la ampliacion lee Cochabamba y La Paz de OpenStreetMap en
 * vivo. Comparten esquema, categoria de dato y modelo de lectura, y cada una
 * trae su propia procedencia, asi que cada una registra su propio artefacto.
 * Se listan por separado para que anadir una tercera no obligue a tocar nada
 * mas que esta constante.
 */
const PLACE_DIRECTORIES = [
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
] as const;

/**
 * One place, shaped like the record an ingestion path would submit.
 *
 * The contact details travel here and stop here: the raw observation is where
 * provenance lives and nothing is dropped from it, while the read model the
 * public report reads does not lift them out. Losing them would make the
 * record less than what was received; publishing them would turn the
 * observatory into a business directory it never said it was.
 */
function placePayload(seed: BoliviaNationalPoi, place: NationalPoiPlace): Record<string, unknown> {
  return {
    recordType: 'PLACE_RECORD',
    dataCategory: 'NATIONAL_POI',
    placeId: place.placeId,
    publisherRecordId: place.publisherRecordId,
    publisher: place.publisher,
    name: place.name,
    locality: place.locality,
    department: place.department,
    address: place.address,
    latitude: place.latitude,
    longitude: place.longitude,
    entityGroup: place.entityGroup,
    entityFamily: place.entityFamily,
    commercialRole: place.commercialRole,
    isRegulated: place.isRegulated,
    officialValidationSource: place.officialValidationSource,
    validationPriority: place.validationPriority,
    genericFamily: place.genericFamily,
    classificationMethod: place.classificationMethod,
    categoryKey: place.categoryKey,
    taxonomyHierarchy: place.taxonomyHierarchy,
    basicCategory: place.basicCategory,
    confidence: place.confidence,
    positionMethod: place.positionMethod,
    dataLevel: place.dataLevel,
    phones: place.phones,
    emails: place.emails,
    websites: place.websites,
    socials: place.socials,
    warnings: place.warnings,
    sourceDatasetUrl: place.sourceDatasetUrl,
    sourceRecordUrl: place.sourceRecordUrl,
    snapshotTakenAt: place.snapshotTakenAt,
    sourceTags: place.sourceTags,
    openingHours: place.openingHours,
    resemblesHeldPlace: place.resemblesHeldPlace,
    licence: place.licence,
    observationId: place.observationId,
    countryCode: seed.provenance.countryCode,
    geofenceMethod: seed.provenance.geofenceMethod,
    release: seed.provenance.release,
  };
}

/**
 * The delivery this corpus arrived in, registered once.
 *
 * One artifact and not one per publisher: what was received is a single signed
 * package of nine parts, and three artifacts would claim three retrievals that
 * never happened. Which upstream dataset each place came from travels on the
 * place itself, where it is true of that place and of no other.
 */
async function reconcileArtifact(
  seed: BoliviaNationalPoi,
  sourceId: string,
  transaction: Transaction,
): Promise<string> {
  const existing = await SourceArtifactModel.findOne({
    where: { sha256: seed.provenance.deliverySha256 },
    transaction,
  });
  if (existing) return existing.sourceArtifactId;

  const sourceArtifactId = randomUUID();
  await SourceArtifactModel.create(
    {
      sourceArtifactId,
      sourceId,
      artifactType: 'JSON',
      originalUri: seed.provenance.deliveryUri,
      storageUri: seed.provenance.deliveryUri,
      mimeType: 'application/json',
      sha256: seed.provenance.deliverySha256,
      publicationDate: null,
      retrievedAt: new Date(`${seed.provenance.extractionDate}T00:00:00.000Z`),
      metadataJson: {
        publishers: seed.provenance.publishers,
        release: seed.provenance.release,
        dataset: seed.dataset,
        licences: seed.provenance.licences,
        upstreamDatasets: seed.provenance.upstreamDatasets,
        geofenceMethod: seed.provenance.geofenceMethod,
        deliveryReportSha256: seed.provenance.deliveryReportSha256,
        catalogueFamilies: seed.provenance.catalogueFamilies,
        retrievalStrategy: 'VERSIONED_SNAPSHOT_V1',
      },
    },
    { transaction },
  );
  return sourceArtifactId;
}

async function alreadyHeld(
  hashes: readonly string[],
  transaction: Transaction,
): Promise<Set<string>> {
  const held = new Set<string>();
  for (let start = 0; start < hashes.length; start += CHUNK) {
    const rows = await RawObservationModel.findAll({
      attributes: ['payloadHash'],
      where: { payloadHash: { [Op.in]: hashes.slice(start, start + CHUNK) } },
      transaction,
    });
    for (const row of rows) held.add(row.payloadHash);
  }
  return held;
}

/** Las piezas de una entrega, o ninguna si esa entrega aun no se ha construido. */
async function piecesOf(relativeDirectory: string): Promise<string[]> {
  try {
    const names = await readdir(join(__dirname, '..', relativeDirectory));
    return names
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => `${relativeDirectory}/${name}`);
  } catch {
    // Un corpus que nadie ha construido todavia no es una carga rota.
    return [];
  }
}

export async function reconcileBoliviaNationalPoi(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const pieces: string[] = [];
  for (const directory of PLACE_DIRECTORIES) pieces.push(...(await piecesOf(directory)));
  if (pieces.length === 0) return;

  const agentRunId = await reconcileHistoryRun(AGENT_CODE, transaction);
  for (const piece of pieces) {
    await loadPiece(piece, sourceId, agentRunId, transaction);
  }
  await reconcilePlaceMunicipalities(sourceId, agentRunId, transaction);
}

/** One piece of the corpus, read and loaded before the next one is opened. */
async function loadPiece(
  path: string,
  sourceId: string,
  agentRunId: string,
  transaction: Transaction,
): Promise<void> {
  const seed = await readSeed(path, boliviaNationalPoiSchema);

  const payloads = seed.places.map((place) => placePayload(seed, place));
  const hashes = payloads.map((payload) => rawPayloadHash(payload));
  const held = await alreadyHeld(hashes, transaction);

  const pending = seed.places
    .map((place, index) => ({ place, payload: payloads[index], hash: hashes[index] }))
    .filter(
      (
        entry,
      ): entry is { place: NationalPoiPlace; payload: Record<string, unknown>; hash: string } =>
        entry.payload !== undefined && entry.hash !== undefined && !held.has(entry.hash),
    );
  if (pending.length === 0) return;

  const sourceArtifactId = await reconcileArtifact(seed, sourceId, transaction);
  const receivedAt = new Date(`${seed.provenance.extractionDate}T00:00:00.000Z`);
  // The release is what dates these rows. A place has no event of its own, and
  // dating them with today's date would make every reload a different day.
  const eventDate = seed.provenance.release.slice(0, 10);

  for (let start = 0; start < pending.length; start += CHUNK) {
    await loadNationalPlaceBatch(pending.slice(start, start + CHUNK), {
      agentRunId,
      sourceArtifactId,
      receivedAt,
      eventDate,
      locator: seed.provenance.deliveryUri,
      transaction,
    });
  }
}
