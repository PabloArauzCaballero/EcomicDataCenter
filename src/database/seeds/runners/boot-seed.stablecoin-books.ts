import { createHash, randomUUID } from 'node:crypto';
import { Op, type Transaction } from 'sequelize';
import {
  ClaimEvidenceModel,
  FactClaimModel,
  RawObservationModel,
  SourceArtifactModel,
} from '../../models';
import { reconcileHistoryRun } from './boot-seed.history-provenance';
import { claimContentHash, rawPayloadHash } from '../../../common/intelligence/claim-normalizer';
import {
  stablecoinBooksSchema,
  type StablecoinBookSeedQuote,
} from '../schemas/stablecoin-books.schema';
import { readSeed } from './seed.utils';

/**
 * Carga las cotizaciones por ficha estable del libro entre particulares.
 *
 * Este cargador existe para que el panel del riel no dependa de un solo
 * servidor. Las lecturas por ficha llegaban únicamente por la API del
 * recolector diario, que apunta a una sola base; cualquier otro despliegue
 * quedaba con el panel a medias y sin señal de que faltara nada, porque el
 * recolector seguía en verde. Con la semilla entran al arrancar, dondequiera
 * que arranque.
 *
 * Aterrizan en las mismas tablas de lectura que todo lo demás, con el mismo
 * código de indicador, el mismo lado resuelto y el mismo instrumento, de modo
 * que `read_models.stablecoin_parallel_daily` no distingue —ni tiene por qué—
 * si una fila llegó por la API o por aquí.
 *
 * Idempotente sobre el digest del payload, como los cargadores de al lado. El
 * digest de la respuesta **sí** entra en ese payload, al contrario que en las
 * cotizaciones del banco: el libro cambia entre una lectura y la siguiente, y
 * dos capturas del mismo día son dos hechos distintos, no el mismo repetido.
 */

const AGENT_CODE = 'STABLECOIN_BOOKS';
const PUBLISHER = 'BINANCE P2P';

async function reconcileArtifact(
  quote: StablecoinBookSeedQuote,
  sourceId: string,
  cache: Map<string, string>,
  transaction: Transaction,
): Promise<string> {
  const cached = cache.get(quote.documentSha256);
  if (cached) return cached;

  const existing = await SourceArtifactModel.findOne({
    where: { sha256: quote.documentSha256 },
    transaction,
  });
  if (existing) {
    cache.set(quote.documentSha256, existing.sourceArtifactId);
    return existing.sourceArtifactId;
  }

  const sourceArtifactId = randomUUID();
  await SourceArtifactModel.create(
    {
      sourceArtifactId,
      sourceId,
      artifactType: 'JSON',
      originalUri: quote.sourceUrl,
      storageUri: quote.sourceUrl,
      mimeType: 'application/json',
      sha256: quote.documentSha256,
      publicationDate: quote.eventDate,
      retrievedAt: new Date(quote.retrievedAt),
      metadataJson: {
        publisher: PUBLISHER,
        retrievalStrategy: 'VERSIONED_SNAPSHOT_V1',
        /*
         * El libro no declara instante de publicación: no trae ni un campo de
         * fecha. La lectura se fecha por el momento en que se tomó, y eso se
         * dice aquí en vez de inventarle un sello a la bolsa.
         */
        publicationDateVerification: 'UNDATED_QUOTED_INDICATOR',
      },
    },
    { transaction },
  );
  cache.set(quote.documentSha256, sourceArtifactId);
  return sourceArtifactId;
}

