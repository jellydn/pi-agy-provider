import { describe, it, expect, vi } from "vitest";
import { resolveApiKey } from "../../src/auth.js";
import { fetchRemoteModels, resolveModels, MODELS } from "../../src/models.js";

// ─── Credential resolution pipeline (config-store → auth) ───────────────────

describe("credential resolution pipeline", () => {
  it("resolves key through full chain: env → agy file → pi auth.json", () => {
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

  it("falls through all files to auth.json agy.access field", () => {
    const readFile = (p: string) => {
      if (p.includes("auth.json"))
        return JSON.stringify({ agy: { type: "oauth", access: "deeply_nested_key" } });
      throw new Error("ENOENT");
    };
    const fileExists = (p: string) => p.includes("auth.json");
    const result = resolveApiKey(undefined, { readFile, fileExists });
    expect(result).toBe("deeply_nested_key");
  });
});

// ─── Model discovery pipeline (resolveModels → fetchRemoteModels) ───────────

describe("model discovery pipeline", () => {
  it("resolves remote models and falls back to static on network error", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockRejectedValueOnce(new Error("ETIMEDOUT"));

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
      .mockRejectedValueOnce(new Error("ECONNRESET"))
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

  it("does not retry on HTTP error responses", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("Unauthorized", { status: 401 }));

    const result = await resolveModels("test_key", { fetch, retries: 2 });

    // 401 is a permanent error, should not retry
    expect(result).toEqual(MODELS);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry on non-200 HTTP responses", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("Not Found", { status: 404 }));

    const result = await resolveModels("test_key", { fetch, retries: 2 });

    expect(result).toEqual(MODELS);
    expect(fetch).toHaveBeenCalledTimes(1);
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
      new Response(
        JSON.stringify({ data: [{ id: "gemini-model", name: "Model" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await fetchRemoteModels({ apiKey: "test_key", fetch });

    expect(result).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
