import { z } from 'zod';

/**
 * Los videos que publican los vendedores de lives bolivianos y las cuentas parecidas que sus perfiles
 * sugieren (ADR 0031). Es un catálogo aparte de los lives: un video no es un live y no se mezcla.
 *
 * - `accounts`: una cuenta incluida, en seudónimo, con su clase, rubro, departamento, cómo se la
 *   encontró y sus cifras de perfil.
 * - `videos`: un video, en seudónimo, con fecha y hora de La Paz, rubro, producto, precios de la
 *   descripción, cifras y marcas de cómo vende. Nunca la descripción ni un identificador real.
 * - `terms`: hashtags más usados por rubro.
 * - `coverage`: cuentas leídas, incluidas y excluidas, y videos por año (sin sesión, cada perfil da
 *   sus videos más recientes: la serie larga está cargada hacia lo reciente).
 */

export const VIDEO_KINDS = ['VENTA', 'GASTRONOMIA', 'ENTRETENIMIENTO'] as const;
export const VIDEO_ORIGINS = ['LIVE', 'SIMILAR'] as const;
export const VIDEO_TACTICS = [
  'PRECIO',
  'ENVIO',
  'CONTACTO',
  'PROMO',
  'LIVE',
  'SORTEO',
  'MAYOR',
  'NUEVO_STOCK',
  'UNBOXING',
  'PEDIDOS',
] as const;

const day = z.string().regex(/^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u);
const code = z.string().regex(/^[A-Z][A-Z_]{1,29}$/u);
const key = z.string().regex(/^[a-f0-9]{16}$/u);
const count = z.number().int().nonnegative();
const departments = z.string().regex(/^(LPZ|SCZ|CBB|ORU|PTS|CHQ|TJA|BEN|PND)$/u);

const account = z
  .object({
    sellerId: key,
    origin: z.enum(VIDEO_ORIGINS),
    kind: z.enum(VIDEO_KINDS),
    rubro: code,
    city: departments.nullable(),
    followers: count.nullable(),
    hearts: count.nullable(),
    videoCount: count.nullable(),
    videosRead: count,
    firstVideo: day.nullable(),
    lastVideo: day.nullable(),
  })
  .strict();

const video = z
  .object({
    videoKey: key,
    sellerId: key,
    kind: z.enum(VIDEO_KINDS),
    date: day,
    hour: z.number().int().min(0).max(23),
    weekday: z.number().int().min(1).max(7),
    rubro: code,
    product: z.string().max(40).nullable(),
    prices: z.array(z.number().positive()).max(5),
    plays: count.nullable(),
    likes: count.nullable(),
    comments: count.nullable(),
    shares: count.nullable(),
    saves: count.nullable(),
    duration: count.nullable(),
    photo: z.boolean(),
    ad: z.boolean(),
    tactics: z.array(z.enum(VIDEO_TACTICS)),
    readOn: day,
  })
  .strict();

export const tiktokVideosSchema = z
  .object({
    provenance: z
      .object({
        runId: day,
        runs: z.array(day).min(1),
        retrievedAt: z.iso.datetime({ offset: false }),
        collector: z.string().min(1),
        method: z.string().min(1),
        usdRate: z.number().positive().nullable(),
      })
      .strict(),
    rubros: z.array(z.object({ code, label: z.string().min(1).max(80) }).strict()).min(1),
    departments: z.array(
      z.object({ code: departments, label: z.string().min(1).max(40) }).strict(),
    ),
    accounts: z.array(account),
    videos: z.array(video),
    terms: z.array(
      z
        .object({
          rubro: code,
          term: z.string().min(1).max(40),
          count: z.number().int().positive(),
          rank: z.number().int().positive(),
        })
        .strict(),
    ),
    coverage: z
      .object({
        accountsRead: count,
        accountsIncluded: count,
        excludedNotBolivia: count,
        excludedNoActivity: count,
        videos: count,
        videosByYear: z.record(z.string().regex(/^20\d{2}$/u), count),
      })
      .strict(),
  })
  .strict();

export type TiktokVideos = z.infer<typeof tiktokVideosSchema>;
