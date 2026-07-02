import { describe, it, expect } from "vitest";
import {
  classifyGeminiError,
  CLASSIFICATION_RULES,
  GEMINI_ERROR_MESSAGES,
} from "../../src/errors.js";

// ─── Rule table integrity ───────────────────────────────────────────────────

describe("CLASSIFICATION_RULES", () => {
  it("all rule types have corresponding friendly messages", () => {
    for (const rule of CLASSIFICATION_RULES) {
      expect(GEMINI_ERROR_MESSAGES[rule.type]).toBeDefined();
      expect(GEMINI_ERROR_MESSAGES[rule.type]).not.toBe("");
    }
  });

  it("all rules have at least one pattern", () => {
    for (const rule of CLASSIFICATION_RULES) {
      expect(rule.patterns.length).toBeGreaterThan(0);
    }
  });

  it("rules are ordered: invalid_key before rate_limited before quota_exceeded", () => {
    const types = CLASSIFICATION_RULES.map((r) => r.type);
    expect(types).toEqual(["invalid_key", "rate_limited", "quota_exceeded"]);
  });
});

// ─── classifyGeminiError — table-driven rule matching ───────────────────────

describe("classifyGeminiError", () => {
  // ── invalid_key patterns ──

  it.each([
    "401 Unauthorized",
    "unauthenticated: request had invalid credentials",
    "API_KEY_INVALID: The API key is not valid",
    "invalid_api_key",
    "invalid api key",
    "api key not valid. please pass a valid api key",
    "Request is missing required authentication. Expected OAuth 2 access token",
    // Real Google API error format
    '{\n  "error": {\n    "code": 401,\n    "message": "Request had invalid authentication credentials.",\n    "status": "UNAUTHENTICATED"\n  }\n}',
  ])("classifies as invalid_key: %s", (message) => {
    const result = classifyGeminiError(message);
    expect(result.type).toBe("invalid_key");
    expect(result.message).toBe(GEMINI_ERROR_MESSAGES.invalid_key);
  });

  // ── rate_limited patterns ──

  it.each([
    "429 Too Many Requests",
    "rate limit exceeded",
    "too many requests in a short period",
    "RESOURCE_EXHAUSTED: rate_limit exceeded",
    // Real Google rate-limit format
    '{\n  "error": {\n    "code": 429,\n    "message": "Resource has been exhausted (e.g. check quota).",\n    "status": "RESOURCE_EXHAUSTED"\n  }\n}',
  ])("classifies as rate_limited: %s", (message) => {
    const result = classifyGeminiError(message);
    expect(result.type).toBe("rate_limited");
    expect(result.message).toBe(GEMINI_ERROR_MESSAGES.rate_limited);
  });

  // ── quota_exceeded patterns ──

  it.each([
    "403 Forbidden",
    "quota exceeded for this project",
    "permission denied: billing account not active",
    "You exceeded your current quota, please check your plan",
    "User does not have permission to access this resource",
    // Real Google quota/permission format
    '{\n  "error": {\n    "code": 403,\n    "message": "Quota exceeded for quota metric \'requests\' and limit \'Requests per minute\'",\n    "status": "PERMISSION_DENIED"\n  }\n}',
  ])("classifies as quota_exceeded: %s", (message) => {
    const result = classifyGeminiError(message);
    expect(result.type).toBe("quota_exceeded");
    expect(result.message).toBe(GEMINI_ERROR_MESSAGES.quota_exceeded);
  });

  // ── unknown fallback ──

  it.each([
    "500 Internal Server Error",
    "Something went wrong",
    "",
    "The model gemini-x is deprecated",
  ])("falls back to unknown for: %s", (message) => {
    const result = classifyGeminiError(message);
    expect(result.type).toBe("unknown");
    expect(result.message).toBe(GEMINI_ERROR_MESSAGES.unknown);
  });

  // ── priority ordering ──

  it("matches first rule when multiple patterns overlap", () => {
    // "unauthorized quota exceeded" has both "unauthorized" and "quota" —
    // "unauthorized" appears in the first rule (invalid_key), so it should win
    const result = classifyGeminiError("unauthorized: quota exceeded for this key");
    expect(result.type).toBe("invalid_key");
  });
});

// ─── Rule table vs classifier integration ───────────────────────────────────

describe("classifyGeminiError — acceptance", () => {
  it("every rule matches at least one of its own patterns", () => {
    // Verify no rule has patterns that never fire
    for (const rule of CLASSIFICATION_RULES) {
      for (const pattern of rule.patterns) {
        const result = classifyGeminiError(pattern);
        expect(result.type).toBe(rule.type);
      }
    }
  });

  it("every non-unknown rule has patterns that are distinct from others", () => {
    // Check for pattern overlap across adjacent rules
    for (let i = 0; i < CLASSIFICATION_RULES.length; i++) {
      for (let j = i + 1; j < CLASSIFICATION_RULES.length; j++) {
        const ruleA = CLASSIFICATION_RULES[i]!;
        const ruleB = CLASSIFICATION_RULES[j]!;
        const overlap = ruleA.patterns.filter((p) =>
          ruleB.patterns.some((q) => p.includes(q) || q.includes(p)),
        );
        expect(overlap).toEqual([]);
      }
    }
  });
});
