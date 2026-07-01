/**
 * Google Gemini login provider for pi's /login flow.
 *
 * Supports two authentication methods:
 *
 * 1. **agy OAuth reuse (automatic)** — if the user is already signed in with
 *    the agy CLI (Antigravity CLI), agy stores an OAuth token at
 *    `~/.gemini/antigravity-cli/antigravity-oauth-token`. We reuse that token
 *    directly as a Bearer token for Google's OpenAI-compatible endpoint.
 *
 * 2. **Static API key (manual)** — long-lived API keys created from Google AI
 *    Studio (aistudio.google.com/apikey). The user pastes the key during
 *    `/login` and it never expires.
 */

import type { OAuthCredentials, OAuthLoginCallbacks } from "@earendil-works/pi-ai";
import { sanitizeApiKey, API_KEY_URL } from "./env.js";
import { resolveAgyOAuthToken } from "./config-store.js";

const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000; // API keys don't expire

// ─── Static API key helpers ──────────────────────────────────────────────────

function credentialsFromApiKey(apiKey: string): OAuthCredentials {
  return {
    refresh: apiKey,
    access: apiKey,
    expires: Date.now() + TEN_YEARS_MS,
  };
}

// ─── Login flow ─────────────────────────────────────────────────────────────

/**
 * Start the Google Gemini login flow.
 *
 * First checks for existing agy CLI OAuth credentials. If found, the user
 * is logged in automatically — no manual paste required.
 *
 * If no agy credentials are found, falls back to the manual paste flow:
 * opens Google AI Studio so the user can create an API key, then prompts
 * them to paste it back.
 */
export async function login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
  // Try to reuse existing agy CLI OAuth credentials
  const agyToken = resolveAgyOAuthToken();
  if (agyToken) {
    // agy OAuth tokens are short-lived access tokens. We use them directly
    // as the Bearer token. The refresh token is the same token (we can't
    // refresh agy OAuth tokens — the user would need to re-run `agy` login).
    // Treat as expiring in ~1 hour, same as agy's token lifetime.
    return {
      access: agyToken,
      refresh: agyToken,
      expires: Date.now() + 55 * 60 * 1000,
    };
  }

  // Fall back to manual API key paste
  callbacks.onAuth({ url: API_KEY_URL });

  const apiKey = sanitizeApiKey(
    await callbacks.onPrompt({
      message:
        "No agy CLI login detected. Paste your Gemini API key " +
        "(create one at Google AI Studio that just opened, or run `agy` first " +
        "to use your Google login):",
    }),
  );

  if (!apiKey) throw new Error("No Gemini API key provided");

  // Gemini API keys are opaque strings, typically 30+ chars. Warn on
  // suspiciously short input.
  if (apiKey.length < 20) {
    console.warn(
      `[agy] Warning: API key looks unusually short (${apiKey.length} chars). ` +
        "Verify you copied the full key from aistudio.google.com/apikey.",
    );
  }

  return credentialsFromApiKey(apiKey);
}

/**
 * Refresh Google Gemini credentials.
 *
 * For agy OAuth tokens, this is a no-op (we can't refresh agy's OAuth token
 * without re-running the agy login flow). The token will expire and the user
 * will need to re-login via `pi /login`.
 *
 * For static API keys, this is a no-op (keys don't expire).
 */
export async function refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
  // Both agy OAuth tokens and static API keys are returned as-is.
  // agy OAuth tokens can't be refreshed without the agy CLI's own refresh
  // flow, which uses Google's OAuth2 token endpoint with a client ID we
  // don't have access to. The user should re-run `agy` or use a static key.
  if (credentials.expires <= Date.now()) {
    console.warn(
      "[agy] OAuth token has expired. Run `pi /login` to re-import your agy credentials, or use a static API key from aistudio.google.com/apikey.",
    );
  }
  return credentials;
}

/**
 * Returns the access token (API key or agy OAuth token) from credentials.
 */
export function getApiKey(credentials: OAuthCredentials): string {
  return credentials.access;
}
