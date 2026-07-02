/**
 * Token verification with retry — separates the verification concern
 * from login orchestration in oauth.ts.
 *
 * Before: verifyToken() in oauth.ts had no retry. One transient network
 * failure dropped the entire agy OAuth path to manual API key paste.
 *
 * Now: TokenVerifier is a standalone module backed by the shared
 * retryFetch() utility.
 *
 * @module agy-oauth-verifier
 */

import { resolveApiBase } from "./env.js";
import { retryFetch, type RetryOptions } from "./retry.js";

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
  const retryOptions: RetryOptions = {
    fetch: options.fetch ?? globalThis.fetch,
    timeoutMs: options.timeoutMs ?? TOKEN_VERIFY_TIMEOUT_MS,
    maxRetries: options.retries ?? TOKEN_VERIFY_RETRIES,
    retryDelayMs: options.retryDelayMs ?? TOKEN_VERIFY_RETRY_DELAY_MS,
  };

  return {
    async verify(token: string): Promise<boolean> {
      const response = await retryFetch(`${apiBase}/models`, {
        fetch: retryOptions.fetch,
        timeoutMs: retryOptions.timeoutMs,
        maxRetries: retryOptions.maxRetries,
        retryDelayMs: retryOptions.retryDelayMs,
        init: { headers: { Authorization: `Bearer ${token}` } },
      });
      return response?.ok ?? false;
    },
  };
}

/** Default verifier — eager-initialized singleton shared across the module. */
export const defaultVerifier: TokenVerifier = createTokenVerifier();
