import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { OAuthCredentials, OAuthLoginCallbacks } from "@earendil-works/pi-ai";
import { login, refreshToken, getApiKey } from "../../src/oauth.js";
import { ENV_API_KEY } from "../../src/env.js";

// ─── Mock resolveAgyOAuthToken from config-store ──────────────────────────

const { mockResolveAgyOAuthToken } = vi.hoisted(() => ({
  mockResolveAgyOAuthToken: vi.fn(),
}));

vi.mock("../../src/config-store.js", async () => ({
  ...(await vi.importActual<typeof import("../../src/config-store.js")>(
    "../../src/config-store.js",
  )),
  resolveAgyOAuthToken: mockResolveAgyOAuthToken,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCallbacks(overrides?: {
  onAuth?: (params: { url: string }) => void;
  onPrompt?: (params: { message: string }) => Promise<string>;
}): OAuthLoginCallbacks {
  return {
    onAuth: overrides?.onAuth ?? vi.fn(),
    onPrompt: overrides?.onPrompt ?? (async () => ""),
    onDeviceCode: vi.fn(),
  } as unknown as OAuthLoginCallbacks;
}

// ─── login — agy OAuth auto-login ────────────────────────────────────────────

describe("login — agy OAuth auto-login", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mockResolveAgyOAuthToken.mockReset();
  });

  it("reuses valid agy OAuth token without prompting user", async () => {
    const token = "AQ_test_token_abcdefghijklmnopqrstuvwxyz";
    mockResolveAgyOAuthToken.mockReturnValue(token);

    // Stub fetch to simulate a successful token verification
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const onAuth = vi.fn();
    const onPrompt = vi.fn();
    const callbacks = makeCallbacks({ onAuth, onPrompt });

    const result = await login(callbacks);

    // Should return the token immediately, no user interaction
    expect(result.access).toBe(token);
    expect(result.refresh).toBe(token);
    expect(onAuth).not.toHaveBeenCalled();
    expect(onPrompt).not.toHaveBeenCalled();
  });

  it("falls back to manual API key paste when agy token fails verification", async () => {
    const token = "dead_token";
    mockResolveAgyOAuthToken.mockReturnValue(token);

    // Stub fetch to simulate failed token verification
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    const onAuth = vi.fn();
    const callbacks = makeCallbacks({
      onAuth,
      onPrompt: async () => "AIzaSyD_fallback_key_12345678901234567890",
    });

    const result = await login(callbacks);

    // Should fall through to the manual API key flow
    expect(result.access).toBe("AIzaSyD_fallback_key_12345678901234567890");
    expect(onAuth).toHaveBeenCalledWith({
      url: "https://aistudio.google.com/apikey",
    });
  });

  it("falls back to manual prompt when verifyToken fetch throws", async () => {
    const token = "network_error_token";
    mockResolveAgyOAuthToken.mockReturnValue(token);

    // Stub fetch to throw (network error)
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const onAuth = vi.fn();
    const callbacks = makeCallbacks({
      onAuth,
      onPrompt: async () => "AIzaSyD_after_error_key_12345678901234",
    });

    const result = await login(callbacks);

    expect(result.access).toBe("AIzaSyD_after_error_key_12345678901234");
    expect(onAuth).toHaveBeenCalled();
  });
});

// ─── login — manual API key flow ─────────────────────────────────────────────

