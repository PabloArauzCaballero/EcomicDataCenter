import { z } from 'zod';

/**
 * Las ventas en vivo de TikTok en Bolivia, observadas noche a noche (ADR 0030).
 *
 * Todo es agregado. La unidad es el mercado, no la persona:
 *
 * - `rooms`: un live observado, con el vendedor en seudónimo estable (la clave
 *   que lo revierte vive fuera del repositorio, solo para trazabilidad) y los
 *   CONTEOS de cada señal del chat. El tablero suma conteos sobre lo que el
 *   lector filtra; por eso aquí no hay tasas.
 * - `prices`: cada precio dicho, mostrado o escrito por el vendedor.
 * - `phrases`: frases dichas por al menos cinco personas distintas en al menos
 *   tres lives. Nunca una cita.
 * - `terms`: lo más repetido por rubro en el chat y en la voz del vendedor.
 * - `coverage`: cuánto se vio y cuánto quedó sin clasificar, por noche.
 *
 * Ningún campo identifica a quien comenta: no hay autor ni identificador, y el
 * esquema es estricto para que uno nuevo no se cuele.
 */

export const LIVE_STATUSES = ['VENTA', 'ENTRETENIMIENTO', 'SIN_VENTA', 'EXTRANJERO'] as const;
export const LIVE_SIZES = ['MICRO', 'CHICO', 'MEDIANO', 'GRANDE', 'SIN_DATO'] as const;
export const LIVE_PRICE_SOURCES = ['SPEECH', 'SCREEN', 'TITLE', 'HOST_CHAT'] as const;
export const LIVE_TERM_SCOPES = ['AUDIENCE', 'SELLER'] as const;

const day = z.string().regex(/^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u);
const code = z.string().regex(/^[A-Z][A-Z_]{1,29}$/u);
const key = z.string().regex(/^[a-f0-9]{16}$/u);
const count = z.number().int().nonnegative();
const counts = z.record(code, count);
const departments = z.string().regex(/^(LPZ|SCZ|CBB|ORU|PTS|CHQ|TJA|BEN|PND)$/u);

const room = z
  .object({
    roomKey: key,
    run: day,
    date: day,
    hour: z.number().int().min(0).max(23),
    weekday: z.number().int().min(1).max(7),
    sellerId: key,
    status: z.enum(LIVE_STATUSES),
    rubro: code,
    product: z.string().max(40).nullable(),
    products: z
      .array(
        z
          .object({
            product: z.string().min(1).max(40),
            weight: z.number().int().positive(),
            rubro: code,
          })
          .strict(),
      )
      .max(5),
    city: departments.nullable(),
    citySource: z.enum(['PERFIL', 'VOZ']).nullable(),
    bolivia: z.boolean(),
    size: z.enum(LIVE_SIZES),
    minutes: count,
    endReason: z.string().regex(/^[A-Z_]{2,20}$/u),
    viewersPeak: count.nullable(),
    viewersMedian: count.nullable(),
    entries: count.nullable(),
    messages: count,
    authors: count,
    buyers: count,
    signals: counts,
    payments: counts,
    destinations: z.record(departments, count),
    emotions: z.partialRecord(
      z.enum(['joy', 'sadness', 'anger', 'surprise', 'disgust', 'fear', 'others', 'apt', 'ironic']),
      count,
    ),
    polarity: z.partialRecord(z.enum(['POS', 'NEG', 'NEU']), count),
    gifts: count,
    follows: count,
    shares: count,
    likes: count,
    speechSegments: count,
    screenReads: count,
    prices: count,
    /** Espectadores por minuto desde que empezó el live: [minuto, espectadores]. */
    curve: z.array(z.tuple([count, count])).max(120),
    /** Mensajes del chat que hablan del dólar, del paralelo o del tipo de cambio. */
    dollarTalk: count,
  })
  .strict();

const price = z
  .object({
    roomKey: key,
    date: day,
    rubro: code,
    product: z.string().max(40).nullable(),
    productSource: z.enum(['TEXTO', 'SALA', 'NINGUNO']),
    amount: z.number().positive(),
    currency: z.enum(['BOB', 'USD', 'PEN']),
    priceBs: z.number().positive().nullable(),
    unit: z.string().max(20).nullable(),
    source: z.enum(LIVE_PRICE_SOURCES),
    explicit: z.boolean(),
    city: departments.nullable(),
  })
  .strict();

const phrase = z
  .object({
    phrase: z.string().min(1).max(80),
    people: z.number().int().min(5),
    lives: z.number().int().min(3),
    rubro: code,
    emotion: z.string().max(20).nullable(),
    signal: code.nullable(),
  })
  .strict();

const term = z
  .object({
    rubro: code,
    scope: z.enum(LIVE_TERM_SCOPES),
    term: z.string().min(1).max(40),
    count: z.number().int().positive(),
    rank: z.number().int().positive(),
  })
  .strict();

const coverage = z
  .object({
    run: day,
    candidatesSeen: count,
    candidatesLive: count,
    roomsOpened: count,
    roomsBlocked: count,
    roomsCommerce: count,
    roomsNoCommerce: count,
    roomsEntertainment: count,
    roomsForeign: count,
    roomsUnidentified: count,
    messages: count,
    messagesWithSignal: count,
    messagesApt: count,
    speechSegments: count,
    screenReads: count,
    prices: count,
    minutes: count,
  })
  .strict();

export const tiktokLiveSchema = z
  .object({
    provenance: z
      .object({
        runId: day,
        runs: z.array(day).min(1),
        retrievedAt: z.iso.datetime({ offset: false }),
        collector: z.string().min(1),
        method: z.string().min(1),
        speechModel: z.string().min(1),
        sentimentModel: z.string().min(1),
        ocrModel: z.string().min(1),
        lexiconVersion: z.string().min(1),
        usdRate: z.number().positive().nullable(),
        phraseThreshold: z
          .object({ people: z.number().int().min(5), lives: z.number().int().min(3) })
          .strict(),
      })
      .strict(),
    rubros: z.array(z.object({ code, label: z.string().min(1).max(60) }).strict()).min(1),
    departments: z.array(
      z.object({ code: departments, label: z.string().min(1).max(40) }).strict(),
    ),
    rooms: z.array(room),
    prices: z.array(price),
    phrases: z.array(phrase).max(400),
    terms: z.array(term),
    coverage: z.array(coverage).min(1),
  })
  .strict();

export type TiktokLive = z.infer<typeof tiktokLiveSchema>;
export type TiktokLiveRoom = TiktokLive['rooms'][number];
export type TiktokLivePrice = TiktokLive['prices'][number];
