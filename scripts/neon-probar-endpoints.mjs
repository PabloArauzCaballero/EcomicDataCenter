import 'dotenv/config';
import pg from 'pg';

/**
 * Tells apart "the database is slow" from "this host cannot reach it".
 *
 * Neon serves each branch on two addresses: a pooled one and a direct one. The
 * load scripts deliberately use the direct address, because a transaction that
 * runs for minutes is the wrong thing to hold on a pooler. But a network that
 * allows one address does not necessarily allow the other, and the symptom of
 * the direct address being unreachable is indistinguishable from a slow load:
 * the process simply sits there.
 *
 * So this connects to both with a short timeout and reports which answered.
 */

const base = process.env.DATABASE_WRITER_URL;
const candidates = [
  ['pooler', base],
  ['directo', base.replace('-pooler', '')],
];

for (const [label, url] of candidates) {
  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 15_000,
    statement_timeout: 15_000,
  });
  const started = Date.now();
  try {
    await client.connect();
    await client.query('select 1');
    console.log(`${label.padEnd(8)} OK en ${Date.now() - started} ms  (${new URL(url).hostname})`);
  } catch (error) {
    console.log(
      `${label.padEnd(8)} FALLA tras ${Date.now() - started} ms: ${error.message.slice(0, 70)}`,
    );
  } finally {
    try {
      await client.end();
    } catch {
      /* la conexión ya estaba caída */
    }
  }
}
