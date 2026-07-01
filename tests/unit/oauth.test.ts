import { describe, it, expect, vi, afterEach } from "vitest";
import type { OAuthCredentials, OAuthLoginCallbacks } from "@earendil-works/pi-ai";
import { login, refreshToken, getApiKey } from "../../src/oauth.js";

// ─── Mock config-store module for login tests ──────────────────────────────

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

// ─── login — agy OAuth auto-login path ──────────────────────────────────────

describe("login — agy OAuth auto-login", () => {
  afterEach(() => {
    mockResolveAgyOAuthToken.mockReset();
  });

  it("returns existing agy OAuth token when found", async () => {
    mockResolveAgyOAuthToken.mockReturnValue("ya29.existing_oauth_token");
    const callbacks = makeCallbacks();

    const result = await login(callbacks);

    expect(result.access).toBe("ya29.existing_oauth_token");
    expect(result.refresh).toBe("ya29.existing_oauth_token");
    expect(result.expires).toBeGreaterThan(Date.now());
    expect(callbacks.onAuth).not.toHaveBeenCalled();
  });

  it("does not call onPrompt when agy token is found", async () => {
    mockResolveAgyOAuthToken.mockReturnValue("ya29.token");
    const onPrompt = vi.fn().mockResolvedValue("");
    const callbacks = makeCallbacks({ onPrompt });

    await login(callbacks);

    expect(onPrompt).not.toHaveBeenCalled();
  });
});

// ─── login — Manual API key paste path ──────────────────────────────────────

describe("login — manual API key paste", () => {
  afterEach(() => {
    mockResolveAgyOAuthToken.mockReset();
  });

  it("opens AI Studio and prompts for API key when no agy credentials", async () => {
    mockResolveAgyOAuthToken.mockReturnValue(undefined);
    const onAuth = vi.fn();
    const callbacks = makeCallbacks({
      onAuth,
      onPrompt: async () => "AIzaSyD_authkey_abcdefghijklmnopqrstuvwxyz1234",
    });

    const result = await login(callbacks);

    expect(onAuth).toHaveBeenCalledWith({ url: "https://aistudio.google.com/apikey" });
    expect(result.access).toBe("AIzaSyD_authkey_abcdefghijklmnopqrstuvwxyz1234");
  });

  it("throws on empty API key", async () => {
    mockResolveAgyOAuthToken.mockReturnValue(undefined);
    const callbacks = makeCallbacks({ onPrompt: async () => "" });

    await expect(login(callbacks)).rejects.toThrow("No Gemini API key provided");
  });

  it("trims whitespace from pasted API key", async () => {
    mockResolveAgyOAuthToken.mockReturnValue(undefined);
    const callbacks = makeCallbacks({
      onPrompt: async () => "  AIzaSyD_key_with_spaces_12345678  ",
    });

    const result = await login(callbacks);

    expect(result.access).toBe("AIzaSyD_key_with_spaces_12345678");
  });

  it("warns on unusually short API key (< 20 chars)", async () => {
    mockResolveAgyOAuthToken.mockReturnValue(undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const callbacks = makeCallbacks({ onPrompt: async () => "short_key_123" });

    await login(callbacks);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("[agy]");
    expect(warnSpy.mock.calls[0][0]).toContain("unusually short");
    expect(warnSpy.mock.calls[0][0]).toContain("13 chars");
    warnSpy.mockRestore();
  });

  it("does not warn on API key >= 20 chars", async () => {
    mockResolveAgyOAuthToken.mockReturnValue(undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const callbacks = makeCallbacks({
      onPrompt: async () => "abcdefghij1234567890",
    });

    await login(callbacks);

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("removes terminal paste wrappers from pasted key", async () => {
    mockResolveAgyOAuthToken.mockReturnValue(undefined);
    const esc = String.fromCharCode(27);
    const pastedKey = `${esc}[200~AIzaSyD_paste_key_123456${esc}[201~`;
    const callbacks = makeCallbacks({ onPrompt: async () => pastedKey });

    const result = await login(callbacks);

    expect(result.access).toBe("AIzaSyD_paste_key_123456");
  });
});

// ─── refreshToken ───────────────────────────────────────────────────────────

describe("refreshToken", () => {
  it("returns static credentials as-is", async () => {
    const cred: OAuthCredentials = {
      access: "AIzaSyD_static_key_abc123",
      refresh: "AIzaSyD_static_key_abc123",
      expires: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
    };

    const result = await refreshToken(cred);

    expect(result.access).toBe("AIzaSyD_static_key_abc123");
    expect(result.refresh).toBe("AIzaSyD_static_key_abc123");
  });

  it("returns agy OAuth credentials as-is (cannot refresh)", async () => {
    const cred: OAuthCredentials = {
      access: "ya29.oauth_token",
      refresh: "ya29.oauth_token",
      expires: Date.now() + 30 * 60 * 1000,
    };

    const result = await refreshToken(cred);

    expect(result.access).toBe("ya29.oauth_token");
    expect(result).toEqual(cred);
  });

  it("warns when agy OAuth token is expired", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cred: OAuthCredentials = {
      access: "ya29.expired_token",
      refresh: "ya29.expired_token",
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
  it("returns the access token from credentials", () => {
    const cred: OAuthCredentials = {
      access: "ya29.token",
      refresh: "ya29.token",
      expires: Date.now() + 3600000,
    };
    expect(getApiKey(cred)).toBe("ya29.token");
  });

  it("returns static API key from credentials", () => {
    const cred: OAuthCredentials = {
      access: "AIzaSyD_static_key",
      refresh: "AIzaSyD_static_key",
      expires: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
    };
    expect(getApiKey(cred)).toBe("AIzaSyD_static_key");
  });
});
