# Architecture

**Analysis Date:** 2026-07-03

## Pattern Overview

**Overall:** pi Extension (Plugin/Provider Pattern)

The project is a pi extension — a TypeScript module loaded at runtime by the pi coding agent. It registers Google Gemini models as an OpenAI-compatible provider via pi's built-in `openai-completions` streaming support. pi discovers it through `package.json` `"pi": { "extensions": ["./src/index.ts"] }`.

**Key Characteristics:**

- Single entry point (`src/index.ts` default export) that wires provider registration, OAuth hooks, and error handling
- Dependency injection via options objects for all I/O surfaces (filesystem, network, env vars, keychain) — no global mocking needed
- Remote model discovery with automatic retry and static catalog fallback
- Credential resolution chain spanning multiple sources: env vars, macOS Keychain, agy CLI files, and manual paste
- Error surface via pi's `message_end` event: filter → classify → deliver user-friendly messages
- Flat module structure (no subdirectories under `src/`) with barrel re-export for the models subsystem

## Layers

**Entry Layer:**

- Purpose: Extension bootstrap — loads models, resolves credentials, registers provider, wires error handler
- Location: `src/index.ts`
- Contains: Default export function receiving `ExtensionAPI`, provider registration call, event listener registration
- Depends on: All other modules (env, config-store, models, oauth, error-handler)
- Used by: pi runtime (discovered via package.json `pi.extensions`)

**Model Layer:**

- Purpose: Define model types, maintain static catalog, fetch remote models from Gemini API with retry/fallback
- Location: `src/model-catalog.ts`, `src/model-discovery.ts`, `src/models.ts` (barrel)
- Contains: `ThinkingLevel`, `ThinkingLevelMap`, `ModelConfig` types, `MODELS` static array, `fetchRemoteModels` with exponential backoff retry, `resolveModels` orchestration, `modelIds()` helper
- Depends on: Infrastructure (env for API base, utils for type guards)
- Used by: Entry layer (`src/index.ts`)

**Authentication Layer:**

- Purpose: Credential resolution, login flow, token management
- Location: `src/config-store.ts`, `src/oauth.ts`
- Contains: `walkAuthPaths` file traversal, `resolveAgyOAuthToken` (macOS Keychain → agy files), `resolveApiKey` (provided → env → files), `resolveKeychainToken` for macOS Keychain, `login`/`refreshToken`/`getApiKey` OAuth hooks
- Depends on: Infrastructure (env constants), Node.js built-ins (`fs`, `os`, `child_process`), utils (type guards)
- Used by: Entry layer (`src/index.ts`), pi OAuth flow

**Error Layer:**

- Purpose: Classify Gemini API errors and surface user-friendly messages
- Location: `src/errors.ts`, `src/error-handler.ts`
- Contains: `classifyGeminiError` (pattern matching on error strings), `handleGeminiError` (filter → classify → deliver pipeline), `GeminiErrorType`, `GEMINI_ERROR_MESSAGES`
- Depends on: Infrastructure (PROVIDER_NAME constant)
- Used by: Entry layer (`src/index.ts`) via `pi.on("message_end")`

**Infrastructure Layer:**

- Purpose: Constants, environment helpers, shared type guards
- Location: `src/env.ts`, `src/utils.ts`
- Contains: Provider name, API base URL, env var names, `resolveApiBase`, `sanitizeApiKey`, `buildEndpointUrl`, `isRecord`, `stringValue`, `numberValue`, `booleanValue`
- Depends on: Nothing (leaf modules)
- Used by: All other layers

## Data Flow

**Extension Bootstrap (cold start):**

1. pi discovers extension via `package.json` `pi.extensions` → loads `src/index.ts` → calls default export with `ExtensionAPI`
2. `resolveApiBase()` reads `GEMINI_API_BASE` env var or falls back to Google's OpenAI-compatible endpoint
3. `resolveApiKey()` walks credential sources: (a) GEMINI_API_KEY env var, (b) GOOGLE_API_KEY env var, (c) file-based agy credentials at `~/.gemini/`
4. If a key is resolved and `GEMINI_API_KEY` is unset, seed `process.env[GEMINI_API_KEY]` so pi's `$GEMINI_API_KEY` interpolation works per-request
5. `resolveModels(apiKey)` attempts dynamic model discovery from `/models` endpoint; falls back to static `MODELS` array on any error
6. `pi.registerProvider("agy", {...})` registers models with `api: "openai-completions"`, OAuth hooks, and `apiKey: "$GEMINI_API_KEY"` (lazy)
7. `pi.on("message_end", handleGeminiError)` wires the error surface pipeline

**Login Flow:**

1. User runs `pi /login` → OAuth callback `login()` fires
2. `resolveAgyOAuthToken()` checks: (a) macOS Keychain (agy v1.0.15+), (b) `~/.gemini/antigravity-cli/antigravity-oauth-token`, (c) `~/.gemini/oauth_creds.json`
3. If token found, verify against Gemini API `/models` endpoint
4. If verified → return credentials immediately (no user interaction)
5. If no valid token → open Google AI Studio URL, prompt user to paste API key
6. `getApiKey()` syncs credentials to `process.env[GEMINI_API_KEY]` so pi's lazy interpolation picks them up

