# Codebase Structure

**Analysis Date:** 2026-07-03

## Directory Layout

```
pi-agy-provider/
├── src/                          # Source code (flat modules, no subdirectories)
│   ├── index.ts                  # Extension entry point — default export
│   ├── models.ts                 # Barrel re-export for model subsystem
│   ├── model-catalog.ts          # Static model definitions + thinking levels
│   ├── model-discovery.ts        # Dynamic model discovery with retry
│   ├── config-store.ts           # Credential resolution (env vars, files, keychain)
│   ├── oauth.ts                  # /login flow, token refresh, API key helpers
│   ├── env.ts                    # Constants, env helpers, URL builders
│   ├── errors.ts                 # Error classification + messages
│   ├── error-handler.ts          # Error surface pipeline (message_end hook)
│   └── utils.ts                  # Type guards (isRecord, stringValue, etc.)
├── tests/
│   ├── unit/                     # Vitest unit tests with DI mocks
│   │   ├── index.test.ts         # Entry point registration tests
│   │   ├── integration.test.ts   # Cross-module pipeline tests
│   │   ├── config-store.test.ts  # Credential resolution tests
│   │   ├── oauth.test.ts         # Login flow tests
│   │   ├── models.test.ts        # Model catalog + discovery tests
│   │   ├── auth.test.ts          # Legacy (pre-consolidation) — kept for coverage
│   │   ├── env.test.ts           # Environment helper tests
│   │   ├── errors.test.ts        # Error classification tests
│   │   ├── error-handler.test.ts # Error handler pipeline tests
│   │   └── utils.test.ts         # Type guard tests
│   ├── type/
│   │   └── contract.ts           # Compile-time function signature check
│   └── e2e/
│       └── smoke.sh              # Shell script: real pi + real API key
├── doc/
│   └── adr/                      # Architecture Decision Records
│       ├── 001-split-models-module.md
│       ├── 002-consolidate-credential-resolution.md
│       └── 003-dependency-injection-for-testability.md
├── .github/workflows/ci.yml      # CI: lint + format check + unit tests + E2E
├── package.json                  # npm metadata, scripts, pi extension config
├── tsconfig.json                 # TypeScript: ES2022, ESNext modules, noEmit
├── vitest.config.ts              # Vitest: tests/**/*.test.ts
├── .oxlintrc.json                # Lint config: typescript + unicorn + import + jest
├── .oxfmtrc.json                 # Formatter config (empty — default rules)
├── prek.toml                     # Pre-commit hooks: trailing-whitespace, oxlint, oxfmt
├── renovate.json                 # Dependency update automation
├── .gitignore                    # node_modules/, dist/, *.tsbuildinfo, .DS_Store
├── .npmignore                    # *.map, dist/, .git/, tests/fixtures, .planning/, doc/
├── AGENTS.md                     # Agent guide for AI assistants
├── CONTEXT.md                    # Domain glossary (ubiquitous language)
├── CONTRIBUTING.md               # Contribution guidelines
├── CHANGELOG.md                  # Release history
├── RELEASE_CHECKLIST.md          # Release process checklist
├── README.md                     # User-facing documentation
└── LICENSE                       # MIT
```

## Directory Purposes

**src/:**

- Purpose: All production source code — a pi extension with flat module organization
- Contains: 10 TypeScript modules, each owning a single responsibility
- Key files: `src/index.ts` (entry), `src/models.ts` (barrel), `src/config-store.ts` (credentials), `src/oauth.ts` (login flow)

**tests/unit/:**

- Purpose: Unit and integration tests using Vitest with dependency injection
- Contains: One test file per source module, plus `integration.test.ts` for cross-module pipelines
- Key files: `tests/unit/index.test.ts` (registration), `tests/unit/integration.test.ts` (end-to-end pipelines)

**tests/type/:**

- Purpose: Compile-time type contract — validates the extension function signature
- Contains: `contract.ts` — type-level assertion, no runtime assertions
- Key files: `tests/type/contract.ts`

**tests/e2e/:**

- Purpose: End-to-end smoke tests against real pi and real Gemini API
- Contains: `smoke.sh` — shell script requiring `GEMINI_API_KEY` env var and globally installed `pi`
- Key files: `tests/e2e/smoke.sh`

**doc/adr/:**

- Purpose: Architecture Decision Records — documented design decisions with context, alternatives, and consequences
- Contains: 3 ADRs covering module splitting, credential consolidation, and DI pattern
- Key files: `doc/adr/001-split-models-module.md`, `doc/adr/002-consolidate-credential-resolution.md`, `doc/adr/003-dependency-injection-for-testability.md`

## Key File Locations

**Entry Points:**

- `src/index.ts`: Extension entry — default export receiving `ExtensionAPI` (loaded by pi runtime)
- `package.json` (`pi.extensions`): pi discovery configuration — `["./src/index.ts"]`

**Configuration:**

- `package.json`: npm metadata, scripts (`test`, `lint`, `format`, `typecheck`, `release`, `pub`), peer dependencies, `pi.extensions`
- `tsconfig.json`: TypeScript strict mode, ES2022 target, ESNext modules, `noEmit: true` (pi loads `.ts` directly)
- `vitest.config.ts`: Test include pattern `tests/**/*.test.ts`
- `.oxlintrc.json`: Lint plugins (typescript, unicorn, oxc, import, jest), test file override for `consistent-function-scoping`
- `.oxfmtrc.json`: Formatter config (empty — no custom ignore patterns needed)
- `prek.toml`: Pre-commit hooks (trailing-whitespace, end-of-file-fixer, check-added-large-files, check-json, check-toml, check-yaml, oxlint, oxfmt)
- `.gitignore`: Ignores `node_modules/`, `dist/`, `*.tsbuildinfo`, `.DS_Store`
- `.npmignore`: Excludes `.map`, `dist/`, `.git/`, test `__snapshots__/` and `fixtures/`, `.planning/`, `doc/`

