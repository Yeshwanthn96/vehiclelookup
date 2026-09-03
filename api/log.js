import { recordSearch } from './_db.js';
import { pushToSheet } from './_sheet.js';
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

  const entry = {
    rc: check.rc,
    found: typeof body.found === 'boolean' ? body.found : null,
    model: body.model ? String(body.model).slice(0, 120) : null,
    owner: body.owner ? String(body.owner).slice(0, 120) : null,
    country: first(req.headers['x-vercel-ip-country']),
    region: first(req.headers['x-vercel-ip-country-region']),
    city: first(req.headers['x-vercel-ip-city']),
    ip: first(req.headers['x-forwarded-for']),
  };

  // Logging must never break a lookup, so failures are swallowed.
  await Promise.allSettled([
    recordSearch(entry).catch((err) => console.error('rc log failed', err)),
    pushToSheet(entry).catch((err) => console.error('sheet push failed', err)),
  ]);

  return res.status(204).end();
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
