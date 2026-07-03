---
title: "pi-antigravity-oauth Reference"
type: source
tags: [reference, oauth, pkce]
updated: 2026-07-03
---

# pi-antigravity-oauth Reference Implementation

**Author(s):** Yofriadi Yahya
**Published:** 2025
**Type:** Open-source pi extension
**Original:** https://github.com/yofriadi/pi-extensions/tree/master/packages/pi-antigravity-oauth

## Summary

`@yofriadi/pi-antigravity-oauth` is a pi extension that registers a Google OAuth provider for Antigravity (Gemini 3, Claude, GPT-OSS). Unlike pi-agy-provider (which reuses existing agy CLI tokens), this extension performs its own PKCE OAuth dance against Google: generates code verifier/challenge, starts a local callback HTTP server, opens the auth URL with `access_type=offline` + `prompt=consent` to get refresh tokens, exchanges the code for tokens, and discovers the user's Cloud Code Assist project.

## Key Points

- **PKCE OAuth flow**: Full browser-based OAuth with local callback server on port 51121
- **Refresh token support**: `access_type=offline` + `prompt=consent` ensures a refresh_token is obtained
- **Project discovery**: Loads the user's Cloud Code Assist project or falls back to default
- **XOR-encoded credentials**: Public OAuth client credentials encoded to bypass GitHub secret scanner
- **Two credential sets**: Gemini CLI (Cloud Code Assist) and Antigravity — different clients for different backends

## Entities Mentioned

- [[google-oauth]] — OAuth token endpoint used for refresh
- [[agy-cli]] — The agy CLI uses the Antigravity client, not the Gemini CLI client

## Concepts Introduced or Developed

- [[oauth-token-refresh]] — The `refreshAntigravityToken()` function shows the correct pattern
- [[credential-resolution-chain]] — pi-antigravity-oauth takes a different approach: PKCE dance vs token reuse
- [[architecture-deepening]] — This reference informed the refresh_token extraction and Antigravity credential fix

## Integration with Wiki

This reference was critical in debugging why agy auto-login wasn't working. The key findings:

1. agy tokens in the Keychain contain a `refresh_token` — we needed to extract it
2. The refresh requires the **Antigravity** client credentials, not the Gemini CLI ones
3. The XOR encoding pattern for credentials is safe to use (public Pi credentials, not secrets)
4. The Google OAuth token endpoint format: `POST /token` with `grant_type=refresh_token`

## Notable Quotes

> "The extension runs a standard PKCE OAuth dance against `https://accounts.google.com/o/oauth2/v2/auth`" — README.md

> "Generate a verifier + SHA-256 challenge. Start a local callback HTTP server. Open the auth URL with `access_type=offline` and `prompt=consent` so we get a refresh token." — README.md

## Open Questions

- Could pi-agy-provider adopt a PKCE-based login flow as an alternative to agy CLI token reuse?
- What happens if Google rotates the Antigravity OAuth client credentials?
