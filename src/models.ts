/**
 * Google Gemini model definitions and dynamic model discovery.
 *
 * @module agy-models
 */

import { isRecord, stringValue, numberValue, booleanValue } from "./utils.js";
import { resolveApiBase } from "./env.js";

// ─── Model Definitions ─────────────────────────────────────────────────────

/** Pi thinking levels that models map to provider-specific reasoning_effort. */
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

/**
 * Explicit capability matrix mapping every thinking level to a
 * provider-specific `reasoning_effort` string or `null` (unsupported).
 * Every model must declare all six levels — there are no implicit defaults.
 */
export type ThinkingLevelMap = Readonly<Record<ThinkingLevel, string | null>>;

/**
 * Default thinking level map for remote models without a static fallback.
 * Gemini supports minimal/low/medium/high via the OpenAI-compatible endpoint.
 */
export const DEFAULT_THINKING_LEVEL_MAP: ThinkingLevelMap = {
  off: null,
  minimal: "minimal",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: null,
};

/**
 * All-null thinking level map used when a model reports reasoning: false.
 * Every level is unsupported — reasoning is simply not available.
 */
export const NO_THINKING_MAP: ThinkingLevelMap = {
  off: null,
  minimal: null,
  low: null,
  medium: null,
  high: null,
  xhigh: null,
};

/**
 * Google Gemini model configuration.
 *
 * Model IDs use the Gemini API model names (e.g. "gemini-3.5-flash") as
 * documented at https://ai.google.dev/gemini-api/docs/models
 *
 * `contextWindow` is in tokens; `maxTokens` is the max output tokens.
 * Cost is $/M tokens from Google's pricing page.
 */
export interface ModelConfig {
  id: string;
  name: string;
  reasoning: boolean;
  input: readonly ["text"];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
  /**
   * Maps every pi thinking level to a provider-specific reasoning_effort
   * string, or `null` to mark a level as unsupported. Every model must
   * declare all six levels explicitly — there are no implicit defaults.
   */
  thinkingLevelMap: ThinkingLevelMap;
}

/**
 * Google Gemini models available via the OpenAI-compatible endpoint.
 *
 * These match the models exposed by the agy CLI (Gemini 3.5 Flash and
 * Gemini 3.1 Pro). Pricing from https://ai.google.dev/gemini-api/docs/pricing
 */
export const MODELS: readonly ModelConfig[] = [
  {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash (agy)",
    reasoning: true,
    input: ["text"],
    cost: { input: 1.5, output: 9.0, cacheRead: 0.15, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: 65_536,
    thinkingLevelMap: {
      off: null,
      minimal: "minimal",
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: null,
    },
  },
  {
    id: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro (agy)",
    reasoning: true,
    input: ["text"],
    cost: { input: 2.0, output: 12.0, cacheRead: 0.2, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: 65_536,
    thinkingLevelMap: {
      off: null,
      minimal: "minimal",
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: null,
    },
  },
];

/**
 * Return the model IDs registered for the agy provider.
 */
export function modelIds(): string[] {
  return MODELS.map((m) => m.id);
}

// ─── Dynamic Model Discovery ───────────────────────────────────────────────

/** Endpoint for listing models (OpenAI-compatible, relative to API base). */
export const MODELS_ENDPOINT = "/models";

/** Timeout for the model-list fetch (ms). Keeps registration responsive. */
export const MODELS_FETCH_TIMEOUT_MS = 5_000;

/** Prefix filter for Gemini models returned by the API. */
const GEMINI_PREFIX = "gemini-";

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
  const contextWindow = numberValue(raw.context_length) ?? fallback?.contextWindow ?? 1_000_000;
  const maxTokens = numberValue(raw.max_output_tokens) ?? fallback?.maxTokens ?? 65_536;
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

/**
 * Options for fetching remote models. All I/O is injectable for testability.
 */
export interface RemoteModelsOptions {
  apiBase?: string;
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

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

  if (!apiKey || !fetchFn) return undefined;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(`${apiBase}${MODELS_ENDPOINT}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });

    if (!response.ok) return undefined;

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
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

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
