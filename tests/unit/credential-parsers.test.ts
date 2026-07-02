import { describe, it, expect } from "vitest";
import {
  bareStringParser,
  topLevelTokenParser,
  nestedTokenParser,
  agyFieldParser,
  withExpiryFilter,
  createCredentialChain,
  type CredentialParser,
} from "../../src/credential-parsers.js";

// ─── bareStringParser ────────────────────────────────────────────────────────

describe("bareStringParser", () => {
  it("extracts a non-empty raw string token", () => {
    const result = bareStringParser.parse("ya29.bare_oauth_token");
    expect(result).toEqual({ token: "ya29.bare_oauth_token" });
  });

  it("returns undefined for empty string", () => {
    expect(bareStringParser.parse("")).toBeUndefined();
  });

  it("returns undefined for JSON objects", () => {
    expect(bareStringParser.parse({ access_token: "nope" })).toBeUndefined();
  });

  it("has no expires — bare strings rely on caller lifetime", () => {
    const result = bareStringParser.parse("token");
    expect(result?.expires).toBeUndefined();
  });
});

// ─── topLevelTokenParser ────────────────────────────────────────────────────

describe("topLevelTokenParser", () => {
  it("extracts token from { access_token, expiry_date }", () => {
    const now = Date.now() + 86_400_000;
    const result = topLevelTokenParser.parse({
      access_token: "AIza_top_level",
      expiry_date: now,
    });
    expect(result).toEqual({ token: "AIza_top_level", expires: now });
  });

  it("returns undefined when access_token field is not a string", () => {
    expect(topLevelTokenParser.parse({ access_token: 123 })).toBeUndefined();
    expect(topLevelTokenParser.parse({ access_token: null })).toBeUndefined();
  });

  it("returns undefined for non-object input", () => {
    expect(topLevelTokenParser.parse("raw_string")).toBeUndefined();
  });

  it("preserves missing expiry_date (caller lifetime applies)", () => {
    const result = topLevelTokenParser.parse({ access_token: "token_no_expiry" });
    expect(result).toEqual({ token: "token_no_expiry", expires: undefined });
  });

  it("rejects non-finite expiry_date numbers", () => {
    const result = topLevelTokenParser.parse({
      access_token: "token",
      expiry_date: Number.NaN,
    });
    expect(result).toEqual({ token: "token", expires: undefined });
  });
});

// ─── nestedTokenParser ──────────────────────────────────────────────────────

describe("nestedTokenParser", () => {
  it("extracts token from { token: { access_token, expiry } }", () => {
    const future = "2027-01-01T00:00:00.000Z";
    const result = nestedTokenParser.parse({
      token: { access_token: "ya29.nested", expiry: future },
    });
    expect(result).toEqual({ token: "ya29.nested", expires: Date.parse(future) });
  });

  it("returns undefined when token field is not an object", () => {
    expect(nestedTokenParser.parse({ token: "not_an_object" })).toBeUndefined();
  });

  it("returns undefined when access_token is missing", () => {
    expect(nestedTokenParser.parse({ token: { expiry: "2027-01-01T00:00:00Z" } })).toBeUndefined();
  });

  it("parses ISO 8601 string expiry", () => {
    const result = nestedTokenParser.parse({
      token: { access_token: "t", expiry: "2026-12-15T12:00:00Z" },
    });
    expect(result?.expires).toBe(Date.parse("2026-12-15T12:00:00Z"));
  });

  it("preserves missing expiry (no token.expiry field)", () => {
    const result = nestedTokenParser.parse({
      token: { access_token: "no_expiry" },
    });
    expect(result).toEqual({ token: "no_expiry", expires: undefined });
  });

  it("handles malformed expiry string gracefully", () => {
    const result = nestedTokenParser.parse({
      token: { access_token: "t", expiry: "not-a-date" },
    });
    expect(result).toEqual({ token: "t", expires: undefined });
  });
});

// ─── agyFieldParser ─────────────────────────────────────────────────────────

describe("agyFieldParser", () => {
  it("extracts token from { agy: 'string' }", () => {
    const result = agyFieldParser.parse({ agy: "ai_key_direct" });
    expect(result).toEqual({ token: "ai_key_direct" });
  });

  it("extracts token from { agy: { access, expires } }", () => {
    const future = Date.now() + 86_400_000;
    const result = agyFieldParser.parse({
      agy: { access: "nested_access_key", expires: future },
    });
    expect(result).toEqual({ token: "nested_access_key", expires: future });
  });

  it("extracts token from { agy: { type: 'oauth', access } }", () => {
    // agy auth.json format — extra fields are ignored
    const future = Date.now() + 86_400_000;
    const result = agyFieldParser.parse({
      agy: { type: "oauth", access: "oauth_key", expires: future },
    });
    expect(result).toEqual({ token: "oauth_key", expires: future });
  });

  it("returns undefined for empty agy string", () => {
    expect(agyFieldParser.parse({ agy: "" })).toBeUndefined();
  });

  it("returns undefined when agy field is not a string or object", () => {
    expect(agyFieldParser.parse({ agy: 42 })).toBeUndefined();
    expect(agyFieldParser.parse({ agy: null })).toBeUndefined();
  });

  it("returns undefined when access field is missing from agy object", () => {
    expect(agyFieldParser.parse({ agy: { type: "oauth" } })).toBeUndefined();
  });
});

