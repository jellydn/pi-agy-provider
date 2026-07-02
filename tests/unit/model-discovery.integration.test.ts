import { describe, it, expect, vi } from "vitest";
import { fetchRemoteModels, resolveModels, MODELS } from "../../src/models.js";

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
