/**
 * In-memory rate limiter for per-user request throttling.
 * Max 20 requests per user per 60-second fixed window.
 */

const MAX_REQUESTS = 20;
const WINDOW_MS = 60_000; // 60 seconds
const CLEANUP_INTERVAL_MS = 5 * 60_000; // clean up every 5 minutes

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

// Periodically remove expired entries to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
}, CLEANUP_INTERVAL_MS).unref();

/**
 * Check whether a request from the given hashed user ID is allowed.
 * @returns true if the request is allowed, false if the user is rate-limited.
 */
export function checkRateLimit(hashedUserId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(hashedUserId);

  if (!entry || now > entry.resetAt) {
    // No entry yet, or the window has expired — start a fresh window
    rateLimitMap.set(hashedUserId, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (entry.count >= MAX_REQUESTS) {
    return false;
  }

  entry.count += 1;
  return true;
}
