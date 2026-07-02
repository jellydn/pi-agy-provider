/**
 * Credential format parsers — one adapter per token format, composed
 * into a prioritized chain. Each parser owns exactly one format and
 * returns a structured result with optional expiry.
 *
 * The previous `extractCredential()` interleaved 4 format branches inside
 * one function. Now each format is a self-contained parser behind a shared
 * interface. The chain dispatches on input type (string vs object) and
 * applies expiry filtering as middleware.
 *
 * @module agy-credential-parsers
 */

import { isRecord, stringValue, numberValue } from "./utils.js";

// ─── Parser Interface ───────────────────────────────────────────────────────

/**
 * Result from a successful credential extraction.
 *
 * `expires` is optional — bare-string tokens (antigravity-oauth-token)
 * have no embedded expiry and the caller supplies a default lifetime.
 */
export interface CredentialResult {
  token: string;
  /**
   * Expiry as a Unix timestamp in milliseconds (e.g. Date.now()).
   * Absent for bare-string tokens where lifetime is set by the caller.
   */
  expires?: number;
}

/**
 * A single-format credential parser.
 *
 * Each parser handles exactly one token format from one credential source.
 * Parsers are composable — `createCredentialChain()` chains them in priority
 * order, returning the first non-undefined result.
 */
export interface CredentialParser {
  /** Human-readable label for debug logging (e.g. "agy.access", "access_token"). */
  readonly format: string;
  /**
   * Attempt to extract a credential from the parsed input.
   * Returns undefined if this parser doesn't recognize the format —
   * the chain moves to the next parser.
   */
  parse(input: Record<string, unknown> | string): CredentialResult | undefined;
}

// ─── Expiry Middleware ───────────────────────────────────────────────────────

/**
 * Wrap a parser with expiry filtering. Expired tokens are discarded
 * (return undefined) so the chain falls through to the next parser.
 *
 * Parsers that have no expiry concept (bare-string tokens) are not
 * affected — they return `undefined` for `expires`, which passes the
 * filter.
 */
export function withExpiryFilter(parser: CredentialParser): CredentialParser {
  return {
    format: parser.format,
    parse(input) {
      const result = parser.parse(input);
      if (!result) return undefined;
      if (result.expires !== undefined && result.expires <= Date.now()) return undefined;
      return result;
    },
  };
}

// ─── Format Parsers ─────────────────────────────────────────────────────────

/**
 * Bare string token parser — handles the agy CLI
 * `~/.gemini/antigravity-cli/antigravity-oauth-token` format where the
 * entire file is a raw OAuth token with no expiry.
 */
export const bareStringParser: CredentialParser = {
  format: "bare-string",
  parse(input) {
    if (typeof input === "string" && input.length > 0) {
      return { token: input };
    }
    return undefined;
  },
};

/**
 * Top-level `access_token` field parser — handles
 * `~/.gemini/oauth_creds.json` format: `{ access_token: "...", expiry_date: ... }`.
 */
export const topLevelTokenParser: CredentialParser = {
  format: "access_token",
  parse(input) {
    if (!isRecord(input)) return undefined;
    const token = stringValue(input.access_token);
    if (!token) return undefined;
    const expires = numberValue(input.expiry_date);
    return { token, expires };
  },
};

/**
 * Nested `token.access_token` field parser — handles the agy
 * `antigravity-oauth-token` JSON format: `{ token: { access_token: ..., expiry: ... } }`.
 */
export const nestedTokenParser: CredentialParser = {
  format: "token.access_token",
  parse(input) {
    if (!isRecord(input)) return undefined;
    const tokenObj = input.token;
    if (!isRecord(tokenObj)) return undefined;
    const token = stringValue(tokenObj.access_token);
    if (!token) return undefined;
    // token.expiry is an ISO 8601 string. numberValue() only returns
    // numbers, so we handle string expiry separately.
    const expires = parseExpiry(tokenObj.expiry);
    return { token, expires };
  },
};

/**
 * agy field parser — handles pi's auth.json format:
 * `{ agy: "token" }` or `{ agy: { access: "token", expires: ... } }`.
 */
export const agyFieldParser: CredentialParser = {
  format: "agy.access",
  parse(input) {
    if (!isRecord(input)) return undefined;
    const agyField = input.agy;
    // agy: "token-string"
    if (typeof agyField === "string" && agyField.length > 0) {
      return { token: agyField };
    }
    // agy: { access: "token", expires: ... }
    if (isRecord(agyField)) {
      const token = stringValue(agyField.access);
      if (!token) return undefined;
      const expires = parseExpiry(agyField.expires);
      return { token, expires };
    }
    return undefined;
  },
};

// ─── Chain Composition ──────────────────────────────────────────────────────

/**
 * Parse an expiry value from a known field.
 *
 * Accepts ISO 8601 strings (agy `token.expiry`) or Unix timestamps in
 * milliseconds (oauth_creds.json `expiry_date`). Returns undefined for
 * missing or malformed values — callers treat missing expiry as
 * "never expires" (filter passes).
 */
function parseExpiry(val: unknown): number | undefined {
  if (typeof val === "number" && !Number.isNaN(val)) return val;
  if (typeof val === "string") {
    const parsed = Date.parse(val);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return undefined;
}

/**
 * Create a prioritized chain of credential parsers.
 *
 * Each parser is applied in order, first non-undefined result wins.
 * Expiry filtering is applied to each parser automatically via
 * `withExpiryFilter`. Parsers that don't set `expires` (bare-string)
 * are passed through unaffected.
 *
 * @example
 * const chain = createCredentialChain([
 *   agyFieldParser,
 *   nestedTokenParser,
 *   topLevelTokenParser,
 *   bareStringParser,
 * ]);
 * const result = chain.parse(input);
 */
export function createCredentialChain(parsers: readonly CredentialParser[]): CredentialParser {
  const filtered = parsers.map((p) => withExpiryFilter(p));
  return {
    format: `chain(${filtered.map((p) => p.format).join(", ")})`,
    parse(input) {
      for (const parser of filtered) {
        const result = parser.parse(input);
        if (result) return result;
      }
      return undefined;
    },
  };
}
