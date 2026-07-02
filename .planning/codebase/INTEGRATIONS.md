# External Integrations

**Analysis Date:** 2026-07-03

## APIs & External Services

**LLM API:**

- Google Gemini API (generativelanguage.googleapis.com) — all model inference (chat completions), model discovery, and token verification
- Endpoint: `https://generativelanguage.googleapis.com/v1beta/openai` (OpenAI-compatible format)
- Override: `GEMINI_API_BASE` env var (custom endpoint for testing or proxying)
- Protocol: OpenAI-compatible Chat Completions API over HTTPS
- Streaming: SSE (Server-Sent Events) via pi's built-in `openai-completions` streaming handler
- Auth: Bearer token in `Authorization` header (`apiKey` via `authHeader: true` in pi provider registration)
- Endpoints used:
  - `POST /chat/completions` — model inference (all chat requests)
  - `GET /models` — dynamic model discovery at startup (filtered to `gemini-*` prefixed models)
  - `GET /models` — token verification during login flow (checks if OAuth token is accepted)

**Model Discovery API:**

- Fetched via `fetch()` with `Authorization: Bearer <apiKey>` header
- Timeout: 5 seconds (`MODELS_FETCH_TIMEOUT_MS = 5000`)
- Retry: 1 retry (2 total attempts) for transient network errors and 502/503/504 responses only
- Retry delay: 1 second base, exponential backoff (doubles per attempt)
- Fallback: static model catalog (`MODELS` array) when discovery fails
- Format: OpenAI-compatible list format — `[{id, name, context_length, max_output_tokens, pricing, reasoning}]` or `{data: [...]}`

**Google AI Studio:**

- `https://aistudio.google.com/apikey` — API key creation URL, opened in browser during `/login` flow
- Used for: user-directed API key provisioning (no programmatic API call)

**pi Coding Agent Integration:**