**Error Surface:**

1. Gemini API returns error → pi emits `message_end` event with `stopReason: "error"` and `errorMessage`
2. `handleGeminiError()` filters: is `stopReason === "error"` and `provider === "agy"`?
3. If Gemini error → `classifyGeminiError()` matches error message against patterns (401/unauthorized, 429/rate_limit, 403/quota)
4. Deliver via `ctx.ui.notify()` (UI mode) or `console.error()` (headless fallback)

**State Management:**

- No mutable global state. Credentials are stored in process.env and pi's auth store (`~/.pi/agent/auth.json`).
- API key is referenced lazily via `$GEMINI_API_KEY` — pi resolves it from process.env per-request, so credential changes from `/login` are picked up without restart.
- Model list is resolved once at startup; no hot reload.

## Key Abstractions

**Credential Resolution Chain:**

- Purpose: Resolve a Gemini API key or OAuth token from multiple sources in priority order
- Examples: `src/config-store.ts` (resolveApiKey, resolveAgyOAuthToken, walkAuthPaths, resolveKeychainToken)
- Pattern: Chain of Responsibility — each source is checked in order; first non-expired token wins. All I/O injectable via `AuthKeyOptions`.

**Model Resolution with Fallback:**

- Purpose: Discover available Gemini models at runtime, falling back to a hardcoded catalog on any error
- Examples: `src/model-discovery.ts` (resolveModels, fetchRemoteModels)
- Pattern: Try/Catch with Fallback — attempt remote fetch with exponential backoff retry for transient errors; return static catalog on failure. Only `gemini-` prefixed models pass the filter.

**Dependency Injection via Options Objects:**

- Purpose: Make all I/O surfaces testable without global mocking (no `vi.mock('node:fs')`)
- Examples: `AuthKeyOptions` (config-store.ts), `RemoteModelsOptions` (model-discovery.ts)
- Pattern: Options Object — every I/O field is optional with a sensible production default. Tests inject mock functions per call.

**Error Classification Pipeline:**

- Purpose: Turn raw Gemini API error messages into user-friendly, actionable messages
- Examples: `src/errors.ts` (classifyGeminiError), `src/error-handler.ts` (handleGeminiError)
- Pattern: Filter → Classify → Deliver. Pattern matching on lowercased error strings against keyword sets. Three categories: invalid_key, rate_limited, quota_exceeded.

**Barrel Re-export (Models):**

- Purpose: Stable public API surface for the models subsystem while allowing internal module boundaries to shift
- Examples: `src/models.ts` re-exports from `model-catalog.ts` and `model-discovery.ts`
- Pattern: Facade — consumers import from `./models.js`, internals split between catalog (pure data) and discovery (I/O with retry). Added 15 lines; eliminated 200-line mixed-concern file.

## Entry Points

**Extension Entry (Primary):**

- Location: `src/index.ts` (default export)
- Triggers: pi runtime loads the extension at startup
- Responsibilities: Resolve credentials, discover models, register provider, wire error handler

**OAuth Hooks:**

- Location: `src/oauth.ts` (login, refreshToken, getApiKey exports)
- Triggers: pi's `/login` command, credential refresh cycle
- Responsibilities: Detect agy CLI OAuth tokens, verify, fall back to manual API key paste, sync credentials to process.env

**Models Barrel:**

- Location: `src/models.ts` (re-exports from model-catalog.ts and model-discovery.ts)
- Triggers: Imported by index.ts and tests
- Responsibilities: Stable public API for model types, static catalog, and discovery functions

**Type Contract:**

- Location: `tests/type/contract.ts`
- Triggers: `npm run typecheck` (compiler validates function signature)
- Responsibilities: Compile-time assertion that the extension function signature matches `ExtensionAPI` → `Promise<void>`

## Error Handling

**Strategy:** Filter → Classify → Deliver

The error handler listens on pi's `message_end` event. It filters for Gemini-specific errors (`stopReason === "error"`, `provider === "agy"`), classifies the error message into one of three categories, and delivers a user-friendly message via pi's UI notification system or console fallback.

**Patterns:**

- Pattern matching on lowercased error strings (no regex, no error codes — keyword presence)
- Three categories: invalid_key (401/unauthenticated), rate_limited (429), quota_exceeded (403/forbidden), plus unknown fallback
- Each category has a static, actionable message with remediation steps (run `pi /login`, check quota page, etc.)

## Cross-Cutting Concerns

**Logging:** Console warnings only — corrupt auth files logged via `console.warn` with `[agy]` prefix. No structured logging, no log levels.

**Validation:** Minimal — API key sanitization strips terminal paste wrappers and control characters. Suspiciously short API keys (< 20 chars) trigger a console warning. Type guards (`isRecord`, `stringValue`, etc.) provide safe extraction from unknown JSON.

**Authentication:** Credential resolution walks multiple sources in priority order. OAuth tokens checked for expiry before use (malformed/missing expiry treated as non-expired — err on the side of letting API reject). API keys from env vars always win over file-based credentials.

---

_Architecture analysis: 2026-07-03_
