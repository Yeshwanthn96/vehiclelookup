import { rateLimit } from './_rateLimit.js';

const MASK_CHARS = '*xX#•';
const MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const BASE_URL = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
const API_KEY = process.env.AI_API_KEY;

export const aiEnabled = Boolean(API_KEY);

// Full state name reads better in a prompt than an RTO code the model may not recognize.
const STATE_NAMES = {
  AN: 'Andaman and Nicobar Islands', AP: 'Andhra Pradesh', AR: 'Arunachal Pradesh',
  AS: 'Assam', BR: 'Bihar', CG: 'Chhattisgarh', CH: 'Chandigarh', DD: 'Daman and Diu',
  DL: 'Delhi', DN: 'Dadra and Nagar Haveli', GA: 'Goa', GJ: 'Gujarat', HP: 'Himachal Pradesh',
  HR: 'Haryana', JH: 'Jharkhand', JK: 'Jammu and Kashmir', KA: 'Karnataka', KL: 'Kerala',
  LA: 'Ladakh', MH: 'Maharashtra', ML: 'Meghalaya', MN: 'Manipur', MP: 'Madhya Pradesh',
  MZ: 'Mizoram', NL: 'Nagaland', OD: 'Odisha', OR: 'Odisha', PB: 'Punjab', PY: 'Puducherry',
  RJ: 'Rajasthan', SK: 'Sikkim', TN: 'Tamil Nadu', TR: 'Tripura', TS: 'Telangana',
  UK: 'Uttarakhand', UA: 'Uttarakhand', UP: 'Uttar Pradesh', WB: 'West Bengal',
};

const isMasked = (token) => [...token].some((c) => MASK_CHARS.includes(c));

/** Same mask semantics as the client: one mask char is exactly one hidden letter. */
function tokenToRegex(token) {
  const body = [...token]
    .map((c) => {
      if (MASK_CHARS.includes(c)) return '[a-z]';
      if (/[a-z]/i.test(c)) return c.toLowerCase();
      return c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(`^${body}$`, 'i');
}

function buildPrompt(token, state) {
  const length = token.length;
  const first = token[0];
  const last = /[a-z]/i.test(token[length - 1]) ? token[length - 1] : null;
  const stateName = STATE_NAMES[state];
  const region = stateName
    ? ` that are common among people from ${stateName}, India (the vehicle's RTO state)`
    : ' that are common in India';

  return [
    `List real Indian personal first or last names${region}.`,
    `Every name must be exactly ${length} letters long, start with the letter "${first}"`,
    last ? `, and end with the letter "${last}"` : '',
    `. Prioritize names actually used in that region over generic pan-Indian names.`,
    ' Reply with a JSON array of up to 15 name strings and nothing else - no explanation, no markdown.',
  ].join('');
}

export default async function handler(req, res) {
  const limit = rateLimit(req, { max: 10 });
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfter));
    return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
  }

  if (!aiEnabled) return res.status(503).json({ error: 'AI suggestions are not configured.' });

  const tokens = String(req.query?.token || '')
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t && t.length <= 30 && isMasked(t))
    .slice(0, 4);
  const state = String(req.query?.state || '').trim().toUpperCase().slice(0, 2);

  if (!tokens.length) {
    return res.status(400).json({ error: 'Provide a masked name part, for example D*******A.' });
  }

  try {
    const entries = await Promise.all(tokens.map(async (token) => [token, await askModel(token, state)]));
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=86400');
    return res.status(200).json({ names: Object.fromEntries(entries), source: 'ai' });
  } catch (error) {
    console.error('ai suggest failed', error.message);
    return res.status(502).json({ error: 'Could not fetch AI suggestions.' });
  }
}

async function askModel(token, state) {
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.5,
      max_tokens: 700,
      // Reasoning models (e.g. Groq's gpt-oss) otherwise spend the whole
      // token budget on hidden chain-of-thought and return empty content.
      reasoning_effort: 'low',
      messages: [
        { role: 'system', content: 'You return only compact JSON arrays of names.' },
        { role: 'user', content: buildPrompt(token, state) },
      ],
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) throw new Error(`AI provider responded ${response.status}`);
  const payload = await response.json();
  const raw = payload?.choices?.[0]?.message?.content ?? '[]';

  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch {
    return [];
  }

  const pattern = tokenToRegex(token);
  // The model is unreliable about length, so every suggestion is re-checked
  // against the mask before it reaches the user.
  const seen = new Set();
  return (Array.isArray(parsed) ? parsed : [])
    .map((name) => (typeof name === 'string' ? name.trim() : ''))
    .filter((name) => name && pattern.test(name) && !seen.has(name.toLowerCase()) && seen.add(name.toLowerCase()))
    .slice(0, 15);
}
