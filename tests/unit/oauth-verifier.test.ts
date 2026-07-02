import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTokenVerifier } from "../../src/oauth-verifier.js";

// ─── createTokenVerifier — retry behavior ───────────────────────────────────

describe("createTokenVerifier", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("verifies token successfully on first attempt", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    const verifier = createTokenVerifier({ fetch, timeoutMs: 1000 });

    const promise = verifier.verify("valid_token");
    await vi.advanceTimersByTimeAsync(0);
    const result = await promise;

    expect(result).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns false when API rejects token (non-retryable)", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false });
    const verifier = createTokenVerifier({ fetch, timeoutMs: 1000 });

    const promise = verifier.verify("bad_token");
    await vi.advanceTimersByTimeAsync(0);
    const result = await promise;

    expect(result).toBe(false);
    // Non-network error — no retry, just return false immediately
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries on transient network error and succeeds on second attempt", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("ECONNRESET"))
      .mockResolvedValueOnce({ ok: true });

    const verifier = createTokenVerifier({
      fetch,
      timeoutMs: 1000,
      retries: 2,
      retryDelayMs: 100,
    });

    const promise = verifier.verify("token");
    // First attempt fails immediately, run timers to trigger retry delay
    await vi.advanceTimersByTimeAsync(0); // first attempt rejection
    await vi.advanceTimersByTimeAsync(100); // retry delay
    await vi.advanceTimersByTimeAsync(0); // second attempt resolves
    const result = await promise;

    expect(result).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retries on AbortError (timeout) and succeeds on retry", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("Aborted", "AbortError"))
      .mockResolvedValueOnce({ ok: true });

    const verifier = createTokenVerifier({
      fetch,
      timeoutMs: 1000,
      retries: 1,
      retryDelayMs: 50,
    });

    const promise = verifier.verify("token");
    await vi.advanceTimersByTimeAsync(0); // first attempt failure
    await vi.advanceTimersByTimeAsync(50); // delay
    await vi.advanceTimersByTimeAsync(0); // second attempt success
    const result = await promise;

    expect(result).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("exhausts retries and returns false after all attempts fail", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("ETIMEDOUT"));
    const verifier = createTokenVerifier({
      fetch,
      timeoutMs: 1000,
      retries: 1,
      retryDelayMs: 50,
    });

    const promise = verifier.verify("doomed_token");
    await vi.advanceTimersByTimeAsync(0); // first attempt
    await vi.advanceTimersByTimeAsync(50); // delay
    await vi.advanceTimersByTimeAsync(0); // second attempt
    const result = await promise;

    expect(result).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-network errors", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("Some parse error"));
    const verifier = createTokenVerifier({
      fetch,
      timeoutMs: 1000,
      retries: 2,
      retryDelayMs: 50,
    });

    const promise = verifier.verify("token");
    await vi.advanceTimersByTimeAsync(0);
    const result = await promise;

    expect(result).toBe(false);
    // Non-transient error — no retry
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("respects exponential backoff: doubles delay per attempt", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("ECONNREFUSED"))
      .mockRejectedValueOnce(new TypeError("ECONNREFUSED"))
      .mockResolvedValueOnce({ ok: true });

    const verifier = createTokenVerifier({
      fetch,
      timeoutMs: 1000,
      retries: 2,
      retryDelayMs: 100,
    });

    const promise = verifier.verify("token");
    await vi.advanceTimersByTimeAsync(0); // 1st fail
    expect(fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100); // 100ms (2^0 * 100)
    await vi.advanceTimersByTimeAsync(0); // 2nd fail
    expect(fetch).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(200); // 200ms (2^1 * 100)
    await vi.advanceTimersByTimeAsync(0); // 3rd success
    expect(fetch).toHaveBeenCalledTimes(3);

    const result = await promise;
    expect(result).toBe(true);
  });

  it("uses custom API base from options", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    const verifier = createTokenVerifier({
      fetch,
      apiBase: "https://custom-api.example.com/v1beta/openai",
    });

    await verifier.verify("token");

    expect(fetch).toHaveBeenCalledWith(
      "https://custom-api.example.com/v1beta/openai/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token",
        }),
      }),
    );
  });
});
