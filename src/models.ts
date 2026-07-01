/**
 * Google Gemini models — barrel re-export.
 *
 * Re-exports the model catalog (static definitions, types, thinking levels)
 * and model discovery (dynamic fetch, retry, resolution).
 *
 * @module agy-models
 */

export {
  type ThinkingLevel,
  type ThinkingLevelMap,
  DEFAULT_THINKING_LEVEL_MAP,
  NO_THINKING_MAP,
  type ModelConfig,
  MODELS,
  modelIds,
} from "./model-catalog.js";

export {
  MODELS_ENDPOINT,
  MODELS_FETCH_TIMEOUT_MS,
  type RemoteModelsOptions,
  fetchRemoteModels,
  resolveModels,
} from "./model-discovery.js";
