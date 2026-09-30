import {
  bankVirtualAssetView as viewWithoutSide,
  grants as grantsWithoutSide,
} from '../migration-sql/0089-read-the-bank-virtual-assets.view';
import {
  bankVirtualAssetViewWithSide,
  dropBankVirtualAssetView,
  grants,
} from '../migration-sql/0090-read-the-bank-quotes.view';
import type { MigrationContext } from '../migration.types';

/**
 * Adds the side of a quotation to the banks' view.
 *
 * What a bank charges or pays per USDT or USDC is not published outside its own
 * application, so a quotation reaches the seed by hand, from a capture. It needs
 * to say whether it is the price the client pays or the one the client receives,
 * and that field rides in the same payload the 0089 view already reads.
 */

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropBankVirtualAssetView);
  await context.sequelize.query(bankVirtualAssetViewWithSide);
  await context.sequelize.query(grants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropBankVirtualAssetView);
  await context.sequelize.query(viewWithoutSide);
  await context.sequelize.query(grantsWithoutSide);
}