// ─── withExpiryFilter ───────────────────────────────────────────────────────

describe("withExpiryFilter", () => {
  it("passes through non-expired tokens", () => {
    const parser: CredentialParser = {
      format: "test",
      parse: () => ({ token: "key", expires: Date.now() + 86_400_000 }),
    };
    const filtered = withExpiryFilter(parser);
    expect(filtered.parse({})).toEqual({ token: "key", expires: expect.any(Number) });
  });

  it("filters out expired tokens", () => {
    const parser: CredentialParser = {
      format: "test",
      parse: () => ({ token: "key", expires: Date.now() - 1_000 }),
    };
    const filtered = withExpiryFilter(parser);
    expect(filtered.parse({})).toBeUndefined();
  });

  it("passes through tokens with no expiry (never expires)", () => {
    const parser: CredentialParser = {
      format: "test",
      parse: () => ({ token: "bare_key" }),
    };
    const filtered = withExpiryFilter(parser);
    expect(filtered.parse({})).toEqual({ token: "bare_key" });
  });

  it("passes through undefined results (parser didn't match)", () => {
    const parser: CredentialParser = {
      format: "test",
      parse: () => undefined,
    };
    const filtered = withExpiryFilter(parser);
    expect(filtered.parse({})).toBeUndefined();
  });
});

// ─── createCredentialChain ──────────────────────────────────────────────────

describe("createCredentialChain", () => {
  it("returns first parser's result when multiple match", () => {
    const parserA: CredentialParser = {
      format: "a",
      parse: () => ({ token: "first_wins" }),
    };
    const parserB: CredentialParser = {
      format: "b",
      parse: () => ({ token: "second" }),
    };
    const chain = createCredentialChain([parserA, parserB]);
    expect(chain.parse({})).toEqual({ token: "first_wins" });
  });

  it("falls through to second parser when first returns undefined", () => {
    const parserA: CredentialParser = {
      format: "a",
      parse: () => undefined,
    };
    const parserB: CredentialParser = {
      format: "b",
      parse: () => ({ token: "fallback" }),
    };
    const chain = createCredentialChain([parserA, parserB]);
    expect(chain.parse({})).toEqual({ token: "fallback" });
  });

  it("returns undefined when no parser matches", () => {
    const parserA: CredentialParser = {
      format: "a",
      parse: () => undefined,
    };
    const chain = createCredentialChain([parserA]);
    expect(chain.parse({})).toBeUndefined();
  });

  it("filters expired tokens from chain — falls through to fresh", () => {
    const expired: CredentialParser = {
      format: "expired",
      parse: () => ({ token: "dead", expires: Date.now() - 1_000 }),
    };
    const fresh: CredentialParser = {
      format: "fresh",
      parse: () => ({ token: "alive", expires: Date.now() + 86_400_000 }),
    };
    const chain = createCredentialChain([expired, fresh]);
    expect(chain.parse({})).toEqual({ token: "alive", expires: expect.any(Number) });
  });

  it("chain format label includes all parser names", () => {
    const parserA: CredentialParser = { format: "a", parse: () => undefined };
    const parserB: CredentialParser = { format: "b", parse: () => undefined };
    const chain = createCredentialChain([parserA, parserB]);
    expect(chain.format).toBe("chain(a, b)");
  });
});

// ─── End-to-end: full chain with real parsers ────────────────────────────────

describe("full parser chain", () => {
  const chain = createCredentialChain([
    agyFieldParser,
    nestedTokenParser,
    topLevelTokenParser,
    bareStringParser,
  ]);

  const future = Date.now() + 86_400_000;

  it("agy string field wins over all others", () => {
    const result = chain.parse({
      agy: "agy_wins",
      access_token: "top_level",
      token: { access_token: "nested" },
    });
    expect(result?.token).toBe("agy_wins");
  });

  it("nested token wins over top-level and bare string", () => {
    const result = chain.parse({
      access_token: "top_level",
      token: { access_token: "nested_wins", expiry: new Date(future).toISOString() },
    });
    expect(result?.token).toBe("nested_wins");
  });

  it("top-level access_token used when agy and nested are absent", () => {
    const result = chain.parse({ access_token: "top_wins", expiry_date: future });
    expect(result?.token).toBe("top_wins");
  });

  it("bare string parser used when all JSON formats fail", () => {
    const result = chain.parse("AQ_raw_token");
    expect(result?.token).toBe("AQ_raw_token");
  });

  it("expired nested token → falls through to fresh top-level", () => {
    const result = chain.parse({
      token: { access_token: "dead_nested", expiry: "2020-01-01T00:00:00Z" },
      access_token: "fresh_top",
      expiry_date: future,
    });
    expect(result?.token).toBe("fresh_top");
  });

  it("all formats fail → undefined", () => {
    const result = chain.parse({});
    expect(result).toBeUndefined();
  });
});
