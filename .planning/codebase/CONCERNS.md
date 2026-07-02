# Codebase Concerns

**Analysis Date:** 2026-07-03

## Tech Debt

**Credential Resolution Chain (config-store.ts):**

- Issue: `src/config-store.ts` (289 lines) has accreted four distinct token formats (bare string, `access_token`, nested `token.access_token`, `agy.access`) across keychain + 2 file paths. The `extractCredential` function handles all formats but the branching logic is indirect — each branch returns on first match, but format ambiguity between files is only resolved by file ordering, not explicit format detection.
- Files: `src/config-store.ts`
- Impact: Adding a new token format requires touching one function with 4 condition paths. Risk of silent regression if a future agy CLI version changes its on-disk format.
- Fix approach: Extract each format parser into a named function, compose them into a prioritized list. Add explicit format-type logging (at debug level) so it's clear which format matched.

**Monolithic Integration Test File:**

- Issue: `tests/unit/integration.test.ts` spans 390+ lines covering three unrelated subsystems: keychain credential resolution, API key resolution chain, and model discovery pipeline. Named "integration" but lives in `unit/` and uses fully mocked I/O.
- Files: `tests/unit/integration.test.ts`
- Impact: Test failures are harder to triage — a break in keychain parsing reports as an integration test failure, not as a config-store failure. Slow to navigate.
- Fix approach: Split into `tests/unit/config-store.integration.test.ts` and `tests/unit/model-discovery.integration.test.ts`. Rename appropriately or move to `tests/integration/`.

**Error Classification Relies on Substring Matching:**

- Issue: `classifyGeminiError` in `src/errors.ts` uses `text.includes(...)` against a hand-maintained list of error substrings (e.g. "unauthorized", "429", "rate limit"). If Google changes error message text or adds new error codes, categories may silently fall through to "unknown".
- Files: `src/errors.ts`
- Impact: Users see the generic "Gemini request failed" message for new error types that could have specific recovery actions (e.g. new billing errors, model deprecation).
- Fix approach: Add regression tests with real Gemini error payloads (captured from API). Consider matching on HTTP status codes in addition to message text when available from the provider message.

## Known Bugs

**No known open bugs.** No TODO/FIXME/HACK comments found in source or test files.

## Security Considerations

**API Key Seeded into process.env:**

- Risk: Both `src/index.ts` (startup) and `src/oauth.ts` (`getApiKey`) write the resolved API key/OAuth token to `process.env[GEMINI_API_KEY]`. This is required by pi's `$GEMINI_API_KEY` interpolation but exposes the key to any child processes spawned during the pi session, including shell commands, tools, and plugins.
- Files: `src/index.ts:42-44`, `src/oauth.ts:133`
- Current mitigation: The key is loaded from env or files at startup and is scoped to the pi process tree. OAuth tokens are short-lived (~1 hour).
- Recommendations: Document this behavior prominently for users running untrusted plugins. Consider an option to skip auto-seeding and require explicit `$GEMINI_API_KEY` env var at pi launch.

**Keychain Shell Command (execSync):**

- Risk: `resolveKeychainToken` uses `execSync` to run `security find-generic-password -s "gemini" -w` with a 3s timeout. The command output (the raw keychain password) is trimmed and used directly. While `stdio: ['ignore', 'pipe', 'ignore']` suppresses stderr, the password passes through the Node.js process memory.
- Files: `src/config-store.ts:186-191`
- Current mitigation: The keychain token is consumed immediately — not logged, not persisted. Platform guard limits to `darwin` only.
- Recommendations: No clear alternative for macOS Keychain access; accept as inherent limitation. Consider a lower timeout (2s) since local keychain lookups are near-instant.

## Performance Bottlenecks

**Synchronous File I/O at Provider Registration:**

