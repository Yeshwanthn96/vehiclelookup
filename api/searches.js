import { timingSafeEqual } from 'node:crypto';
import { listSearches } from './_db.js';
import { sheetEnabled } from './_sheet.js';

const CSV_COLUMNS = ['searched_at', 'rc', 'model', 'owner', 'found', 'city', 'region', 'country', 'ip'];

function keyMatches(provided) {
  const expected = process.env.ADMIN_KEY;
  // Without ADMIN_KEY set, allow local access only so the data is still viewable in dev.
  if (!expected) return !process.env.VERCEL;
  const a = Buffer.from(String(provided || ''));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const csvCell = (value) => {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const toCsv = (rows) =>
  [CSV_COLUMNS.join(','), ...rows.map((row) => CSV_COLUMNS.map((c) => csvCell(row[c])).join(','))].join('\n');

export default async function handler(req, res) {
  const provided = req.headers['x-admin-key'] || req.query?.key;
  if (!keyMatches(provided)) return res.status(401).json({ error: 'Unauthorized' });

  const limit = Math.min(Number(req.query?.limit) || 200, 1000);

  try {
    const data = await listSearches(limit);
    res.setHeader('Cache-Control', 'no-store');

    if (req.query?.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="vehicle-searches.csv"');
      return res.status(200).send(toCsv(data.recent));
    }

    return res.status(200).json({ ...data, sheet: sheetEnabled });
  } catch (err) {
    console.error('searches query failed', err);
    return res.status(500).json({ error: 'Query failed' });
  }
}
