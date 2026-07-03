---
title: "Credential Resolution Chain"
type: concept
tags: [authentication, architecture]
updated: 2026-07-03
---

# Credential Resolution Chain

The ordered sequence of credential sources the pi-agy-provider checks when resolving authentication tokens.

## Resolution Order

1. **macOS Keychain** (`resolveKeychainToken`) — agy v1.0.15+ stores `{access_token, refresh_token, expiry}` here. Highest priority.
2. **Legacy agy files** (`walkAuthPaths` + `credentialChain`) — `~/.gemini/antigravity-cli/antigravity-oauth-token` and `~/.gemini/oauth_creds.json`
3. **Environment variables** — `GEMINI_API_KEY` or `GOOGLE_API_KEY`
4. **Manual paste** — User pastes a static API key from [[google-ai-studio]]

## Parser Chain

File-based tokens are parsed by a prioritized chain of format-specific parsers (`src/credential-parsers.ts`):

| Priority | Parser                | Format                                               |
| -------- | --------------------- | ---------------------------------------------------- |
| 1        | `agyFieldParser`      | `{ agy: "token" }` or `{ agy: { access, expires } }` |
| 2        | `nestedTokenParser`   | `{ token: { access_token, expiry } }`                |
| 3        | `topLevelTokenParser` | `{ access_token, expiry_date }`                      |
| 4        | `bareStringParser`    | Raw string token                                     |

Each parser is a self-contained `CredentialParser` behind a shared interface. Expiry filtering is applied as middleware via `withExpiryFilter()`.

## Keychain Token Extraction

`resolveKeychainToken()` (`src/config-store.ts`) shells out to `security find-generic-password -s "gemini" -w` (macOS only, 5s timeout). Parses the `go-keyring-base64:` encoded JSON to extract both `access_token` and `refresh_token`.

**Behavior with expired tokens**: If the access_token is expired but a refresh_token exists, the token is returned anyway so `login()` can attempt an inline refresh via [[oauth-token-refresh]].

## Related Pages

- [[agy-cli]]
- [[macos-keychain]]
- [[oauth-token-refresh]]
- [[google-ai-studio]]
