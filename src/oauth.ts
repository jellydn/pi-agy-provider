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
    const isVerified = await verifier.verify(agyToken);
    if (isVerified) {
      logger.debug("agy OAuth token verified, auto-login succeeded");
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
    logger.warn("API key looks unusually short", { length: apiKey.length });
  }

  return credentialsFromApiKey(apiKey);
}

/**
 * Refresh Google Gemini credentials.
 *
 * agy OAuth tokens are short-lived (~1 hour) and cannot be refreshed
 * without re-running `agy`. Static API keys from Google AI Studio
 * effectively never expire (10-year lifetime).
 *
 * When credentials are expired, this throws so pi triggers `/login`
 * automatically. Returning the expired credentials would cause pi to
 * keep using them and fail silently on every request.
 *
 * For long-running sessions, use a static API key from
 * aistudio.google.com/apikey instead of agy OAuth tokens.
 */
export async function refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
  if (credentials.expires <= Date.now()) {
    throw new Error(
      "Gemini credentials have expired. Run `pi /login` to re-authenticate. " +
        "Tip: use a static API key from aistudio.google.com/apikey for long-running sessions.",
    );
  }
  return credentials;
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
