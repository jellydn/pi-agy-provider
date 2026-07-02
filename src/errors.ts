/**
 * Google Gemini error classification — maps provider error messages to
 * user-friendly, actionable messages.
 *
 * @module agy-errors
 */

/** Error types returned by the Gemini API. */
export type GeminiErrorType = "invalid_key" | "rate_limited" | "quota_exceeded" | "unknown";

/** A single classification rule — ordered by priority, first match wins. */
export interface ClassificationRule {
  type: GeminiErrorType;
  /** Substrings to match in the lowercased error message. */
  patterns: readonly string[];
}

/**
 * Priority-ordered classification rule table.
 *
 * Rules are evaluated in order. When Google changes error message text or
 * adds new error categories, update this table — the classifier logic
 * stays unchanged. Test coverage should include real Gemini error payloads
 * alongside synthetic edge cases.
 */
export const CLASSIFICATION_RULES: readonly ClassificationRule[] = [
  {
    type: "invalid_key",
    patterns: [
      "401",
      "unauthenticated",
      "unauthorized",
      "invalid api key",
      "invalid_api_key",
      "api key not valid",
      "api key is not valid",
      "api_key_invalid",
      "authentication",
    ],
  },
  {
    type: "rate_limited",
    patterns: ["429", "rate limit", "resource_exhausted", "too many requests", "rate_limit"],
  },
  {
    type: "quota_exceeded",
    patterns: [
      "403",
      "quota",
      "exceeded",
      "forbidden",
      "permission denied",
      "does not have permission",
    ],
  },
];

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
 *
 * Matches the lowercased message against the priority-ordered
 * {@link CLASSIFICATION_RULES} table. The first rule whose patterns
 * match wins. Falls back to `"unknown"` when no rule matches.
 */
export function classifyGeminiError(errorMessage: string): {
  type: GeminiErrorType;
  message: string;
} {
  const lower = errorMessage.toLowerCase();

  for (const rule of CLASSIFICATION_RULES) {
    if (rule.patterns.some((p) => lower.includes(p))) {
      return { type: rule.type, message: GEMINI_ERROR_MESSAGES[rule.type] };
    }
  }

  return { type: "unknown", message: GEMINI_ERROR_MESSAGES.unknown };
}
