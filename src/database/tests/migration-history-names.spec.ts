import type { Sequelize } from 'sequelize';
import { migrationName, normalizeMigrationHistoryNames } from '../migration.runner';

/**
 * Records every statement the runner issues while answering `to_regclass` with
 * `relation`, which is what decides whether the repair has anything to collapse.
 */
function databaseDouble(relation: string | null): { database: Sequelize; statements: string[] } {
  const statements: string[] = [];
  const query = jest.fn((sql: string) => {
    statements.push(sql);
    return Promise.resolve([{ relation }]);
  });
  return { database: { query } as unknown as Sequelize, statements };
}

describe('migrationName', () => {
  it('identifies the same migration from source and from the compiled build', () => {
    expect(migrationName('0010-add-domain-integrity-constraints.ts')).toBe(
      migrationName('0010-add-domain-integrity-constraints.js'),
    );
  });

  it('drops only the trailing extension', () => {
    expect(migrationName('0001-create-schemas.ts')).toBe('0001-create-schemas');
    expect(migrationName('0016-grant-backup-operator.js')).toBe('0016-grant-backup-operator');
  });

  it('leaves a name that carries no extension untouched', () => {
    expect(migrationName('0001-create-schemas')).toBe('0001-create-schemas');
  });
});

describe('normalizeMigrationHistoryNames', () => {
  it('writes nothing when the history table does not exist yet', async () => {
    const { database, statements } = databaseDouble(null);

    await normalizeMigrationHistoryNames(database);

    expect(statements).toHaveLength(1);
  });

  it('inserts the canonical name before removing the suffixed rows', async () => {
    const { database, statements } = databaseDouble('infrastructure.migration_history');

    await normalizeMigrationHistoryNames(database);

    expect(statements).toHaveLength(3);
    expect(statements[1]).toContain('INSERT INTO infrastructure.migration_history');
    expect(statements[1]).toContain('ON CONFLICT (name) DO NOTHING');
    expect(statements[2]).toContain('DELETE FROM infrastructure.migration_history');
  });

  it('escapes the extension separator so the pattern cannot match any character', async () => {
    const { database, statements } = databaseDouble('infrastructure.migration_history');

    await normalizeMigrationHistoryNames(database);

    for (const statement of statements.slice(1)) {
      expect(statement).toContain("'\\.(js|ts)$'");
    }
  });
});
