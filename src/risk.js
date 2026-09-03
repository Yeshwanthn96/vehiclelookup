import { parseApiDate } from './fields.js';

const DAY = 86_400_000;

const daysUntil = (value) => {
  const date = parseApiDate(value);
  return date ? Math.ceil((date - new Date()) / DAY) : null;
};

const isBlank = (value) =>
  value == null || value === '' || /^(na|n\/a|nil|none|-)$/i.test(String(value).trim());

const get = (data, ...keys) => {
  const key = keys.find((k) => !isBlank(data?.[k]));
  return key ? String(data[key]).trim() : '';
};

/** Each check returns a finding; severity drives both the score and the verdict. */
const CHECKS = [
  function insurance(data) {
    const value = get(data, 'Insurance Upto', 'Insurance Expiry');
    if (!value) return { severity: 'unknown', title: 'Insurance status unknown', detail: 'No insurance date reported.' };
    const days = daysUntil(value);
    if (days === null) return null;
    if (days < 0) {
      return {
        severity: 'critical',
        title: 'Insurance expired',
        detail: `Expired ${Math.abs(days)} days ago (${value}). Driving uninsured is a punishable offence and you inherit the gap.`,
      };
    }
    if (days <= 30) {
      return { severity: 'warn', title: 'Insurance expiring soon', detail: `Only ${days} days left (${value}).` };
    }
    return { severity: 'ok', title: 'Insurance valid', detail: `Valid until ${value}.` };
  },

  function hypothecation(data) {
    const financer = get(data, 'Financer Name');
    if (!financer) {
      return { severity: 'ok', title: 'No loan on record', detail: 'No financer listed, so the RC appears free of hypothecation.' };
    }
    return {
      severity: 'critical',
      title: 'Loan not closed (hypothecation)',
      detail: `RC is hypothecated to ${financer}. Ownership cannot be transferred cleanly until the loan is closed and Form 35 is issued.`,
    };
  },

  function blacklist(data) {
    const status = get(data, 'Blacklist Status');
    if (!status) return { severity: 'ok', title: 'Not blacklisted', detail: 'No blacklist entry reported.' };
    return { severity: 'critical', title: 'Blacklisted', detail: `Blacklist entry found: ${status}.` };
  },

  function noc(data) {
    const noc = get(data, 'NOC Details');
    if (!noc) return null;
    return {
      severity: 'warn',
      title: 'NOC issued',
      detail: `An NOC is on record (${noc}), meaning the vehicle is being moved to another RTO.`,
    };
  },

  function fitness(data) {
    const value = get(data, 'Fitness Upto');
    if (!value) return null;
    const days = daysUntil(value);
    if (days === null) return null;
    if (days < 0) {
      return {
        severity: 'critical',
        title: 'Fitness certificate expired',
        detail: `Expired ${Math.abs(days)} days ago (${value}). The vehicle is not legally roadworthy until renewed.`,
      };
    }
    if (days <= 60) {
      return { severity: 'warn', title: 'Fitness expiring soon', detail: `${days} days left (${value}).` };
    }
    return { severity: 'ok', title: 'Fitness valid', detail: `Valid until ${value}.` };
  },

  function tax(data) {
    const value = get(data, 'Tax Upto');
    if (!value) return null;
    if (/^ltt$/i.test(value)) {
      return { severity: 'ok', title: 'Lifetime tax paid', detail: 'Road tax is paid for the life of the vehicle.' };
    }
    const days = daysUntil(value);
    if (days === null) return null;
    if (days < 0) {
      return {
        severity: 'warn',
        title: 'Road tax expired',
        detail: `Expired ${Math.abs(days)} days ago (${value}). Arrears usually transfer to the new owner.`,
      };
    }
    return { severity: 'ok', title: 'Road tax paid', detail: `Paid until ${value}.` };
  },

  function challans(data) {
    const status = get(data, 'Challan Status');
    const fines = get(data, 'Pending Fines');
    if (!status) return null;
    if (/^no pending/i.test(status)) {
      return { severity: 'ok', title: 'No pending challans', detail: 'No unpaid traffic fines found.' };
    }
    return {
      severity: 'warn',
      title: 'Pending challans',
      detail: fines ? `${status}, totalling ${fines}. Unpaid fines follow the vehicle.` : `${status}. Unpaid fines follow the vehicle.`,
    };
  },

  function age(data) {
    const registered = parseApiDate(get(data, 'Registration Date'));
    if (!registered) return null;
    const years = Math.floor((Date.now() - registered) / (DAY * 365.25));
    const isPrivateCar = /motor car|lmv/i.test(get(data, 'Vehicle Class'));
    if (isPrivateCar && years >= 15) {
      return {
        severity: 'warn',
        title: `${years} years old`,
        detail: 'Private vehicles need re-registration after 15 years, and several cities restrict older vehicles.',
      };
    }
    return { severity: 'ok', title: `${years} years old`, detail: `Registered on ${get(data, 'Registration Date')}.` };
  },
];

const WEIGHT = { critical: 30, warn: 12, unknown: 5, ok: 0 };

export function assessVehicle(data) {
  if (!data) return null;

  const findings = CHECKS.map((check) => check(data)).filter(Boolean);
  const penalty = findings.reduce((sum, f) => sum + WEIGHT[f.severity], 0);
  const score = Math.max(0, 100 - penalty);

  const critical = findings.filter((f) => f.severity === 'critical');
  const warnings = findings.filter((f) => f.severity === 'warn');

  let verdict;
  if (critical.length) {
    verdict = {
      tone: 'bad',
      label: 'High risk',
      summary: `${critical.length} serious issue${critical.length > 1 ? 's' : ''} found. Resolve ${critical.length > 1 ? 'these' : 'this'} before buying.`,
    };
  } else if (warnings.length) {
    verdict = {
      tone: 'warn',
      label: 'Check before buying',
      summary: `${warnings.length} item${warnings.length > 1 ? 's need' : ' needs'} attention, but nothing blocks a transfer.`,
    };
  } else {
    verdict = { tone: 'good', label: 'Looks clean', summary: 'No expiry, loan or blacklist problems found in the RC record.' };
  }

  const order = { critical: 0, warn: 1, unknown: 2, ok: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return { score, verdict, findings, critical: critical.length, warnings: warnings.length };
}
