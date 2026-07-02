# Coding Conventions

**Analysis Date:** 2026-07-03

## Naming Patterns

**Files:**

- kebab-case for source modules (descriptive noun phrases): `config-store.ts`, `model-catalog.ts`, `error-handler.ts`, `model-discovery.ts`
- Barrel re-exports in `index.ts` (extension entry) and `models.ts`
- No `.spec.ts` — test files use `.test.ts` extension, matched by Vitest `include: ["tests/**/*.test.ts"]`

**Functions:**

- camelCase for all functions: `resolveApiKey()`, `fetchRemoteModels()`, `handleGeminiError()`
- Boolean predicates use `is` prefix: `isRecord()`, `isNetworkError()`, `isTransientHttpError()`, `isExpired()`
- Extractors use descriptive verb-noun: `extractCredential()`, `parseRemoteModel()`, `classifyGeminiError()`
- Type guards return type predicates with `is`-prefixed names

**Variables:**

- camelCase consistently: `apiBase`, `resolvedKey`, `modelIds`
- UPPER_SNAKE_CASE for module-level constants: `MODELS`, `DEFAULT_API_BASE`, `ENV_API_KEY`, `KEYCHAIN_TIMEOUT_MS`, `GEMINI_ERROR_MESSAGES`
- Numeric constants use underscore separators: `1_000_000`, `65_536`, `86_400_000`

**Types:**

- PascalCase for types/interfaces: `ThinkingLevel`, `ModelConfig`, `AuthKeyOptions`, `RemoteModelsOptions`
- Type aliases for unions: `GeminiErrorType = "invalid_key" | "rate_limited" | "quota_exceeded" | "unknown"`
- Interfaces imported as `type` import when only types are used: `import type { ExtensionAPI } from "..."`

## Code Style

**Formatting:**

- Tool: oxfmt (Oxford formatter) v0.57.0
- Config: `.oxfmtrc.json` (minimal — only `ignorePatterns: []`)
- Format command: `oxfmt --write src/ tests/`
- Check command: `oxfmt --check src/ tests/`
- No biome.json, no prettier config — oxfmt is the sole formatter

**Linting:**

- Tool: oxlint v1.71.0 with plugins: `typescript`, `unicorn`, `oxc`, `import`, `jest`
- Config: `.oxlintrc.json`
  - `correctness` category → `error`
  - `suspicious` category → `warn`
  - Override for test files: `unicorn/consistent-function-scoping` is turned off in `tests/**/*.test.ts`
- Env: `builtin: true, node: true`
- Pre-commit hooks via `prek` (prek.toml): oxlint + oxfmt --check + trailing-whitespace, end-of-file-fixer, check-added-large-files, check-json, check-toml, check-yaml

**TypeScript:**

- `tsconfig.json`: `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`, `strict: true`, `noEmit: true`
- No build step — pi loads `.ts` source directly
- All `import`/`export` with explicit `.js` extension (ESM resolution for bundler)
- Type-only imports use `import type { ... }`

## Import Organization

**Order:**

1. Node built-ins: `node:child_process`, `node:fs`, `node:os`, `node:path`
2. External packages: `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`
3. Internal modules (relative `.js`): `./env.js`, `./config-store.js`, `./errors.js`

**Patterns observed in `src/config-store.ts`:**

```typescript
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { isRecord, stringValue } from "./utils.js";
import { ENV_API_KEY, ENV_API_KEY_ALT } from "./env.js";
```

**Path Aliases:**

- No path aliases used — all imports are relative (`./`, `../../`)
- Directory imports use explicit barrel files: `src/models.ts` re-exports from `model-catalog.ts` + `model-discovery.ts`

## Error Handling

**Patterns:**

- **Error classification pattern:** Dedicated `errors.ts` module classifies errors by string-matching against known patterns (HTTP status codes, keywords). Returns typed result `{ type: GeminiErrorType; message: string }`.
- **Error surface pipeline:** `error-handler.ts` implements filter → classify → deliver via `pi.on("message_end")` event. Filters on `stopReason: "error"` + provider match, then delegates to classification.
- **Silent fallback on transient errors:** Network errors (`TypeError`, `AbortError`) and transient HTTP 5xx (502, 503, 504) are retried. All others (4xx, parse errors) fail silently returning `undefined` — the caller falls back to static defaults.
- **Emit vs throw:** Internal functions return `undefined` on failure instead of throwing. The extension entry (`src/index.ts`) catches implicit errors via `resolveModels` fallback. Only the OAuth login flow throws explicitly (`throw new Error("No Gemini API key provided")`).
- **ENOENT suppression:** File walking suppresses "ENOENT" and "not found" errors, warns on other I/O failures, but never throws.
- **Expiry is best-effort:** Malformed/missing expiry values don't block — let the API reject the token rather than falsely discarding it.
- **Context-aware delivery:** `handleGeminiError` checks `ctx.hasUI` — uses `ctx.ui.notify()` when available, `console.error` as fallback.

