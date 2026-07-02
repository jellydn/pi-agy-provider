import { describe, it, expect } from "vitest";
import { walkAuthPaths, defaultAuthPaths, resolveApiKey } from "../../src/config-store.js";

describe("defaultAuthPaths", () => {
  it("includes pi auth.json first, then agy files", () => {
    const paths = defaultAuthPaths("/home/user");
    // auth.json takes priority (user's /login credentials)
    expect(paths[0]).toBe("/home/user/.pi/agent/auth.json");
    expect(paths).toContain("/home/user/.gemini/antigravity-cli/antigravity-oauth-token");
    expect(paths).toContain("/home/user/.gemini/oauth_creds.json");
    expect(paths).toHaveLength(3);
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

  it("extracts apiKey from auth.json (first file checked)", () => {
    const readFile = (p: string) => {
      if (p.includes("auth.json")) return JSON.stringify({ apiKey: "AIza_key_from_auth" });
      throw new Error("ENOENT");
    };
    const fileExists = (p: string) => p.includes("auth.json");
    expect(resolveApiKey(undefined, { readFile, fileExists, env: {} })).toBe("AIza_key_from_auth");
  });

  it("extracts agy.access from auth.json", () => {
    const futureExpires = Date.now() + 86_400_000;
    const readFile = (p: string) => {
      if (p.includes("auth.json"))
        return JSON.stringify({ agy: { access: "AIza_agy_access", expires: futureExpires } });
      throw new Error("ENOENT");
    };
    const fileExists = (p: string) => p.includes("auth.json");
    expect(resolveApiKey(undefined, { readFile, fileExists, env: {} })).toBe("AIza_agy_access");
  });

  it("skips expired agy.access and falls through to next file", () => {
    const readFile = (p: string) => {
      if (p.includes("auth.json"))
        return JSON.stringify({ agy: { access: "dead_token", expires: 1 } });
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
      if (p.includes("auth.json")) return JSON.stringify({});
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
      if (p.includes("auth.json")) return JSON.stringify({});
      if (p.includes("oauth_creds.json")) return JSON.stringify({ access_token: "AIza_no_expiry" });
      throw new Error("ENOENT");
    };
    const fileExists = () => true;
    expect(resolveApiKey(undefined, { readFile, fileExists, env: {} })).toBe("AIza_no_expiry");
  });

  it("accepts token with valid future expiry", () => {
    const futureExpiry = Date.now() + 86_400_000;
    const readFile = (p: string) => {
      if (p.includes("auth.json")) return JSON.stringify({});
      if (p.includes("oauth_creds.json"))
        return JSON.stringify({ access_token: "AIza_future", expiry_date: futureExpiry });
      throw new Error("ENOENT");
    };
    const fileExists = () => true;
    expect(resolveApiKey(undefined, { readFile, fileExists, env: {} })).toBe("AIza_future");
  });

  it("extracts nested token.access_token from agy oauth file", () => {
    const readFile = (p: string) => {
      if (p.includes("auth.json")) return JSON.stringify({});
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
      if (p.includes("auth.json")) return JSON.stringify({});
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
