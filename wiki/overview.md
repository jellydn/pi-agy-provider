---
title: "Overview"
updated: 2026-07-03
---

# pi-agy-provider — Overview

The `pi-agy-provider` is a pi extension that registers Google Gemini models as a model provider via pi's built-in `openai-completions` streaming. It supports two authentication paths: agy CLI OAuth tokens (auto-detected from macOS Keychain) and static API keys from Google AI Studio.

## Architecture at a Glance

```
User's pi session
    │
    ▼
src/index.ts (extension entry)
    ├── Registers provider "agy" with pi
    ├── Resolves API key/credentials
    ├── Discovers models (dynamic → static fallback)
    └── Wires error handler
    │
    ├── src/config-store.ts    — Credential resolution (Keychain, files, env)
    │   └── src/credential-parsers.ts — Format-specific token extractors
    ├── src/oauth.ts           — Login flow + token refresh
    │   ├── src/oauth-verifier.ts     — Token verification with retry
    │   └── src/oauth-credentials.ts — Antigravity OAuth client credentials
    ├── src/model-discovery.ts — Dynamic model fetch with retry
    │   └── src/model-catalog.ts      — Static model definitions
    ├── src/error-handler.ts   — Error surface pipeline
    │   └── src/errors.ts             — Classification rule table
    ├── src/retry.ts           — Shared retry utility
    └── src/logger.ts          — Structured logging (DEBUG=agy gated)
```

## Key Design Decisions

1. **OpenAI-compatible endpoint** — Uses `https://generativelanguage.googleapis.com/v1beta/openai` with `api: "openai-completions"` for zero-implementation streaming.

2. **Credential parser chain** — Four format-specific parsers composed in priority order. Adding a new format = new parser, no changes to existing ones.

3. **Antigravity OAuth refresh** — agy v1.0.15+ stores refresh tokens in the macOS Keychain. The provider extracts both access and refresh tokens, refreshing via Google's OAuth endpoint with public Antigravity client credentials.

4. **Error classification as data** — Classification patterns live in a priority-ordered rule table, not inline substring chains. New Google error messages = new rule rows.

5. **Structured observability** — Shared Logger interface with `DEBUG=agy` gating. Production suppresses debug/info noise; warn/error always surface.

## Authentication Paths

| Path           | Source                                                        | Lifetime | Refreshable                 |
| -------------- | ------------------------------------------------------------- | -------- | --------------------------- |
| agy OAuth      | macOS Keychain (`security find-generic-password -s "gemini"`) | ~1 hour  | Yes (via Google OAuth)      |
| Static API key | `GEMINI_API_KEY` env var or manual paste                      | 10 years | N/A (effectively permanent) |

## Known Limitations

- agy OAuth refresh requires the `ANTIGRAVITY_CLIENT_ID` (public Pi credential). If Google rotates this client, refresh breaks.
- File-based agy tokens (`~/.gemini/antigravity-cli/`) are legacy — newer agy versions only use Keychain. File tokens have no refresh_token.
- The error classification table requires manual updates when Google changes error message text.
