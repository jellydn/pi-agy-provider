/**
 * agy / Google Gemini configuration store traversal helpers.
 *
 * Owns the shared boilerplate for navigating and parsing credential stores
 * from the agy CLI (~/.gemini/) and pi (~/.pi/agent/auth.json): file path
 * resolution, JSON parsing with ENOENT suppression, and credential iteration.
 *
 * @module agy-config-store
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { isRecord, stringValue } from "./utils.js";

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

// ─── agy Credential Extraction ─────────────────────────────────────────────

/**
 * Extract an OAuth access token from agy's credential stores.
 *
 * Checks these locations in order:
 * 1. ~/.gemini/antigravity-cli/antigravity-oauth-token — may be a bare
 *    string (just the token) or a JSON object with fields.
 * 2. ~/.gemini/oauth_creds.json — JSON with `access_token` field.
 *
 * @returns The access token string, or undefined if not found.
 */
export function resolveAgyOAuthToken(options: AuthKeyOptions = {}): string | undefined {
  return walkAuthPaths(options, (parsed) => {
    // Bare string token (antigravity-oauth-token file)
    if (typeof parsed === "string" && parsed.length > 0) return parsed;

    // JSON object with access_token field (oauth_creds.json)
    if (isRecord(parsed)) {
      const token = stringValue(parsed.access_token);
      if (token) return token;

      // Also check pi auth.json format: {agy: {access: "..."}}
      const agyField = parsed.agy;
      if (typeof agyField === "string") return agyField;
      if (isRecord(agyField)) {
        const access = stringValue(agyField.access);
        if (access) return access;
      }
    }

    return undefined;
  });
}
