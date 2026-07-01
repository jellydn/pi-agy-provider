/**
 * agy / Google Gemini credential medium — file traversal, OAuth extraction,
 * and full API key resolution chain.
 *
 * Owns all credential resolution: navigating and parsing credential stores
 * from the agy CLI (~/.gemini/) and pi (~/.pi/agent/auth.json), extracting
 * OAuth tokens, and resolving API keys from env vars.
 *
 * @module agy-config-store
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { isRecord, stringValue } from "./utils.js";
import { ENV_API_KEY, ENV_API_KEY_ALT } from "./env.js";

// ─── Options ────────────────────────────────────────────────────────────────

/**
 * I/O options for store traversal functions. All fields are injectable for
 * testability, with sensible production defaults.
 */
export interface AuthKeyOptions {
  env?: Record<string, string | undefined>;
  authPaths?: readonly string[];
  homeDir?: () => string;
  readFile?: (path: string) => string;
  fileExists?: (path: string) => boolean;
}

// ─── Path Resolution ────────────────────────────────────────────────────────

/**
 * Default auth file paths checked in order.
 *
 * 1. ~/.gemini/antigravity-cli/antigravity-oauth-token — agy CLI OAuth token
 * 2. ~/.gemini/oauth_creds.json — Gemini CLI OAuth credentials
 * 3. ~/.pi/agent/auth.json — pi's OAuth credentials store
 */
export function defaultAuthPaths(home: string): string[] {
  return [
    join(home, ".gemini", "antigravity-cli", "antigravity-oauth-token"),
    join(home, ".gemini", "oauth_creds.json"),
    join(home, ".pi", "agent", "auth.json"),
  ];
}

// ─── File Walking ───────────────────────────────────────────────────────────

/**
 * Iterate auth file paths in order, parsing JSON from each and extracting
 * a value. Handles the shared boilerplate: resolving I/O options, iterating
 * paths, try/catch with ENOENT suppression, and warning on corrupt files.
 *
 * @param options Auth I/O options (injectable for testing)
 * @param extract Called with each successfully parsed JSON object (or raw
 *                string for non-JSON files); return undefined to skip to the
 *                next file, or a value to stop
 */
export function walkAuthPaths<T>(
  options: AuthKeyOptions,
  extract: (parsed: Record<string, unknown> | string, path: string) => T | undefined,
): T | undefined {
  const home = options.homeDir?.() ?? homedir();
  const authPaths = options.authPaths ?? defaultAuthPaths(home);
  const readFile = options.readFile ?? ((p: string) => readFileSync(p, "utf-8"));
  const fileExists = options.fileExists ?? ((p: string) => existsSync(p));

  for (const authPath of authPaths) {
    try {
      if (!fileExists(authPath)) continue;
      const raw = readFile(authPath);

      // The agy OAuth token file may be a bare string (just the token),
      // not JSON. Try JSON first, fall back to raw string.
      let parsed: Record<string, unknown> | string;
      try {
        const json: unknown = JSON.parse(raw);
        parsed = isRecord(json) ? json : typeof json === "string" ? json : raw.trim();
      } catch {
        parsed = raw.trim();
      }

      const result = extract(parsed, authPath);
      if (result !== undefined) return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("ENOENT") && !msg.includes("not found")) {
        console.warn(`[agy] Warning: failed to read auth file ${authPath}: ${msg}`);
      }
    }
  }
  return undefined;
}

// ─── Expiry Helpers ──────────────────────────────────────────────────────────

/**
 * Check whether a credential is expired.
 *
 * Accepts ISO 8601 strings (agy antigravity-oauth-token: `token.expiry`)
 * or Unix timestamps in milliseconds (oauth_creds.json: `expiry_date`).
 * Missing or malformed values are treated as not-expired — we err on the
 * side of letting the API reject the token rather than falsely discarding it.
 */
function isExpired(expiryTime: unknown): boolean {
  if (typeof expiryTime === "number") {
    return !Number.isNaN(expiryTime) && expiryTime <= Date.now();
  }
  if (typeof expiryTime === "string") {
    const parsed = Date.parse(expiryTime);
    return !Number.isNaN(parsed) && parsed <= Date.now();
  }
  return false;
}

