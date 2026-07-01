/**
 * Google Gemini error classification — maps provider error messages to
 * user-friendly, actionable messages.
 *
 * @module agy-errors
 */

/** Error types returned by the Gemini API. */
export type GeminiErrorType = "invalid_key" | "rate_limited" | "quota_exceeded" | "unknown";

/**
 * Check if a lowercased string matches any of the given patterns.
 */
function matchesAny(text: string, patterns: string[]): boolean {
  return patterns.some((p) => text.includes(p));
}

/**
 * User-friendly error messages for Gemini-specific failures.
 */
export const GEMINI_ERROR_MESSAGES: Record<GeminiErrorType, string> = {
  invalid_key:
    "Gemini API key is invalid or expired. Run `pi /login` and select Google Gemini (agy) to re-authenticate, or set GEMINI_API_KEY env var with a valid key from aistudio.google.com/apikey.",
  rate_limited:
    "Gemini rate limit reached. Wait a moment and try again, or check your quota at ai.google.dev/gemini-api/docs/rate-limits.",
  quota_exceeded:
    "Gemini API quota exceeded. Check your usage at ai.google.dev or upgrade your plan. You may also run `agy` to use your Google account's quota.",
  unknown:
    "Gemini request failed. Check your API key at aistudio.google.com/apikey or run `pi /login` to re-authenticate.",
};

/**
 * Classify a Gemini API error message into a specific error type.
 */
export function classifyGeminiError(errorMessage: string): {
  type: GeminiErrorType;
  message: string;
} {
  const lower = errorMessage.toLowerCase();

  if (
    matchesAny(lower, [
      "401",
      "unauthorized",
      "invalid api key",
      "invalid_api_key",
      "api key not valid",
    ])
  ) {
    return { type: "invalid_key", message: GEMINI_ERROR_MESSAGES.invalid_key };
  }

  if (matchesAny(lower, ["429", "rate limit", "too many requests", "rate_limit"])) {
    return { type: "rate_limited", message: GEMINI_ERROR_MESSAGES.rate_limited };
  }

  if (matchesAny(lower, ["403", "quota", "exceeded", "forbidden", "permission denied"])) {
    return { type: "quota_exceeded", message: GEMINI_ERROR_MESSAGES.quota_exceeded };
  }

  return { type: "unknown", message: GEMINI_ERROR_MESSAGES.unknown };
}
