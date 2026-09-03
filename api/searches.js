import { timingSafeEqual } from 'node:crypto';
import { ensureSchema, sql } from './_db.js';

function keyMatches(provided) {
  const expected = process.env.ADMIN_KEY;
  if (!expected) return false;
  const a = Buffer.from(String(provided || ''));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  const provided = req.headers['x-admin-key'] || req.query.key;
  if (!keyMatches(provided)) return res.status(401).json({ error: 'Unauthorized' });

  const limit = Math.min(Number(req.query.limit) || 200, 1000);

  try {
    await ensureSchema();
    const [recent, top, totals] = await Promise.all([
      sql`
        SELECT rc, searched_at, found, country, region, city, ip
        FROM rc_searches
        ORDER BY searched_at DESC
        LIMIT ${limit}
      `,
      sql`
        SELECT rc, COUNT(*)::int AS searches, MAX(searched_at) AS last_searched
        FROM rc_searches
        GROUP BY rc
        ORDER BY searches DESC, last_searched DESC
        LIMIT ${limit}
      `,
      sql`SELECT COUNT(*)::int AS total, COUNT(DISTINCT rc)::int AS unique_rc FROM rc_searches`,
    ]);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ...totals[0], top, recent });
  } catch (err) {
    console.error('searches query failed', err);
    return res.status(500).json({ error: 'Query failed' });
  }
}
