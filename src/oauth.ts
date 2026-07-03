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
import { sanitizeApiKey, API_KEY_URL, ENV_API_KEY } from "./env.js";
import { defaultVerifier, type TokenVerifier } from "./oauth-verifier.js";
import { logger } from "./logger.js";
import { ANTIGRAVITY_CLIENT_ID, ANTIGRAVITY_CLIENT_SECRET } from "./oauth-credentials.js";

/** Lifetime for static API key credentials (10 years — effectively permanent). */
const API_KEY_LIFETIME_MS = 10 * 365 * 24 * 60 * 60 * 1000;

/**
 * Lifetime assigned to agy OAuth tokens (55 minutes — safety buffer
 * under the typical ~1 hour Google OAuth expiry).
 *
 * Used as the expires value when a non-expired agy token is verified
 * against the Gemini API. The actual token may expire earlier if the agy
 * CLI session ends; this is a best-estimate.
 */
const AGY_OAUTH_LIFETIME_MS = 55 * 60 * 1000;

// ─── Static API key helpers ──────────────────────────────────────────────────

function credentialsFromApiKey(apiKey: string): OAuthCredentials {
  return {
    refresh: apiKey,
    access: apiKey,
    expires: Date.now() + API_KEY_LIFETIME_MS,
  };
}

// ─── Login flow ─────────────────────────────────────────────────────────────

/**
 * Start the Google Gemini login flow.
 *
 * First tries to reuse an existing agy CLI OAuth token via the
 * TokenVerifier (with retry for transient network errors). If the
 * token is verified, returns it immediately. Otherwise falls back
 * to the manual API key flow.
 *
 * The verifier is injectable via the second parameter for testing.
 */
export async function login(
  callbacks: OAuthLoginCallbacks,
  verifier: TokenVerifier = defaultVerifier,
): Promise<OAuthCredentials> {
  // 1. Try to reuse agy CLI OAuth credentials
  const agyToken = resolveAgyOAuthToken();
  if (agyToken) {
    const isVerified = await verifier.verify(agyToken.access);
    if (isVerified) {
      logger.debug("agy OAuth token verified, auto-login succeeded");
      return {
        access: agyToken.access,
        refresh: agyToken.refresh,
        expires: Date.now() + AGY_OAUTH_LIFETIME_MS,
      };
    }

    // Access token failed verification — try refreshing if we have a real
    // refresh_token (Keychain tokens have one; file-based tokens set
    // refresh === access).
    if (agyToken.refresh !== agyToken.access) {
      logger.debug("agy access token expired, attempting refresh");
      try {
        const refreshed = await refreshToken({
          access: agyToken.access,
          refresh: agyToken.refresh,
          expires: 0, // force refresh
        });
        logger.debug("agy token refreshed during login");
        return refreshed;
      } catch {
        logger.debug("agy token refresh failed during login, falling back to manual");
      }
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
    logger.warn("API key looks unusually short", { length: apiKey.length });
  }

  return credentialsFromApiKey(apiKey);
}

/**
 * Refresh Google Gemini credentials.
 *
 * agy OAuth tokens are short-lived (~1 hour) but the agy CLI stores a
 * refresh_token in the macOS Keychain. When the access token expires,
 * this function exchanges the refresh_token for a new access token via
 * Google's OAuth token endpoint.
 *
 * Static API keys from Google AI Studio effectively never expire
 * (10-year lifetime) — they pass through unchanged.
 *
 * Throws if refresh fails (e.g. refresh_token revoked, network error).
 * pi catches the error and triggers `/login` automatically.
 */
export async function refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
  if (credentials.expires > Date.now()) return credentials;

  // Only attempt OAuth refresh if the refresh token differs from the access
  // token (static API keys set refresh === access; agy tokens have a real
  // refresh_token from the Keychain).
  if (credentials.refresh === credentials.access) {
    throw new Error(
      "Gemini credentials have expired and cannot be refreshed. " +
        "Run `pi /login` to re-authenticate. " +
        "Tip: use a static API key from aistudio.google.com/apikey for long-running sessions.",
    );
  }

  logger.debug("Refreshing agy OAuth token");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: ANTIGRAVITY_CLIENT_ID,
      client_secret: ANTIGRAVITY_CLIENT_SECRET,
      refresh_token: credentials.refresh,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text().catch(() => "unknown");
    logger.warn("Token refresh failed", { status: response.status, error });
    throw new Error("Gemini token refresh failed. Run `pi /login` to re-authenticate.");
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };

  return {
    access: data.access_token,
    // Google may rotate the refresh_token; use the new one if provided
    refresh: data.refresh_token ?? credentials.refresh,
    expires: Date.now() + data.expires_in * 1000 - 5 * 60 * 1000,
  };
}

/**
 * Returns the access token (API key) from credentials.
 * Also syncs process.env so pi's `$GEMINI_API_KEY` interpolation
 * picks up credential changes from `/login` without a restart.
 */
export function getApiKey(credentials: OAuthCredentials): string {
  process.env[ENV_API_KEY] = credentials.access;
  return credentials.access;
}
