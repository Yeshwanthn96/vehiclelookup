// Optional paid challan provider. Any service returning JSON works: set
// CHALLAN_API_URL with {rc} as a placeholder, plus CHALLAN_API_KEY.
const URL_TEMPLATE = process.env.CHALLAN_API_URL;
const API_KEY = process.env.CHALLAN_API_KEY;
const HEADER = process.env.CHALLAN_API_HEADER || 'Authorization';

export const providerEnabled = Boolean(URL_TEMPLATE && API_KEY);

const INR = (total) =>
  `₹${total.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(total) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(total) ? 0 : 2,
  })}`;

/** Pulls challan entries out of whatever shape the provider returns. */
function extract(payload) {
  const list =
    payload?.challans ||
    payload?.data?.challans ||
    payload?.result?.challans ||
    (Array.isArray(payload?.data) ? payload.data : null) ||
    (Array.isArray(payload) ? payload : []);

  if (!Array.isArray(list)) return null;

  const pending = list.filter(
    (item) => !/paid|settled|disposed/i.test(String(item?.status ?? item?.challan_status ?? '')),
  );
  const total = pending.reduce((sum, item) => {
    const amount = Number(
      String(item?.amount ?? item?.challan_amount ?? item?.fine_amount ?? 0).replace(/[^\d.]/g, ''),
    );
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);

  return {
    verified: true,
    status: pending.length
      ? `${pending.length} pending challan${pending.length > 1 ? 's' : ''}`
      : 'No pending challans',
    fines: total > 0 ? INR(total) : undefined,
  };
}

export async function fetchChallanFromProvider(rc, { timeoutMs = 12000 } = {}) {
  if (!providerEnabled) return null;

  const res = await fetch(URL_TEMPLATE.replace('{rc}', encodeURIComponent(rc)), {
    headers: {
      Accept: 'application/json',
      [HEADER]: HEADER.toLowerCase() === 'authorization' ? `Bearer ${API_KEY}` : API_KEY,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Challan provider responded ${res.status}`);

  return extract(await res.json());
}
