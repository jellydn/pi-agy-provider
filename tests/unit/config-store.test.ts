import { describe, it, expect } from "vitest";
import {
  walkAuthPaths,
  defaultAuthPaths,
  resolveAgyOAuthToken,
  resolveApiKey,
  resolveKeychainToken,
} from "../../src/config-store.js";

describe("defaultAuthPaths", () => {
  it("includes only agy-native credential files (no pi auth.json)", () => {
    const paths = defaultAuthPaths("/home/user");
    expect(paths).toContain("/home/user/.gemini/antigravity-cli/antigravity-oauth-token");
    expect(paths).toContain("/home/user/.gemini/oauth_creds.json");
    expect(paths).toHaveLength(2);
  });
});

describe("walkAuthPaths", () => {
  it("returns the value from the first file that has it", () => {
    const readFile = () => JSON.stringify({ apiKey: "found_key" });
    const fileExists = () => true;
    const result = walkAuthPaths({ readFile, fileExists }, (parsed) => {
      if (typeof parsed === "string") return parsed;
      const key = parsed.apiKey;
      return typeof key === "string" ? key : undefined;
    });
    expect(result).toBe("found_key");
  });

  it("tries paths in order when first lacks the value", () => {
    const calls: string[] = [];
    const readFile = (p: string) => {
      calls.push(p);
      if (p.includes("first")) return JSON.stringify({ name: "first" });
      return JSON.stringify({ apiKey: "found_in_second" });
    };
    const fileExists = () => true;
    const result = walkAuthPaths(
      { readFile, fileExists, authPaths: ["/tmp/first.json", "/tmp/second.json"] },
      (parsed) => {
        if (typeof parsed === "string") return undefined;
        const key = parsed.apiKey;
        return typeof key === "string" ? key : undefined;
      },
    );
    expect(result).toBe("found_in_second");
    expect(calls).toHaveLength(2);
  });

  it("returns undefined when no file has the value", () => {
    const readFile = () => JSON.stringify({ name: "test" });
    const fileExists = () => true;
    const result = walkAuthPaths({ readFile, fileExists }, () => undefined);
    expect(result).toBeUndefined();
  });

  it("returns undefined when no file exists", () => {
    const fileExists = () => false;
    const result = walkAuthPaths({ fileExists }, () => "value");
    expect(result).toBeUndefined();
  });

  it("handles bare string files (non-JSON)", () => {
    const readFile = () => "bare_oauth_token_value";
    const fileExists = () => true;
    const result = walkAuthPaths({ readFile, fileExists }, (parsed) => {
      if (typeof parsed === "string" && parsed.length > 0) return parsed;
      return undefined;
    });
    expect(result).toBe("bare_oauth_token_value");
  });

  it("skips malformed JSON and falls back to raw string", () => {
    const readFile = () => "not json but a token";
    const fileExists = () => true;
    const result = walkAuthPaths({ readFile, fileExists }, (parsed) => {
      if (typeof parsed === "string") return parsed.trim() || undefined;
      return undefined;
    });
    expect(result).toBe("not json but a token");
  });

  it("skips non-object JSON arrays", () => {
    const readFile = () => JSON.stringify(["array"]);
    const fileExists = () => true;
    const result = walkAuthPaths({ readFile, fileExists }, (parsed) => {
      if (typeof parsed === "string") return undefined;
      return undefined;
    });
    expect(result).toBeUndefined();
  });
});

