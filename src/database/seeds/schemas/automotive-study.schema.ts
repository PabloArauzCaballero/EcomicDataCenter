import { z } from 'zod';

const source = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    url: z.url(),
    capturedAt: z.iso.datetime({ offset: true }),
    httpStatus: z.number().int(),
    bytes: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    format: z.enum(['html', 'pdf']),
  })
  .passthrough();
const row = z.record(z.string(), z.json());
const offer = z
  .object({
    id: z.string(),
    country: z.string(),
    model: z.string(),
    price: z.number().positive(),
    sourceId: z.string(),
    observedAt: z.iso.date(),
    validUntil: z.iso.date().nullable(),
  })
  .passthrough();
const pair = z
  .object({
    id: z.string(),
    boliviaId: z.string(),
    foreignId: z.string(),
    grade: z.enum(['A', 'B', 'C']),
    directGapAllowed: z.boolean(),
  })
  .passthrough();

export const automotiveStudySchema = z
  .object({
    version: z.string(),
    observedAt: z.iso.date(),
    title: z.string(),
    sources: z.array(source).min(1),
    offers: z.array(offer).min(1),
    dealers: z.array(row),
    historicalDealers: z.array(row),
    comparisons: z.array(pair),
    fleet: row,
    trade: row,
    conflicts: z.array(row),
    environment: z.array(row),
    decisions: z.array(row),
    gaps: z.array(z.string()),
  })
  .strict()
  .superRefine((study, ctx) => {
    const sources = new Map(study.sources.map((item) => [item.id, item]));
    const offers = new Set(study.offers.map((item) => item.id));
    if (sources.size !== study.sources.length || offers.size !== study.offers.length) {
      ctx.addIssue({ code: 'custom', message: 'Identidades de fuentes u ofertas duplicadas' });
    }
    for (const item of study.offers) {
      const evidence = sources.get(item.sourceId);
      if (
        !evidence ||
        evidence.httpStatus !== 200 ||
        evidence.capturedAt.slice(0, 10) !== item.observedAt
      ) {
        ctx.addIssue({
          code: 'custom',
          message: `Oferta ${item.id} sin captura exitosa de la fecha declarada`,
        });
      }
    }
    for (const item of study.comparisons) {
      if (
        !offers.has(item.boliviaId) ||
        !offers.has(item.foreignId) ||
        (item.grade !== 'A' && item.directGapAllowed)
      ) {
        ctx.addIssue({ code: 'custom', message: `Comparación ${item.id} inconsistente` });
      }
    }
  });
