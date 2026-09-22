import 'dotenv/config';
import pg from 'pg';

/**
 * Ends sessions left holding a transaction open by a killed loader.
 *
 * An `idle in transaction` session keeps its locks and its uncommitted rows for
 * as long as it lives, which blocks the next loader and bloats the table it was
 * writing to. Terminating it rolls that work back — nothing was committed, by
 * design: the load is one transaction so that either the corpus lands or
 * nothing does.
 */
const url = (process.env.DATABASE_WRITER_URL ?? '').replace('-pooler', '');
const client = new pg.Client({ connectionString: url });
await client.connect();
const { rows } = await client.query(
  `select pid, state, age(clock_timestamp(), xact_start)::text as edad
   from pg_stat_activity
   where datname = current_database() and pid <> pg_backend_pid()
     and xact_start is not null and clock_timestamp() - xact_start > interval '5 minutes'`,
);
for (const row of rows) {
  const { rows: done } = await client.query('select pg_terminate_backend($1) as ok', [row.pid]);
  console.log(`terminada ${row.pid} (${row.state}, ${row.edad}): ${done[0].ok}`);
}
if (rows.length === 0) console.log('no había sesiones que terminar');
await client.end();
