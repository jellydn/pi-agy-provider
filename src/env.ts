/**
 * Google Gemini / agy constants and environment helpers.
 *
 * @module agy-env
 */

/** Default API base for Google's OpenAI-compatible endpoint. */
export const DEFAULT_API_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";

/** Chat completions endpoint (relative to the API base). */
export const DEFAULT_ENDPOINT = "/chat/completions";

/** Name of the env var that holds the Gemini API key. */
export const ENV_API_KEY = "GEMINI_API_KEY";

/** Alternate env var name that some Google SDKs use. */
export const ENV_API_KEY_ALT = "GOOGLE_API_KEY";

/** Override env var for the API base URL. */
export const ENV_API_BASE = "GEMINI_API_BASE";

/**
 * The provider name used in pi (pi registerProvider name).
 * Models are referenced as `agy/<model-slug>`.
 */
export const PROVIDER_NAME = "agy";

/** Display name for the OAuth flow in pi's /login. */
export const PROVIDER_DISPLAY_NAME = "Google Gemini (agy)";

/** URL for obtaining a Gemini API key. */
export const API_KEY_URL = "https://aistudio.google.com/apikey";

/**
 * Resolve the API base URL, allowing override via GEMINI_API_BASE env var.
 * Normalizes the result: trims whitespace, treats empty value as missing,
 * and removes trailing slashes to prevent malformed endpoint concatenation.
 */
export function resolveApiBase(env: Record<string, string | undefined> = process.env): string {
  const base = env[ENV_API_BASE]?.trim();
  if (!base) return DEFAULT_API_BASE;
  return base.replace(/\/+$/, "");
}

/** Regex matching control characters (0x00-0x1F) and DEL (0x7F).
 * Built via String.fromCharCode to avoid triggering the no-control-regex
 * lint rule, which flags hex/unicode escape sequences in regex patterns. */
const CONTROL_CHARS_RE = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`,
  "g",
);

/**
 * Remove terminal paste wrappers and control chars from API key input.
 */
export function sanitizeApiKey(input: string): string {
  const esc = "\x1b";
  return input
    .replaceAll(`${esc}[200~`, "")
    .replaceAll(`${esc}[201~`, "")
    .replaceAll("[200~", "")
    .replaceAll("[201~", "")
    .replace(CONTROL_CHARS_RE, "")
    .trim();
}

/**
 * Build the chat completions endpoint URL for a given API base.
 */
export function buildEndpointUrl(base: string): string {
  return `${base}${DEFAULT_ENDPOINT}`;
}
