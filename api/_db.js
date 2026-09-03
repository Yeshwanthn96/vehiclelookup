import { neon } from '@neondatabase/serverless';

const connectionString =
  process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;

if (!connectionString) {
  console.warn('No Postgres connection string set (DATABASE_URL / POSTGRES_URL).');
}

export const sql = connectionString ? neon(connectionString) : null;

let ready = null;

/** Creates the table on first use so there is no separate migration step. */
export function ensureSchema() {
  if (!sql) throw new Error('Database is not configured.');
  ready ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS rc_searches (
        id BIGSERIAL PRIMARY KEY,
        rc TEXT NOT NULL,
        searched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        found BOOLEAN,
        country TEXT,
        region TEXT,
        city TEXT,
        ip TEXT
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS rc_searches_rc_idx ON rc_searches (rc)`;
    await sql`CREATE INDEX IF NOT EXISTS rc_searches_time_idx ON rc_searches (searched_at DESC)`;
  })();
  return ready;
}
