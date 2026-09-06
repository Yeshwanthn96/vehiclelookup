const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const HIDDEN_KEYS = new Set(['copyright', 'source']);

const OWNER_KEYS = ['Owner Name', 'owner_name', 'ownerName', 'Owner'];

export const HIGHLIGHTS = [
  { key: 'Owner Name', label: 'Owner name', alt: OWNER_KEYS },
  { key: 'Maker Model', label: 'Vehicle', alt: ['Maker Model', 'maker_model'] },
  { key: 'Insurance Upto', label: 'Insurance upto', alt: ['Insurance Upto', 'Insurance Expiry'] },
  { key: 'Model Name', label: 'Make / model', alt: ['Model Name', 'Vehicle Class'] },
];

const GROUPS = [
  {
    title: 'Vehicle',
    keys: [
      'Model Name', 'Maker Model', 'Vehicle Class', 'Fuel Type', 'Fuel Norms',
      'Chassis Number', 'Engine Number',
    ],
  },
  {
    title: 'Validity & compliance',
    keys: [
      'Insurance Company', 'Insurance No', 'Insurance Upto', 'Insurance Expiry',
      'Insurance Expiry In', 'PUC Upto', 'Fitness Upto', 'Tax Upto',
    ],
  },
  {
    title: 'Registration',
    keys: [
      'Registration Number', 'Registration Date', 'Vehicle Age', 'Registered RTO',
      'Code', 'City Name', 'Address', 'Phone', 'Website',
    ],
  },
  {
    title: 'Status',
    keys: ['Challan Status', 'Pending Fines', 'Financer Name', 'Permit Type', 'Blacklist Status', 'NOC Details', 'RC Status'],
  },
];

/** Dates come back as "20-Oct-2040"; anything else (e.g. "LTT") is not a date. */
export function parseApiDate(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;

  const explicit = /^(\d{1,2})[-\s]+([A-Za-z]{3,9})[-\s]+(\d{4})$/i.exec(text);
  if (explicit) {
    const [, day, monthName, year] = explicit;
    const month = MONTHS[monthName.toLowerCase().slice(0, 3)];
    if (month === undefined) return null;
    return new Date(Number(year), month, Number(day));
  }

  const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(text);
  if (!match) return null;
  const month = MONTHS[match[2].toLowerCase()];
  if (month === undefined) return null;
  return new Date(Number(match[3]), month, Number(match[1]));
}

const EXPIRY_KEYS = new Set(['Insurance Upto', 'Insurance Expiry', 'PUC Upto', 'Fitness Upto', 'Tax Upto']);

export function expiryStatus(key, value) {
  if (!EXPIRY_KEYS.has(key)) return null;
  const date = parseApiDate(value);
  if (!date) return null;
  const days = Math.ceil((date - new Date()) / 86_400_000);
  if (days < 0) return { tone: 'bad', label: 'Expired' };
  if (days <= 30) return { tone: 'warn', label: `${days}d left` };
  return { tone: 'good', label: 'Valid' };
}

export function ownerNameOf(data) {
  const key = OWNER_KEYS.find((k) => data?.[k]);
  return key ? String(data[key]) : '';
}

const usable = (value) => value !== '' && value != null;

export function highlightsOf(data) {
  return HIGHLIGHTS.map(({ label, alt }) => {
    const key = alt.find((k) => usable(data?.[k]));
    return key ? { key, label, value: String(data[key]) } : null;
  }).filter(Boolean);
}

/** Ordered groups first, then whatever else the API returned. */
export function groupsOf(data) {
  const entries = Object.entries(data).filter(([key, value]) => !HIDDEN_KEYS.has(key) && usable(value));
  const remaining = new Map(entries);

  const groups = GROUPS.map(({ title, keys }) => {
    const rows = [];
    for (const key of keys) {
      if (remaining.has(key)) {
        rows.push([key, String(remaining.get(key))]);
        remaining.delete(key);
      }
    }
    return { title, rows };
  }).filter((group) => group.rows.length > 0);

  remaining.delete(OWNER_KEYS.find((k) => remaining.has(k)));
  const rest = [...remaining].map(([key, value]) => [key, String(value)]);
  if (rest.length) groups.push({ title: 'Other details', rows: rest });

  return groups;
}
