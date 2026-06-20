// In-memory fixed-window limiter (SR-1). Scoped to a single Next.js server
// process -- correct for local dev / single-instance deployment; a multi-
// instance production deployment would need a shared store (e.g. Redis).
// That's a real gap, not a YAGNI call, but out of scope for this phase.

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
}

export function checkRateLimit(
  identity: string,
  action: string,
  options: RateLimitOptions
): RateLimitResult {
  const key = `${identity}:${action}`;
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now - existing.windowStart >= options.windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (existing.count >= options.limit) {
    return { allowed: false };
  }

  existing.count += 1;
  return { allowed: true };
}
