/**
 * Google Gemini login provider for pi's /login flow.
 *
 * Two credential paths are supported:
 * 1. agy CLI OAuth tokens — automatically detected and verified against the
 *    Gemini API. These are short-lived (~1 hour) but allow instant login
 *    if the user has agy installed and authenticated.
 * 2. Static API keys from Google AI Studio — the fallback when no agy
 *    token is found or verification fails.
 *
 * Users can also set the GEMINI_API_KEY env var to skip the login flow.
 */

import type { OAuthCredentials, OAuthLoginCallbacks } from "@earendil-works/pi-ai";
import { resolveAgyOAuthToken } from "./config-store.js";
import { sanitizeApiKey, API_KEY_URL, resolveApiBase } from "./env.js";

/** Lifetime for static API key credentials (10 years — effectively permanent). */
const API_KEY_LIFETIME_MS = 10 * 365 * 24 * 60 * 60 * 1000;

/**
 * Lifetime assigned to agy OAuth tokens (55 minutes — safety buffer
 * under the typical ~1 hour Google OAuth expiry).
 */
const AGY_OAUTH_LIFETIME_MS = 55 * 60 * 1000;

/** Timeout for token verification API calls (5 seconds). */
const TOKEN_VERIFY_TIMEOUT_MS = 5_000;

// ─── Static API key helpers ──────────────────────────────────────────────────

function credentialsFromApiKey(apiKey: string): OAuthCredentials {
  return {
    refresh: apiKey,
    access: apiKey,
    expires: Date.now() + API_KEY_LIFETIME_MS,
  };
}

// ─── Token verification ──────────────────────────────────────────────────────

/**
 * Verify that an OAuth token is accepted by the Gemini API.
 *
 * Makes a quick GET to the /models endpoint with Bearer auth. Returns
 * true if the API accepts the token (HTTP 2xx), false otherwise.
 */
async function verifyToken(token: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOKEN_VERIFY_TIMEOUT_MS);

  try {
    const response = await fetch(`${resolveApiBase()}/models`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Login flow ─────────────────────────────────────────────────────────────

/**
 * Start the Google Gemini login flow.
 *
 * First tries to reuse an existing agy CLI OAuth token. If found and
 * verified against the Gemini API, returns it immediately (no user
 * interaction needed). Otherwise falls back to the manual API key flow:
 * opens Google AI Studio and prompts the user to paste a key.
 */
export async function login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
  // 1. Try to reuse agy CLI OAuth credentials
  const agyToken = resolveAgyOAuthToken();
  if (agyToken) {
    const isVerified = await verifyToken(agyToken);
    if (isVerified) {
      return {
        access: agyToken,
        refresh: agyToken,
        expires: Date.now() + AGY_OAUTH_LIFETIME_MS,
      };
    }
  }

  // 2. Fall back to manual API key paste
  callbacks.onAuth({ url: API_KEY_URL });

  const apiKey = sanitizeApiKey(
    await callbacks.onPrompt({
      message:
        "No agy CLI login detected. " +
        "Paste your Gemini API key (create one at Google AI Studio that just opened, " +
        "or run `agy` first to use your Google login):",
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
 * For agy OAuth tokens and static API keys alike, this is a no-op —
 * agy tokens cannot be refreshed without re-running `agy`, and API
 * keys don't expire. Run `pi /login` to re-authenticate if needed.
 */
export async function refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
  if (credentials.expires <= Date.now()) {
    console.warn(
      "[agy] Credentials have expired. Run `pi /login` to re-authenticate or paste a new API key.",
    );
  }
  return credentials;
}

/**
 * Returns the access token (API key) from credentials.
 */
export function getApiKey(credentials: OAuthCredentials): string {
  return credentials.access;
}
