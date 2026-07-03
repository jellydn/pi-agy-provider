---
title: "Gemini OpenAI-Compatible Endpoint"
type: entity
tags: [api, gemini]
updated: 2026-07-03
---

# Gemini OpenAI-Compatible Endpoint

Google's OpenAI-compatible API endpoint for Gemini models. Used by pi-agy-provider as the primary model interface.

## URL

```
https://generativelanguage.googleapis.com/v1beta/openai
```

Override via `GEMINI_API_BASE` env var.

## Why OpenAI-Compatible

pi has built-in `openai-completions` streaming support. By pointing at Google's OpenAI-compatible endpoint, the provider gets SSE streaming, tool calls, and usage tracking without custom implementation.

## Authentication

Bearer token in `Authorization` header:

- agy OAuth: `Authorization: Bearer <access_token>`
- Static API key: `Authorization: Bearer AIza...`

pi resolves `$GEMINI_API_KEY` lazily per-request from `process.env`, so credential changes (env var updates, `/login`) are picked up without restart.

## Models Endpoint

`GET /models` — used for:

1. Dynamic model discovery (`src/model-discovery.ts`)
2. Token verification (`src/oauth-verifier.ts` — checks if API accepts the token)

## Related Pages

- [[google-ai-studio]]
- [[model-discovery]]
