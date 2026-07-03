# Wiki Log

Append-only chronological record of all wiki operations.

Format: `## [YYYY-MM-DD] <operation> | <title>`

---

## Log

## [2026-07-03] init | pi-agy-provider knowledge wiki

Initialized wiki structure: entities, concepts, sources, overview, index, log.
Domain: pi-agy-provider architecture, authentication, and provider internals.

## [2026-07-03] ingest | pi-antigravity-oauth Reference Implementation

Ingested the @yofriadi/pi-antigravity-oauth extension as a reference for
proper Google OAuth with PKCE, refresh tokens, and project discovery.
Key finding: Antigravity OAuth credentials differ from Gemini CLI credentials.

## [2026-07-03] ingest | Architecture Deepening Review

Ingested the architecture review report covering 4 deepening candidates:
credential parsers, error classification rules, token verifier with retry,
and structured logger. All 4 candidates implemented.

## [2026-07-03] ingest | OAuth Debugging Session

Debugged why agy auto-login wasn't working. Root cause: wrong OAuth client
credentials (Gemini CLI vs Antigravity), expired token rejection, and
missing refresh_token extraction from Keychain.
