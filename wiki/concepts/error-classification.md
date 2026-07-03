---
title: "Error Classification"
type: concept
tags: [error-handling, architecture]
updated: 2026-07-03
---

# Error Classification

Pattern-based Gemini API error classification using a priority-ordered rule table.

## Design

Before: `classifyGeminiError()` in `src/errors.ts` used inline substring checks (`text.includes("401")`, `text.includes("rate limit")`). Google changing an error message silently broke classification.

After: Classification patterns live in `CLASSIFICATION_RULES` — a priority-ordered array of `{ type, patterns }` objects. The classifier iterates rules; first pattern match wins.

## Rule Table (`src/errors.ts`)

| Priority | Type             | Patterns                                                                                                                                                                           |
| -------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | `invalid_key`    | `"401"`, `"unauthenticated"`, `"unauthorized"`, `"invalid api key"`, `"invalid_api_key"`, `"api key not valid"`, `"api key is not valid"`, `"api_key_invalid"`, `"authentication"` |
| 2        | `rate_limited`   | `"429"`, `"rate limit"`, `"resource_exhausted"`, `"too many requests"`, `"rate_limit"`                                                                                             |
| 3        | `quota_exceeded` | `"403"`, `"quota"`, `"exceeded"`, `"forbidden"`, `"permission denied"`, `"does not have permission"`                                                                               |
| fallback | `unknown`        | (no patterns match)                                                                                                                                                                |

## Testing

29 table-driven tests in `tests/unit/errors.test.ts` cover:

- Each pattern in the rule table
- Real Gemini error payloads (JSON format from API responses)
- Priority ordering (overlapping patterns resolved by rule order)
- Pattern distinctiveness (no overlap between adjacent rules)

## Related Pages

- [[architecture-deepening]] — Candidate #2 from the review