- Issue: `resolveApiKey()` in `index.ts` is called synchronously during extension registration. It uses `existsSync` + `readFileSync` to walk up to 3 credential files. This blocks pi's startup path until credential resolution completes.
- Files: `src/index.ts:148`, `src/config-store.ts:218`
- Cause: `walkAuthPaths` uses synchronous `readFileSync` and `existsSync`. The async model discovery (`resolveModels`) already supports async — but the credential path doesn't.
- Improvement path: Low priority — file reads of small JSON files are near-instant. Only worth addressing if pi extension registration moves to fully async.

**E2E Smoke Tests Not in CI:**

- Issue: The E2E smoke test (`tests/e2e/smoke.sh`) requires a real Gemini API key and pi installed globally. It is not run in any CI pipeline.
- Files: `tests/e2e/smoke.sh`
- Impact: API compatibility regressions (Google endpoint changes, model deprecations) are only caught by manual testing or user reports.
- Improvement path: Add a scheduled CI workflow (weekly) with a repo secret for `GEMINI_API_KEY`. At minimum, run the auth-check curl test to detect API endpoint changes.

## Fragile Areas

**Login Verification Has No Retry:**

- Files: `src/oauth.ts:64-75` (`verifyToken`)
- Why fragile: A single transient network failure during the agy OAuth auto-login path causes a fallback to manual API key paste — even though the token is valid. The user sees a browser open and a paste prompt, which is a confusing UX jump from "auto-detected your agy login."
- Safe modification: Add 1 retry (with short delay) to `verifyToken` before falling through to the manual flow. Keep the total wait under 8s.
- Test coverage: Tested (oauth.test.ts mocks fetch with reject and resolves), but no test for `verifyToken` in isolation.

**Node.js execSync Timeout is a Kill, Not a Graceful Fallback:**

- Files: `src/config-store.ts:186-191`
- Why fragile: `execSync` with `timeout: 3000` will throw a `Error` with `err.killed = true` and `err.code = 'ETIMEDOUT'`. The catch block in `resolveKeychainToken` silently swallows this, but on heavily loaded systems or during macOS auth prompts, the keychain call may time out and the token is discarded — even though the credential exists.
- Safe modification: Verify the timeout behavior on macOS under load. Consider a longer timeout (5s) or adding `signal` option for `child_process.exec` with explicit cleanup.

**Hardcoded Model Count = 2:**

- Files: `src/model-catalog.ts:88-105`
- Why fragile: The static catalog has exactly 2 models. If both are deprecated or renamed by Google, dynamic discovery is the only recourse — and that requires a valid API key. Users without a key would see no models.
- Safe modification: Keep static catalog as fallback; add a `lastUpdated` field and a scheduled job/script to check for model deprecations against the Gemini API. Consider exposing a `--models` endpoint in dev mode.
- Test coverage: Unit tests assert model count, IDs, and structure. No test for "all static models are deprecated."

## Scaling Limits

**Single Provider, Two Models:**

- Current capacity: 2 static models (gemini-3.5-flash, gemini-3.1-pro-preview). Dynamic discovery can surface more from the API.
- Limit: Static fallback is fixed at 2 models. If Google releases 10+ new Gemini models, users without an API key won't see them.
- Scaling path: Dynamic model discovery already exists — the limit is the key requirement. Consider making the `keychainToken` + `agy OAuth` paths also populate dynamic models (i.e., use OAuth tokens for model discovery too, not just static API keys).

## Dependencies at Risk

**`@earendil-works/pi-coding-agent` and `@earendil-works/pi-ai`:**

- Risk: Peer dependencies on pi's internal packages (`^0.80.2`). These are pre-1.0 and the API surface (ExtensionAPI, OAuthLoginCallbacks, OAuthCredentials) could change in breaking ways before pi reaches 1.0.
- Impact: `registerProvider` signature or OAuth flow changes could require a coordinated release with pi. Since pi loads `.ts` source directly, there's no build-time protection.
- Migration plan: Pin devDependencies to tested versions. Monitor pi changelog. Add a `test:compat` script that fetches the latest pi release and runs unit tests against it.

