# Testing Patterns

**Analysis Date:** 2026-07-03

## Test Framework

**Runner:**

- Vitest v4.1.5
- Config: `vitest.config.ts`
  ```typescript
  import { defineConfig } from "vitest/config";
  export default defineConfig({
    test: {
      include: ["tests/**/*.test.ts"],
    },
  });
  ```
- No browser environment — all tests run in Node
- ESM modules throughout (`.js` import extensions, `type: "module"` in package.json)

**Assertion Library:**

- Vitest's built-in `expect` (Jest-compatible API)
- Common matchers: `toBe()`, `toEqual()`, `toContain()`, `toHaveLength()`, `toBeGreaterThan()`, `toBeCloseTo()`, `toBeUndefined()`, `toBeDefined()`, `toMatch()`, `toBeNull()`

**Run Commands:**

```bash
npm test              # Run all tests (vitest run)
npm run test:watch    # Watch mode (vitest)
npm run test:e2e      # E2E smoke tests (bash tests/e2e/smoke.sh)
npm run typecheck     # TypeScript type checking including type contract test
```

**Coverage:** Not configured — no coverage thresholds or reports

## Test File Organization

**Location:**

- Unit tests: `tests/unit/` — separate directory from source
- Type contract test: `tests/type/contract.ts` — validates extension signature compiles
- E2E tests: `tests/e2e/smoke.sh` — shell script with real API calls

**Naming:**

- Test files mirror source module names with `.test.ts` suffix
- `tests/unit/config-store.test.ts` ↔ `src/config-store.ts`
- `tests/unit/error-handler.test.ts` ↔ `src/error-handler.ts`
- `tests/unit/models.test.ts` ↔ `src/model-catalog.ts` + `src/model-discovery.ts` (via barrel)

**Structure:**

```
tests/
├── e2e/
│   └── smoke.sh                          # E2E smoke tests (bash script)
├── type/
│   └── contract.ts                       # Type contract test (compile-only)
└── unit/
    ├── auth.test.ts                      # API key resolution chain
    ├── config-store.test.ts              # File walking, OAuth extraction
    ├── env.test.ts                       # Constants, API base, sanitization
    ├── error-handler.test.ts             # Error surface pipeline
    ├── errors.test.ts                    # Error classification
    ├── index.test.ts                     # Provider registration (dynamic import)
    ├── integration.test.ts               # Cross-module integration: keychain→files, env→files, retry
    ├── models.test.ts                    # Model catalog + discovery
    ├── oauth.test.ts                     # Login flow, token verification, refresh
    └── utils.test.ts                     # Type guards
```

## Test Structure

**Suite Organization:**
Tests use nested `describe` blocks by function under test, with `it` for individual cases:

```typescript
import { describe, it, expect } from "vitest";
import { targetFunction } from "../../src/module.js";

describe("targetFunction", () => {
  it("describes a specific behavior", () => {
    // arrange — set up dependencies
    // act — call target function
    // assert — verify result
    expect(result).toBe(expected);
  });
});
```

**Patterns:**

- **Setup pattern:** Inline dependency injection — I/O functions (readFile, fileExists, fetch, env) are passed as options objects. No `beforeEach` for arranging test dependencies (they vary per test). `beforeEach` is used for global stubs (`vi.stubGlobal("fetch", ...)`) when multiple tests share the same mock setup.
- **Teardown pattern:** `afterEach` / `afterAll` used to clean up global state: `vi.unstubAllGlobals()`, `delete process.env[ENV_API_KEY]`
- **Assertion pattern:** Single assertion per test is common, but multiple related assertions on the same result are fine. Focus on one behavior per `it` block.
- **Test naming:** Descriptive sentences: `"extracts access_token from oauth_creds.json"`, `"falls back to static MODELS when fetch fails"`, `"returns undefined for empty string tokens"`

**Async Testing:**

```typescript
it("returns remote models when fetch succeeds", async () => {
  // Use vi.stubGlobal for fetch, vi.fn() for mock functions
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(...);
  const result = await someAsyncFunc();
  expect(result).toEqual(expected);
});
```

## Mocking

**Framework:** Vitest built-in mocking (`vi.fn()`, `vi.mock()`, `vi.spyOn()`, `vi.stubGlobal()`)

**Patterns:**

1. **Dependency injection (preferred):** Pass I/O dependencies as options:

   ```typescript
   const readFile = (p: string) => {
     if (p.includes("oauth_creds.json")) return JSON.stringify({ access_token: "test" });
     throw new Error("ENOENT");
   };
   const fileExists = (p: string) => p.includes("oauth_creds.json");
   expect(resolveApiKey(undefined, { readFile, fileExists })).toBe("test");
   ```

2. **Global stubs:** For APIs without injection points (fetch, process.env):

   ```typescript
   beforeEach(() => {
     vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Not Found", { status: 404 })));
   });
   afterEach(() => {
     vi.unstubAllGlobals();
   });
   ```

3. **Module mocking (vi.mock):** Used sparingly — only when the module has no injection option:

   ```typescript
   const { mockResolveAgyOAuthToken } = vi.hoisted(() => ({
     mockResolveAgyOAuthToken: vi.fn(),
   }));
   vi.mock("../../src/config-store.js", async () => ({
     ...(await vi.importActual<typeof import("../../src/config-store.js")>(
       "../../src/config-store.js",
     )),
     resolveAgyOAuthToken: mockResolveAgyOAuthToken,
   }));
   ```

