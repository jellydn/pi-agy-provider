# Technology Stack

**Analysis Date:** 2026-07-03

## Languages

**Primary:**

- TypeScript 6.0.3 - All source code (`src/`), unit tests (`tests/unit/`), type contract test (`tests/type/`)

**Secondary:**

- Shell (Bash) - E2E smoke tests (`tests/e2e/smoke.sh`)

## Runtime

**Environment:**

- Node.js >= 22 (enforced via `package.json` engines field)

**Package Manager:**

- npm (no yarn/pnpm — `np` config explicitly sets `yarn: false, pnpm: false`)
- Lockfile: `package-lock.json` (379 KB, present and committed)

**Host Runtime:**

- pi coding agent — the extension is loaded by pi at runtime (no standalone execution)
- Entry point: `src/index.ts` (loaded directly by pi, no compilation/build step)

## Frameworks

**Core:**

- None — this is a pi extension, not a standalone application. It implements the `ExtensionAPI` contract from `@earendil-works/pi-coding-agent`.
- pi AI runtime (`@earendil-works/pi-ai` ^0.80.2) — peer dependency providing `OAuthCredentials`, `OAuthLoginCallbacks` types
- pi Coding Agent (`@earendil-works/pi-coding-agent` ^0.80.2) — peer dependency providing `ExtensionAPI` type and `registerProvider()`

**Testing:**

- Vitest 4.1.5 — unit test runner (`tests/unit/*.test.ts`, configured via `vitest.config.ts`)
- Shell (Bash) — E2E smoke tests calling `pi` CLI directly

**Build/Dev:**

- TypeScript 6.0.3 — type checking only (`noEmit: true` in `tsconfig.json`; pi loads `.ts` source directly)
- oxlint 1.71.0 — JavaScript/TypeScript linter (config: `.oxlintrc.json`, plugins: typescript, unicorn, oxc, import, jest)
- oxfmt 0.57.0 — code formatter (config: `.oxfmtrc.json`)
- prek (via `prek.toml`) — pre-commit hooks: trailing-whitespace, end-of-file-fixer, check-added-large-files, check-json, check-toml, check-yaml, oxlint, oxfmt
- bumpp 11.1.0 — automated version bumping for releases (`release:patch`, `release:minor`, `release:major`)
- np 11.2.1 — npm publish tool with release-draft support
- all-contributors-cli 6.26.1 — contributor management

**Dependency Management:**

- Renovate (`renovate.json`) — automated dependency updates, extends `config:recommended`

## Key Dependencies

**Critical (peer dependencies):**

- `@earendil-works/pi-ai` \* — Core pi AI types and OAuth interfaces (types only, no runtime import beyond type annotations)
- `@earendil-works/pi-coding-agent` \* — pi extension API: `ExtensionAPI`, `registerProvider()`, and `message_end` event

**Production dependencies:**

- None — the package has zero runtime `dependencies`. All logic uses Node.js built-in modules (`node:fs`, `node:os`, `node:path`, `node:child_process`, `node:buffer`) and the global `fetch` API.

**Dev-only dependencies (not shipped):**

- `@types/node` 26.0.1 — TypeScript type definitions for Node.js APIs
- Types are isolated: only `@types/node` is referenced in `tsconfig.json` `types`

## Configuration

**TypeScript:**

- `tsconfig.json` — target ES2022, module ESNext, moduleResolution bundler, strict mode, noEmit, ES2022 lib
- Includes: `src/**/*.ts`, `tests/**/*.ts`

**Testing:**

- `vitest.config.ts` — includes pattern: `tests/**/*.test.ts`

**Linting & Formatting:**

- `.oxlintrc.json` — plugins: typescript, unicorn, oxc, import, jest; correctness=error, suspicious=warn; test files disable `unicorn/consistent-function-scoping`
- `.oxfmtrc.json` — default configuration (no ignore patterns)
- `prek.toml` — pre-commit hooks for linting, formatting, and general file hygiene

**CI/CD:**

- `.github/workflows/ci.yml` — GitHub Actions: 4 matrix jobs (Node 22/24 × latest pi / min pi v0.80.2), lint+format only on one cell, typecheck on all, unit tests on all; separate E2E job (manual trigger with `run_e2e` dispatch)

**Dependency Updates:**

- `renovate.json` — extends `config:recommended`

**Package Publishing:**

- `.npmignore` — excludes maps, dist, tsbuildinfo, git files, test snapshots/fixtures, `.planning/`, `doc/`
- `package.json` `files` field — includes `src`, `tests`, `CHANGELOG.md`, `README.md`, `LICENSE`

**pi Extension Config:**

- `package.json` `pi.extensions` — `["./src/index.ts"]` (the entry point pi loads)

**Environment Variables (runtime):**

- `GEMINI_API_KEY` — API key for Google Gemini (primary)
- `GOOGLE_API_KEY` — alternate API key env var (fallback)
- `GEMINI_API_BASE` — override for API endpoint (default: `https://generativelanguage.googleapis.com/v1beta/openai`)

## Platform Requirements

**Development:**

- Node.js >= 22
- npm (for dependency management)
- macOS Keychain access (`security` CLI) for agy OAuth credential reuse (optional; skipped on non-darwin platforms)
- pi coding agent installed globally (for E2E tests only)

**Production:**

- npm registry (published as `pi-agy-provider`)
- Installed via `pi install npm:pi-agy-provider` or `pi install git:github.com/jellydn/pi-agy-provider`
- pi coding agent as the host runtime
- Target: Node.js >= 22 (cross-platform — macOS, Linux; macOS-only keychain integration gracefully degrades)

---

_Stack analysis: 2026-07-03_
