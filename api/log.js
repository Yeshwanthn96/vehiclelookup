import { ensureSchema, sql } from './_db.js';
import { validateRc } from '../src/rcNumber.js';

const first = (value) => String(value || '').split(',')[0].trim() || null;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body || {};
  const check = validateRc(body.rc);
  if (!check.valid) return res.status(400).json({ error: 'Invalid registration number' });

  try {
    await ensureSchema();
    await sql`
      INSERT INTO rc_searches (rc, found, country, region, city, ip)
      VALUES (
        ${check.rc},
        ${typeof body.found === 'boolean' ? body.found : null},
        ${first(req.headers['x-vercel-ip-country'])},
        ${first(req.headers['x-vercel-ip-country-region'])},
        ${first(req.headers['x-vercel-ip-city'])},
        ${first(req.headers['x-forwarded-for'])}
      )
    `;
    return res.status(204).end();
  } catch (err) {
    // Logging must never break a lookup for the user.
    console.error('rc log failed', err);
    return res.status(204).end();
  }
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
