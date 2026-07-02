/**
 * agy / Google Gemini credential medium — file traversal, OAuth extraction,
 * and full API key resolution chain.
 *
 * Owns all credential resolution: navigating and parsing credential stores
 * from the agy CLI (~/.gemini/ files and macOS Keychain), extracting
 * OAuth tokens, and resolving API keys from env vars.
 *
 * @module agy-config-store
 */

import { execSync } from "node:child_process";
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
  /**
   * Pre-resolved keychain token for testability.
   * - string: use as the resolved keychain token.
   * - null: skip the keychain check entirely (test isolation on macOS).
   * - undefined / not set: call resolveKeychainToken() (default production behaviour).
   */
  keychainToken?: string | null;
  /** Options forwarded to resolveKeychainToken() when keychainToken is not set. */
  keychainOptions?: KeychainOptions;
}

// ─── Path Resolution ────────────────────────────────────────────────────────

/**
 * Default auth file paths checked in order.
 *
 * Only agy-native credential files — the macOS Keychain is the primary
 * source (checked separately via resolveKeychainToken()).
 *
 * 1. ~/.gemini/antigravity-cli/antigravity-oauth-token — agy CLI OAuth token
 * 2. ~/.gemini/oauth_creds.json — Gemini CLI OAuth credentials
 */
export function defaultAuthPaths(home: string): string[] {
  return [
    join(home, ".gemini", "antigravity-cli", "antigravity-oauth-token"),
    join(home, ".gemini", "oauth_creds.json"),
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

  // agy format: {agy: "..."} or {agy: {access: "..."}}
  const agyField = parsed.agy;
  if (typeof agyField === "string") return agyField;
  if (isRecord(agyField)) {
    const access = stringValue(agyField.access);
    if (access && !isExpired(agyField.expires)) return access;
  }

  return undefined;
}

// ─── Keychain Token Resolution (macOS) ──────────────────────────────────

/** Timeout for keychain command in milliseconds. */
const KEYCHAIN_TIMEOUT_MS = 3_000;

/** Options for resolveKeychainToken(). */
export interface KeychainOptions {
  /**
   * Override for testing. Returns the raw password string from the macOS
   * Keychain (the `go-keyring-base64:<base64>` value), or throws on error.
   * Defaults to calling `security find-generic-password -s "gemini" -w`.
   */
  readKeychainPassword?: () => string;
  /** Override for testing. Defaults to `process.platform`. */
  platform?: string;
}

/** Default production implementation — shells out to the macOS security(1) CLI. */
function defaultReadKeychainPassword(): string {
  return execSync('security find-generic-password -s "gemini" -w', {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: KEYCHAIN_TIMEOUT_MS,
  }).trim();
}

/**
 * Resolve a Gemini OAuth token from the macOS Keychain.
 *
 * agy CLI v1.0.15+ stores credentials in the Keychain under the service
 * name "gemini", encoded as `go-keyring-base64:<base64-encoded JSON>`.
 * The JSON contains `{token: {access_token, expiry, ...}}`.
 *
 * Options are injectable for testability — pass `readKeychainPassword` to
 * mock the keychain read without shelling out to security(1).
 *
 * Returns undefined on any error — this is best-effort and the caller
 * falls through to file-based resolution.
 */
export function resolveKeychainToken(options: KeychainOptions = {}): string | undefined {
  const platform = options.platform ?? process.platform;
  if (platform !== "darwin") return undefined;

  const readPassword = options.readKeychainPassword ?? defaultReadKeychainPassword;

  try {
    const raw = readPassword();

    if (!raw || !raw.startsWith("go-keyring-base64:")) return undefined;

    const b64 = raw.slice("go-keyring-base64:".length);
    const json: unknown = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));

    if (!isRecord(json)) return undefined;
    const token = json.token;
    if (!isRecord(token)) return undefined;

    const accessToken = stringValue(token.access_token);
    if (!accessToken || isExpired(token.expiry)) return undefined;

    return accessToken;
  } catch {
    // Keychain unavailable, not logged in, or token expired —
    // silently fall through to file-based resolution.
    return undefined;
  }
}

// ─── agy OAuth Token Resolution ─────────────────────────────────────────

/**
 * Resolve a Gemini API token from agy CLI credentials.
 *
 * Checks sources in order:
 * 1. macOS Keychain — agy v1.0.15+ stores OAuth tokens here
 * 2. ~/.gemini/antigravity-cli/antigravity-oauth-token — legacy agy flat file
 * 3. ~/.gemini/oauth_creds.json — Gemini CLI OAuth credentials
 *
 * Used by the login flow to automatically reuse existing agy CLI credentials.
 */
export function resolveAgyOAuthToken(options: AuthKeyOptions = {}): string | undefined {
  // 1. macOS Keychain (agy v1.0.15+)
  //    keychainToken option: string = use it; null = skip; undefined = call resolveKeychainToken()
  const kcToken =
    "keychainToken" in options
      ? (options.keychainToken ?? undefined)
      : resolveKeychainToken(options.keychainOptions);
  if (kcToken) return kcToken;

  // 2. File-based sources (legacy agy versions)
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
 *           → file-based credentials (agy-native files)
 *
 * Auth sources checked:
 * - GEMINI_API_KEY / GOOGLE_API_KEY env vars
 * - ~/.gemini/antigravity-cli/antigravity-oauth-token (agy CLI OAuth)
 * - ~/.gemini/oauth_creds.json (Gemini CLI OAuth, has access_token field)
 */
export function resolveApiKey(
  providedKey?: string,
  options: AuthKeyOptions = {},
): string | undefined {
  if (providedKey) return providedKey;

  const env = options.env ?? process.env;
  if (env[ENV_API_KEY]) return env[ENV_API_KEY];
  if (env[ENV_API_KEY_ALT]) return env[ENV_API_KEY_ALT];

  return walkAuthPaths(options, (parsed) => extractCredential(parsed));
}
