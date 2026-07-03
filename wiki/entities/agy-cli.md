---
title: "agy CLI"
type: entity
tags: [authentication, credential-source, external-tool]
updated: 2026-07-03
---

# agy CLI (Antigravity CLI)

Google's official AI coding agent CLI. Provides access to Gemini and other models through Google's backend.

## Credential Storage

- **macOS Keychain**: agy v1.0.15+ stores OAuth tokens in the macOS Keychain under service name `"gemini"`, account `"antigravity"`, encoded as `go-keyring-base64:<base64-JSON>`. The JSON contains `{token: {access_token, refresh_token, token_type, expiry}, auth_method: "consumer"}`.
- **Legacy files** (pre-v1.0.15): `~/.gemini/antigravity-cli/antigravity-oauth-token` (bare string or JSON), `~/.gemini/oauth_creds.json`.

## OAuth Client

The agy CLI uses the **Antigravity** OAuth client (not the older Gemini CLI/Cloud Code Assist client):

- Client ID: `1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com`
- Token endpoint: `https://oauth2.googleapis.com/token`

## Token Lifetimes

- Access token: ~1 hour
- Refresh token: long-lived, stored in Keychain alongside access_token
- The pi-agy-provider refreshes expired access tokens using the Antigravity client credentials

## How pi-agy-provider Uses It

The provider does NOT shell out to the `agy` binary. Instead, it reads tokens directly from the Keychain via `security find-generic-password -s "gemini" -w` and uses them against the OpenAI-compatible Gemini endpoint.

## Related Pages

- [[macos-keychain]]
- [[google-oauth]]
- [[oauth-token-refresh]]
- [[credential-resolution-chain]]
