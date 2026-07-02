/**
 * Token verification with retry — separates the verification concern
 * from login orchestration in oauth.ts.
 *
 * Before: verifyToken() in oauth.ts had no retry. One transient network
 * failure dropped the entire agy OAuth path to manual API key paste.
 *
 * Now: TokenVerifier is a standalone module with retry policy. Two
 * adapters confirm the seam is real — the HTTP verifier for production
 * and an injectable fetch for tests.
 *
 * @module agy-oauth-verifier
 */

import { resolveApiBase } from "./env.js";

// ─── TokenVerifier Interface ────────────────────────────────────────────────

/**
 * Verifies that a token is accepted by the Gemini API.
 *
 * The production adapter makes an HTTP request to the /models endpoint.
 * Tests inject a fetch mock to verify retry behaviour without network.
 */
export interface TokenVerifier {
  /** Returns true if the API accepts the token, false otherwise. */
  verify(token: string): Promise<boolean>;
}

// ─── Default Configuration ──────────────────────────────────────────────────

/** Timeout for token verification API calls (5 seconds). */
const TOKEN_VERIFY_TIMEOUT_MS = 5_000;

/** Number of retry attempts for transient failures. */
const TOKEN_VERIFY_RETRIES = 1;

/** Base delay between retry attempts in milliseconds. Doubles per attempt. */
const TOKEN_VERIFY_RETRY_DELAY_MS = 2_000;

// ─── Retry Helpers ──────────────────────────────────────────────────────────

/** Check if an error is a transient network failure worth retrying. */
function isTransientError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof DOMException) return err.name === "AbortError";
  return false;
}

// ─── Verifier Factory ───────────────────────────────────────────────────────

/** Options for createTokenVerifier, injectable for testing. */
export interface TokenVerifierOptions {
  apiBase?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

/**
 * Create a token verifier with built-in retry for transient network errors.
 *
 * Retries on DNS failures, connection refused, and timeout aborts.
 * Non-network errors (bad response, parse errors) are terminal —
 * the token is genuinely invalid, no point retrying.
 */
export function createTokenVerifier(options: TokenVerifierOptions = {}): TokenVerifier {
  const apiBase = options.apiBase ?? resolveApiBase();
  const fetchFn = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? TOKEN_VERIFY_TIMEOUT_MS;
  const maxRetries = options.retries ?? TOKEN_VERIFY_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? TOKEN_VERIFY_RETRY_DELAY_MS;

  return {
    async verify(token: string): Promise<boolean> {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const response = await fetchFn(`${apiBase}/models`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          });
          return response.ok;
        } catch (err) {
          if (isTransientError(err) && attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, retryDelayMs * 2 ** attempt));
            continue;
          }
          return false;
        } finally {
          clearTimeout(timer);
        }
      }

      return false;
    },
  };
}

/** Default verifier — eager-initialized singleton shared across the module. */
export const defaultVerifier: TokenVerifier = createTokenVerifier();
