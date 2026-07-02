/**
 * Structured observability for pi-agy-provider.
 *
 * Before: four modules logged ad-hoc (console.warn here, silent fallback
 * there). No shared interface. Debugging required reproduction + env var
 * guessing.
 *
 * Now: Logger interface behind a seam, with two adapter behaviours —
 * full console logging (DEBUG=agy) and warn/error-only (production).
 *
 * @module agy-logger
 */

// ─── Logger Interface ───────────────────────────────────────────────────────

/** Log levels supported by the Logger interface. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Structured logging interface.
 *
 * All modules drain into a Logger for credential resolution, model
 * discovery, error classification, and auth lifecycle events.
 * Production suppresses debug/info; development (DEBUG=agy) logs
 * everything.
 */
export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

// ─── Format Helper ──────────────────────────────────────────────────────────

/** Format a log message with [agy] [LEVEL] prefix and optional data. */
function fmt(level: string, message: string, data?: Record<string, unknown>): string {
  const prefix = `[agy] [${level}]`;
  if (data && Object.keys(data).length > 0) {
    return `${prefix} ${message} ${JSON.stringify(data)}`;
  }
  return `${prefix} ${message}`;
}

// ─── Console Adapter ────────────────────────────────────────────────────────

/**
 * Console-backed logger, gated by the `DEBUG=agy` environment variable.
 *
 * Format: `[agy] [LEVEL] message {data}`
 * Filter: only `debug` and `info` are DEBUG-gated; `warn` and `error`
 * always log (they indicate actual problems, not diagnostic noise).
 */
function createConsoleLogger(env: Record<string, string | undefined>): Logger {
  const debugEnabled = env["DEBUG"]?.includes("agy") ?? false;

  return {
    debug(message, data) {
      if (debugEnabled) console.debug(fmt("DEBUG", message, data));
    },
    info(message, data) {
      if (debugEnabled) console.info(fmt("INFO", message, data));
    },
    warn(message, data) {
      console.warn(fmt("WARN", message, data));
    },
    error(message, data) {
      console.error(fmt("ERROR", message, data));
    },
  };
}

// ─── Factory ────────────────────────────────────────────────────────────────

/**
 * Create a Logger for the given environment.
 *
 * `debug` and `info` are gated by `DEBUG=agy` — they log to console when
 * the flag is set, otherwise they are silently discarded. `warn` and
 * `error` always log to console (they indicate actual problems).
 *
 * The `env` parameter is injectable for testing — in production it
 * defaults to `process.env`.
 */
export function createLogger(env: Record<string, string | undefined> = process.env): Logger {
  const consoleLog = createConsoleLogger(env);
  const isDebug = env["DEBUG"]?.includes("agy");

  if (!isDebug) {
    // Production: suppress debug/info noise, keep warn/error
    return {
      debug: () => {},
      info: () => {},
      warn: consoleLog.warn,
      error: consoleLog.error,
    };
  }

  return consoleLog;
}

/**
 * Singleton logger — initialized once at module load from process.env.
 * All modules share this instance.
 *
 * Production (no DEBUG=agy): debug/info suppressed, warn/error to console.
 * Development (DEBUG=agy): all levels to console with [agy] prefix.
 */
export const logger: Logger = createLogger();
