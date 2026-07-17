import type { Transaction } from 'sequelize';
import { CodeItemModel, CodeListModel, ConceptModel, StatisticalDomainModel } from '../../models';
import type { MockSeed } from '../schemas/seed.schemas';

/** Reconciles deterministic semantic catalogs used by the synthetic dataset. */
export async function reconcileMockSemantics(
  seed: MockSeed,
  transaction: Transaction,
): Promise<void> {
  await StatisticalDomainModel.upsert(
    {
      ...seed.domain,
      parentDomainId: null,
      description: 'Synthetic domain for non-production tests.',
    },
    { transaction },
  );

  for (const concept of seed.concepts) {
    await ConceptModel.upsert(
      {
        ...concept,
        ownerOrganizationId: seed.organization.organizationId,
        validFrom: seed.organization.validFrom,
        validTo: null,
      },
      { transaction },
    );
  }

  await CodeListModel.upsert(
    {
      codeListId: seed.codeList.codeListId,
      ownerOrganizationId: seed.organization.organizationId,
      code: seed.codeList.code,
      name: seed.codeList.name,
      versionCode: seed.codeList.versionCode,
      validFrom: seed.organization.validFrom,
      validTo: null,
    },
    { transaction },
  );

  for (const [sortOrder, item] of seed.codeList.items.entries()) {
    await CodeItemModel.upsert(
      {
        ...item,
        codeListId: seed.codeList.codeListId,
        parentCodeItemId: null,
        description: 'Synthetic catalog item.',
        sortOrder,
        validFrom: seed.organization.validFrom,
        validTo: null,
        isActive: true,
      },
      { transaction },
    );
  }
}
