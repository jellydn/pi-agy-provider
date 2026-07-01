# 3. Dependency injection for testability (options objects)

Date: 2026-07-02

## Status

Accepted

## Context

The provider interacts with the filesystem (`node:fs`), environment variables (`process.env`), and the network (`fetch`). These are all global side-effect sources that make unit testing difficult.

Common alternatives:

- **Vitest `vi.mock`**: Mock Node.js built-ins and globals per test file.
- **Dependency injection (DI)**: Pass I/O as injectable parameters through options objects.

## Decision

Use dependency injection via options objects (`AuthKeyOptions`, `RemoteModelsOptions`) for all external I/O:

```typescript
export interface AuthKeyOptions {
  env?: Record<string, string | undefined>;
  authPaths?: readonly string[];
  homeDir?: () => string;
  readFile?: (path: string) => string;
  fileExists?: (path: string) => boolean;
}

export interface RemoteModelsOptions {
  apiBase?: string;
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}
```

Every field is optional with a sensible production default (e.g., `readFile` defaults to `readFileSync`, `fetch` defaults to `globalThis.fetch`). Tests inject mocks per call without modifying global state.

This is the pattern used consistently across the codebase and documented in CONTEXT.md and CONVENTIONS.md.

## Consequences

### Positive

- **No global mocking**: Tests don't rely on `vi.mock('node:fs')` or `vi.stubGlobal('fetch')`. Each test controls its own I/O with inline mocks.
- **Explicit dependencies**: Options objects make it clear which functions interact with external systems. Reading a function signature reveals its I/O surface.
- **Parallel-safe**: Tests that inject different mock implementations can run in parallel without interference.

### Negative

- **Boilerplate**: Each function that accepts options must resolve defaults (`options.readFile ?? ((p) => readFileSync(p, 'utf-8'))`). This adds ~5-10 lines per function.
- **Interface surface**: `AuthKeyOptions` has 5 fields, `RemoteModelsOptions` has 6. Options objects grow with the I/O surface.
- **Mock fidelity**: Tests that inject `readFile` must match real-world behavior (e.g., ENOENT errors, JSON format). Simple mocks can miss edge cases caught by integration/E2E tests.

### Mitigations

- Integration tests (`tests/unit/integration.test.ts`) cover the full credential and discovery pipelines with more realistic mocks.
- E2E smoke tests (`tests/e2e/smoke.sh`) run against real `pi` with a real API key.
- Vitest is configured to only match `tests/**/*.test.ts` — type contracts and shell scripts are intentionally excluded from the test runner.