/** Payload de una cotización, con la misma forma que produce el recolector. */
function bookPayload(quote: StablecoinBookSeedQuote): Record<string, unknown> {
  return {
    recordType: 'DAILY_INDICATOR',
    dataCategory: 'FX_STABLECOIN',
    eventDate: quote.eventDate,
    aggregation: 'POINT_IN_TIME',
    frequency: 'DAILY',
    measures: [
      {
        indicatorCode: quote.indicatorCode,
        priceSide: quote.priceSide,
        value: quote.value,
        unit: quote.unit,
      },
    ],
    // El par, en el orden en que lo escribe el resto del sistema: fiat/ficha.
    instrument: `BOB/${quote.asset}`,
    venue: PUBLISHER,
    publisher: PUBLISHER,
    publisherVerified: true,
    url: quote.sourceUrl,
    sha256: quote.documentSha256,
    storageUri: quote.sourceUrl,
  };
}

export async function reconcileStablecoinBooks(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const seed = await readSeed('boot/stablecoin-books.json', stablecoinBooksSchema);
  const agentRunId = await reconcileHistoryRun(AGENT_CODE, transaction);

  const entries = seed.quotes.map((quote) => ({ quote, payload: bookPayload(quote) }));
  const hashes = entries.map((entry) => rawPayloadHash(entry.payload));

  const present = new Set<string>();
  for (let start = 0; start < hashes.length; start += 500) {
    const rows = await RawObservationModel.findAll({
      attributes: ['payloadHash'],
      where: { payloadHash: { [Op.in]: hashes.slice(start, start + 500) } },
      transaction,
    });
    for (const row of rows) present.add(row.payloadHash);
  }

  const artifacts = new Map<string, string>();
  for (const [index, entry] of entries.entries()) {
    const payloadHash = hashes[index];
    if (!payloadHash || present.has(payloadHash)) continue;

    const { quote } = entry;
    const sourceArtifactId = await reconcileArtifact(quote, sourceId, artifacts, transaction);

    const observation = await RawObservationModel.create(
      {
        agentRunId,
        sourceArtifactId,
        payloadJson: entry.payload,
        payloadHash,
        receivedAt: new Date(quote.retrievedAt),
        processingStatus: 'NORMALIZED',
        retryCount: 0,
      },
      { transaction },
    );

    /*
     * La afirmación se redacta con los términos del propio payload —la ficha, el
     * fiat, el lado— por la misma razón que en la vía de la API: una redacción
     * en prosa comparte tan pocos términos con un cuerpo JSON que no pasa el
     * umbral de anclaje léxico, y la lectura acabaría en revisión en vez de
     * publicarse. La única cifra que se enuncia es el precio, que es la única
     * que contiene el aviso citado.
     */
    const reading = quote.priceSide === 'SELL' ? 'venta al lector' : 'compra al lector';
    const assertion =
      `Dolar paralelo asset ${quote.asset} fiatUnit BOB ` +
      `tradeType ${quote.priceSide} (${reading}): price ${quote.value}.`;
    const factClaimId = randomUUID();
    await FactClaimModel.create(
      {
        factClaimId,
        agentRunId,
        rawObservationId: observation.rawObservationId,
        claimType: 'INDICATOR_READING',
        assertion,
        eventDate: quote.eventDate,
        /*
         * Fechada a mediodía local, como las cotizaciones del banco. El libro no
         * declara instante propio y aquí hace falta uno: mediodía es el que no
         * empuja la lectura al día anterior ni al siguiente en ningún huso.
         */
        publishedAt: new Date(`${quote.eventDate}T12:00:00-04:00`),
        confidenceLevel: 'HIGH',
        confidenceScore: '0.8500',
        impactLevel: 'HIGH',
        timeHorizon: 'IMMEDIATE',
        status: 'PUBLISHED',
        contentHash: claimContentHash({
          claimType: 'INDICATOR_READING',
          assertion,
          eventDate: quote.eventDate,
        }),
        createdAt: new Date(),
      },
      { transaction },
    );

    await ClaimEvidenceModel.create(
      {
        factClaimId,
        sourceArtifactId,
        excerpt: quote.excerpt,
        excerptHash: createHash('sha256').update(quote.excerpt).digest('hex'),
        locator: quote.sourceUrl,
        retrievedAt: new Date(quote.retrievedAt),
      },
      { transaction },
    );
  }
}
