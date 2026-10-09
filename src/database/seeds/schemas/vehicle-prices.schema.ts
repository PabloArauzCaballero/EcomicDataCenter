import { z } from 'zod';

const day = z.string().regex(/^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u);

export const vehicleOfferSchema = z.object({
  type: z.enum(['Camioneta', 'Sedán', 'SUV / vagoneta', 'Urbano / hatchback', 'Utilitario / van', 'Otro']),
  brand: z.string().min(1),
  model: z.string().min(1),
  version: z.string().min(1),
  modelYear: z.number().int().min(2000).max(2100),
  price: z.number().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/u),
  priceType: z.string().min(1),
  observedAt: day,
  source: z.url(),
  transmission: z.string().min(1),
  traction: z.string().min(1),
}).strict();

export const vehicleSourceSchema = z.object({
  url: z.url(),
  capturedAt: day,
  httpStatus: z.number().int().min(200).max(299),
  bytes: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
}).strict();

export const vehicleOffersSeedSchema = z.array(vehicleOfferSchema).min(1);
export const vehicleSourcesSeedSchema = z.array(vehicleSourceSchema).min(1);

export type VehicleOffer = z.infer<typeof vehicleOfferSchema>;
export type VehicleSource = z.infer<typeof vehicleSourceSchema>;

/** Refuse untraceable offers and two prices for one version in one snapshot. */
export function validateVehicleSnapshot(
  offers: readonly VehicleOffer[],
  sources: readonly VehicleSource[],
): void {
  const byUrl = new Map(sources.map((source) => [source.url, source]));
  if (byUrl.size !== sources.length) throw new Error('Fuentes de vehículos duplicadas');
  const keys = new Set<string>();
  for (const offer of offers) {
    const source = byUrl.get(offer.source);
    if (!source || source.capturedAt !== offer.observedAt) {
      throw new Error(`Precio de ${offer.brand} ${offer.model} sin captura coincidente`);
    }
    const key = [offer.brand, offer.model, offer.version, offer.modelYear, offer.observedAt, offer.source].join('|');
    if (keys.has(key)) throw new Error(`Versión duplicada: ${key}`);
    keys.add(key);
  }
}
