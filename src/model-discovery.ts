/**
 * Google Gemini dynamic model discovery — fetch from the Gemini API with retry.
 *
 * @module agy-model-discovery
 */

import { isRecord, stringValue, numberValue, booleanValue } from "./utils.js";
import { resolveApiBase } from "./env.js";
import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MAX_TOKENS,
  DEFAULT_THINKING_LEVEL_MAP,
  NO_THINKING_MAP,
  MODELS,
  type ModelConfig,
} from "./model-catalog.js";

// ─── Discovery Configuration ────────────────────────────────────────────────

/** Endpoint for listing models (OpenAI-compatible, relative to API base). */
export const MODELS_ENDPOINT = "/models";

/** Timeout for the model-list fetch (ms). Keeps registration responsive. */
export const MODELS_FETCH_TIMEOUT_MS = 5_000;

/** Number of retry attempts for transient network failures during model discovery. */
const MODELS_FETCH_RETRIES = 1;

/** Base delay between retry attempts (ms). Doubles with each attempt. */
const MODELS_FETCH_RETRY_DELAY_MS = 1_000;

/** Prefix filter for Gemini models returned by the API. */
const GEMINI_PREFIX = "gemini-";

// ─── Raw Model Parsing ──────────────────────────────────────────────────────

/**
 * Raw model entry from the Gemini API `/models` endpoint.
 * Follows the OpenAI-compatible format.
 */
interface RawModelEntry {
  id?: unknown;
  name?: unknown;
  context_length?: unknown;
  max_output_tokens?: unknown;
  pricing?: unknown;
  reasoning?: unknown;
}

/** Convert a per-token price from the API to our $/M tokens representation. */
function toMicroPerToken(val: unknown, fallbackVal: number): number {
  const n = numberValue(val);
  return n != null ? n * 1_000_000 : fallbackVal;
}

/**
 * Parse a single raw model entry into a `ModelConfig`.
 * Falls back to static-model values when the API doesn't provide a field.
 */
function parseRemoteModel(raw: RawModelEntry, fallback?: ModelConfig): ModelConfig | undefined {
  const id = stringValue(raw.id);
  if (!id) return undefined;

  const name = stringValue(raw.name) ?? fallback?.name ?? id;
  const contextWindow =
    numberValue(raw.context_length) ?? fallback?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
  const maxTokens = numberValue(raw.max_output_tokens) ?? fallback?.maxTokens ?? DEFAULT_MAX_TOKENS;
  const reasoning = booleanValue(raw.reasoning) ?? fallback?.reasoning ?? true;

  const pricing = isRecord(raw.pricing) ? raw.pricing : undefined;
  const cost = {
    input: toMicroPerToken(pricing?.prompt, fallback?.cost.input ?? 0),
    output: toMicroPerToken(pricing?.completion, fallback?.cost.output ?? 0),
    cacheRead: toMicroPerToken(pricing?.cached_input, fallback?.cost.cacheRead ?? 0),
    cacheWrite: fallback?.cost.cacheWrite ?? 0,
  };

  return {
    id,
    name,
    reasoning,
    input: ["text"],
    cost,
    contextWindow,
    maxTokens,
    thinkingLevelMap: reasoning
      ? (fallback?.thinkingLevelMap ?? DEFAULT_THINKING_LEVEL_MAP)
      : NO_THINKING_MAP,
  };
}

// ─── Discovery Options ──────────────────────────────────────────────────────

/**
 * Options for fetching remote models. All I/O is injectable for testability.
 */
export interface RemoteModelsOptions {
  apiBase?: string;
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  /** Number of retry attempts for transient failures (default: 1). */
  retries?: number;
  /** Base delay between retry attempts in ms, doubles each attempt (default: 1000). */
  retryDelayMs?: number;
}

// ─── Retry Helpers ────────────────────────────────────────────────────────

/**
 * Check if an error is a transient network failure worth retrying.
 * Includes DNS/connection errors and timeout aborts — excludes parse
 * errors, type errors, and other application-level failures.
 */
function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true; // connection refused, DNS failure
  if (err instanceof DOMException) return err.name === "AbortError"; // timeout
  return false;
}

/**
 * Check if an HTTP status code represents a transient server error.
 * 5xx errors (except 501 Not Implemented) are typically transient.
 */
function isTransientHttpError(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

// ─── Remote Fetch ───────────────────────────────────────────────────────────

/**
 * Fetch the model list from the Gemini API `/models` endpoint.
 *
 * Returns parsed `ModelConfig[]` on success, or `undefined` on any error.
 * Callers should fall back to the static `MODELS` array when this returns
 * `undefined`.
 *
 * Only models with `gemini-` prefixed IDs are included.
 */
export async function fetchRemoteModels(
  options: RemoteModelsOptions = {},
): Promise<ModelConfig[] | undefined> {
  const apiBase = options.apiBase ?? resolveApiBase();
  const apiKey = options.apiKey;
  const fetchFn = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? MODELS_FETCH_TIMEOUT_MS;
  const maxRetries = options.retries ?? MODELS_FETCH_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? MODELS_FETCH_RETRY_DELAY_MS;

  if (!apiKey || !fetchFn) return undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchFn(`${apiBase}${MODELS_ENDPOINT}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });

      if (!response.ok) {
        // Retry on transient 5xx errors; 4xx and permanent 5xx are terminal
        if (isTransientHttpError(response.status) && attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, retryDelayMs * 2 ** attempt));
          continue;
        }
        return undefined;
      }

      const json: unknown = await response.json();
      const rawList: RawModelEntry[] = Array.isArray(json)
        ? json
        : isRecord(json) && Array.isArray(json.data)
          ? (json.data as RawModelEntry[])
          : [];

      if (rawList.length === 0) return undefined;

      const staticById = new Map(MODELS.map((m) => [m.id, m]));

      const parsed = rawList.reduce<ModelConfig[]>((acc, raw) => {
        const id = stringValue(raw?.id);
        if (!id?.startsWith(GEMINI_PREFIX)) return acc;
        const model = parseRemoteModel(raw, staticById.get(id));
        if (model) acc.push(model);
        return acc;
      }, []);

      return parsed.length > 0 ? parsed : undefined;
    } catch (err) {
      // Only retry on transient network errors (timeout, connection
      // refused, DNS failure). Parse errors and validation failures
      // should not retry — the response body won't change.
      if (isNetworkError(err) && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, retryDelayMs * 2 ** attempt));
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  return undefined;
}

// ─── Model Resolution ───────────────────────────────────────────────────────

/**
 * Resolve the model list for registration.
 *
 * Tries the remote API first (if an API key is available), falling back to
 * the static `MODELS` array on any error.
 *
 * @param apiKey The API key to use for the fetch (optional)
 * @param options I/O options for testability
 */
export async function resolveModels(
  apiKey?: string,
  options: RemoteModelsOptions = {},
): Promise<readonly ModelConfig[]> {
  if (apiKey) {
    const remote = await fetchRemoteModels({ ...options, apiKey });
    if (remote) return remote;
  }
  return MODELS;
}