**`vitest` v4 (prerelease):**

- Risk: Vitest `^4.1.5` is a prerelease line with unstable APIs. Mocking behaviors (`vi.hoisted`, `vi.stubGlobal`) could change.
- Impact: Test suite could break on a minor vitest update. Test output format changes could break CI reporting.
- Migration plan: Consider pinning to a specific vitest version until v4 stable. The test suite has moderate usage of `vi.mock` and `vi.hoisted` — validate against vitest changelog when upgrading.

## Missing Critical Features

**No OAuth Token Refresh Chain:**

- Problem: agy OAuth tokens expire after ~1 hour. The `refreshToken` function is explicitly a no-op — it just warns if expired. Users must manually run `pi /login` to re-authenticate.
- Blocks: Long-running pi sessions (>1 hour) will silently fail mid-conversation when the token expires. Users on macOS Keychain need to re-run `agy` to get a fresh token.
- Recommendation: Document prominently. Investigate whether `agy refresh` or `agy auth` can be called programmatically to extend the session. Consider adding an automatic re-login prompt when token expiry is detected during a request.

**No Offline Fallback Model List:**

- Problem: If the Gemini API is completely unreachable at startup (DNS failure, firewall), and no API key is cached, the static model catalog is the only source. But the static catalog is bundled — so this works. However, the `.gemini/` credential files are only consulted if they exist; there's no bundled default credential path.
- Blocks: Fresh install with no `GEMINI_API_KEY` and no agy install — user must paste a key. This is by design (no baked-in credentials), but the UX for first-time setup could be improved.
- Recommendation: Improve `pi /login` messaging to detect common setups (no agy CLI, no env var) and provide tailored instructions.

**No Observability / Telemetry:**

- Problem: No logging of model discovery results, credential resolution sources, or error classification decisions. Debugging user issues requires asking them to set env vars or read logs.
- Blocks: Support triage. Can't answer "which credential source was used?" or "did dynamic discovery succeed?" without reproduction.
- Recommendation: Add a `DEBUG=agy` verbose logging mode (gated by env var) that reports: credential source resolved, model discovery outcome (remote vs static), error classification decision.

## Test Coverage Gaps

**`handleGeminiError` console fallback path:**

- What's not tested: The `ctx.hasUI === false` path that writes to `console.error`. Tested in unit test via spy, but no integration test verifying end-to-end that a real pi process without UI surfaces the error.
- Files: `src/error-handler.ts:39`, `tests/unit/error-handler.test.ts:71-80`
- Risk: If pi changes how it signals `hasUI`, errors go to console and user never sees them.
- Priority: Low

**`resolveAgyOAuthToken` with real keychain integration:**

- What's not tested: The actual `security(1)` CLI call path. All keychain tests inject `readKeychainPassword`. No integration test on macOS verifies the real security binary produces parseable output.
- Files: `src/config-store.ts:178-211`
- Risk: macOS security binary output format change (e.g., TCC prompt, new keychain format) would silently fail.
- Priority: Medium — add a manual test checklist item for macOS releases.

**E2E error classification end-to-end:**

- What's not tested: The full path from Gemini API error → `message_end` event → `handleGeminiError` → user notification. The E2E smoke test checks for error keywords but doesn't validate the friendly message content.
- Files: `tests/e2e/smoke.sh:78-90`
- Risk: Error classification regex could break without detection.
- Priority: Medium

**`parseRemoteModel` with malformed pricing:**

- What's not tested: When the Gemini API returns pricing with non-numeric values (e.g., strings with currency symbols like `"$0.000005"`), `toMicroPerToken` returns the fallback value. Tested indirectly but no boundary/edge case coverage for garbage pricing fields.
- Files: `src/model-discovery.ts:57-59`
- Risk: Misleading cost display in pi if API returns unexpected format.
- Priority: Low

---

_Concerns audit: 2026-07-03_
