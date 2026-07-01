/**
 * Google Gemini Provider for pi (via agy / Antigravity CLI)
 *
 * Adds Google's Gemini models as a pi provider, giving access to
 * Gemini 3.5 Flash and Gemini 3.1 Pro through Google's OpenAI-compatible
 * API endpoint.
 *
 * This provider reuses credentials from the agy CLI (Antigravity CLI) when
 * available, falling back to GEMINI_API_KEY env var or manual paste via
 * `pi /login`.
 *
 * Setup:
 *   1. Get a Gemini API key at https://aistudio.google.com/apikey
 *   2. Set GEMINI_API_KEY env var, run `pi /login` and select Google Gemini (agy),
 *      or sign in with the agy CLI (`agy`) for automatic reuse
 *   3. Install: pi install git:github.com/jellydn/pi-agy-provider
 *   4. Use /model to select a Gemini model
 *
 * @module pi-agy-provider
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolveApiBase, PROVIDER_NAME, PROVIDER_DISPLAY_NAME, ENV_API_KEY } from "./env.js";
import { resolveApiKey } from "./config-store.js";
import { resolveModels } from "./models.js";
import { handleGeminiError } from "./error-handler.js";
import { getApiKey as oauthGetApiKey, login, refreshToken } from "./oauth.js";

// ─── Extension Entry Point ─────────────────────────────────────────────────

export default async function (pi: ExtensionAPI) {
  const apiBase = resolveApiBase();

  // Attempt dynamic model discovery from the Gemini API. Falls back to the
  // static MODELS array on any error (network failure, 404, parse error).
  const apiKey = resolveApiKey();
  const models = await resolveModels(apiKey, { apiBase });

  pi.registerProvider(PROVIDER_NAME, {
    name: PROVIDER_DISPLAY_NAME,
    baseUrl: apiBase,
    apiKey: `$${ENV_API_KEY}`,
    authHeader: true,
    // Google's OpenAI-compatible endpoint uses standard OpenAI Chat
    // Completions format, so pi's built-in openai-completions streaming
    // handles SSE + tool calls + usage.
    api: "openai-completions",
    oauth: {
      name: PROVIDER_DISPLAY_NAME,
      login,
      refreshToken,
      getApiKey: oauthGetApiKey,
    },
    models: models.map((model) => ({
      ...model,
      input: [...model.input],
    })),
  });

  // ─── Error Surface ─────────────────────────────────────────────────────
  //
  // Surface user-friendly error messages for Gemini API failures (invalid
  // key, rate limit, quota exceeded).
  pi.on("message_end", handleGeminiError);
}