describe("resolveAgyOAuthToken", () => {
  it("returns undefined when no credential files exist", () => {
    const fileExists = () => false;
    expect(resolveAgyOAuthToken({ fileExists, keychainToken: null })).toBeUndefined();
  });

  it("returns undefined when credential files have no token", () => {
    const readFile = () => JSON.stringify({ name: "test" });
    const fileExists = () => true;
    expect(resolveAgyOAuthToken({ readFile, fileExists, keychainToken: null })).toBeUndefined();
  });

  it("returns undefined when files do not contain a valid token", () => {
    const readFile = (p: string) => {
      if (p.includes("antigravity-oauth-token")) return "";
      if (p.includes("oauth_creds.json")) return JSON.stringify({ other: "value" });
      throw new Error("ENOENT");
    };
    const fileExists = () => true;
    expect(resolveAgyOAuthToken({ readFile, fileExists, keychainToken: null })).toBeUndefined();
  });

  it("extracts bare string from antigravity-oauth-token", () => {
    const readFile = (p: string) => {
      if (p.includes("antigravity-oauth-token")) return "AQ_bare_token_string";
      throw new Error("ENOENT");
    };
    const fileExists = (p: string) => p.includes("antigravity-oauth-token");
    const result = resolveAgyOAuthToken({ readFile, fileExists, keychainToken: null });
    expect(result).toEqual({ access: "AQ_bare_token_string", refresh: "AQ_bare_token_string" });
  });

  it("extracts access_token from oauth_creds.json", () => {
    const futureExpiry = Date.now() + 86_400_000;
    const readFile = (p: string) => {
      if (p.includes("oauth_creds.json"))
        return JSON.stringify({
          access_token: "AIza_oauth_token",
          expiry_date: futureExpiry,
        });
      throw new Error("ENOENT");
    };
    const fileExists = () => true;
    const result = resolveAgyOAuthToken({ readFile, fileExists, keychainToken: null });
    expect(result).toEqual({ access: "AIza_oauth_token", refresh: "AIza_oauth_token" });
  });

  it("extracts nested token.access_token from antigravity-oauth-token", () => {
    const readFile = (p: string) => {
      if (p.includes("antigravity-oauth-token"))
        return JSON.stringify({
          token: {
            access_token: "AIza_nested_token",
            expiry: "2099-01-01T00:00:00.000Z",
          },
        });
      throw new Error("ENOENT");
    };
    const fileExists = () => true;
    const result = resolveAgyOAuthToken({ readFile, fileExists, keychainToken: null });
    expect(result).toEqual({ access: "AIza_nested_token", refresh: "AIza_nested_token" });
  });

  it("does NOT extract from auth.json (walks only agy files)", () => {
    const readFile = (p: string) => {
      if (p.includes("auth.json")) return JSON.stringify({ apiKey: "should_not_find_this" });
      throw new Error("ENOENT");
    };
    const fileExists = () => true;
    expect(resolveAgyOAuthToken({ readFile, fileExists, keychainToken: null })).toBeUndefined();
  });

  it("returns undefined for empty string tokens", () => {
    const readFile = () => "";
    const fileExists = () => true;
    expect(resolveAgyOAuthToken({ readFile, fileExists, keychainToken: null })).toBeUndefined();
  });

  it("accepts tokens with missing expiry field", () => {
    const readFile = (p: string) => {
      if (p.includes("oauth_creds.json")) return JSON.stringify({ access_token: "AIza_no_expiry" });
      throw new Error("ENOENT");
    };
    const fileExists = () => true;
    const result = resolveAgyOAuthToken({ readFile, fileExists, keychainToken: null });
    expect(result).toEqual({ access: "AIza_no_expiry", refresh: "AIza_no_expiry" });
  });

  it("skips expired token and falls through to next agy file", () => {
    const readFile = (p: string) => {
      if (p.includes("antigravity-oauth-token"))
        return JSON.stringify({
          token: { access_token: "dead_nested", expiry: "2020-01-01T00:00:00Z" },
        });
      if (p.includes("oauth_creds.json"))
        return JSON.stringify({
          access_token: "AIza_fresh",
          expiry_date: Date.now() + 86_400_000,
        });
      throw new Error("ENOENT");
    };
    const fileExists = () => true;
    const result = resolveAgyOAuthToken({ readFile, fileExists, keychainToken: null });
    expect(result).toEqual({ access: "AIza_fresh", refresh: "AIza_fresh" });
  });

  it("returns undefined when only expired token found", () => {
    const readFile = (p: string) => {
      if (p.includes("oauth_creds.json"))
        return JSON.stringify({ access_token: "dead", expiry_date: 1 });
      throw new Error("ENOENT");
    };
    const fileExists = () => true;
    expect(resolveAgyOAuthToken({ readFile, fileExists, keychainToken: null })).toBeUndefined();
  });

  it("accepts tokens with valid future expiry", () => {
    const futureExpiry = Date.now() + 86_400_000;
    const readFile = (p: string) => {
      if (p.includes("antigravity-oauth-token"))
        return JSON.stringify({
          token: {
            access_token: "AIza_future_token",
            expiry: new Date(futureExpiry).toISOString(),
          },
        });
      throw new Error("ENOENT");
    };
    const fileExists = () => true;
    const result = resolveAgyOAuthToken({ readFile, fileExists, keychainToken: null });
    expect(result).toEqual({ access: "AIza_future_token", refresh: "AIza_future_token" });
  });

  it("handles malformed expiry string by accepting token", () => {
    const readFile = (p: string) => {
      if (p.includes("oauth_creds.json"))
        return JSON.stringify({
          access_token: "AIza_malformed",
          expiry_date: "not-a-date",
        });
      throw new Error("ENOENT");
    };
    const fileExists = () => true;
    const result = resolveAgyOAuthToken({ readFile, fileExists, keychainToken: null });
    expect(result).toEqual({ access: "AIza_malformed", refresh: "AIza_malformed" });
  });

  // ── Keychain (agy v1.0.15+) ─────────────────────────────────────────────

  it("returns keychain token immediately when provided (priority over files)", () => {
    const readFile = (p: string) => {
      if (p.includes("antigravity-oauth-token")) return "AQ_file_token";
      throw new Error("ENOENT");
    };
    const fileExists = () => true;
    const result = resolveAgyOAuthToken({
      readFile,
      fileExists,
      keychainToken: "AQ_keychain_token",
    });
    expect(result).toEqual({ access: "AQ_keychain_token", refresh: "AQ_keychain_token" });
  });

  it("skips keychain when keychainToken is null and falls through to files", () => {
    const readFile = (p: string) => {
      if (p.includes("antigravity-oauth-token")) return "AQ_file_token";
      throw new Error("ENOENT");
    };
    const fileExists = (p: string) => p.includes("antigravity-oauth-token");
    const result = resolveAgyOAuthToken({ readFile, fileExists, keychainToken: null });
    expect(result).toEqual({ access: "AQ_file_token", refresh: "AQ_file_token" });
  });

  it("skips keychain when keychainToken is undefined (explicit)", () => {
    const readFile = (p: string) => {
      if (p.includes("antigravity-oauth-token")) return "AQ_file_token";
      throw new Error("ENOENT");
    };
    const fileExists = (p: string) => p.includes("antigravity-oauth-token");
    const result = resolveAgyOAuthToken({ readFile, fileExists, keychainToken: undefined });
    expect(result).toEqual({ access: "AQ_file_token", refresh: "AQ_file_token" });
  });

  it("passes keychainOptions through to resolveKeychainToken", () => {
    // When keychainToken is NOT set, keychainOptions.readKeychainPassword is used.
    // Build a valid keychain payload and verify it's extracted before checking files.
    const json = JSON.stringify({
      token: { access_token: "ya29.from_keychain_opts", expiry: "2099-01-01T00:00:00.000Z" },
    });
    const raw = `go-keyring-base64:${Buffer.from(json).toString("base64")}`;

    const readFile = (p: string) => {
      if (p.includes("antigravity-oauth-token")) return "AQ_should_not_be_used";
      throw new Error("ENOENT");
    };
    const fileExists = () => true;

    const result = resolveAgyOAuthToken({
      readFile,
      fileExists,
      keychainOptions: { readKeychainPassword: () => raw, platform: "darwin" },
    });
    expect(result?.access).toBe("ya29.from_keychain_opts");
  });
});

