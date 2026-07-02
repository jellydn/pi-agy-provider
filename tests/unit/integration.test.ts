import { describe, it, expect, vi } from "vitest";
import { resolveApiKey, resolveAgyOAuthToken } from "../../src/config-store.js";
import { fetchRemoteModels, resolveModels, MODELS } from "../../src/models.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Build a valid go-keyring-base64 payload for keychain injection. */
function keychainPayload(tokenFields: Record<string, unknown>): string {
  const json = JSON.stringify({ token: tokenFields });
  return `go-keyring-base64:${Buffer.from(json).toString("base64")}`;
}

// ─── Credential resolution pipeline (config-store → auth) ───────────────────

describe("resolveAgyOAuthToken — keychain → agy files chain", () => {
  const freshExpiry = () => new Date(Date.now() + 86_400_000).toISOString();

  it("keychain token wins — files are never consulted", () => {
    // Both keychain and agy files have valid tokens; keychain takes priority.
    // Verify that when keychain returns a token, no file I/O is performed.
    const raw = keychainPayload({
      access_token: "ya29.keychain_wins",
      expiry: freshExpiry(),
    });

    const readFile = vi.fn((p: string) => {
      if (p.includes("antigravity-oauth-token")) return "AQ_file_should_not_use";
      if (p.includes("oauth_creds.json"))
        return JSON.stringify({
          access_token: "AIza_also_should_not_use",
          expiry_date: Date.now() + 86_400_000,
        });
      throw new Error("ENOENT");
    });
    const fileExists = vi.fn(() => true);

    const result = resolveAgyOAuthToken({
      readFile,
      fileExists,
      keychainOptions: { readKeychainPassword: () => raw },
    });

    expect(result).toBe("ya29.keychain_wins");
    expect(readFile).not.toHaveBeenCalled();
    expect(fileExists).not.toHaveBeenCalled();
  });

  it("keychain throws → falls through to antigravity-oauth-token (bare string)", () => {
    // Keychain access fails (e.g. macOS prompt denied, timeout), falls to files
    const readFile = (p: string) => {
      if (p.includes("antigravity-oauth-token")) return "ya29.bare_from_file";
      throw new Error("ENOENT");
    };
    const fileExists = (p: string) => p.includes("antigravity-oauth-token");

    const result = resolveAgyOAuthToken({
      readFile,
      fileExists,
      keychainOptions: {
        readKeychainPassword: () => {
          throw new Error("security: keychain not available");
        },
      },
    });

    expect(result).toBe("ya29.bare_from_file");
  });

  it("keychain malformed base64 → falls through to oauth_creds.json", () => {
    // Keychain returns garbage — base64 decode fails → skip to files
    const futureExpiry = Date.now() + 86_400_000;
    const readFile = (p: string) => {
      if (p.includes("oauth_creds.json"))
        return JSON.stringify({ access_token: "AIza_from_json", expiry_date: futureExpiry });
      throw new Error("ENOENT");
    };
    const fileExists = () => true;

    const result = resolveAgyOAuthToken({
      readFile,
      fileExists,
      keychainOptions: {
        readKeychainPassword: () => "go-keyring-base64:!!!not-valid-base64!!!",
      },
    });

    expect(result).toBe("AIza_from_json");
  });

  it("keychain expired → antigravity expired → oauth_creds fresh", () => {
    // Full fallthrough: keychain expired, first file expired, second file valid
    const raw = keychainPayload({
      access_token: "ya29.keychain_expired",
      expiry: "2020-01-01T00:00:00.000Z",
    });

    const readFile = (p: string) => {
      if (p.includes("antigravity-oauth-token"))
        return JSON.stringify({
          token: {
            access_token: "ya29.file_expired",
            expiry: "2020-01-01T00:00:00.000Z",
          },
        });
      if (p.includes("oauth_creds.json"))
        return JSON.stringify({
          access_token: "AIza_last_resort",
          expiry_date: Date.now() + 86_400_000,
        });
      throw new Error("ENOENT");
    };
    const fileExists = () => true;

    const result = resolveAgyOAuthToken({
      readFile,
      fileExists,
      keychainOptions: { readKeychainPassword: () => raw },
    });

    expect(result).toBe("AIza_last_resort");
  });

  it("all sources exhausted → returns undefined", () => {
    // Keychain throws, no files exist — nothing found
    const result = resolveAgyOAuthToken({
      fileExists: () => false,
      keychainOptions: {
        readKeychainPassword: () => {
          throw new Error("Keychain error");
        },
      },
    });

    expect(result).toBeUndefined();
  });
});