- Provider registration: `pi.registerProvider("agy", {...})`
- Provider name: `agy` (models referenced as `agy/<model-id>`, e.g. `agy/gemini-3.5-flash`)
- API format: `openai-completions` (pi's built-in streaming handler)
- OAuth interface: implements `login()`, `refreshToken()`, `getApiKey()` callbacks
- Error surface: `pi.on("message_end", handleGeminiError)` event listener
- `$GEMINI_API_KEY` variable interpolation: pi resolves `$${ENV_API_KEY}` from `process.env` per-request

## Data Storage

**Databases:**

- None — no database, ORM, or persistent storage

**File Storage:**

- Local filesystem only — reads credential files from user's home directory
- Paths read:
  - `~/.gemini/antigravity-cli/antigravity-oauth-token` — agy CLI OAuth token (bare string)
  - `~/.gemini/oauth_creds.json` — Gemini CLI OAuth credentials (JSON with `access_token`)

**Caching:**

- None — no in-memory cache, no Redis, no filesystem cache

## Authentication & Identity

**Auth Methods (in priority order):**

1. **Provided API key** — passed directly via `resolveApiKey(providedKey)` parameter
2. **`GEMINI_API_KEY` env var** — primary env var for static API keys
3. **`GOOGLE_API_KEY` env var** — alternate env var (some Google SDKs use this)
4. **macOS Keychain** — agy v1.0.15+ stores OAuth tokens under service name `"gemini"`, encoded as `go-keyring-base64:<base64-encoded-JSON>`. Accessed via `security find-generic-password -s "gemini" -w` (macOS only, skipped on Linux/Windows)
5. **agy CLI flat files** — `~/.gemini/antigravity-cli/antigravity-oauth-token` and `~/.gemini/oauth_creds.json`

**Credential Formats Supported:**

- Static API key: opaque string (typically 30+ chars), never expires (10-year lifetime)
- Bearer token (bare string): agy OAuth token format from `antigravity-oauth-token`
- OAuth JSON: `{access_token: string, expiry_date?: number}` (oauth_creds.json)
- Nested OAuth: `{token: {access_token: string, expiry?: string}}` (Keychain format)
- agy field: `{agy: string}` or `{agy: {access: string, expires?: string}}`

**Token Lifetimes:**

- Static API keys: 10 years (~315,360,000,000 ms) — effectively permanent
- agy OAuth tokens: 55 minutes (~3,300,000 ms) — safety buffer under ~1 hour Google OAuth expiry
- Token verification: 5-second timeout on `/models` GET to verify credentials

**Login Flow:**

1. Try agy OAuth reuse from Keychain/files → verify against Gemini API
2. If verified → return immediately (no user interaction)
3. If not → open Google AI Studio in browser, prompt user to paste API key
4. Sanitize pasted input (strip terminal paste wrappers, control chars)

**Token Refresh:**

- No-op — agy OAuth tokens cannot be refreshed programmatically (must re-run `agy` CLI)
- API keys don't expire
- Expired credentials warn user to run `pi /login`

## Monitoring & Observability

**Error Tracking:**

- None — no Sentry, DataDog, or other error tracking service
- Console warnings on recoverable errors (e.g., corrupt auth files, suspiciously short API keys)
- Error classification at the provider level: invalid_key, rate_limited, quota_exceeded, unknown

**Logs:**

- `console.warn()` — auth file read failures, short API key warnings, expired credentials
- `console.error()` — fallback error delivery when pi UI is unavailable
- No structured logging, no log levels, no log aggregation

**Error Surface Pipeline:**

1. Filter: `message_end` event, `stopReason === "error"`, provider match ("agy")
2. Classify: match error message patterns (401/429/403, keyword matching)
3. Deliver: pi UI notification (`.notify()`) or `console.error()` fallback

## CI/CD & Deployment

**Hosting:**

- npm registry — published as `pi-agy-provider`

**CI Pipeline:**

- GitHub Actions (`.github/workflows/ci.yml`)
- Matrix: Node 22/24 × latest pi / min pi v0.80.2 (4 jobs, `fail-fast: false`)
- Steps: checkout → setup-node → npm ci → (conditional) pin pi version → lint + format:check (one cell only) → typecheck → unit tests
- E2E job: manual trigger only (`workflow_dispatch` with `run_e2e` boolean), requires `GEMINI_API_KEY` secret

**Release Pipeline:**

- Manual: `npm run release:{patch|minor|major}` (bumpp: bump version, git commit, git tag, git push)
- Manual: `npm run pub` (npm publish)
- `np` config: branch=main, testScript=npm test, releaseDraft=true

**Dependency Updates:**

- Renovate bot (`.github/renovate.json` → `config:recommended`)
- Automated PRs for dependency bumps

## Environment Configuration

**Required env vars (runtime):**

- `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) — API key for Google Gemini; required for API calls, optional only if agy OAuth token is available and verified

**Optional env vars:**

- `GEMINI_API_BASE` — override default API endpoint (default: `https://generativelanguage.googleapis.com/v1beta/openai`)
- `GOOGLE_API_KEY` — alternate API key env var (lower priority than `GEMINI_API_KEY`)

**Secrets location:**

- macOS Keychain — agy v1.0.15+ primary credential store
- `~/.gemini/antigravity-cli/antigravity-oauth-token` — agy CLI flat file
- `~/.gemini/oauth_creds.json` — Gemini CLI OAuth JSON
- `process.env.GEMINI_API_KEY` — static API key (set by user or by `/login`)
- CI: `${{ secrets.GEMINI_API_KEY }}` — GitHub Actions secret for E2E tests

## Webhooks & Callbacks

**Incoming:**

- None — no HTTP server, no webhook endpoints

**Outgoing:**

- `HTTPS://generativelanguage.googleapis.com/v1beta/openai/chat/completions` — all model inference requests (POST)
- `HTTPS://generativelanguage.googleapis.com/v1beta/openai/models` — model discovery (GET) and token verification (GET)

---

_Integration audit: 2026-07-03_
