# Release Checklist

Follow these steps when cutting a new release of pi-agy-provider.

## 1. Pre-Release Verification

```bash
git status
npm test
npm run typecheck
npm run lint
npm run format:check
prek run --all-files
```

## 2. E2E Smoke Tests

```bash
export GEMINI_API_KEY=your_api_key_here
npm run test:e2e
```

## 3. Update Changelog

Move entries from `[Unreleased]` to a new version section.

## 4. Bump Version & Tag

```bash
npm run release:patch    # 0.1.0 → 0.1.1
npm run release:minor    # 0.1.0 → 0.2.0
npm run release:major    # 0.1.0 → 1.0.0
```

## 5. Publish to npm

```bash
npm run pub
npm view pi-agy-provider version
```

## 6. Post-Release Verification

- [ ] `pi install npm:pi-agy-provider` installs the new version
- [ ] `pi --list-models agy` shows the expected models
- [ ] Quick chat test: `pi --model agy/gemini-3.5-flash -p "Hello"` works
