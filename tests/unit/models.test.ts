import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  modelIds,
  MODELS,
  fetchRemoteModels,
  resolveModels,
  NO_THINKING_MAP,
} from "../../src/models.js";

describe("modelIds", () => {
  it("returns all model IDs", () => {
    const ids = modelIds();
    expect(ids).toHaveLength(MODELS.length);
    expect(ids).toContain("gemini-3.5-flash");
    expect(ids).toContain("gemini-3.1-pro-preview");
  });

  it("all IDs start with gemini-", () => {
    for (const id of modelIds()) {
      expect(id.startsWith("gemini-")).toBe(true);
    }
  });
});

describe("MODELS", () => {
  it("has at least one model", () => {
    expect(MODELS.length).toBeGreaterThan(0);
  });

  it("all models have valid cost and context fields", () => {
    for (const m of MODELS) {
      expect(m.cost.input).toBeGreaterThanOrEqual(0);
      expect(m.cost.output).toBeGreaterThanOrEqual(0);
      expect(m.cost.cacheRead).toBeGreaterThanOrEqual(0);
      expect(m.cost.cacheWrite).toBeGreaterThanOrEqual(0);
      expect(m.contextWindow).toBeGreaterThan(0);
      expect(m.maxTokens).toBeGreaterThan(0);
      expect(m.reasoning).toBe(true);
      expect(m.input).toEqual(["text"]);
    }
  });

  it("every model declares all six thinking levels", () => {
    const validLevels = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
    for (const m of MODELS) {
      const map = m.thinkingLevelMap;
      for (const level of validLevels) {
        expect(map).toHaveProperty(level);
        const value = map[level];
        expect(value === null || typeof value === "string").toBe(true);
      }
    }
  });

  it("Gemini 3.5 Flash supports minimal/low/medium/high (off and xhigh unsupported)", () => {
    const model = MODELS.find((m) => m.id === "gemini-3.5-flash")!;
    const map = model.thinkingLevelMap;
    expect(map.off).toBeNull();
    expect(map.minimal).toBe("minimal");
    expect(map.low).toBe("low");
    expect(map.medium).toBe("medium");
    expect(map.high).toBe("high");
    expect(map.xhigh).toBeNull();
  });

  it("Gemini 3.1 Pro supports minimal/low/medium/high (off and xhigh unsupported)", () => {
    const model = MODELS.find((m) => m.id === "gemini-3.1-pro-preview")!;
    const map = model.thinkingLevelMap;
    expect(map.off).toBeNull();
    expect(map.minimal).toBe("minimal");
    expect(map.low).toBe("low");
    expect(map.medium).toBe("medium");
    expect(map.high).toBe("high");
    expect(map.xhigh).toBeNull();
  });

  it("Gemini 3.5 Flash has 1M context window", () => {
    const model = MODELS.find((m) => m.id === "gemini-3.5-flash")!;
    expect(model.contextWindow).toBe(1_000_000);
  });

  it("Gemini 3.1 Pro has 1M context window", () => {
    const model = MODELS.find((m) => m.id === "gemini-3.1-pro-preview")!;
    expect(model.contextWindow).toBe(1_000_000);
  });
});

describe("fetchRemoteModels", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns undefined when no API key is provided", async () => {
    const result = await fetchRemoteModels({ apiKey: undefined });
    expect(result).toBeUndefined();
  });

  it("returns undefined on non-OK response", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("Not Found", { status: 404 }),
    );
    const result = await fetchRemoteModels({ apiKey: "test_key" });
    expect(result).toBeUndefined();
  });

  it("returns undefined on network error", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network error"));
    const result = await fetchRemoteModels({ apiKey: "test_key" });
    expect(result).toBeUndefined();
  });

  it("parses OpenAI-compatible { data: [...] } response", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "gemini-3.5-flash",
              name: "Gemini 3.5 Flash",
              context_length: 1_000_000,
              max_output_tokens: 65_536,
              pricing: { prompt: "0.0000015", completion: "0.000009", cached_input: "0.00000015" },
              reasoning: true,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const result = await fetchRemoteModels({ apiKey: "test_key" });
    expect(result).toHaveLength(1);
    expect(result![0].id).toBe("gemini-3.5-flash");
    expect(result![0].name).toBe("Gemini 3.5 Flash");
    expect(result![0].contextWindow).toBe(1_000_000);
    expect(result![0].cost.input).toBeCloseTo(1.5, 1);
    expect(result![0].cost.output).toBeCloseTo(9.0, 1);
  });

  it("filters out non-gemini models", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash" },
            { id: "gpt-4", name: "GPT-4" },
            { id: "claude-3", name: "Claude 3" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const result = await fetchRemoteModels({ apiKey: "test_key" });
    expect(result).toHaveLength(1);
    expect(result![0].id).toBe("gemini-3.5-flash");
  });

  it("uses static model fallback values for missing fields", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "gemini-3.5-flash" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await fetchRemoteModels({ apiKey: "test_key" });
    expect(result).toHaveLength(1);
    const staticModel = MODELS.find((m) => m.id === "gemini-3.5-flash");
    expect(result![0].contextWindow).toBe(staticModel!.contextWindow);
    expect(result![0].maxTokens).toBe(staticModel!.maxTokens);
  });

  it("uses NO_THINKING_MAP when remote model reports reasoning: false", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ id: "gemini-test-non-reasoning", reasoning: false }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const result = await fetchRemoteModels({ apiKey: "test_key" });
    expect(result).toHaveLength(1);
    expect(result![0].reasoning).toBe(false);
    expect(result![0].thinkingLevelMap).toEqual(NO_THINKING_MAP);
  });

  it("returns undefined for empty model list", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await fetchRemoteModels({ apiKey: "test_key" });
    expect(result).toBeUndefined();
  });
});

describe("resolveModels", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to static MODELS when no API key", async () => {
    const result = await resolveModels(undefined);
    expect(result).toEqual(MODELS);
  });

  it("falls back to static MODELS when fetch fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("Not Found", { status: 404 }),
    );
    const result = await resolveModels("test_key");
    expect(result).toEqual(MODELS);
  });

  it("returns remote models when fetch succeeds", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash Updated" },
            { id: "gemini-new-model", name: "New Gemini Model" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const result = await resolveModels("test_key");
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("gemini-3.5-flash");
    expect(result[0].name).toBe("Gemini 3.5 Flash Updated");
  });
});
