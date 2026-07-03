---
title: "Google OAuth"
type: entity
tags: [external-service, authentication]
updated: 2026-07-03
---

# Google OAuth

Google's OAuth 2.0 token endpoint used for refreshing agy access tokens.

## Endpoint

```
POST https://oauth2.googleapis.com/token
Content-Type: application/x-www-form-urlencoded

client_id=<ANTIGRAVITY_CLIENT_ID>
client_secret=<ANTIGRAVITY_CLIENT_SECRET>
refresh_token=<from Keychain>
grant_type=refresh_token
```

## Response

```json
{
  "access_token": "ya29.a0...",
  "expires_in": 3599,
  "scope": "https://www.googleapis.com/auth/...",
  "token_type": "Bearer"
}
```

The `refresh_token` may be rotated in the response — if present, the new value replaces the old one.

## Related Pages

- [[oauth-token-refresh]]
- [[agy-cli]]
- [[pi-antigravity-oauth-reference]]