**Core Logic:**

- `src/model-catalog.ts`: Static model definitions (2 models: Gemini 3.5 Flash, Gemini 3.1 Pro Preview), thinking level maps, shared defaults
- `src/model-discovery.ts`: Remote model discovery from Gemini `/models` endpoint with retry (network errors + 5xx), `gemini-` prefix filter, static fallback
- `src/models.ts`: Barrel re-export preserving stable import path `from "./models.js"`
- `src/config-store.ts`: Full credential resolution — `walkAuthPaths`, `resolveAgyOAuthToken` (keychain → files), `resolveApiKey` (provided → env → files), `resolveKeychainToken` (macOS only)
- `src/oauth.ts`: Login flow — agy token reuse → manual API key paste, `refreshToken` (no-op), `getApiKey` (syncs to process.env)
- `src/env.ts`: Provider constants (`PROVIDER_NAME = "agy"`), env var names, `resolveApiBase`, `sanitizeApiKey`, `buildEndpointUrl`
- `src/errors.ts`: Error classification — pattern matching on lowercased strings, 3 categories + unknown
- `src/error-handler.ts`: Error surface pipeline — filter → classify → deliver via `message_end`
- `src/utils.ts`: Shared type guards (`isRecord`, `stringValue`, `numberValue`, `booleanValue`)

**Testing:**

- `tests/unit/`: 10 test files, one per source module plus integration test
- `tests/type/contract.ts`: TypeScript compile-time assertion
- `tests/e2e/smoke.sh`: Shell-based smoke test

**Documentation:**

- `AGENTS.md`: AI assistant guide with architecture overview, commands, testing, install instructions
- `CONTEXT.md`: Domain glossary — core concepts (agy, pi extension, provider), authentication (static API key, agy OAuth token, credential store, token lifetimes), model lifecycle, error handling
- `README.md`: User-facing install and usage documentation
- `CONTRIBUTING.md`: Contributor setup and guidelines
- `CHANGELOG.md`: Version history
- `RELEASE_CHECKLIST.md`: Release process steps

## Naming Conventions

**Files:**

- `kebab-case.ts`: All source and test files (e.g., `model-catalog.ts`, `error-handler.ts`, `config-store.test.ts`)
- Barrel files: Single-word names for re-export modules (e.g., `models.ts`, `index.ts`)
- ADR files: `NNN-kebab-case-description.md` (e.g., `001-split-models-module.md`)

**Directories:**

- Flat under `src/` — no subdirectories. Each module is a single file.
- `tests/` organized by test type: `unit/`, `type/`, `e2e/`
- `doc/adr/` for Architecture Decision Records
- Hidden config dirs: `.github/workflows/`, `.planning/`

**Symbols:**

- Types: PascalCase (`ThinkingLevel`, `ModelConfig`, `AuthKeyOptions`, `RemoteModelsOptions`)
- Constants: UPPER_SNAKE_CASE for public constants (`MODELS`, `DEFAULT_CONTEXT_WINDOW`, `ENV_API_KEY`), camelCase for private/module-scoped (`geminiPrefix`, `controlCharsRe`)
- Functions: camelCase with verb prefix (`resolveApiKey`, `fetchRemoteModels`, `parseRemoteModel`, `handleGeminiError`, `classifyGeminiError`)
- Exports: Named exports only — no `export default` except the extension entry in `src/index.ts`
- Provider name: lowercase short string (`"agy"`)

**Module IDs:**

- Model IDs use Gemini API model names: `gemini-3.5-flash`, `gemini-3.1-pro-preview`
- pi model references: `agy/<model-id>` (e.g., `agy/gemini-3.5-flash`)

## Where to Add New Code

**New Feature (e.g., new model, new auth source):**

- Primary code: `src/` — add a new module file or extend the relevant existing module
- Tests: `tests/unit/` — one test file per new source module, or extend existing test file
- Update ADR if the change involves an architectural decision: `doc/adr/`

**New Model:**

- Implementation: `src/model-catalog.ts` — add entry to `MODELS` array
- Or if remote-only: no code change needed (discovery automatically picks up new `gemini-*` models)

**New Error Category:**

- Implementation: `src/errors.ts` — add to `GeminiErrorType`, `GEMINI_ERROR_MESSAGES`, and pattern matching in `classifyGeminiError`

**New Credential Source:**

- Implementation: `src/config-store.ts` — add to `walkAuthPaths` chain, `resolveApiKey` priority, and extraction logic
- Tests: `tests/unit/config-store.test.ts`

**Utilities:**

- Shared helpers: `src/utils.ts` — add type guards or small pure functions

## Special Directories

**.planning/:**

- Purpose: AI-generated planning artifacts (architecture maps, task planning)
- Generated: Yes (by AI agents during `codemap` and `focus` workflows)
- Committed: No (listed in `.npmignore`)

**doc/adr/:**

- Purpose: Architecture Decision Records — permanent record of design decisions
- Generated: No (authored by developers)
- Committed: Yes

---

_Structure analysis: 2026-07-03_
