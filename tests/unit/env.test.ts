import { describe, it, expect } from "vitest";
import {
  DEFAULT_API_BASE,
  DEFAULT_ENDPOINT,
  ENV_API_KEY,
  ENV_API_KEY_ALT,
  ENV_API_BASE,
  PROVIDER_NAME,
  PROVIDER_DISPLAY_NAME,
  API_KEY_URL,
  resolveApiBase,
  sanitizeApiKey,
  buildEndpointUrl,
} from "../../src/env.js";

describe("constants", () => {
  it("exports correct provider name", () => {
    expect(PROVIDER_NAME).toBe("agy");
  });

  it("exports correct env var name", () => {
    expect(ENV_API_KEY).toBe("GEMINI_API_KEY");
  });

  it("exports alternate env var name", () => {
    expect(ENV_API_KEY_ALT).toBe("GOOGLE_API_KEY");
  });

  it("exports correct API base override env var", () => {
    expect(ENV_API_BASE).toBe("GEMINI_API_BASE");
  });

  it("exports correct default API base", () => {
    expect(DEFAULT_API_BASE).toBe("https://generativelanguage.googleapis.com/v1beta/openai");
  });

  it("exports correct endpoint path", () => {
    expect(DEFAULT_ENDPOINT).toBe("/chat/completions");
  });

  it("exports display name", () => {
    expect(PROVIDER_DISPLAY_NAME).toBe("Google Gemini (agy)");
  });

  it("exports API key URL", () => {
    expect(API_KEY_URL).toBe("https://aistudio.google.com/apikey");
  });
});

describe("resolveApiBase", () => {
  it("returns default when env not set", () => {
    expect(resolveApiBase({})).toBe(DEFAULT_API_BASE);
  });

  it("returns override from GEMINI_API_BASE", () => {
    expect(resolveApiBase({ GEMINI_API_BASE: "https://custom.example.com" })).toBe(
      "https://custom.example.com",
    );
  });

  it("removes trailing slashes from override", () => {
    expect(resolveApiBase({ GEMINI_API_BASE: "https://custom.example.com/" })).toBe(
      "https://custom.example.com",
    );
  });

  it("removes multiple trailing slashes", () => {
    expect(resolveApiBase({ GEMINI_API_BASE: "https://custom.example.com///" })).toBe(
      "https://custom.example.com",
    );
  });

  it("trims whitespace from override", () => {
    expect(resolveApiBase({ GEMINI_API_BASE: "  https://custom.example.com  " })).toBe(
      "https://custom.example.com",
    );
  });

  it("falls back to default when GEMINI_API_BASE is empty string", () => {
    expect(resolveApiBase({ GEMINI_API_BASE: "" })).toBe(DEFAULT_API_BASE);
  });

  it("falls back to default when GEMINI_API_BASE is whitespace-only", () => {
    expect(resolveApiBase({ GEMINI_API_BASE: "   " })).toBe(DEFAULT_API_BASE);
  });
});

describe("sanitizeApiKey", () => {
  it("trims whitespace", () => {
    expect(sanitizeApiKey("  gemini_test  ")).toBe("gemini_test");
  });

  it("removes terminal paste wrappers", () => {
    const esc = String.fromCharCode(27);
    expect(sanitizeApiKey(`${esc}[200~gemini_test${esc}[201~`)).toBe("gemini_test");
  });

  it("removes control characters", () => {
    expect(sanitizeApiKey("gemini_\x00test")).toBe("gemini_test");
  });

  it("removes DEL (char code 127)", () => {
    expect(sanitizeApiKey("gemini_\x7Ftest")).toBe("gemini_test");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(sanitizeApiKey("   \t\n  ")).toBe("");
  });
});

describe("buildEndpointUrl", () => {
  it("builds the full chat completions URL", () => {
    expect(buildEndpointUrl(DEFAULT_API_BASE)).toBe(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    );
  });

  it("works with a custom base", () => {
    expect(buildEndpointUrl("https://staging.example.com")).toBe(
      "https://staging.example.com/chat/completions",
    );
  });
});
