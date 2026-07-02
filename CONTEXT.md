# CONTEXT.md — Domain Glossary

This document defines the ubiquitous language for the `pi-agy-provider` project.

---

## Core Concepts

### agy (Antigravity CLI)

Google's official AI coding agent CLI (v1.0.14). Written in Go. Provides access to Gemini and other models through Google's backend. Config stored at `~/.gemini/antigravity-cli/`.

### Google Gemini API

Google's LLM API exposing Gemini models (3.5 Flash, 3.1 Pro). Supports an OpenAI-compatible endpoint at `https://generativelanguage.googleapis.com/v1beta/openai/`.

### pi Extension

A TypeScript module loaded by the pi coding agent that registers a model provider, OAuth hooks, and error handlers.

### Provider

The model provider registered with pi as `"agy"`. Models are referenced as `agy/<model-id>` (e.g., `agy/gemini-3.5-flash`).

---

## Authentication

### Static API Key

A long-lived API key from Google AI Studio (`aistudio.google.com/apikey`). Used directly as the `Authorization: Bearer <key>` header.

### agy OAuth Token

A short-lived (~1 hour) OAuth access token stored by the agy CLI at `~/.gemini/antigravity-cli/antigravity-oauth-token` or `~/.gemini/oauth_creds.json`. Cannot be refreshed without re-running the agy CLI.

### Credential Store

JSON files that store credentials:

- **agy CLI store**: `~/.gemini/antigravity-cli/antigravity-oauth-token` (bare token), `~/.gemini/oauth_creds.json` (JSON with `access_token`)
- **pi auth store**: `~/.pi/agent/auth.json` — `agy` (string) or `agy.access` (OAuth object)

### Token Lifetimes

- **API key lifetime** (`API_KEY_LIFETIME_MS`): 10 years (315,360,000,000 ms). Statically defined — API keys from Google AI Studio never expire, so this is effectively permanent.
- **agy OAuth lifetime** (`AGY_OAUTH_LIFETIME_MS`): 55 minutes (3,300,000 ms). agy tokens expire after ~1 hour; a 5-minute safety buffer prevents mid-request expiration.

### Token Verifier

A module (`src/oauth-verifier.ts`) that verifies an agy OAuth token against the Gemini API with built-in retry for transient network errors (DNS failures, connection refused, timeouts). Non-network errors (bad response) are terminal — no retry. The verifier is injectable via `TokenVerifier` interface; two adapters (real HTTP and mock) confirm the seam.

---

## Observability

### Logger

A structured logging interface behind a seam, shared by all modules. Two adapters:

- **Console adapter** — gated by `DEBUG=agy` env var; `debug` and `info` levels only fire when the flag is set; `warn` and `error` always log.
- **No-op adapter** — production default, silently discards all messages.

Modules log: credential source resolution (`config-store`), model discovery outcome (`model-discovery`), error classification decisions (`error-handler`), and auth lifecycle events (`oauth`).

---

## Model Lifecycle

### Static Model Catalog

Two hardcoded models: Gemini 3.5 Flash and Gemini 3.1 Pro Preview, with pricing, context windows (1M tokens), and token limits (65,536 output).

### Model Defaults

Shared constants used by both the static model catalog and remote model parsing as fallback values:

- **`DEFAULT_CONTEXT_WINDOW`**: 1,000,000 tokens
- **`DEFAULT_MAX_TOKENS`**: 65,536 output tokens

### Dynamic Model Discovery

Runtime fetch from Gemini's `/models` endpoint (OpenAI-compatible format). Only `gemini-` prefixed models are included. Falls back to static catalog on error.

### Model Discovery Retry

Transient network failures during model discovery trigger automatic retries:

- **Retry count** (`MODELS_FETCH_RETRIES`): 1 (2 total attempts)
- **Retry delay** (`MODELS_FETCH_RETRY_DELAY_MS`): 1,000 ms base, doubling per attempt (exponential backoff)
- **Scope**: Network errors (timeout, connection refused) and transient 5xx responses (502, 503, 504) are retried. Permanent HTTP errors (4xx, 500, 501) return immediately without retry, falling back to the static catalog.
- **Configurable**: `RemoteModelsOptions` accepts `retries` and `retryDelayMs` overrides for testing.

---

## Error Handling

### Error Classification

Three categories:

- **Invalid key** (401, unauthorized, unauthenticated) — credentials need refresh
- **Rate limited** (429) — temporary throttle
- **Quota exceeded** (403, forbidden) — usage limit reached

### Classification Rule Table

A priority-ordered list of `ClassificationRule` objects, each mapping a set of substrings to an error type. The classifier iterates rules in order, returning the first match. New error types or Google message changes are handled by updating the rule table — the classifier logic stays unchanged.

### Error Pipeline

Filter → Classify → Deliver via `message_end` event handler.

---

## Credential Resolution

### Credential Parser

A composable function that extracts a token from exactly one credential format. Returns a structured `{ token, expires? }` result or `undefined` when the format doesn't match. Each parser owns one format: bare string, `access_token`, nested `token.access_token`, or `agy.access`.

### Parser Chain

An ordered list of parsers evaluated in priority sequence. The first parser to return a non-undefined result wins. Expiry filtering is applied as middleware — expired tokens are discarded and the chain falls through to the next parser. The chain is backed by the `CredentialParser` interface.
