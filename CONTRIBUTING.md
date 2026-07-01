# Contributing to pi-agy-provider

Thanks for your interest in contributing! This guide covers everything you need to get started.

## Dev Setup

```bash
git clone https://github.com/jellydn/pi-agy-provider.git
cd pi-agy-provider
npm install
prek install
```

**Requirements:** Node.js >= 22, npm >= 10.

No build step. Pi loads `.ts` source directly (`tsconfig.json` has `noEmit: true`).

## Commands

| Command                | Purpose                                  |
| ---------------------- | ---------------------------------------- |
| `npm test`             | Run unit tests via Vitest                |
| `npm run test:watch`   | Run tests in watch mode                  |
| `npm run test:e2e`     | E2E smoke tests (needs `GEMINI_API_KEY`) |
| `npm run lint`         | Lint all files with oxlint               |
| `npm run format`       | Auto-format all files with oxfmt         |
| `npm run format:check` | Check formatting without writing         |
| `npm run typecheck`    | TypeScript strict mode check             |

## Coding Conventions

- **Strict mode** — strict null checks, no implicit `any`.
- All exports have JSDoc comments.
- Use `unknown` at I/O boundaries, guarded by type predicates.
- Dependency injection via options objects for all I/O.
- Files under 300 lines.

## Pull Request Process

1. Create a branch from `main`: `feat/description`, `fix/description`.
2. Verify locally: `npm test && npm run typecheck && npm run lint && npm run format:check`.
3. Push and open a PR. CI runs automatically.
4. Squash merge preferred.

## Commit Conventions

Follow [conventional commits](https://www.conventionalcommits.org/):

```text
type(scope): description
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`.
