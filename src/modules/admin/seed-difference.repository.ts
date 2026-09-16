import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { ReadQueryExecutor } from '../../common/persistence/read-query.executor';
import { MANAGED_CATALOGUES, toColumn, type ManagedCatalogue } from './seed-catalogue-map';

const SEEDS_ROOT = resolve(__dirname, '..', '..', 'database', 'seeds');

export interface FieldDifference {
  readonly field: string;
  readonly expected: string;
  readonly stored: string;
}

export interface RowDifference {
  readonly identity: string;
  readonly fields: readonly FieldDifference[];
}

export interface CatalogueDifference {
  readonly label: string;
  readonly table: string;
  readonly declared: number;
  readonly present: number;
  readonly missing: readonly string[];
  readonly modified: readonly RowDifference[];
  /** Rows in the table the package does not declare. Never a defect. */
  readonly additional: number;
}

export interface PackageDifference {
  readonly compared: boolean;
  readonly reason: string;
  readonly catalogues: readonly CatalogueDifference[];
}

/**
 * Compares a date or number the same way on both sides of the comparison.
 *
 * PostgreSQL hands back a `Date` for a `date` column and a string for
 * `numeric`; the seed carries `"2011-01-01"` and `1`. Comparing the raw values
 * would report every dated row as modified, which is worse than not comparing
 * at all — it would teach an operator that the difference report is noise.
 */
function normalize(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  // Anything that is not a scalar the seed could have declared is reported as
  // its shape rather than stringified: `[object Object]` compared against
  // `[object Object]` would call two different objects equal.
  if (typeof value !== 'string') return JSON.stringify(value);
  const text = value;
  const dated = /^(\d{4}-\d{2}-\d{2})/u.exec(text);
  return dated?.[1] ?? text;
}

function sectionRows(document: unknown, catalogue: ManagedCatalogue): Record<string, unknown>[] {
  const root = catalogue.section
    ? (document as Record<string, unknown>)[catalogue.section]
    : document;
  if (Array.isArray(root)) return root as Record<string, unknown>[];
  if (root && typeof root === 'object') return [root as Record<string, unknown>];
  return [];
}

/**
 * Says what the database holds against what the package declares.
 *
 * It reads through the reader pool, because comparing is a read and because a
 * comparison must never be able to write. Four outcomes are kept apart on
 * purpose: a row the package declares and the table lacks is **missing**; a row
 * whose managed fields differ is **modified**, and whether that is a repair or
 * a conflict depends on the package's ownership, not on this report; a row the
 * table holds and the package does not declare is **additional**, which is
 * allowed and is not corruption; everything else matches.
 */
@Injectable()
export class SeedDifferenceRepository {
  constructor(private readonly executor: ReadQueryExecutor) {}

  async describe(packageCode: string): Promise<PackageDifference> {
    const catalogues = MANAGED_CATALOGUES[packageCode];
    if (!catalogues) {
      return {
        compared: false,
        reason:
          'Este paquete es un corpus: su estado se sigue por el registro de aplicaciones, ' +
          'no por comparación fila a fila.',
        catalogues: [],
      };
    }
    const results: CatalogueDifference[] = [];
    for (const catalogue of catalogues) {
      results.push(await this.compare(catalogue));
    }
    return {
      compared: true,
      reason: 'Comparación campo a campo de los catálogos gestionados',
      catalogues: results,
    };
  }

  private async compare(catalogue: ManagedCatalogue): Promise<CatalogueDifference> {
    const raw = await readFile(resolve(SEEDS_ROOT, catalogue.file), 'utf8');
    const declared = sectionRows(JSON.parse(raw) as unknown, catalogue);
    const identities = declared
      .map((row) => row[catalogue.identityField])
      .filter((value): value is string => typeof value === 'string');
    const columns = catalogue.managedFields.map(toColumn);
    const selected = [catalogue.identityColumn, ...columns].join(', ');

    // The table name and column list come from the descriptor above, never from
    // a request: the portal names a package, and the package resolves to this.
    const stored = await this.executor.run(
      'operations.seed_difference',
      ({ database, transaction }) =>
        database.query<Record<string, unknown>>(
          `SELECT ${selected} FROM ${catalogue.table} WHERE ${catalogue.identityColumn} = ANY(ARRAY[:identities]::uuid[])`,
          { type: QueryTypes.SELECT, transaction, replacements: { identities } },
        ),
    );
    const total = await this.executor.run('operations.seed_total', ({ database, transaction }) =>
      database.query<{ total: string }>(`SELECT count(*)::text AS total FROM ${catalogue.table}`, {
        type: QueryTypes.SELECT,
        transaction,
      }),
    );

    const byIdentity = new Map(
      stored.map((row) => [String(row[catalogue.identityColumn]), row] as const),
    );
    const missing: string[] = [];
    const modified: RowDifference[] = [];
    for (const row of declared) {
      const identity = String(row[catalogue.identityField]);
      const found = byIdentity.get(identity);
      if (!found) {
        missing.push(identity);
        continue;
      }
      const fields = catalogue.managedFields.flatMap((field) => {
        const expected = normalize(row[field]);
        const value = normalize(found[toColumn(field)]);
        return expected === value ? [] : [{ field, expected, stored: value }];
      });
      if (fields.length) modified.push({ identity, fields });
    }
    const storedTotal = Number(total[0]?.total ?? '0');
    return {
      label: catalogue.label,
      table: catalogue.table,
      declared: declared.length,
      present: byIdentity.size,
      missing,
      modified,
      additional: Math.max(storedTotal - byIdentity.size, 0),
    };
  }
}
