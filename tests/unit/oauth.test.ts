import { describe, it, expect, vi } from "vitest";
import type { OAuthCredentials, OAuthLoginCallbacks } from "@earendil-works/pi-ai";
import { login, refreshToken, getApiKey } from "../../src/oauth.js";

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

// ─── login ───────────────────────────────────────────────────────────────────

describe("login", () => {
  it("opens AI Studio and prompts for API key", async () => {
    const onAuth = vi.fn();
    const callbacks = makeCallbacks({
      onAuth,
      onPrompt: async () => "AIzaSyD_authkey_abcdefghijklmnopqrstuvwxyz1234",
    });

    const result = await login(callbacks);

    expect(onAuth).toHaveBeenCalledWith({ url: "https://aistudio.google.com/apikey" });
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
    const callbacks = makeCallbacks({ onPrompt: async () => "short_key_123" });

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

  it("returns credentials as-is even when expired", async () => {
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
  it("returns the access token from credentials", () => {
    const cred: OAuthCredentials = {
      access: "AIzaSyD_static_key",
      refresh: "AIzaSyD_static_key",
      expires: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
    };
    expect(getApiKey(cred)).toBe("AIzaSyD_static_key");
  });
});
