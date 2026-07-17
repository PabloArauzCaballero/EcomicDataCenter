import { z } from 'zod';

const uuid = z.string().uuid();
const date = z.iso.date();

export const createOrganizationSchema = z
  .object({
    parentOrganizationId: uuid.optional(),
    code: z.string().min(2).max(50),
    legalName: z.string().min(2).max(250),
    shortName: z.string().min(1).max(80),
    organizationType: z.string().min(2).max(40),
    countryCode: z.string().regex(/^[A-Z]{2}$/),
    officialStatisticsProducer: z.boolean(),
    isActive: z.boolean().default(true),
    validFrom: date,
    validTo: date.optional(),
  })
  .strict()
  .refine((value) => !value.validTo || value.validTo >= value.validFrom, {
    path: ['validTo'],
    message: 'validTo precedes validFrom',
  });

export const createSourceSchema = z
  .object({
    organizationId: uuid,
    frequencyId: uuid.optional(),
    code: z.string().min(2).max(80),
    name: z.string().min(2).max(250),
    sourceType: z.string().min(2).max(40),
    accessMethod: z.string().min(2).max(40),
    officialUri: z.string().url().optional(),
    licenseCode: z.string().max(80).optional(),
    activeFrom: date.optional(),
    activeTo: date.optional(),
    isActive: z.boolean().default(true),
  })
  .strict()
  .refine((value) => !value.activeFrom || !value.activeTo || value.activeTo >= value.activeFrom, {
    path: ['activeTo'],
    message: 'activeTo precedes activeFrom',
  });

export const createSourceArtifactSchema = z
  .object({
    sourceId: uuid,
    artifactType: z.string().min(2).max(40),
    originalFilename: z.string().max(255).optional(),
    originalUri: z.string().url().optional(),
    storageUri: z.string().min(1).max(4_000),
    mimeType: z.string().max(120).optional(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    publicationDate: date.optional(),
    retrievedAt: z.iso.datetime(),
    fileSizeBytes: z.string().regex(/^\d+$/).optional(),
    metadataJson: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const listProvenanceSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  search: z.string().max(120).optional(),
});

export const idParamsSchema = z.object({ id: uuid });

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type CreateSourceInput = z.infer<typeof createSourceSchema>;
export type CreateSourceArtifactInput = z.infer<typeof createSourceArtifactSchema>;
export type ListProvenanceInput = z.infer<typeof listProvenanceSchema>;
