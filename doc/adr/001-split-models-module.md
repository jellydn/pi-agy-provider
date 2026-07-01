# 1. Split models.ts into catalog + discovery with barrel re-export

Date: 2026-07-02

## Status

Accepted

## Context

`src/models.ts` had grown to 206 lines mixing two distinct concerns:

- **Static model definitions**: types (`ThinkingLevel`, `ThinkingLevelMap`, `ModelConfig`), the `MODELS` array, thinking level maps, shared defaults, and `modelIds()` helper.
- **Dynamic model discovery**: `fetchRemoteModels` with retry logic, `parseRemoteModel`, `resolveModels` with static fallback, and `RemoteModelsOptions`.

These concerns have different dependency profiles. The static catalog depends only on local constants; the discovery module depends on `fetch`, `AbortController`, and the network. Testing them together forced discovery tests to mock `fetch` even for catalog-only assertions.

## Decision

Split `src/models.ts` into two focused modules with a thin barrel re-export:

- **`src/model-catalog.ts`** (113 lines): Static model definitions, types, thinking levels, shared defaults. Pure data — no I/O, no side effects.
- **`src/model-discovery.ts`** (128 lines): Dynamic model discovery with retry. All I/O is injectable via `RemoteModelsOptions`.
- **`src/models.ts`** (15 lines down from 206): Barrel re-export preserving the existing public API surface.

The barrel exists so consumers importing from `./models.js` don't break when internal boundaries shift. It re-exports from both modules under a single stable import path.

## Alternatives considered

- **Keep a single file**: Rejected because it mixed pure data definitions with I/O-dependent discovery logic, preventing isolated unit testing of the static catalog.
- **Split without a barrel**: Rejected because it would break the existing import path `from "./models.js"` used by `src/index.ts` and tests. The barrel costs 15 lines and preserves backward compatibility.

## Consequences

### Positive

- **Test isolation**: Catalog tests can run as pure unit tests without mocking `fetch`. Discovery tests stay focused on I/O + retry behavior.
- **Locality**: Each module has a single clear purpose. Static definitions and active I/O logic no longer share a file.
- **Backward compatibility**: The barrel preserves the existing import path `from "./models.js"`. No downstream changes required.

### Negative

- **Module count increased**: Went from 1 module to 3 (catalog, discovery, barrel). The barrel adds 15 lines of indirection.
- **Re-export maintenance**: Adding a new public export requires updating both the source module and the barrel's `export` list.
