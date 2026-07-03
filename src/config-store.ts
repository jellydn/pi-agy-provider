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
import {
  createCredentialChain,
  agyFieldParser,
  nestedTokenParser,
  topLevelTokenParser,
  bareStringParser,
} from "./credential-parsers.js";
import { isRecord, stringValue } from "./utils.js";
import { ENV_API_KEY, ENV_API_KEY_ALT } from "./env.js";
import { logger } from "./logger.js";

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

      const extracted = extract(parsed, authPath);
      if (extracted !== undefined) return extracted;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("ENOENT") && !msg.includes("not found")) {
        logger.warn(`Failed to read auth file ${authPath}`, { error: msg });
      }
    }
  }
  return undefined;
}

// ─── Expiry Helper ──────────────────────────────────────────────────────────

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

// ─── Credential Parser Chain ────────────────────────────────────────────────

/**
 * The prioritized credential parser chain.
 *
 * Parsers are applied in priority order: agy field (pi auth.json),
 * nested token (agy antigravity-oauth-token), top-level access_token
 * (oauth_creds.json), bare string (legacy agy flat file).
 *
 * Expiry filtering is applied to each parser automatically — expired
 * tokens are skipped and the chain falls through to the next parser.
 */
const credentialChain = createCredentialChain([
  agyFieldParser,
  nestedTokenParser,
  topLevelTokenParser,
  bareStringParser,
]);

// ─── Keychain Token Resolution (macOS) ──────────────────────────────────

/** Timeout for keychain command in milliseconds. */
const KEYCHAIN_TIMEOUT_MS = 5_000;

/**
 * Result from a successful Keychain token resolution.
 * Includes the refresh_token so the caller can refresh the access token
 * when it expires.
 */
export interface KeychainToken {
  access: string;
  refresh: string;
}

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
 * The JSON contains `{token: {access_token, refresh_token, expiry, ...}}`.
 *
 * Returns both access and refresh tokens. The refresh token is used by
 * `refreshToken()` to obtain a new access token when the current one
 * expires.
 *
 * Options are injectable for testability — pass `readKeychainPassword` to
 * mock the keychain read without shelling out to security(1).
 *
 * Returns undefined on any error — this is best-effort and the caller
 * falls through to file-based resolution.
 */
export function resolveKeychainToken(options: KeychainOptions = {}): KeychainToken | undefined {
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
    const refreshToken = stringValue(token.refresh_token);
    if (!accessToken || isExpired(token.expiry)) return undefined;

    return {
      access: accessToken,
      refresh: refreshToken ?? accessToken,
    };
  } catch {
    logger.debug("Keychain token resolution failed — falling through to files");
    return undefined;
  }
}

// ─── agy OAuth Token Resolution ─────────────────────────────────────────

/**
 * Resolve a Gemini API token from agy CLI credentials.
 *
 * Checks sources in order:
 * 1. macOS Keychain — agy v1.0.15+ stores OAuth tokens here (with refresh_token)
 * 2. ~/.gemini/antigravity-cli/antigravity-oauth-token — legacy agy flat file
 * 3. ~/.gemini/oauth_creds.json — Gemini CLI OAuth credentials
 *
 * Returns both access and refresh tokens when found in the Keychain.
 * File-based sources only provide access_token (no refresh).
 *
 * Used by the login flow to automatically reuse existing agy CLI credentials.
 */
export function resolveAgyOAuthToken(
  options: AuthKeyOptions & { keychainToken?: string | null } = {},
): KeychainToken | undefined {
  // 1. macOS Keychain (agy v1.0.15+)
  //    keychainToken option: string = use it; null = skip; undefined = call resolveKeychainToken()
  const kcToken =
    "keychainToken" in options
      ? (options.keychainToken ?? undefined)
      : resolveKeychainToken(options.keychainOptions)?.access;
  if (kcToken) {
    logger.debug("Resolved credential from keychain");
    const fullToken =
      "keychainToken" in options
        ? ({ access: options.keychainToken!, refresh: options.keychainToken! } as KeychainToken)
        : resolveKeychainToken(options.keychainOptions);
    return fullToken;
  }

  // 2. File-based sources (legacy agy versions)
  const home = options.homeDir?.() ?? homedir();
  const fileToken = walkAuthPaths(
    { ...options, authPaths: defaultAuthPaths(home) },
    (parsed) => credentialChain.parse(parsed)?.token,
  );
  if (fileToken) {
    return { access: fileToken, refresh: fileToken };
  }

  return undefined;
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

  return walkAuthPaths(options, (parsed) => {
    const result = credentialChain.parse(parsed);
    return result?.token;
  });
}
