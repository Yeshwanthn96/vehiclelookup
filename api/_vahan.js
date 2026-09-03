const SOURCE = 'https://vahanx.in/rc-search/';
const CHALLAN = 'https://vahanx.in/challan-search/';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// vahanx renders each field as either <span>label</span><p>value</p> or the reverse.
const LABEL_FIRST = /<span[^>]*>\s*([^<>{}]{2,40}?)\s*<\/span>\s*<p[^>]*>\s*([\s\S]*?)\s*<\/p>/g;
const VALUE_FIRST = /<p[^>]*>\s*([\s\S]*?)\s*<\/p>\s*<span[^>]*>\s*([^<>{}]{2,40}?)\s*<\/span>/g;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

const decode = (text) =>
  text.replace(/&(#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') return String.fromCharCode(Number(code.slice(1)));
    return ENTITIES[code.toLowerCase()] ?? match;
  });

const clean = (html) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// vahanx renders these as hardcoded placeholders (identical for every vehicle), so they are dropped.
const PLACEHOLDER_FIELDS = new Set(['Cubic Capacity', 'Seating Capacity']);

function parse(html) {
  const fields = {};
  const add = (label, value) => {
    const key = clean(label);
    const val = clean(value);
    if (!key || !val || key in fields || PLACEHOLDER_FIELDS.has(key)) return;
    // Skip page furniture: real labels are short and values are single data points.
    if (key.split(' ').length > 4 || val.length > 120) return;
    fields[key] = val;
  };

  for (const [, label, value] of html.matchAll(LABEL_FIRST)) add(label, value);
  for (const [, value, label] of html.matchAll(VALUE_FIRST)) add(label, value);

  return fields;
}

export async function fetchFromVahan(rc, { timeoutMs = 12000 } = {}) {
  const res = await fetch(`${SOURCE}${encodeURIComponent(rc)}`, {
    headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Source responded ${res.status}`);

  const fields = parse(await res.text());
  if (!fields['Registration Number'] && !fields['Owner Name']) {
    throw new Error('No details found for this number.');
  }
  return fields;
}

/** Pending traffic fines, from vahanx's separate challan page. */
export async function fetchChallanSummary(rc, { timeoutMs = 10000 } = {}) {
  const res = await fetch(`${CHALLAN}${encodeURIComponent(rc)}`, {
    headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Challan source responded ${res.status}`);

  const html = await res.text();
  if (/no challan records found/i.test(html)) return { status: 'No pending challans' };

  // Strip head/scripts/styles so marketing copy can't contribute stray amounts.
  const body = html
    .replace(/<head[\s\S]*?<\/head>/i, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  const amounts = [...body.matchAll(/(?:₹|&#8377;|Rs\.?)\s*([\d,]+(?:\.\d{1,2})?)/gi)]
    .map((m) => Number(m[1].replace(/,/g, '')))
    .filter((n) => n > 0);
  const count = (body.match(/challan\s*(?:no|number)\b/gi) || []).length;
  const total = amounts.reduce((sum, n) => sum + n, 0);
  const decimals = Number.isInteger(total) ? 0 : 2;

  return {
    status: count ? `${count} pending challan${count > 1 ? 's' : ''}` : 'Challan records found',
    fines:
      total > 0
        ? `₹${total.toLocaleString('en-IN', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })}`
        : undefined,
  };
}
