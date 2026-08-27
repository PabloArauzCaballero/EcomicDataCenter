import 'dotenv/config';
import pg from 'pg';
const url = (process.env.DATABASE_WRITER_URL ?? '').replace('-pooler', '');
const client = new pg.Client({ connectionString: url });
await client.connect();
const { rows } = await client.query(
  `select pid, state, age(clock_timestamp(), xact_start)::text as edad, left(query, 60) as consulta
   from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()
     and state <> 'idle' order by xact_start`,
);
console.log(
  rows.length
    ? rows.map((r) => `${r.pid} ${r.state} ${r.edad} ${r.consulta}`).join('\n')
    : 'ninguna',
);
await client.end();
