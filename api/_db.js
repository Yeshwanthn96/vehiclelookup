import { neon } from '@neondatabase/serverless';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const connectionString =
  process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;

const sql = connectionString ? neon(connectionString) : null;

// Without Postgres, fall back to a JSON file so local runs still collect history.
// Serverless filesystems are ephemeral, so /tmp is only ever a dev convenience.
const FILE = process.env.VERCEL ? '/tmp/rc_searches.json' : join(process.cwd(), '.data', 'rc_searches.json');

export const driver = sql ? 'postgres' : 'file';

let ready = null;

function ensureSchema() {
  ready ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS rc_searches (
        id BIGSERIAL PRIMARY KEY,
        rc TEXT NOT NULL,
        searched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        found BOOLEAN,
        model TEXT,
        owner TEXT,
        country TEXT,
        region TEXT,
        city TEXT,
        ip TEXT
      )
    `;
    await sql`ALTER TABLE rc_searches ADD COLUMN IF NOT EXISTS model TEXT`;
    await sql`ALTER TABLE rc_searches ADD COLUMN IF NOT EXISTS owner TEXT`;
    await sql`CREATE INDEX IF NOT EXISTS rc_searches_rc_idx ON rc_searches (rc)`;
    await sql`CREATE INDEX IF NOT EXISTS rc_searches_time_idx ON rc_searches (searched_at DESC)`;
  })();
  return ready;
}

async function readFileRows() {
  try {
    const parsed = JSON.parse(await readFile(FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeFileRows(rows) {
  await mkdir(dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(rows.slice(-5000), null, 2), 'utf8');
}

export async function recordSearch(entry) {
  const row = { ...entry, searched_at: new Date().toISOString() };

  if (sql) {
    await ensureSchema();
    await sql`
      INSERT INTO rc_searches (rc, found, model, owner, country, region, city, ip)
      VALUES (${row.rc}, ${row.found ?? null}, ${row.model ?? null}, ${row.owner ?? null},
              ${row.country ?? null}, ${row.region ?? null}, ${row.city ?? null}, ${row.ip ?? null})
    `;
    return;
  }

  const rows = await readFileRows();
  rows.push(row);
  await writeFileRows(rows);
}

export async function listSearches(limit = 200) {
  if (sql) {
    await ensureSchema();
    const [recent, top, totals] = await Promise.all([
      sql`SELECT rc, searched_at, found, model, owner, country, region, city, ip
          FROM rc_searches ORDER BY searched_at DESC LIMIT ${limit}`,
      sql`SELECT rc, COUNT(*)::int AS searches, MAX(searched_at) AS last_searched,
                 MAX(model) AS model, MAX(owner) AS owner
          FROM rc_searches GROUP BY rc
          ORDER BY searches DESC, last_searched DESC LIMIT ${limit}`,
      sql`SELECT COUNT(*)::int AS total, COUNT(DISTINCT rc)::int AS unique_rc FROM rc_searches`,
    ]);
    return { driver, ...totals[0], top, recent };
  }

  const rows = await readFileRows();
  const recent = [...rows].reverse().slice(0, limit);

  const grouped = new Map();
  for (const row of rows) {
    const entry = grouped.get(row.rc) || { rc: row.rc, searches: 0, last_searched: null, model: null, owner: null };
    entry.searches += 1;
    if (!entry.last_searched || row.searched_at > entry.last_searched) entry.last_searched = row.searched_at;
    entry.model ||= row.model || null;
    entry.owner ||= row.owner || null;
    grouped.set(row.rc, entry);
  }
  const top = [...grouped.values()]
    .sort((a, b) => b.searches - a.searches || String(b.last_searched).localeCompare(String(a.last_searched)))
    .slice(0, limit);

  return { driver, total: rows.length, unique_rc: grouped.size, top, recent };
}
