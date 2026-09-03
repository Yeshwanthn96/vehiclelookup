// Valid state / UT codes used in Indian registration numbers.
const STATE_CODES = new Set([
  'AN', 'AP', 'AR', 'AS', 'BR', 'CG', 'CH', 'DD', 'DL', 'DN', 'GA', 'GJ',
  'HP', 'HR', 'JH', 'JK', 'KA', 'KL', 'LA', 'LD', 'MH', 'ML', 'MN', 'MP',
  'MZ', 'NL', 'OD', 'OR', 'PB', 'PY', 'RJ', 'SK', 'TN', 'TR', 'TS', 'UK',
  'UA', 'UP', 'WB',
]);

// KA02MX3710 -> state(2) + district(1-2) + series(0-3) + number(4)
const STANDARD = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/;
// 22BH1234A -> year(2) + BH + number(4) + series(1-2)
const BH_SERIES = /^\d{2}BH\d{4}[A-Z]{1,2}$/;

// Same shapes, but allowing an incomplete tail so typing is not blocked mid-way.
const STANDARD_PARTIAL = /^[A-Z]{1,2}(\d{1,2}([A-Z]{1,3})?(\d{1,4})?)?$/;
const BH_PARTIAL = /^\d{1,2}(B(H(\d{1,4}([A-Z]{1,2})?)?)?)?$/;

export const MAX_RC_LENGTH = 11;

export const normalizeRc = (value) =>
  String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, MAX_RC_LENGTH);

/** True while the value can still grow into a valid number - used to reject keystrokes. */
export function isTypableRc(value) {
  return value === '' || STANDARD_PARTIAL.test(value) || BH_PARTIAL.test(value);
}

export function validateRc(value) {
  const rc = normalizeRc(value);
  if (!rc) return { valid: false, rc, message: 'Enter a registration number, e.g. KA02MX3710.' };

  if (BH_SERIES.test(rc)) return { valid: true, rc, message: '' };

  if (/^\d/.test(rc)) {
    return { valid: false, rc, message: 'Only BH-series numbers start with digits, e.g. 22BH1234A.' };
  }
  if (!STANDARD.test(rc)) {
    return { valid: false, rc, message: 'Use the format KA02MX3710 - state code, district, series, then 4 digits.' };
  }
  if (!STATE_CODES.has(rc.slice(0, 2))) {
    return { valid: false, rc, message: `"${rc.slice(0, 2)}" is not a valid state code.` };
  }
  return { valid: true, rc, message: '' };
}
