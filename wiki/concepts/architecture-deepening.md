---
title: "Architecture Deepening"
type: concept
tags: [architecture, refactoring, review]
updated: 2026-07-03
---

# Architecture Deepening

Results of the architecture review that identified shallow modules and proposed deepening candidates. All 4 candidates were implemented.

## Candidates

| #   | Candidate                            | Strength        | Outcome                                              |
| --- | ------------------------------------ | --------------- | ---------------------------------------------------- |
| 1   | Credential format extraction sprawl  | Strong          | Extracted 4 parsers into `src/credential-parsers.ts` |
| 2   | Error classification string coupling | Strong          | Rule table in `src/errors.ts`                        |
| 3   | Login verification shallowness       | Worth exploring | `src/oauth-verifier.ts` with retry                   |
| 4   | No structured observability          | Worth exploring | `src/logger.ts` with `DEBUG=agy` gating              |

## Key Architectural Moves

1. **Credential parser chain**: `extractCredential()` had 4 format branches interleaved. Now each format is a self-contained `CredentialParser` adapter behind one interface. Adding format 5 = new adapter, zero touch to existing ones.

2. **Error rules as data**: `classifyGeminiError()` used hardcoded substrings inline. Now `CLASSIFICATION_RULES` is a data table; the classifier is pure matching logic. New error type = new rule row.

3. **Token verifier seam**: `verifyToken()` was inline with no retry. Now a standalone `TokenVerifier` module with retry policy. Two adapters (real HTTP, mock) confirm the seam.

4. **Logger seam**: Four modules had ad-hoc logging. Now one `Logger` interface, two adapter behaviors: full console (DEBUG=agy) and warn/error-only (production).

## Shared Retry

Both `src/model-discovery.ts` and `src/oauth-verifier.ts` had bespoke retry loops. Extracted to `src/retry.ts` — `retryFetch()` with exponential backoff, injectable fetch, and transient error detection.

## Related Pages

- [[credential-resolution-chain]]
- [[error-classification]]
- [[retry-pattern]]
- [[oauth-token-refresh]]
- [[observability-logger]]
