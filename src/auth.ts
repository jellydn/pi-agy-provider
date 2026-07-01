/**
 * Google Gemini API key resolution — testable without pi runtime.
 *
 * @module agy-auth
 */

import { isRecord, stringValue } from "./utils.js";
import { ENV_API_KEY, ENV_API_KEY_ALT } from "./env.js";
import { walkAuthPaths, resolveAgyOAuthToken, type AuthKeyOptions } from "./config-store.js";

/**
 * Resolve the Gemini API key or OAuth token.
 * Priority: provided key → GEMINI_API_KEY env var → GOOGLE_API_KEY env var
 *           → agy OAuth token → pi auth.json
 *
 * Auth sources checked:
 * - GEMINI_API_KEY / GOOGLE_API_KEY env vars
 * - ~/.gemini/antigravity-cli/antigravity-oauth-token (agy CLI OAuth)
 * - ~/.gemini/oauth_creds.json (Gemini CLI OAuth, has access_token field)
 * - ~/.pi/agent/auth.json (pi OAuth format: {agy: "..."} or {agy: {access: "..."}})
 */
export function resolveApiKey(
  providedKey?: string,
  options: AuthKeyOptions = {},
): string | undefined {
  if (providedKey) return providedKey;

  const env = options.env ?? process.env;
  if (env[ENV_API_KEY]) return env[ENV_API_KEY];
  if (env[ENV_API_KEY_ALT]) return env[ENV_API_KEY_ALT];

  // Try agy OAuth token from ~/.gemini/ files
  const agyToken = resolveAgyOAuthToken(options);
  if (agyToken) return agyToken;

  // Try pi auth.json format
  return walkAuthPaths(options, (parsed) => {
    if (!isRecord(parsed)) return undefined;

    // pi auth.json format: direct apiKey field
    const apiKey = stringValue(parsed.apiKey);
    if (apiKey) return apiKey;

    // pi auth.json format: agy field (string or OAuth object)
    const agyField = parsed.agy;
    if (typeof agyField === "string") return agyField;
    if (isRecord(agyField)) {
      const access = stringValue(agyField.access);
      if (access) return access;
    }

    return undefined;
  });
}
