const { randomBytes } = require('node:crypto');
const { existsSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');

const targetPath = resolve(process.cwd(), '.env');
const useHostRuntime = process.argv.includes('--host');
const forceOverwrite = process.argv.includes('--force');

if (existsSync(targetPath) && !forceOverwrite) {
  process.stderr.write(
    '.env already exists. Re-run with --force only when replacing the current local configuration is intentional.\n',
  );
  process.exitCode = 1;
  return;
}

function createSecret() {
  return randomBytes(24).toString('hex');
}

const adminPassword = createSecret();
const migratorPassword = createSecret();
const writerPassword = createSecret();
const readerPassword = createSecret();
const backupPassword = createSecret();
const databaseHost = useHostRuntime ? '127.0.0.1' : 'postgres';
const appHost = useHostRuntime ? '127.0.0.1' : '0.0.0.0';
const trustProxy = useHostRuntime ? 'false' : 'true';
const smokeBaseUrl = useHostRuntime ? 'http://127.0.0.1:3000' : 'http://127.0.0.1:8080';

const environment = [
  'NODE_ENV=development',
  `APP_HOST=${appHost}`,
  'APP_PORT=3000',
  'APP_NAME=observatorio-economico-core',
  'API_PREFIX=api',
  'API_VERSION=v1',
  'CORS_ORIGINS=http://localhost:3001',
  'BODY_LIMIT_BYTES=1048576',
  'RATE_LIMIT_MAX=300',
  'RATE_LIMIT_WINDOW_MS=60000',
  'HTTP_REQUEST_TIMEOUT_MS=30000',
  'HTTP_CONNECTION_TIMEOUT_MS=10000',
  'HTTP_KEEP_ALIVE_TIMEOUT_MS=72000',
  'LOG_LEVEL=info',
  `TRUST_PROXY=${trustProxy}`,
  '',
  `DATABASE_WRITER_URL=postgresql://observatory_writer:${writerPassword}@${databaseHost}:5432/observatorio_economico`,
  `DATABASE_READER_URL=postgresql://observatory_reader:${readerPassword}@${databaseHost}:5432/observatorio_economico`,
  `DATABASE_MIGRATOR_URL=postgresql://observatory_migrator:${migratorPassword}@${databaseHost}:5432/observatorio_economico`,
  'DATABASE_SSL=false',
  'DATABASE_CONNECT_TIMEOUT_MS=5000',
  'DATABASE_POOL_MAX_WRITER=15',
  'DATABASE_POOL_MAX_READER=30',
  'DATABASE_POOL_MIN=0',
  'DATABASE_POOL_ACQUIRE_MS=15000',
  'DATABASE_POOL_IDLE_MS=10000',
  'DATABASE_STATEMENT_TIMEOUT_MS=15000',
  '',
  `POSTGRES_ADMIN_PASSWORD=${adminPassword}`,
  `MIGRATOR_PASSWORD=${migratorPassword}`,
  `WRITER_PASSWORD=${writerPassword}`,
  `READER_PASSWORD=${readerPassword}`,
  `BACKUP_PASSWORD=${backupPassword}`,
  'POSTGRES_HOST_PORT=5432',
  '',
  'AUTH_MODE=disabled',
  'AUTH_JWKS_URI=https://identity.example.test/.well-known/jwks.json',
  'AUTH_ISSUER=https://identity.example.test/',
  'AUTH_AUDIENCE=observatorio-economico-api',
  'AUTH_ROLE_CLAIM=roles',
  'AUTH_ORGANIZATION_CLAIM=organization_id',
  '',
  'SWAGGER_ENABLED=true',
  'METRICS_ENABLED=true',
  '',
  'BACKUP_ENABLED=false',
  'BACKUP_STRATEGY=pg_dump',
  'BACKUP_RETENTION_DAYS=30',
  'BACKUP_DESTINATION=/backups',
  'BACKUP_ENCRYPTION_ENABLED=false',
  'BACKUP_COMPRESSION=custom',
  'BACKUP_MAX_DURATION_SECONDS=3600',
  `BACKUP_DATABASE_URL=postgresql://observatory_backup:${backupPassword}@${databaseHost}:5432/observatorio_economico`,
  '',
  `SMOKE_BASE_URL=${smokeBaseUrl}`,
  'LOCAL_STARTUP_TIMEOUT_MS=180000',
  '',
].join('\n');

writeFileSync(targetPath, environment, { encoding: 'utf8', mode: 0o600 });
process.stdout.write(
  `Created ${targetPath} for ${useHostRuntime ? 'host API development' : 'the full Docker stack'}.\n`,
);