describe("resolveApiKey — provided key → env → agy files chain", () => {
  it("resolves key through full chain: env → agy file", () => {
    // GEMINI_API_KEY wins over everything
    const result = resolveApiKey(undefined, {
      env: { GEMINI_API_KEY: "env_key_wins" },
      readFile: () => JSON.stringify({ access_token: "should_not_use" }),
      fileExists: () => true,
    });
    expect(result).toBe("env_key_wins");
  });

  it("falls through env → agy OAuth → finds token in antigravity file", () => {
    const readFile = (p: string) => {
      if (p.includes("antigravity-oauth-token")) return "ya29.bare_oauth";
      throw new Error("ENOENT");
    };
    const fileExists = (p: string) => p.includes("antigravity-oauth-token");
    const result = resolveApiKey(undefined, { readFile, fileExists });
    expect(result).toBe("ya29.bare_oauth");
  });

  it("falls through all files to antigravity-oauth-token agy.access field", () => {
    const readFile = (p: string) => {
      if (p.includes("antigravity-oauth-token"))
        return JSON.stringify({ agy: { type: "oauth", access: "deeply_nested_key" } });
      throw new Error("ENOENT");
    };
    const fileExists = (p: string) => p.includes("antigravity-oauth-token");
    const result = resolveApiKey(undefined, { readFile, fileExists });
    expect(result).toBe("deeply_nested_key");
  });

  it("provided key wins over env vars and files", () => {
    expect(
      resolveApiKey("AIza_provided", {
        env: { GEMINI_API_KEY: "AIza_gemini", GOOGLE_API_KEY: "AIza_google" },
        readFile: () => JSON.stringify({ access_token: "file_token" }),
        fileExists: () => true,
      }),
    ).toBe("AIza_provided");
  });

  it("GEMINI_API_KEY wins over GOOGLE_API_KEY and files", () => {
    expect(
      resolveApiKey(undefined, {
        env: { GEMINI_API_KEY: "AIza_gemini", GOOGLE_API_KEY: "AIza_google" },
        readFile: () => JSON.stringify({ access_token: "file_token" }),
        fileExists: () => true,
      }),
    ).toBe("AIza_gemini");
  });

  it("GOOGLE_API_KEY works as fallback when GEMINI_API_KEY not set", () => {
    expect(
      resolveApiKey(undefined, {
        env: { GOOGLE_API_KEY: "AIza_google" },
        readFile: () => JSON.stringify({ access_token: "file_token" }),
        fileExists: () => true,
      }),
    ).toBe("AIza_google");
  });

  it("no env vars → falls through to files", () => {
    expect(
      resolveApiKey(undefined, {
        env: {},
        readFile: (p: string) => {
          if (p.includes("antigravity-oauth-token")) return "AQ_file";
          throw new Error("ENOENT");
        },
        fileExists: (p: string) => p.includes("antigravity-oauth-token"),
      }),
    ).toBe("AQ_file");
  });

  it("all sources empty → returns undefined", () => {
    expect(
      resolveApiKey(undefined, {
        env: {},
        readFile: () => JSON.stringify({ other: "value" }),
        fileExists: () => true,
      }),
    ).toBeUndefined();
  });

  it("two file sources: antigravity expired → oauth_creds fresh", () => {
    // No env vars — files are the only source
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

    const result = resolveApiKey(undefined, { readFile, fileExists, env: {} });
    expect(result).toBe("AIza_fresh");
  });
});

// ─── Model discovery pipeline (resolveModels → fetchRemoteModels) ───────────

describe("model discovery pipeline", () => {
  it("resolves remote models and falls back to static on network error", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("ECONNREFUSED"))
      .mockRejectedValueOnce(new TypeError("ETIMEDOUT"));

    const result = await resolveModels("test_key", {
      fetch,
      // Retry once, short delay for test speed
      retries: 1,
      retryDelayMs: 1,
    });

    // Both attempts fail → fall back to static catalog
    expect(result).toEqual(MODELS);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("succeeds on second attempt after transient error", async () => {
    const remoteData = {
      data: [
        {
          id: "gemini-remote-model",
          name: "Remote Gemini",
          context_length: 500_000,
          max_output_tokens: 32_768,
          pricing: {
            prompt: "0.000001",
            completion: "0.000005",
            cached_input: "0.0000001",
          },
          reasoning: true,
        },
      ],
    };

    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("ECONNRESET"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(remoteData), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const result = await resolveModels("test_key", {
      fetch,
      retries: 1,
      retryDelayMs: 1,
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("gemini-remote-model");
    expect(result[0].name).toBe("Remote Gemini");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 4xx HTTP errors", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("Unauthorized", { status: 401 }));

    const result = await resolveModels("test_key", { fetch, retries: 2 });

    // 401 is a permanent client error, should not retry
    expect(result).toEqual(MODELS);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries on 5xx transient server errors", async () => {
    const remoteData = {
      data: [{ id: "gemini-model", name: "Model" }],
    };

    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("Service Unavailable", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(remoteData), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const result = await resolveModels("test_key", {
      fetch,
      retries: 1,
      retryDelayMs: 1,
    });

    expect(result).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("filters non-gemini models from remote response", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: "gemini-3.5-flash", name: "Gemini Flash" },
            { id: "gpt-4", name: "GPT-4" },
            { id: "claude-3", name: "Claude 3" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await resolveModels("test_key", { fetch });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("gemini-3.5-flash");
  });
});

// ─── Fetch retry with AbortController ────────────────────────────────────────

describe("fetchRemoteModels retry behavior", () => {
  it("respects AbortController timeout on each retry attempt", async () => {
    const fetch = vi.fn().mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_, reject) => {
          // Simulate AbortError from the AbortController timeout
          if (init?.signal) {
            const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
            (init.signal as AbortSignal).addEventListener("abort", onAbort, { once: true });
          }
        }),
    );

    const result = await fetchRemoteModels({
      apiKey: "test_key",
      fetch,
      timeoutMs: 1, // Immediate timeout
      retries: 1,
      retryDelayMs: 1,
    });

    expect(result).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("returns remote models without retry on first success", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "gemini-model", name: "Model" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await fetchRemoteModels({ apiKey: "test_key", fetch });

    expect(result).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
