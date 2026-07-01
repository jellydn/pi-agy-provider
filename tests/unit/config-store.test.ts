import { describe, it, expect } from "vitest";
import { walkAuthPaths, defaultAuthPaths, resolveAgyOAuthToken } from "../../src/config-store.js";

describe("defaultAuthPaths", () => {
  it("includes agy OAuth token, Gemini oauth_creds, and pi auth.json paths", () => {
    const paths = defaultAuthPaths("/home/user");
    expect(paths).toContain("/home/user/.gemini/antigravity-cli/antigravity-oauth-token");
    expect(paths).toContain("/home/user/.gemini/oauth_creds.json");
    expect(paths).toContain("/home/user/.pi/agent/auth.json");
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
  it("extracts bare string token from antigravity-oauth-token file", () => {
    const readFile = (p: string) => {
      if (p.includes("antigravity-oauth-token")) return "ya29.aBcDeFgHiJkL";
      throw new Error("ENOENT");
    };
    const fileExists = (p: string) => p.includes("antigravity-oauth-token");
    expect(resolveAgyOAuthToken({ readFile, fileExists })).toBe("ya29.aBcDeFgHiJkL");
  });

  it("extracts access_token from oauth_creds.json", () => {
    const readFile = (p: string) => {
      if (p.includes("oauth_creds.json")) return JSON.stringify({ access_token: "ya29.token" });
      throw new Error("ENOENT");
    };
    const fileExists = (p: string) => p.includes("oauth_creds.json");
    expect(resolveAgyOAuthToken({ readFile, fileExists })).toBe("ya29.token");
  });

  it("extracts agy field (string) from pi auth.json", () => {
    const readFile = (p: string) => {
      if (p.includes("auth.json")) return JSON.stringify({ agy: "gemini_key_from_pi" });
      throw new Error("ENOENT");
    };
    const fileExists = (p: string) => p.includes("auth.json");
    expect(resolveAgyOAuthToken({ readFile, fileExists })).toBe("gemini_key_from_pi");
  });

  it("extracts agy.access from pi auth.json (OAuth object)", () => {
    const readFile = (p: string) => {
      if (p.includes("auth.json"))
        return JSON.stringify({ agy: { type: "oauth", access: "oauth_access_token" } });
      throw new Error("ENOENT");
    };
    const fileExists = (p: string) => p.includes("auth.json");
    expect(resolveAgyOAuthToken({ readFile, fileExists })).toBe("oauth_access_token");
  });

  it("returns undefined when no credential files exist", () => {
    const fileExists = () => false;
    expect(resolveAgyOAuthToken({ fileExists })).toBeUndefined();
  });

  it("returns undefined when files have no valid token", () => {
    const readFile = () => JSON.stringify({ other_field: "value" });
    const fileExists = () => true;
    expect(resolveAgyOAuthToken({ readFile, fileExists })).toBeUndefined();
  });

  it("returns undefined for empty string token", () => {
    const readFile = () => "   ";
    const fileExists = () => true;
    expect(resolveAgyOAuthToken({ readFile, fileExists })).toBeUndefined();
  });
});