## Logging

**Framework:** `console` (warn and error — no formal logger library)

**Patterns:**

- All logs prefixed with `[agy]` for source identification
- `console.warn` for warnings: malformed auth files, expired credentials, short API keys
- `console.error` for fallback error delivery when no UI is available
- No `console.log` in production code — only in test assertions
- Warning format: ``console.warn(`[agy] Warning: ...`)``
- Error format: ``console.error(`[agy] ${friendlyMessage}`)``

## Comments

**When to Comment:**

- Module-level JSDoc with `@module` tag on every source file
- Section dividers with Unicode box-drawing characters: `// ─── Section Name ────...`
- Doc comments on all exported functions and interfaces describing purpose, parameters, and behavior
- Inline comments explaining non-obvious logic (e.g., "seed process.env so pi's interpolation picks it up")
- File-level doc comments describing architecture, responsibilities, and data flow

**JSDoc/TSDoc:**

- Used consistently on all exported functions and interfaces
- Module annotation: `@module agy-config-store`
- Parameter documentation: `@param options Auth I/O options (injectable for testing)`
- Return value documentation: `@returns The API key string, or undefined if not found`
- Interface fields have inline `/** ... */` doc comments

**Section Comments:**

```typescript
// ─── Section Name ────────────────────────────────────────────────────────

export function someFunc() { ... }
```

Used to visually group related exports within a single file (constants, types, path resolution, file walking, credential extraction, API key resolution).

## Function Design

**Size:** Small, focused — typically 10-40 lines. Single responsibility per function.

**Parameters:**

- Options objects for injectable I/O dependencies: `AuthKeyOptions`, `RemoteModelsOptions`, `KeychainOptions`
- All I/O fields are optional with sensible production defaults
- Override pattern: `options.readFile ?? defaultReadFile` — testability without runtime impact

**Return Values:**

- Functions that can fail return `undefined` instead of throwing (silent fallback pattern)
- Type guards return `value is Type` predicates
- Async functions use `async/await` consistently, never raw Promises

**Function Patterns:**

```typescript
// I/O injection for testability
export function resolveApiKey(
  providedKey?: string,
  options: AuthKeyOptions = {},
): string | undefined { ... }

// Type guards
export function isRecord(value: unknown): value is Record<string, unknown> { ... }

// Pure classification
export function classifyGeminiError(errorMessage: string): {
  type: GeminiErrorType;
  message: string;
} { ... }
```

## Module Design

**Exports:**

- Named exports exclusively — no `export default` except for the extension entry point (`src/index.ts`)
- Each source module exports its public API surface explicitly
- Internal helpers are not exported (e.g., `isExpired`, `isNetworkError`, `matchesAny`)

**Barrel Files:**

- `src/models.ts` — re-exports from `model-catalog.ts` + `model-discovery.ts` (stable public API surface)
- `src/index.ts` — default export receiving `ExtensionAPI` (extension entry, discovered by pi via `package.json` `"pi": { "extensions": ["./src/index.ts"] }`)

**Module Cohesion:**

- `src/config-store.ts` — all credential medium: file paths, parsing, OAuth extraction, keychain, API key resolution chain
- `src/env.ts` — constants, env helpers, URL builders, input sanitization
- `src/errors.ts` — error classification (pure functions, no I/O)
- `src/error-handler.ts` — error surface pipeline (pi event handler)
- `src/model-catalog.ts` — static model definitions, thinking levels, types
- `src/model-discovery.ts` — dynamic model fetch, retry, parsing
- `src/oauth.ts` — `/login` flow, token verification, credential management
- `src/utils.ts` — shared type guards (`isRecord`, `stringValue`, `numberValue`, `booleanValue`)

---

_Convention analysis: 2026-07-03_
