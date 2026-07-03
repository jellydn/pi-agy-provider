---
title: "Google AI Studio"
type: entity
tags: [external-service, api-keys]
updated: 2026-07-03
---

# Google AI Studio

Google's web interface for obtaining Gemini API keys. Used as the fallback authentication method when agy CLI tokens aren't available.

## URL

https://aistudio.google.com/apikey

## API Key Format

Gemini API keys start with `AIza` and are ~39 characters:

```
AIzaSyD-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

These keys are used directly as `Authorization: Bearer <key>` against the [[gemini-openai-endpoint]].

## Lifetime

Effectively permanent (10-year expiry in code, `API_KEY_LIFETIME_MS`).

## Related Pages

- [[credential-resolution-chain]]
- [[gemini-openai-endpoint]]