describe("login — manual API key flow", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mockResolveAgyOAuthToken.mockReset();
    mockResolveAgyOAuthToken.mockReturnValue(undefined);
  });

  it("opens AI Studio and prompts for API key", async () => {
    const onAuth = vi.fn();
    const callbacks = makeCallbacks({
      onAuth,
      onPrompt: async () => "AIzaSyD_authkey_abcdefghijklmnopqrstuvwxyz1234",
    });

    const result = await login(callbacks);

    expect(onAuth).toHaveBeenCalledWith({
      url: "https://aistudio.google.com/apikey",
    });
    expect(result.access).toBe("AIzaSyD_authkey_abcdefghijklmnopqrstuvwxyz1234");
    expect(result.refresh).toBe("AIzaSyD_authkey_abcdefghijklmnopqrstuvwxyz1234");
    expect(result.expires).toBeGreaterThan(Date.now());
  });

  it("throws on empty API key", async () => {
    const callbacks = makeCallbacks({ onPrompt: async () => "" });

    await expect(login(callbacks)).rejects.toThrow("No Gemini API key provided");
  });

  it("trims whitespace from pasted API key", async () => {
    const callbacks = makeCallbacks({
      onPrompt: async () => "  AIzaSyD_key_with_spaces_12345678  ",
    });

    const result = await login(callbacks);

    expect(result.access).toBe("AIzaSyD_key_with_spaces_12345678");
  });

  it("warns on unusually short API key (< 20 chars)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const callbacks = makeCallbacks({
      onPrompt: async () => "short_key_123",
    });

    await login(callbacks);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("[agy]");
    expect(warnSpy.mock.calls[0][0]).toContain("unusually short");
    expect(warnSpy.mock.calls[0][0]).toContain("13 chars");
    warnSpy.mockRestore();
  });

  it("does not warn on API key >= 20 chars", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const callbacks = makeCallbacks({
      onPrompt: async () => "abcdefghij1234567890",
    });

    await login(callbacks);

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("removes terminal paste wrappers from pasted key", async () => {
    const esc = String.fromCharCode(27);
    const pastedKey = `${esc}[200~AIzaSyD_paste_key_123456${esc}[201~`;
    const callbacks = makeCallbacks({ onPrompt: async () => pastedKey });

    const result = await login(callbacks);

    expect(result.access).toBe("AIzaSyD_paste_key_123456");
  });
});

// ─── refreshToken ───────────────────────────────────────────────────────────

describe("refreshToken", () => {
  it("returns credentials as-is (no-op)", async () => {
    const cred: OAuthCredentials = {
      access: "AIzaSyD_static_key_abc123",
      refresh: "AIzaSyD_static_key_abc123",
      expires: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
    };

    const result = await refreshToken(cred);

    expect(result.access).toBe("AIzaSyD_static_key_abc123");
    expect(result.refresh).toBe("AIzaSyD_static_key_abc123");
  });

  it("returns credentials even when expired", async () => {
    const cred: OAuthCredentials = {
      access: "AIzaSyD_expired_key",
      refresh: "AIzaSyD_expired_key",
      expires: Date.now() - 1000,
    };

    const result = await refreshToken(cred);

    expect(result.access).toBe("AIzaSyD_expired_key");
    expect(result).toEqual(cred);
  });

  it("warns when credentials are expired", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cred: OAuthCredentials = {
      access: "AIzaSyD_expired_key",
      refresh: "AIzaSyD_expired_key",
      expires: Date.now() - 1000,
    };

    await refreshToken(cred);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("[agy]");
    expect(warnSpy.mock.calls[0][0]).toContain("expired");
    warnSpy.mockRestore();
  });
});

// ─── getApiKey ──────────────────────────────────────────────────────────────

describe("getApiKey", () => {
  afterEach(() => {
    delete process.env[ENV_API_KEY];
  });

  it("returns the access token from credentials", () => {
    const cred: OAuthCredentials = {
      access: "AIzaSyD_static_key",
      refresh: "AIzaSyD_static_key",
      expires: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
    };
    expect(getApiKey(cred)).toBe("AIzaSyD_static_key");
  });

  it("syncs process.env so /login credential changes take effect immediately", () => {
    delete process.env[ENV_API_KEY];

    const cred: OAuthCredentials = {
      access: "AIzaSyD_new_key_from_login",
      refresh: "AIzaSyD_new_key_from_login",
      expires: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
    };

    getApiKey(cred);

    // After getApiKey is called (post-/login), pi's $GEMINI_API_KEY
    // interpolation should resolve to the new key
    expect(process.env[ENV_API_KEY]).toBe("AIzaSyD_new_key_from_login");
  });
});
