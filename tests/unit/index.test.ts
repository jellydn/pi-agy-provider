import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DEFAULT_API_BASE, ENV_API_KEY, PROVIDER_NAME } from "../../src/env.js";
import { MODELS } from "../../src/models.js";

/** Minimal mock of ExtensionAPI capturing registerProvider + on calls. */
function makeMockPi(): ExtensionAPI & {
  captured: { name: string; config: Record<string, unknown> } | undefined;
  events: Map<string, unknown>;
} {
  const mock = {
    captured: undefined as { name: string; config: Record<string, unknown> } | undefined,
    events: new Map<string, unknown>(),
    registerProvider(name: string, config: Record<string, unknown>) {
      mock.captured = { name, config };
    },
    on(event: string, handler: unknown) {
      mock.events.set(event, handler);
    },
  };
  // The mock object literal doesn't have captured / events directly —
  // they're accessed via closure. We need a type assertion to satisfy
  // the return type.
  return mock as any;
}

describe("provider registration", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Not Found", { status: 404 })));
    delete process.env[ENV_API_KEY];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env[ENV_API_KEY];
  });

  it("uses lazy $GEMINI_API_KEY reference so key is resolved per-request", async () => {
    const fakePi = makeMockPi();

    const mod = await import("../../src/index.js");
    await mod.default(fakePi);

    const captured = fakePi.captured;
    expect(captured).toBeDefined();
    expect(captured!.name).toBe(PROVIDER_NAME);
    expect(captured!.config.baseUrl).toBe(DEFAULT_API_BASE);
    // apiKey should always be the env var reference — pi resolves it per-request
    expect(captured!.config.apiKey).toBe(`$${ENV_API_KEY}`);
    expect(captured!.config.api).toBe("openai-completions");
    expect(captured!.config.authHeader).toBe(true);
  });

  it("seeds process.env when GEMINI_API_KEY is unset but resolveApiKey finds a key", async () => {
    // Simulate a key found in auth.json by setting GOOGLE_API_KEY (checked 3rd)
    process.env.GOOGLE_API_KEY = "found-in-file";
    delete process.env[ENV_API_KEY];

    const fakePi = makeMockPi();
    const mod = await import("../../src/index.js");
    await mod.default(fakePi);

    // Should have seeded GEMINI_API_KEY from the file-based source
    expect(process.env[ENV_API_KEY]).toBe("found-in-file");

    delete process.env.GOOGLE_API_KEY;
  });

  it("does not overwrite GEMINI_API_KEY if user already set it", async () => {
    process.env[ENV_API_KEY] = "user-explicit-key";
    process.env.GOOGLE_API_KEY = "should-be-ignored";

    const fakePi = makeMockPi();
    const mod = await import("../../src/index.js");
    await mod.default(fakePi);

    // User's explicit env var should stay intact
    expect(process.env[ENV_API_KEY]).toBe("user-explicit-key");

    delete process.env.GOOGLE_API_KEY;
  });

  it("registers all static models as fallback when API is unavailable", async () => {
    const fakePi = makeMockPi();

    const mod = await import("../../src/index.js");
    await mod.default(fakePi);

    const models = fakePi.captured!.config.models as Array<Record<string, unknown>>;
    expect(models).toHaveLength(MODELS.length);
    for (let i = 0; i < MODELS.length; i++) {
      expect(models[i].id).toBe(MODELS[i].id);
      expect(models[i].name).toBe(MODELS[i].name);
      expect(models[i].reasoning).toBe(MODELS[i].reasoning);
      expect(models[i].cost).toEqual(MODELS[i].cost);
      expect(models[i].contextWindow).toBe(MODELS[i].contextWindow);
      expect(models[i].maxTokens).toBe(MODELS[i].maxTokens);
      expect(models[i].input).toEqual([...MODELS[i].input]);
      expect(Array.isArray(models[i].input)).toBe(true);
    }
  });

  it("wires oauth with login, refreshToken, and getApiKey", async () => {
    const fakePi = makeMockPi();

    const mod = await import("../../src/index.js");
    await mod.default(fakePi);

    const oauth = fakePi.captured!.config.oauth as Record<string, unknown>;
    expect(oauth.name).toBe("Google Gemini (agy)");
    expect(typeof oauth.login).toBe("function");
    expect(typeof oauth.refreshToken).toBe("function");
    expect(typeof oauth.getApiKey).toBe("function");
  });
});

describe("message_end event registration", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Not Found", { status: 404 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers a message_end event listener", async () => {
    const fakePi = makeMockPi();

    const mod = await import("../../src/index.js");
    await mod.default(fakePi);

    expect(fakePi.events.has("message_end")).toBe(true);
  });
});