describe("resolveKeychainToken", () => {
  /** Build a valid go-keyring-base64 payload with the given token fields. */
  function keychainPayload(tokenFields: Record<string, unknown>): string {
    const json = JSON.stringify({ token: tokenFields });
    return `go-keyring-base64:${Buffer.from(json).toString("base64")}`;
  }

  it("returns access_token from well-formed keychain data", () => {
    const raw = keychainPayload({
      access_token: "ya29.valid_token",
      expiry: "2099-01-01T00:00:00.000Z",
    });
    expect(resolveKeychainToken({ readKeychainPassword: () => raw, platform: "darwin" })).toEqual({
      access: "ya29.valid_token",
      refresh: "ya29.valid_token",
    });
  });

  it("returns undefined on non-darwin platforms", () => {
    const raw = keychainPayload({ access_token: "ya29.token" });
    // Platform is injectable — no global mutation needed
    expect(
      resolveKeychainToken({ readKeychainPassword: () => raw, platform: "linux" }),
    ).toBeUndefined();
  });

  it("returns undefined when password is empty", () => {
    expect(
      resolveKeychainToken({ readKeychainPassword: () => "", platform: "darwin" }),
    ).toBeUndefined();
  });

  it("returns undefined when password lacks go-keyring-base64 prefix", () => {
    expect(
      resolveKeychainToken({ readKeychainPassword: () => "some-other-token", platform: "darwin" }),
    ).toBeUndefined();
  });

  it("returns undefined on malformed base64", () => {
    expect(
      resolveKeychainToken({
        readKeychainPassword: () => "go-keyring-base64:!!!not-base64!!!",
        platform: "darwin",
      }),
    ).toBeUndefined();
  });

  it("returns undefined when base64 decodes to non-object", () => {
    const b64 = Buffer.from('"just a string"').toString("base64");
    expect(
      resolveKeychainToken({
        readKeychainPassword: () => `go-keyring-base64:${b64}`,
        platform: "darwin",
      }),
    ).toBeUndefined();
  });

  it("returns undefined when token field is missing", () => {
    const b64 = Buffer.from(JSON.stringify({ other: "value" })).toString("base64");
    expect(
      resolveKeychainToken({
        readKeychainPassword: () => `go-keyring-base64:${b64}`,
        platform: "darwin",
      }),
    ).toBeUndefined();
  });

  it("returns undefined when token.access_token is missing", () => {
    const raw = keychainPayload({ expiry: "2099-01-01T00:00:00.000Z" });
    expect(
      resolveKeychainToken({ readKeychainPassword: () => raw, platform: "darwin" }),
    ).toBeUndefined();
  });

  it("returns undefined for expired token", () => {
    const raw = keychainPayload({
      access_token: "ya29.expired",
      expiry: "2020-01-01T00:00:00.000Z",
    });
    expect(
      resolveKeychainToken({ readKeychainPassword: () => raw, platform: "darwin" }),
    ).toBeUndefined();
  });

  it("accepts token with valid future expiry", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const raw = keychainPayload({ access_token: "ya29.fresh", expiry: future });
    expect(resolveKeychainToken({ readKeychainPassword: () => raw, platform: "darwin" })).toEqual({
      access: "ya29.fresh",
      refresh: "ya29.fresh",
    });
  });

  it("accepts token with missing expiry field", () => {
    const raw = keychainPayload({ access_token: "ya29.no_expiry" });
    expect(resolveKeychainToken({ readKeychainPassword: () => raw, platform: "darwin" })).toEqual({
      access: "ya29.no_expiry",
      refresh: "ya29.no_expiry",
    });
  });

  it("accepts token with malformed expiry string", () => {
    const raw = keychainPayload({
      access_token: "ya29.bad_expiry",
      expiry: "not-a-date",
    });
    expect(resolveKeychainToken({ readKeychainPassword: () => raw, platform: "darwin" })).toEqual({
      access: "ya29.bad_expiry",
      refresh: "ya29.bad_expiry",
    });
  });

  it("returns undefined when readKeychainPassword throws", () => {
    expect(
      resolveKeychainToken({
        readKeychainPassword: () => {
          throw new Error("Keychain not available");
        },
        platform: "darwin",
      }),
    ).toBeUndefined();
  });

  it("handles real keychain tokens with additional fields", () => {
    // agy stores token_type, refresh_token, etc. alongside access_token
    const raw = keychainPayload({
      access_token: "ya29.full",
      expiry: "2099-01-01T00:00:00.000Z",
      token_type: "Bearer",
      refresh_token: "1//refresh",
      expiry_timestamp: 4070908800,
    });
    expect(resolveKeychainToken({ readKeychainPassword: () => raw, platform: "darwin" })).toEqual({
      access: "ya29.full",
      refresh: "1//refresh",
    });
  });

  // Manual smoke test (macOS only — slow, shells out to security(1)):
  //   expect(() => resolveKeychainToken()).not.toThrow();
});