// ─── Credential Extraction ──────────────────────────────────────────────────

/**
 * Extract a credential token from a parsed auth file.
 * Handles all known token formats: bare string tokens, JSON with
 * access_token, nested {token: {access_token}}, and
 * {agy: string | {access: string}}.
 *
 * Expired tokens are skipped — the walk continues to the next file.
 *
 * Does NOT handle the `apiKey` field — callers that need apiKey
 * extraction should check it before delegating to this function.
 */
function extractCredential(parsed: Record<string, unknown> | string): string | undefined {
  // Bare string token (antigravity-oauth-token file)
  if (typeof parsed === "string" && parsed.length > 0) return parsed;

  if (!isRecord(parsed)) return undefined;

  // oauth_creds.json: top-level access_token — missing/malformed expiry_date → accept token
  const topToken = stringValue(parsed.access_token);
  if (topToken && !isExpired(parsed.expiry_date)) return topToken;

  // agy antigravity-oauth-token format — missing/malformed token.expiry → accept token
  if (isRecord(parsed.token)) {
    const nestedToken = stringValue(parsed.token.access_token);
    if (nestedToken && !isExpired(parsed.token.expiry)) return nestedToken;
  }

  // pi auth.json / agy format: {agy: "..."} or {agy: {access: "..."}}
  const agyField = parsed.agy;
  if (typeof agyField === "string") return agyField;
  if (isRecord(agyField)) {
    const access = stringValue(agyField.access);
    if (access && !isExpired(agyField.expires)) return access;
  }

  return undefined;
}

// ─── agy OAuth Token ────────────────────────────────────────────────────────

/**
 * Extract an OAuth access token from agy's credential stores.
 *
 * Only walks agy CLI files (~/.gemini/). auth.json is intentionally
 * excluded — the login flow should discover tokens from agy sources,
 * not from pi's own previously-saved credentials (which creates an
 * infinite loop where stale login-saved tokens shadow fresh agy ones).
 *
 * Checks these locations in order:
 * 1. ~/.gemini/antigravity-cli/antigravity-oauth-token — may be a bare
 *    string (just the token) or a nested JSON object.
 * 2. ~/.gemini/oauth_creds.json — JSON with `access_token` field.
 *
 * @returns The access token string, or undefined if not found.
 */
export function resolveAgyOAuthToken(options: AuthKeyOptions = {}): string | undefined {
  const home = options.homeDir?.() ?? homedir();
  const agyPaths = [
    join(home, ".gemini", "antigravity-cli", "antigravity-oauth-token"),
    join(home, ".gemini", "oauth_creds.json"),
  ];
  return walkAuthPaths({ ...options, authPaths: agyPaths }, (parsed) => extractCredential(parsed));
}

// ─── API Key Resolution ──────────────────────────────────────────────────

/**
 * Resolve the Gemini API key or OAuth token from all available sources.
 * Walks credential files exactly once — no duplicate file I/O.
 *
 * Priority: provided key → GEMINI_API_KEY env var → GOOGLE_API_KEY env var
 *           → file-based credentials (apiKey, access_token, agy OAuth, agy.access)
 *
 * Auth sources checked:
 * - GEMINI_API_KEY / GOOGLE_API_KEY env vars
 * - ~/.gemini/antigravity-cli/antigravity-oauth-token (agy CLI OAuth)
 * - ~/.gemini/oauth_creds.json (Gemini CLI OAuth, has access_token field)
 * - ~/.pi/agent/auth.json (pi OAuth format: {apiKey: "..."}, {agy: "..."}, or {agy: {access: "..."}})
 */
export function resolveApiKey(
  providedKey?: string,
  options: AuthKeyOptions = {},
): string | undefined {
  if (providedKey) return providedKey;

  const env = options.env ?? process.env;
  if (env[ENV_API_KEY]) return env[ENV_API_KEY];
  if (env[ENV_API_KEY_ALT]) return env[ENV_API_KEY_ALT];

  // Single file walk — checks apiKey first, then delegates to extractCredential
  return walkAuthPaths(options, (parsed) => {
    if (isRecord(parsed)) {
      const apiKey = stringValue(parsed.apiKey);
      if (apiKey) return apiKey;
    }
    return extractCredential(parsed);
  });
}
