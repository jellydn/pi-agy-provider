---
title: "OAuth Token Refresh"
type: concept
tags: [authentication, oauth, refresh]
updated: 2026-07-03
---

# OAuth Token Refresh

How the pi-agy-provider refreshes expired agy OAuth access tokens.

## Flow

1. `login()` calls `resolveAgyOAuthToken()` → finds Keychain token (may be expired if refresh_token present)
2. Verifies access_token against Gemini `/models` endpoint via `TokenVerifier`
3. If verification fails AND `refresh !== access` (real refresh_token from Keychain):
   - Calls `refreshToken()` with `expires: 0` to force refresh
4. `refreshToken()` POSTs to `https://oauth2.googleapis.com/token`:
   ```
   client_id=ANTIGRAVITY_CLIENT_ID
   client_secret=ANTIGRAVITY_CLIENT_SECRET
   refresh_token=<from Keychain>
   grant_type=refresh_token
   ```
5. Returns new `{ access, refresh, expires }` with fresh access_token (~1 hour) and 5-minute safety buffer

## OAuth Client Credentials

The refresh uses the **Antigravity** public OAuth client credentials (from `src/oauth-credentials.ts`):

- Client ID: `1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com`
- XOR-encoded to bypass GitHub's secret scanner

**Important**: These are NOT user secrets — they are public Pi client credentials. The same credentials are used by the agy CLI itself.

## Failure Cases

| Scenario                            | Behavior                                |
| ----------------------------------- | --------------------------------------- |
| refresh === access (static API key) | Throws — static keys can't be refreshed |
| Google rejects refresh_token        | Throws — pi triggers `/login`           |
| Network error during refresh        | Throws — pi triggers `/login`           |

## Related Pages

- [[credential-resolution-chain]]
- [[agy-cli]]
- [[google-oauth]]
- [[pi-antigravity-oauth-reference]]
