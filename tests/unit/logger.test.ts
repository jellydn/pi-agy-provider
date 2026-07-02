import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger } from "../../src/logger.js";

// ─── createLogger — adapter selection ────────────────────────────────────────

describe("createLogger", () => {
  it("suppresses debug/info but logs warn/error when DEBUG is absent", () => {
    const spyWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const spyError = vi.spyOn(console, "error").mockImplementation(() => {});

    const log = createLogger({ DEBUG: "other" });
    expect(() => log.debug("msg")).not.toThrow();
    expect(() => log.info("msg")).not.toThrow();

    log.warn("warn msg");
    log.error("error msg");

    expect(spyWarn).toHaveBeenCalledTimes(1);
    expect(spyError).toHaveBeenCalledTimes(1);
    expect(spyWarn.mock.calls[0][0]).toContain("[agy] [WARN]");

    spyWarn.mockRestore();
    spyError.mockRestore();
  });

  it("suppresses debug/info when DEBUG is empty", () => {
    const log = createLogger({});
    expect(() => log.debug("msg")).not.toThrow();
    expect(() => log.info("msg")).not.toThrow();
  });

  it("returns console logger when DEBUG includes 'agy'", () => {
    // Console logger writes to console.* — verify it doesn't throw
    const log = createLogger({ DEBUG: "agy,other" });
    expect(() => log.debug("msg")).not.toThrow();
    expect(() => log.info("msg")).not.toThrow();
  });

  it("returns console logger when DEBUG is exactly 'agy'", () => {
    const log = createLogger({ DEBUG: "agy" });
    expect(() => log.debug("msg")).not.toThrow();
  });
});

// ─── Console logger — level gating ──────────────────────────────────────────

describe("console logger level gating", () => {
  beforeEach(() => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("debug and info are gated by DEBUG=agy", () => {
    const log = createLogger({ DEBUG: "agy" });

    log.debug("debug msg");
    log.info("info msg");
    log.warn("warn msg");
    log.error("error msg");

    expect(console.debug).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("warn and error always log even without DEBUG=agy", () => {
    const log = createLogger({});

    log.debug("debug msg");
    log.info("info msg");
    log.warn("warn msg");
    log.error("error msg");

    // debug and info are suppressed, warn and error are not
    expect(console.debug).not.toHaveBeenCalled();
    expect(console.info).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("formats messages with [agy] [LEVEL] prefix", () => {
    const log = createLogger({ DEBUG: "agy" });

    log.info("test message");

    expect(console.info).toHaveBeenCalledWith(expect.stringContaining("[agy] [INFO] test message"));
  });

  it("includes structured data as JSON in log message", () => {
    const log = createLogger({ DEBUG: "agy" });

    log.info("event", { key: "value", count: 42 });

    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining('{"key":"value","count":42}'),
    );
  });

  it("omits data field when not provided", () => {
    const log = createLogger({ DEBUG: "agy" });

    log.info("no data");

    const callArg = (console.info as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg).toBe("[agy] [INFO] no data");
  });
});
