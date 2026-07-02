/**
 * Google Gemini login provider for pi's /login flow.
 *
 * agy OAuth tokens (from the Antigravity CLI) do not work with the Google
 * Gemini API endpoint — they are only valid for Google's Antigravity IDE.
 * The login flow always prompts for a Gemini API key from Google AI Studio
 * (aistudio.google.com/apikey).
 *
 * As a convenience, users can also set the GEMINI_API_KEY env var to
 * skip the login flow entirely.
 */

import type { OAuthCredentials, OAuthLoginCallbacks } from "@earendil-works/pi-ai";
import { sanitizeApiKey, API_KEY_URL } from "./env.js";

/** Lifetime for static API key credentials (10 years — effectively permanent). */
const API_KEY_LIFETIME_MS = 10 * 365 * 24 * 60 * 60 * 1000;

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
 * Opens Google AI Studio so the user can create an API key, then prompts
 * them to paste it back.
 */
export async function login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
  callbacks.onAuth({ url: API_KEY_URL });

  const apiKey = sanitizeApiKey(
    await callbacks.onPrompt({
      message: "Paste your Gemini API key (create one at Google AI Studio that just opened):",
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
 * For static API keys, this is a no-op (keys don't expire).
 */
export async function refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
  if (credentials.expires <= Date.now()) {
    console.warn(
      "[agy] Credentials have expired. Run `pi /login` to paste a new API key from aistudio.google.com/apikey.",
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
