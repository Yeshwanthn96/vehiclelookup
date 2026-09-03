const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;

// Per-instance only: serverless spreads traffic across instances, so this blunts
// bursts rather than enforcing a global quota.
const hits = new Map();

export function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

export function rateLimit(req, { max = MAX_REQUESTS, windowMs = WINDOW_MS } = {}) {
  const key = clientIp(req);
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
    }
    return { allowed: true, remaining: max - 1, retryAfter: 0 };
  }

  entry.count += 1;
  const allowed = entry.count <= max;
  return {
    allowed,
    remaining: Math.max(0, max - entry.count),
    retryAfter: Math.ceil((entry.resetAt - now) / 1000),
  };
}
