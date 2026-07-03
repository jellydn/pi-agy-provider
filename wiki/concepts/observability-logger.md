---
title: "Observability Logger"
type: concept
tags: [observability, logging, debugging]
updated: 2026-07-03
---

# Observability Logger

Structured logging interface (`src/logger.ts`) shared by all modules. Replaces ad-hoc `console.warn`/`console.error` calls with a single seam.

## Interface

```typescript
interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}
```

## Adapter Behaviors

| Mode        | Condition                  | debug/info           | warn/error           |
| ----------- | -------------------------- | -------------------- | -------------------- |
| Development | `DEBUG=agy` in env         | → console.debug/info | → console.warn/error |
| Production  | `DEBUG` absent or no `agy` | Suppressed (no-op)   | → console.warn/error |

Format: `[agy] [LEVEL] message {json_data}`

## Consumers

- `src/config-store.ts` — Credential source resolution (`logger.debug`)
- `src/model-discovery.ts` — Remote vs static model discovery (`logger.info`, `logger.debug`)
- `src/error-handler.ts` — Error classification decisions (`logger.debug`)
- `src/oauth.ts` — Token verification, refresh, API key warnings (`logger.debug`, `logger.warn`)

## Related Pages

- [[architecture-deepening]] — Candidate #4 from the review