4. **Spy on console:** For verifying warning/error output:

   ```typescript
   const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
   // ... act ...
   expect(errorSpy).toHaveBeenCalledTimes(1);
   expect(errorSpy.mock.calls[0][0]).toContain("[agy]");
   errorSpy.mockRestore();
   ```

5. **Dynamic import for integration tests:** The index.ts test dynamically imports to test the extension entry:
   ```typescript
   const mod = await import("../../src/index.js");
   await mod.default(fakePi);
   ```

**What to Mock:**

- File system: `readFile`, `fileExists` (filesystem operations)
- Network: `fetch`, `AbortController` signals
- Environment variables: `process.env` (injected via options or direct set/delete)
- OS/platform: `process.platform` (injected via `platform` option)
- Keychain: `readKeychainPassword` (shells out to `security` CLI)
- Console: `console.warn`, `console.error` (side-effect verification)

**What NOT to Mock:**

- Pure functions (type guards, error classification, string manipulation)
- Domain logic (expiry checking, credential extraction, token parsing)
- Static model definitions (tested directly against MODELS array)

## Fixtures and Factories

**Test Data:**

- Inline literals defined within each test — no shared fixture files
- Token strings use descriptive prefixes: `"AIza_env"`, `"ya29.oauth_token"`, `"dead_nested"`, `"AQ_bare_token_string"`
- Helper functions for building test payloads:

```typescript
// Keychain payload builder (integration.test.ts)
function keychainPayload(tokenFields: Record<string, unknown>): string {
  const json = JSON.stringify({ token: tokenFields });
  return `go-keyring-base64:${Buffer.from(json).toString("base64")}`;
}

// Mock context factory (error-handler.test.ts)
function makeUICtx(notifyCalls: { msg: string; type: string }[]): HandlerCtx {
  return {
    hasUI: true,
    ui: { notify: (msg: string, type: string) => notifyCalls.push({ msg, type }) },
    model: { provider: PROVIDER_NAME },
  };
}

// Mock pi factory (index.test.ts)
function makeMockPi(): ExtensionAPI & { ... } { ... }
```

**Location:**

- Test helper functions live at the top of their respective test files
- No separate `__fixtures__` or `test-helpers/` directories
- `vi.hoisted()` for module-level mocks that must be initialized before imports

## Coverage

**Requirements:** No coverage thresholds enforced — coverage is not configured in vitest.config.ts

**No coverage commands are defined** in package.json scripts.

## Test Types

**Unit Tests:**

- Location: `tests/unit/`
- Scope: Single function or module in isolation — all I/O injected
- No filesystem, no network, no `process.env` side-effects
- Dependency injection via options objects is the primary pattern
- Files: `auth.test.ts`, `config-store.test.ts`, `env.test.ts`, `error-handler.test.ts`, `errors.test.ts`, `utils.test.ts`, `models.test.ts`, `oauth.test.ts`

**Integration Tests:**

- Location: `tests/unit/integration.test.ts`
- Scope: Cross-module pipelines — keychain → files chain, env → files chain, retry behavior
- Tests the full resolution chain: `resolveAgyOAuthToken` with all three sources, `resolveApiKey` with env → files fallthrough
- Model discovery pipeline: `resolveModels` → `fetchRemoteModels` with retry on transient errors
- Still uses injection — no real I/O, but tests multiple modules wired together

**E2E Tests:**

- Location: `tests/e2e/smoke.sh` (bash script, not Vitest)
- Scope: Real API calls against Google's Gemini endpoint
- Requires `GEMINI_API_KEY` env var and `pi` on PATH
- Tests: API authentication, model smoke tests (simple math, knowledge), error handling (invalid key, unknown model)
- Timeout: 45 seconds per test
- Color-coded PASS/FAIL output

**Type Contract Test:**

- Location: `tests/type/contract.ts`
- Scope: Validate that the extension function signature matches `ExtensionAPI` type
- Run via `npm run typecheck` (compiled but not executed)
- Pattern:
  ```typescript
  import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
  import extension from "../../src/index.js";
  const contract: (api: ExtensionAPI) => Promise<void> = extension;
  void contract;
  ```

## Common Patterns

**Error Testing:**

```typescript
// Testing thrown errors
await expect(login(callbacks)).rejects.toThrow("No Gemini API key provided");

// Testing fallback to silent undefined
expect(fetchRemoteModels({ apiKey: undefined })).resolves.toBeUndefined();

// Testing classification output
const result = classifyGeminiError("401 Unauthorized");
expect(result.type).toBe("invalid_key");
expect(result.message).toBe(GEMINI_ERROR_MESSAGES.invalid_key);
```

**Side-effect verification:**

```typescript
// Verify console.warn was called
const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
// ... act ...
expect(warnSpy).toHaveBeenCalledTimes(1);
expect(warnSpy.mock.calls[0][0]).toContain("[agy]");
warnSpy.mockRestore();
```

**Mock call counting:**

```typescript
// Verify retry behavior
expect(fetch).toHaveBeenCalledTimes(2); // initial + 1 retry

// Verify priority — no I/O when not needed
expect(readFile).not.toHaveBeenCalled();
expect(fileExists).not.toHaveBeenCalled();
```

**Process env cleanup:**

```typescript
afterEach(() => {
  delete process.env[ENV_API_KEY];
});
```

---

_Testing analysis: 2026-07-03_
