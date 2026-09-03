import { fetchChallanSummary, fetchFromVahan } from './_vahan.js';
import { validateRc } from '../src/rcNumber.js';

const WRAPPER = 'https://vehicleinfobyterabaap.vercel.app/lookup?rc=';

async function fetchFromWrapper(rc) {
  const res = await fetch(`${WRAPPER}${encodeURIComponent(rc)}`, {
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => null);
  if (!json || json.error) throw new Error(json?.error || `Wrapper responded ${res.status}`);
  delete json.copyright;
  return json;
}

export default async function handler(req, res) {
  const check = validateRc(req.query?.rc);
  if (!check.valid) return res.status(400).json({ error: check.message });

  try {
    const [details, challan] = await Promise.all([
      fetchFromVahan(check.rc),
      fetchChallanSummary(check.rc).catch(() => null),
    ]);
    // max-age=0 keeps browsers revalidating; the edge still serves cached copies.
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate, s-maxage=3600');
    return res.status(200).json({
      ...details,
      ...(challan?.status ? { 'Challan Status': challan.status } : {}),
      ...(challan?.fines ? { 'Pending Fines': challan.fines } : {}),
      source: 'vahanx',
    });
  } catch (primaryError) {
    try {
      const data = await fetchFromWrapper(check.rc);
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate, s-maxage=3600');
      return res.status(200).json({ ...data, source: 'wrapper' });
    } catch (fallbackError) {
      console.error('lookup failed', check.rc, primaryError.message, fallbackError.message);
      const notFound = /no details found/i.test(primaryError.message);
      return res.status(notFound ? 404 : 502).json({
        error: notFound
          ? 'No details found for this number.'
          : 'The vehicle data service is temporarily unreachable. Please try again in a few minutes.',
      });
    }
  }
}
