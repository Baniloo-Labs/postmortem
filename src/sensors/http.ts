// Shared HTTP client for API-polling sensors (Vercel, GitHub Actions, …).
// A `got` instance with retry/backoff and a request timeout so a flaky or
// rate-limited API degrades gracefully instead of hammering or hanging.

import got, { type Got } from "got";

export const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Build a got client with sane polling defaults. `throwHttpErrors: false` so the
 * caller inspects `statusCode` itself (needed for 304 conditional requests and to
 * surface API errors as sensor-unhealthy rather than thrown exceptions).
 */
export function apiClient(token?: string): Got {
  return got.extend({
    retry: { limit: 2, methods: ["GET"] },
    timeout: { request: REQUEST_TIMEOUT_MS },
    throwHttpErrors: false,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}
