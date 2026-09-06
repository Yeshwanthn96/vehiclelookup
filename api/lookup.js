import { fetchChallanSummary, fetchFromVahan } from './_vahan.js';
import { fetchChallanFromProvider, providerEnabled } from './_challan.js';
import { rateLimit } from './_rateLimit.js';
import { validateRc } from '../src/rcNumber.js';

const WRAPPER = 'https://vehicleinfobyterabaap.vercel.app/lookup?rc=';
const VAHANAS = 'https://vahanas.ai.studio/api/lookup?rc=';

function normalizeVahanasDetails(raw, rc) {
  const details = { ...raw };
  const owner = details.ownerName || details.owner_name || details.ownerName || '';
  const makerModel = details.makerModel || details.maker_model || details['Maker Model'] || '';
  const modelName = details.modelName || details.model_name || details['Model Name'] || '';
  const rtoName = details.rtoName || details.rto_name || details['Registered RTO'] || '';
  const city = details.cityName || details.city_name || details.city || '';
  const address = details.rtoAddress || details.rto_address || details.Address || '';
  const phone = details.rtoPhone || details.phone || details.Phone || '';
  const website = details.rtoWebsite || details.website || details.Website || '';
  const insuranceExpiry = details.insuranceExpiry || details['Insurance Upto'] || details['Insurance Expiry'] || '';
  const fitnessExpiry = details.fitnessExpiry || details['Fitness Upto'] || '';
  const taxExpiry = details.taxExpiry || details['Tax Upto'] || '';
  const pucExpiry = details.pucExpiry || details['PUC Upto'] || '';

  return {
    'Owner Name': owner || 'Masked by privacy rules',
    'Maker Model': makerModel,
    'Model Name': modelName,
    'Vehicle Class': details.vehicleClass || details['Vehicle Class'] || '',
    'Fuel Type': details.fuelType || details['Fuel Type'] || '',
    'Fuel Norms': details.fuelNorms || details['Fuel Norms'] || '',
    'Chassis Number': details.chassisNo || details['Chassis Number'] || '',
    'Engine Number': details.engineNo || details['Engine Number'] || '',
    'Insurance Company': details.insuranceCompany || details['Insurance Company'] || '',
    'Insurance No': details.insuranceNo || details['Insurance No'] || '',
    'Insurance Upto': insuranceExpiry,
    'Insurance Expiry': insuranceExpiry,
    'Insurance Expiry In': details.insuranceStatus === 'expired' ? 'Insurance Already Expired' : details.insuranceDaysLeft ? `${details.insuranceDaysLeft} days left` : '',
    'PUC Upto': pucExpiry,
    'Fitness Upto': fitnessExpiry,
    'Tax Upto': taxExpiry,
    'Registration Number': details.formattedRc || details.registrationNumber || rc,
    'Registration Date': details.registrationDate || details['Registration Date'] || '',
    'Vehicle Age': details.vehicleAge || details['Vehicle Age'] || '',
    'Registered RTO': rtoName,
    'Code': details.rtoCode || details['Code'] || '',
    'City Name': city,
    'Address': address,
    'Phone': phone,
    'Website': website,
    'Challan Status': details.challanStatus || details['Challan Status'] || 'Not checked',
    'Pending Fines': details.pendingFines || details['Pending Fines'] || '',
    'Financer Name': details.financerName || details['Financer Name'] || '',
    'Permit Type': details.permitType || details['Permit Type'] || '',
    'Blacklist Status': details.blacklistStatus || details['Blacklist Status'] || '',
    'NOC Details': details.nocStatus || details['NOC Details'] || '',
    'RC Status': details.rcStatus || details['RC Status'] || '',
    'Owner Serial No': details.ownerSerial || details['Owner Serial No'] || '',
    source: 'vahanas',
    raw: details,
  };
}

async function fetchFromVahanas(rc) {
  const res = await fetch(`${VAHANAS}${encodeURIComponent(rc)}`, {
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  const json = await res.json().catch(() => null);
  if (!json || json.error || !json.rcNumber) {
    throw new Error(json?.error || `Vahanas responded ${res.status}`);
  }
  return normalizeVahanasDetails(json, rc);
}

// A paid provider gives verified results; the scrape only ever reports "Not checked".
async function challanFor(rc) {
  if (providerEnabled) {
    const result = await fetchChallanFromProvider(rc).catch(() => null);
    if (result) return result;
  }
  return fetchChallanSummary(rc).catch(() => null);
}

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
  const limit = rateLimit(req);
  res.setHeader('X-RateLimit-Remaining', String(limit.remaining));
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfter));
    return res.status(429).json({ error: 'Too many lookups. Please wait a minute and try again.' });
  }

  const check = validateRc(req.query?.rc);
  if (!check.valid) return res.status(400).json({ error: check.message });

  try {
    const details = await fetchFromVahanas(check.rc).catch(() => fetchFromVahan(check.rc));
    const challan = await challanFor(check.rc).catch(() => null);
    // max-age=0 keeps browsers revalidating; the edge still serves cached copies.
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate, s-maxage=3600');
    return res.status(200).json({
      ...details,
      ...(challan?.status ? { 'Challan Status': challan.status } : {}),
      ...(challan?.fines ? { 'Pending Fines': challan.fines } : {}),
      source: details?.source || 'vahanx',
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
