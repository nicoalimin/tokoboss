import { RateLimitedError } from './auth-errors';

/**
 * Sliding-window sign-in rate limiter (UTA-67 acceptance: failed sign-in
 * is rate-limited). Process-local; keyed by `email|ip` so one attacker's
 * failures never lock out an unrelated user on a shared IP — and one
 * user's typos never block another user.
 *
 * The limiter tracks *failures only*; successes reset the key. Routes map
 * `RateLimitedError` to 429 with a message that carries no identifier
 * state (no enumeration oracle: throttled unknown-email and throttled
 * wrong-password look identical).
 */
export class SignInRateLimiter {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly options: { maxFailures?: number; windowMs?: number } = {}
  ) {}

  get maxFailures(): number {
    return this.options.maxFailures ?? 5;
  }

  get windowMs(): number {
    return this.options.windowMs ?? 15 * 60 * 1000;
  }

  /** Throw `RateLimitedError` when the key exhausted its failure budget. */
  check(key: string, nowMs = Date.now()): void {
    this.prune(key, nowMs);
    if ((this.failures.get(key) ?? []).length >= this.maxFailures) {
      throw new RateLimitedError();
    }
  }

  recordFailure(key: string, nowMs = Date.now()): void {
    this.prune(key, nowMs);
    const list = this.failures.get(key) ?? [];
    list.push(nowMs);
    this.failures.set(key, list);
  }

  reset(key: string): void {
    this.failures.delete(key);
  }

  /** Test seam: number of tracked failures for a key. */
  count(key: string, nowMs = Date.now()): number {
    this.prune(key, nowMs);
    return (this.failures.get(key) ?? []).length;
  }

  private prune(key: string, nowMs: number): void {
    const cutoff = nowMs - this.windowMs;
    const list = this.failures.get(key);
    if (!list) return;
    const fresh = list.filter((t) => t > cutoff);
    if (fresh.length === 0) this.failures.delete(key);
    else this.failures.set(key, fresh);
  }
}

/** Build the limiter key from the normalized email + caller ip. */
export function rateLimitKey(
  normalizedEmail: string,
  ip: string | undefined
): string {
  return `${normalizedEmail}|${(ip ?? 'unknown').trim().toLowerCase() || 'unknown'}`;
}
