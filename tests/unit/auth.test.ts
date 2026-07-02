import { describe, it, expect } from "vitest";
// resolveApiKey was moved from src/auth.ts to src/config-store.ts (credential medium).
// This test file exercises the full API key resolution chain.
import { resolveApiKey } from "../../src/config-store.js";

describe("resolveApiKey", () => {
  it("returns provided key first", () => {
    expect(resolveApiKey("gemini_provided")).toBe("gemini_provided");
  });

  it("falls back to GEMINI_API_KEY env var", () => {
    expect(resolveApiKey(undefined, { env: { GEMINI_API_KEY: "gemini_env" } })).toBe("gemini_env");
  });

  it("falls back to GOOGLE_API_KEY env var", () => {
    expect(resolveApiKey(undefined, { env: { GOOGLE_API_KEY: "google_env" } })).toBe("google_env");
  });

  it("GEMINI_API_KEY takes priority over GOOGLE_API_KEY", () => {
    expect(
      resolveApiKey(undefined, {
        env: { GEMINI_API_KEY: "gemini_first", GOOGLE_API_KEY: "google_second" },
      }),
    ).toBe("gemini_first");
  });

  it("falls back to agy OAuth token from antigravity-oauth-token", () => {
    const readFile = (p: string) => {
      if (p.includes("antigravity-oauth-token")) return "ya29.oauth_token";
      throw new Error("ENOENT");
    };
    const fileExists = (p: string) => p.includes("antigravity-oauth-token");
    expect(resolveApiKey(undefined, { readFile, fileExists })).toBe("ya29.oauth_token");
  });

  it("falls back to oauth_creds.json access_token", () => {
    const readFile = (p: string) => {
      if (p.includes("oauth_creds.json")) return JSON.stringify({ access_token: "ya29.creds" });
      throw new Error("ENOENT");
    };
    const fileExists = (p: string) => p.includes("oauth_creds.json");
    expect(resolveApiKey(undefined, { readFile, fileExists })).toBe("ya29.creds");
  });

  it("extracts agy string field from credential file", () => {
    const readFile = (p: string) => {
      if (p.includes("antigravity-oauth-token")) return JSON.stringify({ agy: "agy_string_key" });
      throw new Error("ENOENT");
    };
    const fileExists = (p: string) => p.includes("antigravity-oauth-token");
    expect(resolveApiKey(undefined, { readFile, fileExists })).toBe("agy_string_key");
  });

  it("extracts agy.access OAuth object from credential file", () => {
    const readFile = (p: string) => {
      if (p.includes("oauth_creds.json"))
        return JSON.stringify({ agy: { type: "oauth", access: "agy_oauth_access" } });
      throw new Error("ENOENT");
    };
    const fileExists = (p: string) => p.includes("oauth_creds.json");
    expect(resolveApiKey(undefined, { readFile, fileExists })).toBe("agy_oauth_access");
  });

  it("GEMINI_API_KEY env wins over auth files", () => {
    const readFile = () => JSON.stringify({ apiKey: "from_file" });
    const fileExists = () => true;
    expect(
      resolveApiKey(undefined, {
        env: { GEMINI_API_KEY: "env_wins" },
        readFile,
        fileExists,
      }),
    ).toBe("env_wins");
  });

  it("returns undefined when no key is available", () => {
    const readFile = () => {
      throw new Error("ENOENT");
    };
    const fileExists = () => false;
    expect(resolveApiKey(undefined, { readFile, fileExists })).toBeUndefined();
  });

  it("skips credential file with no relevant fields", () => {
    const readFile = () => JSON.stringify({ other: "value" });
    const fileExists = () => true;
    expect(resolveApiKey(undefined, { readFile, fileExists })).toBeUndefined();
  });

  it("extracts bare string token from antigravity-oauth-token file", () => {
    const readFile = (p: string) => {
      if (p.includes("antigravity-oauth-token")) return "ya29.bare_oauth_token";
      throw new Error("ENOENT");
    };
    const fileExists = (p: string) => p.includes("antigravity-oauth-token");
    expect(resolveApiKey(undefined, { readFile, fileExists })).toBe("ya29.bare_oauth_token");
  });
});
