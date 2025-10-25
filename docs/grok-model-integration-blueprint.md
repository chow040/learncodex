# Grok Model Integration Blueprint

## Objective
Allow trading and assessment workflows to run on Grok (x.ai) models in addition to the existing OpenAI lineup.

## Tasks

### 1. Configuration Updates
- Add new env vars: `GROK_API_KEY`, `GROK_BASE_URL` (default `https://api.x.ai/v1`), `GROK_MODEL`, `GROK_ALLOWED_MODELS`, optional `TRADING_DEFAULT_MODEL`.
- In `src/config/env.ts`:
  - Export `grokApiKey`, `grokBaseUrl`, `grokModel`, `grokAllowedModels`.
  - Derive `defaultTradingModel` (priority: `TRADING_DEFAULT_MODEL` → `OPENAI_MODEL` → `GROK_MODEL`).
  - Merge OpenAI + Grok allow-lists (plus any override from `TRADING_ALLOWED_MODELS`) into `tradingAllowedModels` (deduped).
  - Warn if a Grok model is configured but `GROK_API_KEY` is missing.

### 2. Model Selection Logic
- Add `resolveProvider(modelId)` helper to map models to `openai` or `grok`.
- Update `createChatModel` in `decisionWorkflow.ts`:
  - OpenAI branch unchanged.
  - Grok branch: instantiate `ChatOpenAI` with `openAIApiKey = env.grokApiKey` and `configuration.baseURL = env.grokBaseUrl`; throw a clear error if the key is absent.
- Update `resolveModelId` to fall back to `env.defaultTradingModel`.

### 3. Request Validation & Routing
- Ensure `validateTradingAgentsRequest` receives the merged allow-list and new default model in both trading routes (`/decision/internal` & POST variant).
- Confirm validation errors list Grok models when appropriate.
- Surface the merged `allowedModels` in REST responses so the UI sees Grok options.

### 4. Metadata & Progress Events
- Anywhere progress/log payloads include the model, rely on `resolveModelId` or `defaultTradingModel` so Grok identifiers flow through.

### 5. Documentation & Templates
- Update backend `.env` example and README/docs with the new Grok variables and usage notes.

### 6. Testing Checklist
- Request succeeds with Grok model when key provided.
- Request fails gracefully when Grok model selected without key.
- Combined allow-list rejects unsupported strings.
- Regression check: OpenAI-only setup still works.

This blueprint is ready for hand-off to implement Grok support without disrupting existing OpenAI functionality.

## Implementation Checklist
- [x] `env.ts` exports Grok config, merged allow-list, and new default model.
- [x] `createChatModel` dynamically selects OpenAI vs Grok and validates keys.
- [x] `decisionWorkflow` progress/log payloads use the resolved model ID.
- [x] Routes (`tradingRoutes.ts`) send merged `allowedModels` to validation and responses.
- [x] Validators accept Grok models and show them in error messages.
- [x] `.env` template / docs list the new Grok environment variables.
- [x] Manual or automated tests cover Grok-enabled and OpenAI-only scenarios.

## Implementation Complete ✅
All tasks from the blueprint have been implemented successfully. See `grok-model-integration-implementation-summary.md` for detailed documentation.
