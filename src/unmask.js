import raw from './names.json';

const dedupe = (list) =>
  [...new Set(list.map((n) => n.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

const FIRST = dedupe(raw.first);
const LAST = dedupe(raw.last);
const ALL = dedupe([...raw.first, ...raw.last]);

const MASK_CHARS = '*xX#•';

const isMasked = (token) => [...token].some((c) => MASK_CHARS.includes(c));

// A mask token such as "P***N" means: 5 letters, starts with P, ends with N.
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

function candidatesFor(token, pool, limit, rank) {
  const re = tokenToRegex(token);
  const hits = pool.filter((name) => re.test(name));
  const ranked = rank ? [...hits].sort((a, b) => rank(b) - rank(a) || a.localeCompare(b)) : hits;
  return { total: hits.length, names: ranked.slice(0, limit) };
}

// Name endings strongly associated with a region, used to rank candidates when
// we know which state's RTO issued the registration.
const REGIONAL_HINTS = {
  KA: [/appa$/i, /amma$/i, /esh$/i, /aiah$/i, /swamy$/i, /gowda$/i, /raju$/i, /shetty$/i],
  TN: [/an$/i, /murthy$/i, /raj$/i, /velu$/i, /samy$/i, /nathan$/i],
  AP: [/reddy$/i, /naidu$/i, /rao$/i, /varma$/i, /chowdary$/i],
  TS: [/reddy$/i, /naidu$/i, /rao$/i, /goud$/i],
  KL: [/nair$/i, /menon$/i, /pillai$/i, /kutty$/i, /dasan$/i],
  MH: [/kar$/i, /patil$/i, /rao$/i, /shinde$/i, /desai$/i],
  GJ: [/bhai$/i, /patel$/i, /shah$/i, /lal$/i],
  PB: [/singh$/i, /kaur$/i, /preet$/i],
  WB: [/jee$/i, /das$/i, /ghosh$/i, /sen$/i],
};

function rankerFor(stateCode) {
  const patterns = REGIONAL_HINTS[String(stateCode || '').toUpperCase()];
  if (!patterns) return null;
  return (name) => (patterns.some((re) => re.test(name)) ? 1 : 0);
}

export function buildCombinations(parts, limit = 6) {
  // A masked part with no candidate would only ever produce the mask itself,
  // so there is no honest full name to offer.
  if (parts.some((part) => part.masked && part.candidates.length === 0)) return [];

  let combos = [''];
  for (const part of parts) {
    const options = part.masked ? part.candidates : [part.token];
    const next = [];
    for (const base of combos) {
      for (const option of options) {
        next.push(base ? `${base} ${option}` : option);
        if (next.length >= limit) break;
      }
      if (next.length >= limit) break;
    }
    combos = next;
  }
  return combos;
}

/** Break a masked owner name into parts and suggest real names for each masked part. */
export function suggestNames(maskedName, { perPartLimit = 5, comboLimit = 6, stateCode } = {}) {
  const cleaned = String(maskedName || '').trim();
  if (!cleaned) return { masked: '', parts: [], combinations: [], note: 'No owner name to work with.' };

  const rank = rankerFor(stateCode);
  const tokens = cleaned.split(/\s+/);
  const parts = tokens.map((token, index) => {
    if (!isMasked(token)) {
      return {
        token,
        masked: false,
        isInitial: token.replace(/\W/g, '').length === 1,
        total: 1,
        candidates: [token],
      };
    }
    const pool = index === 0 ? FIRST : tokens.length - 1 === index ? LAST : ALL;
    const primary = candidatesFor(token, pool, perPartLimit, rank);
    // Fall back to the full dictionary when the positional pool yields nothing.
    const result = primary.total > 0 ? primary : candidatesFor(token, ALL, perPartLimit, rank);
    return {
      token,
      masked: true,
      isInitial: false,
      length: token.length,
      total: result.total,
      candidates: result.names,
    };
  });

  return {
    masked: cleaned,
    parts,
    combinations: buildCombinations(parts, comboLimit),
    hasMask: parts.some((p) => p.masked),
    note: parts.some((p) => p.masked && p.total === 0)
      ? 'No dictionary match for one or more masked parts — the real name may be outside the built-in name list.'
      : 'Suggestions are dictionary guesses based on the visible letters and mask length, not confirmed data.',
  };
}

export const dictionarySize = { first: FIRST.length, last: LAST.length, total: ALL.length };
