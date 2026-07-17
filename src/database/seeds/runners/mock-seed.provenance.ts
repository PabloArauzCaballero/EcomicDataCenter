import type { Transaction } from 'sequelize';
import { OrganizationModel, SourceArtifactModel, SourceModel } from '../../models';
import type { MockSeed } from '../schemas/seed.schemas';

/** Reconciles the synthetic producer, source and immutable source artifact. */
export async function reconcileMockProvenance(
  seed: MockSeed,
  transaction: Transaction,
): Promise<void> {
  await OrganizationModel.upsert(
    { ...seed.organization, parentOrganizationId: null, validTo: null },
    { transaction },
  );
  await SourceModel.upsert(
    {
      ...seed.source,
      organizationId: seed.organization.organizationId,
      officialUri: null,
      licenseCode: null,
      activeFrom: seed.organization.validFrom,
      activeTo: null,
    },
    { transaction },
  );

  const artifact = await SourceArtifactModel.findByPk(seed.artifact.sourceArtifactId, {
    transaction,
  });
  if (artifact) return;

  await SourceArtifactModel.create(
    {
      ...seed.artifact,
      sourceId: seed.source.sourceId,
      originalFilename: 'demo-prices.csv',
      originalUri: null,
      publicationDate: null,
      retrievedAt: new Date(seed.artifact.retrievedAt),
    },
    { transaction },
  );
}
