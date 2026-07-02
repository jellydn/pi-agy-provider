/**
 * Shared retry utility used by model-discovery and oauth-verifier.
 *
 * Both modules had near-identical retry loops: AbortController, setTimeout,
 * transient-error checks, exponential backoff. This consolidates them
 * behind a single `retryFetch()` helper.
 *
 * @module agy-retry
 */

// ─── Retry Options ──────────────────────────────────────────────────────────

/** Options for retryFetch, injectable for testing. */
export interface RetryOptions {
  /** Fetch function (injectable for testing). */
  fetch: typeof globalThis.fetch;
  /** Timeout per attempt in milliseconds. */
  timeoutMs: number;
  /** Maximum retry count (0 = no retry, just the initial attempt). */
  maxRetries: number;
  /** Base delay between retries in ms. Doubles per attempt. */
  retryDelayMs: number;
  /** Additional fetch options merged into each attempt (e.g. headers). */
  init?: RequestInit;
}

// ─── Error Classification ───────────────────────────────────────────────────

/** Check if an error is a transient network failure worth retrying. */
export function isTransientError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof DOMException) return err.name === "AbortError";
  return false;
}

/** Check if an HTTP status code is a transient server error worth retrying. */
export function isTransientHttpStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

// ─── Retry Fetch ────────────────────────────────────────────────────────────

/**
 * Fetch a URL with automatic retry for transient network errors and
 * transient HTTP server errors, using exponential backoff.
 *
 * Returns the Response on success (including non-2xx responses that are
 * not transient — the caller decides how to handle them).
 *
 * @param url The URL to fetch.
 * @param options Fetch and retry configuration.
 * @returns The Response on success, or undefined if all attempts fail.
 */
export async function retryFetch(
  url: string,
  options: RetryOptions,
): Promise<Response | undefined> {
  const { fetch, timeoutMs, maxRetries, retryDelayMs, init } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);

      if (isTransientHttpStatus(response.status) && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, retryDelayMs * 2 ** attempt));
        continue;
      }
      return response;
    } catch (err) {
      clearTimeout(timer);

      if (isTransientError(err) && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, retryDelayMs * 2 ** attempt));
        continue;
      }
      return undefined;
    }
  }

  return undefined;
}
