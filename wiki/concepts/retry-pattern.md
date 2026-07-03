---
title: "Retry Pattern"
type: concept
tags: [utility, resilience, network]
updated: 2026-07-03
---

# Retry Pattern

Shared retry utility (`src/retry.ts`) consolidating bespoke retry loops from model discovery and token verification.

## API

```typescript
retryFetch(url: string, options: RetryOptions): Promise<Response | undefined>
```

## Options

| Option         | Default            | Description                          |
| -------------- | ------------------ | ------------------------------------ |
| `fetch`        | `globalThis.fetch` | Injectable fetch function            |
| `timeoutMs`    | (caller-defined)   | Timeout per attempt                  |
| `maxRetries`   | (caller-defined)   | 0 = no retry                         |
| `retryDelayMs` | (caller-defined)   | Base delay, doubles per attempt      |
| `init`         | undefined          | RequestInit merged into each attempt |

## Transient Error Detection

- **Network errors**: `TypeError` (connection refused, DNS failure)
- **Timeouts**: `DOMException` with name `"AbortError"`
- **HTTP server errors**: 502, 503, 504

Non-transient errors (4xx, 500, 501, parse errors) are terminal — no retry.

## Callers

- `src/model-discovery.ts` — `fetchRemoteModels()` for dynamic model list
- `src/oauth-verifier.ts` — `TokenVerifier.verify()` for token check

## Related Pages

- [[architecture-deepening]] — Motivation for extracting shared retry
