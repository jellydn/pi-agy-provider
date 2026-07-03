---
title: "macOS Keychain"
type: entity
tags: [credential-store, macos]
updated: 2026-07-03
---

# macOS Keychain

The macOS system credential store where agy CLI v1.0.15+ persists OAuth tokens.

## Access Pattern

The pi-agy-provider accesses the Keychain via:

```bash
security find-generic-password -s "gemini" -w
```

- Service name: `"gemini"`
- Account: `"antigravity"`
- Timeout: 5 seconds (`KEYCHAIN_TIMEOUT_MS`)
- Platform: macOS only (`darwin`)

## Token Format

The raw password is encoded as `go-keyring-base64:<base64-encoded JSON>`. Decoded JSON:

```json
{
  "token": {
    "access_token": "ya29.a0...",
    "refresh_token": "1//0gYN...",
    "token_type": "Bearer",
    "expiry": "2026-07-03T08:07:18+08:00"
  },
  "auth_method": "consumer"
}
```

## Failure Modes

- **Timeout**: macOS permission prompt may delay the first access. 5s timeout tolerates this.
- **Non-macOS**: Returns `undefined` immediately (platform check).
- **Missing token**: Returns `undefined` — falls through to file-based resolution.
- **Malformed base64**: Returns `undefined` — falls through.

## Related Pages

- [[agy-cli]]
- [[credential-resolution-chain]]
- [[oauth-token-refresh]]
