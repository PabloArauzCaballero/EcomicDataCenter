import 'dotenv/config';
import pg from 'pg';
const client = new pg.Client({ connectionString: process.env.DATABASE_MIGRATOR_URL ?? process.env.DATABASE_WRITER_URL });
await client.connect();
const { rows } = await client.query("select rolname from pg_roles where rolname not like 'pg_%' and rolname not in ('cloud_admin','neon_superuser') order by 1");
console.log('roles:', rows.map(r => r.rolname).join(', '));
const { rows: size } = await client.query("select pg_size_pretty(pg_database_size(current_database())) as s");
console.log('tamaño actual:', size[0].s);
await client.end();
