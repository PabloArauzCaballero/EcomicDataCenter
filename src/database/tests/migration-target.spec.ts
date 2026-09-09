import { resolveMigrationTarget } from '../migration-target';

const WRITER = 'postgresql://writer:secret@db.internal:5432/economic_observatory';

describe('resolveMigrationTarget', () => {
  it('applies migrations to the database the writer writes to', () => {
    const target = resolveMigrationTarget(
      'postgresql://migrator:other@db.internal:5432/postgres',
      WRITER,
    );

    expect(target.database).toBe('economic_observatory');
    expect(target.url).toBe('postgresql://migrator:other@db.internal:5432/economic_observatory');
    expect(target.redirectedFrom).toBe('postgres');
  });

  it('keeps the migrator role, and only moves the database', () => {
    const target = resolveMigrationTarget(
      'postgresql://migrator:s%40cret@db.internal:5432/postgres?sslmode=require',
      WRITER,
    );

    const url = new URL(target.url);
    expect(url.username).toBe('migrator');
    expect(url.password).toBe('s%40cret');
    expect(url.searchParams.get('sslmode')).toBe('require');
  });

  it('leaves a migrator that already names the writer database alone', () => {
    const migrator = 'postgresql://migrator:other@db.internal:5432/economic_observatory';
    const target = resolveMigrationTarget(migrator, WRITER);

    expect(target.url).toBe(migrator);
    expect(target.redirectedFrom).toBeUndefined();
  });

  it('does not treat a different host as a mismatch', () => {
    // El writer usa el endpoint agrupado y el migrador el directo: misma base.
    const migrator = 'postgresql://migrator:other@db-direct.internal:5432/economic_observatory';
    const target = resolveMigrationTarget(migrator, WRITER);

    expect(target.url).toBe(migrator);
    expect(target.redirectedFrom).toBeUndefined();
  });

  it('names the writer database when the migrator names none', () => {
    const target = resolveMigrationTarget('postgresql://migrator:other@db.internal:5432', WRITER);

    expect(target.database).toBe('economic_observatory');
    expect(target.redirectedFrom).toBeUndefined();
  });

  it('passes through a URL it cannot read rather than guessing', () => {
    const target = resolveMigrationTarget('no-es-una-url', WRITER);

    expect(target.url).toBe('no-es-una-url');
    expect(target.redirectedFrom).toBeUndefined();
  });

  it('passes through when the writer itself names no database', () => {
    const migrator = 'postgresql://migrator:other@db.internal:5432/postgres';
    const target = resolveMigrationTarget(migrator, 'postgresql://writer:secret@db.internal:5432');

    expect(target.url).toBe(migrator);
    expect(target.redirectedFrom).toBeUndefined();
  });
});
