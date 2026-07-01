# 2. Consolidate credential resolution into config-store.ts

Date: 2026-07-02

## Status

Accepted

## Context

Credential resolution was split across two modules:

- **`src/auth.ts`**: A single-function file (`resolveApiKey`) that delegated almost entirely to `config-store.ts` via `resolveAgyOAuthToken` and `walkAuthPaths`.
- **`src/config-store.ts`**: Owned `walkAuthPaths`, `resolveAgyOAuthToken`, and all file traversal logic — but didn't own the complete API key resolution chain.

This created a shallow module (`auth.ts` — one exported function, 0 unique logic paths) and forced `resolveApiKey` to call `resolveAgyOAuthToken` then do a second `walkAuthPaths` for `apiKey` extraction, walking the same files twice.

## Decision

Move `resolveApiKey` into `src/config-store.ts`, making it the single **credential medium** that owns all credential resolution:

- `walkAuthPaths` — file traversal with ENOENT suppression
- `resolveAgyOAuthToken` — agy OAuth extraction (called from `oauth.ts`)
- `resolveApiKey` — full resolution chain (provided key → env vars → file-based credentials)

`src/auth.ts` is deleted. All callers (`index.ts`, tests) import from `config-store.js` directly.

A shared `extractCredential()` helper handles all credential formats (bare string, `access_token`, nested `token.access_token`, `agy`, `agy.access`). `resolveApiKey` adds inline `apiKey` extraction before delegating — no boolean flags.

## Consequences

### Positive

- **Single source of truth**: All credential resolution lives in one module. No more "go to auth.ts, then config-store.ts to understand the flow."
- **Eliminated double file walk**: `resolveApiKey` walks files exactly once, checking all formats in a single pass.
- **Cleaner extraction**: `extractCredential()` is a pure token extractor — `resolveApiKey` owns the `apiKey` check without a boolean flag toggling behavior.

### Negative

- **Module cohesion**: `config-store.ts` now handles both file traversal and credential extraction. At 160 lines it's still well within healthy size limits.
- **`oauth.ts` still calls `resolveAgyOAuthToken`**: Two callers for different credential subsets means the extraction helper must remain general-purpose. This is acceptable given the different use cases (login flow vs. API key resolution).
