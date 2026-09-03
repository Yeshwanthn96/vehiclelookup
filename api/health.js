import { driver } from './_db.js';
import { sheetEnabled } from './_sheet.js';
import { aiEnabled } from './suggest.js';

// Reports which logging sinks are configured. Booleans only - no secrets.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    store: driver,
    sheet: sheetEnabled,
    ai: aiEnabled,
    adminKey: Boolean(process.env.ADMIN_KEY),
    env: process.env.VERCEL_ENV || 'local',
  });
}
