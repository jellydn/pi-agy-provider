import { describe, it, expect } from "vitest";
import { classifyGeminiError, GEMINI_ERROR_MESSAGES } from "../../src/errors.js";

describe("classifyGeminiError", () => {
  it("classifies 401 as invalid_key", () => {
    const result = classifyGeminiError("Request failed with status 401");
    expect(result.type).toBe("invalid_key");
    expect(result.message).toBe(GEMINI_ERROR_MESSAGES.invalid_key);
  });

  it("classifies 'unauthorized' as invalid_key", () => {
    const result = classifyGeminiError("Unauthorized: invalid credentials");
    expect(result.type).toBe("invalid_key");
  });

  it("classifies 'invalid api key' as invalid_key", () => {
    const result = classifyGeminiError("invalid api key provided");
    expect(result.type).toBe("invalid_key");
  });

  it("classifies 'api key not valid' as invalid_key", () => {
    const result = classifyGeminiError("API key not valid. Please pass a valid API key.");
    expect(result.type).toBe("invalid_key");
  });

  it("classifies 429 as rate_limited", () => {
    const result = classifyGeminiError("Request failed with status 429");
    expect(result.type).toBe("rate_limited");
    expect(result.message).toBe(GEMINI_ERROR_MESSAGES.rate_limited);
  });

  it("classifies 'rate limit' as rate_limited", () => {
    const result = classifyGeminiError("rate limit exceeded");
    expect(result.type).toBe("rate_limited");
  });

  it("classifies 'too many requests' as rate_limited", () => {
    const result = classifyGeminiError("Too many requests");
    expect(result.type).toBe("rate_limited");
  });

  it("classifies 403 as quota_exceeded", () => {
    const result = classifyGeminiError("Request failed with status 403");
    expect(result.type).toBe("quota_exceeded");
    expect(result.message).toBe(GEMINI_ERROR_MESSAGES.quota_exceeded);
  });

  it("classifies 'quota' as quota_exceeded", () => {
    const result = classifyGeminiError("Quota exceeded for this resource");
    expect(result.type).toBe("quota_exceeded");
  });

  it("classifies 'forbidden' as quota_exceeded", () => {
    const result = classifyGeminiError("Forbidden: access denied");
    expect(result.type).toBe("quota_exceeded");
  });

  it("classifies unknown errors as unknown", () => {
    const result = classifyGeminiError("Internal server error");
    expect(result.type).toBe("unknown");
    expect(result.message).toBe(GEMINI_ERROR_MESSAGES.unknown);
  });

  it("is case-insensitive", () => {
    const result = classifyGeminiError("FORBIDDEN: Access Denied");
    expect(result.type).toBe("quota_exceeded");
  });

  it("handles empty string", () => {
    const result = classifyGeminiError("");
    expect(result.type).toBe("unknown");
  });
});
