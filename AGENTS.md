# pi-agy-provider — Agent Guide

## Identity

pi extension that registers Google Gemini models as a model provider via pi's built-in `openai-completions` streaming. Uses Google's OpenAI-compatible API endpoint. Entry point: `src/index.ts` (default export receiving `ExtensionAPI`). pi discovers it via `package.json` `"pi": { "extensions": ["./src/index.ts"] }`.

## Commands

| Command                 | What it does                                       |
| ----------------------- | -------------------------------------------------- |
| `npm test`              | Unit tests via Vitest                              |
| `npm run test:watch`    | Watch mode                                         |
| `npm run test:e2e`      | E2E smoke tests (requires `GEMINI_API_KEY` + `pi`) |
| `npm run lint`          | Lint all source/test files with oxlint             |
| `npm run format`        | Format all source/test files with oxfmt (in-place) |
| `npm run format:check`  | Check formatting without writing                   |
| `npm run typecheck`     | TypeScript type checking (no emit via tsconfig)    |
| `npm run release`       | Bump version (prompt), commit, tag, push           |
| `npm run release:patch` | Bump patch version, commit, tag, push              |
| `npm run release:minor` | Bump minor version, commit, tag, push              |
| `npm run release:major` | Bump major version, commit, tag, push              |
| `npm run pub`           | Publish to npm (run after `release:*`)             |

`tsconfig.json` has `noEmit: true` — pi loads `.ts` source directly. No build step.

## Architecture

- **`src/index.ts`** — Extension entry. Calls `pi.registerProvider()`, wires models + OAuth + API base + error handler.
- **`src/models.ts`** — Model definitions (Gemini 3.5 Flash, Gemini 3.1 Pro) and dynamic model discovery (`fetchRemoteModels`, `resolveModels` with static fallback).
- **`src/auth.ts`** — API key resolution: GEMINI_API_KEY → GOOGLE_API_KEY → agy OAuth → pi auth.json.
- **`src/config-store.ts`** — Credential store traversal: file path resolution, JSON parsing with ENOENT suppression, agy OAuth token extraction from `~/.gemini/` files.
- **`src/oauth.ts`** — `/login` flow: (1) agy OAuth reuse — detects existing agy CLI credentials; (2) Static API key — browser-assisted manual paste.
- **`src/env.ts`** — Constants and environment helpers (API base, env vars, sanitization, URL builder).
- **`src/errors.ts`** — Error classification (invalid_key, rate_limited, quota_exceeded, unknown).
- **`src/error-handler.ts`** — Error surface pipeline: filter → classify → deliver via `message_end` event.
- **`src/utils.ts`** — Shared type guards (`isRecord`, `stringValue`, `numberValue`, `booleanValue`).

## Testing

- Unit tests in `tests/unit/` use dependency injection (mock `readFile`, `fileExists`, `env`) — no FS or network. `vitest.config.ts` includes `tests/**/*.test.ts`.
- **Type contract test** at `tests/type/contract.ts` validates the extension function signature compiles — run via `npm run typecheck`.
- E2E tests (`tests/e2e/smoke.sh`) run `pi --no-extensions -e <provider_path>` with real API key. Requires `pi` globally installed and `GEMINI_API_KEY` set.
- CI runs lint + format:check only on the `latest / Node 22` matrix cell (not pinned pi version or Node 24). Run them locally before pushing.

## Install

```bash
# From npm
pi install npm:pi-agy-provider

# From git
pi install git:github.com/jellydn/pi-agy-provider

# Or local path
pi install /path/to/pi-agy-provider

# Quick test without installing
pi -e /path/to/pi-agy-provider
```

## Key gotchas

- **Pre-commit hooks via prek** — run `prek install` after cloning, or `prek run --all-files` to check manually.
- **Local dev setup:** `npm install` is sufficient — peer deps are in `devDependencies`.
- Module IDs use the Gemini API model names (e.g. `gemini-3.5-flash`). When invoking pi, use `--model agy/gemini-3.5-flash`.
- `GEMINI_API_BASE` env var overrides the API endpoint (default: `https://generativelanguage.googleapis.com/v1beta/openai`).
- **agy OAuth tokens** are short-lived (~1 hour) and cannot be refreshed without re-running the agy CLI. For long-running sessions, use a static API key from aistudio.google.com.
- `GEMINI_API_KEY` takes priority over `GOOGLE_API_KEY` env var.
- Lint disables `unicorn/consistent-function-scoping` in test files (`.oxlintrc.json` override).
