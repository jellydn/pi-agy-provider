# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Architecture**: Split `src/models.ts` into `src/model-catalog.ts` (static definitions) and `src/model-discovery.ts` (dynamic fetch + retry); `src/models.ts` is now a barrel re-export.
- **Credentials**: Moved `resolveApiKey` into `src/config-store.ts` (credential medium); deleted `src/auth.ts`.

### Fixed

- **agy OAuth**: Support nested `{token: {access_token: "..."}}` format in `antigravity-oauth-token` file.
- **Error classification**: `UNAUTHENTICATED` errors from expired tokens are now correctly classified as `invalid_key` instead of falling through to `unknown`.
- **Retry scope**: Only retry on network errors and transient 5xx (502/503/504); 4xx and permanent 5xx return immediately.
- **Simplification**: Removed `includeApiKey` boolean flag from `extractCredential` helper; eliminated duplicate file walks in credential resolution; removed redundant `thinkingLevelMap` duplication in `MODELS` array.

### Added

- **Integration tests**: `tests/unit/integration.test.ts` covering credential resolution chain, model discovery with retry, and AbortController timeout.

## [0.1.0] — 2026-07-02

### Added

- Initial release — Google Gemini provider for pi (via agy / Antigravity CLI)
- 2 Gemini models: Gemini 3.5 Flash, Gemini 3.1 Pro Preview
- OpenAI-compatible Chat Completions streaming via pi's built-in `openai-completions` provider
- agy OAuth credential reuse — detects agy CLI login from `~/.gemini/antigravity-cli/antigravity-oauth-token` or `~/.gemini/oauth_creds.json`
- Static API key authentication with auto-discovery from `GEMINI_API_KEY` / `GOOGLE_API_KEY` env vars, `~/.gemini/` files, or `~/.pi/agent/auth.json`
- Dynamic model discovery from Gemini's `/models` endpoint, falling back to static list on error
- `/login` integration — automatic agy OAuth detection or browser-assisted manual paste
- Error classification — user-friendly messages for 401 (invalid key), 429 (rate limit), 403 (quota) errors
- Error surface via `message_end` event handler with filter → classify → deliver pipeline
- Injection-testable I/O via options objects (`AuthKeyOptions`, `RemoteModelsOptions`)
- Unit tests across 9 files
- E2E smoke tests (manual trigger with `GEMINI_API_KEY`)
- CI matrix: Node 22 + Node 24, with minimum pi version pinning

[Unreleased]: https://github.com/jellydn/pi-agy-provider/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/jellydn/pi-agy-provider/releases/tag/v0.1.0
