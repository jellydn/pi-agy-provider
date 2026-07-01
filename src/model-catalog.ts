/**
 * Google Gemini model catalog — types, static definitions, and thinking levels.
 *
 * @module agy-model-catalog
 */

// ─── Thinking Levels ────────────────────────────────────────────────────────

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

// ─── Model Configuration ────────────────────────────────────────────────────

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

// ─── Shared Defaults ────────────────────────────────────────────────────────

/** Default context window in tokens — used by both static catalog and remote fallback. */
export const DEFAULT_CONTEXT_WINDOW = 1_000_000;

/** Default max output tokens — used by both static catalog and remote fallback. */
export const DEFAULT_MAX_TOKENS = 65_536;

// ─── Static Model Catalog ───────────────────────────────────────────────────

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
