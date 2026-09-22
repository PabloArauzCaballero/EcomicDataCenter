import {
  channelMixView,
  coverageView,
  gapView,
} from '../migration-sql/0065-read-trade-by-form.panels';
import { commerceView, dropTradeViews } from '../migration-sql/0065-read-trade-by-form.view';
import type { MigrationContext } from '../migration.types';

/**
 * Reads the commerce register by the way business is actually done in Bolivia.
 *
 * The register already held what households buy and where. What it could not
 * answer was the question that matters here: how much of the country's buying
 * and selling happens outside anything that issues an invoice, and through
 * which form of trade. A reading filed only as "commerce" cannot distinguish a
 * mall from a popular fair, and in a country where 71% of households buy their
 * clothing in fairs and 9% in supermarkets, that distinction is the subject.
 *
 * Four models, each answering one question the previous one raises:
 *
 * - `social_commerce` files every commerce reading by form of trade, side of
 *   the counter, means of settlement, basket and territory. Derived in SQL for
 *   the reason ADR 0020 gave and ADR 0022 repeated: a classification that lives
 *   in one visible expression can be argued with, where a label baked in at
 *   capture time cannot be corrected without rewriting immutable raw data.
 * - `informal_trade_channel_mix` adds the channels up, and is the model most
 *   exposed to misreading: the penetrations are multi-response and sum past
 *   100. It publishes the quotient under the name of what it is — channels per
 *   household — so nobody reports 155% of a market.
 * - `informal_trade_coverage` writes the vocabulary out as rows, so a form of
 *   trade nobody has measured appears as a row that says so. Street vending has
 *   no household panel behind it; the model has to say that rather than omit
 *   the form and look complete.
 * - `informal_trade_gap` sets a social reading against the measured series for
 *   the same year. That contrast, and never the social level alone, is what
 *   ADR 0022 said the register is for.
 *
 * Nothing here can reach an indicator series: every model reads only
 * `read_models.social_reading`, which admits only SOCIAL_READING observations,
 * and the two checks that admit a figure into a series still demand OFFICIAL.
 *
 * The models read the register live rather than a materialised copy. At ninety
 * readings the cost is nothing and the staleness would be real: the register
 * grows by hand, one publication at a time, and a panel that shows yesterday's
 * catalogue after somebody registered a reading today would be discovered the
 * hard way. The snapshot of the raw register that migration 0063 created stays
 * where it is, for the consumer that already reads it.
 *
 * See docs/decisions/0023-trade-is-read-by-its-form.md.
 */

const grants = `
DO $$
DECLARE
  role_name text;
  view_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      FOREACH view_name IN ARRAY ARRAY[
        'social_commerce',
        'informal_trade_channel_mix',
        'informal_trade_coverage',
        'informal_trade_gap'
      ] LOOP
        EXECUTE format('GRANT SELECT ON read_models.%I TO %I', view_name, role_name);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
`;

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropTradeViews);
  await context.sequelize.query(commerceView);
  await context.sequelize.query(channelMixView);
  await context.sequelize.query(coverageView);
  await context.sequelize.query(gapView);
  await context.sequelize.query(grants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropTradeViews);
}
