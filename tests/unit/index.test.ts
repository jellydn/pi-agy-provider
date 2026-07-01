import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DEFAULT_API_BASE, ENV_API_KEY, PROVIDER_NAME } from "../../src/env.js";
import { MODELS } from "../../src/models.js";

/** Minimal mock of ExtensionAPI capturing registerProvider + on calls. */
function makeMockPi(): ExtensionAPI & { _captured: { name: string; config: Record<string, unknown> } | undefined; _events: Map<string, unknown> } {
  const mock = {
    _captured: undefined as { name: string; config: Record<string, unknown> } | undefined,
    _events: new Map<string, unknown>(),
    registerProvider(name: string, config: Record<string, unknown>) {
      mock._captured = { name, config };
    },
    on(event: string, handler: unknown) {
      mock._events.set(event, handler);
    },
  };
  // The mock object literal doesn't have _captured / _events directly —
  // they're accessed via closure. We need a type assertion to satisfy
  // the return type.
  return mock as any;
}

describe("provider registration", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Not Found", { status: 404 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers with correct baseUrl, apiKey, and api type", async () => {
    const fakePi = makeMockPi();

    const mod = await import("../../src/index.js");
    await mod.default(fakePi);

    const captured = fakePi._captured;
    expect(captured).toBeDefined();
    expect(captured!.name).toBe(PROVIDER_NAME);
    expect(captured!.config.baseUrl).toBe(DEFAULT_API_BASE);
    expect(captured!.config.apiKey).toBe(`$${ENV_API_KEY}`);
    expect(captured!.config.api).toBe("openai-completions");
    expect(captured!.config.authHeader).toBe(true);
  });

  it("registers all static models as fallback when API is unavailable", async () => {
    const fakePi = makeMockPi();

    const mod = await import("../../src/index.js");
    await mod.default(fakePi);

    const models = fakePi._captured!.config.models as Array<Record<string, unknown>>;
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

    const oauth = fakePi._captured!.config.oauth as Record<string, unknown>;
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

    expect(fakePi._events.has("message_end")).toBe(true);
  });
});