describe("resolveApiKey", () => {
  it("returns provided key directly", () => {
    expect(resolveApiKey("AIza_provided", {})).toBe("AIza_provided");
  });

  it("prefers GEMINI_API_KEY over GOOGLE_API_KEY when both are set", () => {
    const env = { GEMINI_API_KEY: "AIza_gemini", GOOGLE_API_KEY: "AIza_google" };
    expect(resolveApiKey(undefined, { env })).toBe("AIza_gemini");
  });

  it("returns GEMINI_API_KEY from env", () => {
    const env = { GEMINI_API_KEY: "AIza_env" };
    expect(resolveApiKey(undefined, { env })).toBe("AIza_env");
  });

  it("returns GOOGLE_API_KEY if GEMINI_API_KEY is missing", () => {
    const env = { GOOGLE_API_KEY: "AIza_google" };
    expect(resolveApiKey(undefined, { env })).toBe("AIza_google");
  });

  it("skips expired nested token and falls through to next file", () => {
    const readFile = (p: string) => {
      if (p.includes("antigravity-oauth-token"))
        return JSON.stringify({
          token: { access_token: "dead_nested", expiry: "2020-01-01T00:00:00Z" },
        });
      if (p.includes("oauth_creds.json"))
        return JSON.stringify({
          access_token: "AIza_fresh",
          expiry_date: Date.now() + 86_400_000,
        });
      throw new Error("ENOENT");
    };
    const fileExists = () => true;
    expect(resolveApiKey(undefined, { readFile, fileExists, env: {} })).toBe("AIza_fresh");
  });

  it("skips expired oauth_creds token and continues walk", () => {
    const readFile = (p: string) => {
      if (p.includes("oauth_creds.json"))
        return JSON.stringify({ access_token: "dead_oauth", expiry_date: 1 });
      if (p.includes("antigravity-oauth-token")) return "AIza_bare";
      throw new Error("ENOENT");
    };
    const fileExists = () => true;
    expect(resolveApiKey(undefined, { readFile, fileExists, env: {} })).toBe("AIza_bare");
  });

  it("accepts token with missing expiry field", () => {
    const readFile = (p: string) => {
      if (p.includes("oauth_creds.json")) return JSON.stringify({ access_token: "AIza_no_expiry" });
      throw new Error("ENOENT");
    };
    const fileExists = () => true;
    expect(resolveApiKey(undefined, { readFile, fileExists, env: {} })).toBe("AIza_no_expiry");
  });

  it("accepts token with valid future expiry", () => {
    const futureExpiry = Date.now() + 86_400_000;
    const readFile = (p: string) => {
      if (p.includes("oauth_creds.json"))
        return JSON.stringify({ access_token: "AIza_future", expiry_date: futureExpiry });
      throw new Error("ENOENT");
    };
    const fileExists = () => true;
    expect(resolveApiKey(undefined, { readFile, fileExists, env: {} })).toBe("AIza_future");
  });

  it("extracts nested token.access_token from agy oauth file", () => {
    const readFile = (p: string) => {
      if (p.includes("antigravity-oauth-token"))
        return JSON.stringify({
          token: { access_token: "AIza_nested", expiry: "2099-01-01T00:00:00.000Z" },
        });
      throw new Error("ENOENT");
    };
    const fileExists = () => true;
    expect(resolveApiKey(undefined, { readFile, fileExists, env: {} })).toBe("AIza_nested");
  });

  it("handles bare string token from antigravity-oauth-token", () => {
    const readFile = (p: string) => {
      if (p.includes("antigravity-oauth-token")) return "AIza_bare_string";
      throw new Error("ENOENT");
    };
    const fileExists = () => true;
    expect(resolveApiKey(undefined, { readFile, fileExists, env: {} })).toBe("AIza_bare_string");
  });

  it("returns undefined when no credential source has a valid key", () => {
    const readFile = () => JSON.stringify({ other: "value" });
    const fileExists = () => true;
    expect(resolveApiKey(undefined, { readFile, fileExists, env: {} })).toBeUndefined();
  });
});
