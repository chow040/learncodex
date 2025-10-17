# Trading Agents Fundamentals-Only Cache Blueprint

Goal: Reuse the fundamentals persona output whenever the company’s core filings (balance sheet, income statement, cash flow) remain unchanged, while still allowing the other personas (news, social, market, trader) to run fresh each request.

## Objectives

- Reduce fundamentals persona LLM invocations by ≥80% for symbols with unchanged filings.
- Preserve freshness for volatile personas (news/social) by recomputing their segments on every run.
- Ensure blended responses still reflect the latest data; stale fundamentals must be invalidated within 24 hours of a new 10-Q/10-K.

## Success Metrics

- [ ] Fundamentals persona cache hit rate ≥80% over a 2-week window for actively monitored tickers.
- [ ] ≥40% reduction in overall assessment latency when filings unchanged (since other personas still execute).
- [ ] 0 incidents of returning fundamentals data more than 24 hours old relative to the latest filing.
- [ ] Observability dashboard showing per-persona hit/miss counts and recompute latency.

## Scope

- Personas covered: fundamentals analyst only.
- Inputs tracked: canonicalized balance sheet, income statement, cash flow JSON (annual + quarterly), insider transactions if we treat as fundamentals input.
- Not in scope: trading/trader, social, news, market personas (those continue to execute and may later adopt their own caches).
- Cache backend: existing Postgres tables extended with persona-specific keys.

## Architecture Overview

1. **Persona Fingerprinting**
   - Compute a fundamentals-specific fingerprint: `fingerprint({bs, is, cf, insider, schemaVersion})`.
   - Maintain other persona fingerprints separately for future extensibility.
2. **Persona Cache Store**
   - New key space: `persona:fundamentals:{agentVersion}:{symbol}:{persona_fp}`.
   - Stored payload: persona response text + supporting metadata (citations, TTL, schema version).
3. **Workflow Integration**
   - Before running fundamentals persona, check the persona cache.
   - If hit, inject cached output into orchestrator state and skip the persona LLM call.
   - Downstream analysts continue with fresh inputs; final decision merges cached fundamentals text with newly generated segments.
4. **Invalidation**
   - Automatic: fingerprint drift (new filings) triggers recompute.
   - Manual: bump `FUNDAMENTALS_PERSONA_VERSION` or delete persona cache keys if prompt/schema changes.

## Phase Plan

### Phase 0 — Discovery (0.5 day)

- [ ] Inventory fundamentals persona inputs (balance sheet fields, ratios, insider summaries).
- [ ] Confirm required metadata (filing `asOf`, `fiscalDateEnding`, etc.) to detect updates.
- [ ] Decide on prompt schema versioning (`FUNDAMENTALS_PERSONA_VERSION`).

Deliverable: short brief enumerating persona inputs + change signals.

### Phase 1 — Persona Cache Subsystem (1 day)

- [ ] Extend cache repository with persona-specific get/set helpers.
- [ ] Define persona cache table or reuse `assessment_cache` with new key pattern.
- [ ] Add metrics/logging per persona (hit/miss/store).

Deliverable: repository module `personaCacheRepository.ts` + unit tests.

### Phase 2 — Orchestrator Changes (1–2 days)

- [ ] Update fundamentals fetch flow to compute persona fingerprint separately from global fingerprint.
- [ ] Modify orchestrator to check persona cache before executing fundamentals analyst node.
- [ ] Ensure orchestrator can accept “precomputed persona output” and skip LLM invocation.
- [ ] Persist new fundamentals output back to persona cache when recomputed.

Deliverable: orchestrator diff demonstrating cached persona injection + integration tests.

### Phase 3 — Output Assembly (0.5 day)

- [ ] Verify final trading decision composes cached fundamentals text with fresh outputs.
- [ ] Update logging to annotate which personas used cached data for each run.
- [ ] Expose persona cache status in API responses (optional debug metadata).

Deliverable: end-to-end test showing fundamentals reuse while news/social rerun.

### Phase 4 — Observability & Rollout (0.5 day)

- [ ] Add metrics (persona hits/misses, tokens saved, latency saved).
- [ ] Create alert for fundamentals cache staleness >24h after filing.
- [ ] Roll out behind `FEATURE_FUNDAMENTALS_PERSONA_CACHE` flag.
- [ ] Update runbook (invalidate persona cache, version bumps).

Deliverable: rollout plan + observability checklist.

## Key Design Details

- **Cache Key:** `persona:fundamentals:{agentVersion}:{symbol}:{personaFingerprint}`.
- **Payload:** `{ text: string, fingerprint: string, inputs: { bsHash, isHash, cfHash }, expiresAt, schemaVersion }`.
- **TTL Policy:** 90 days hard limit, refreshed immediately on new filing detection; configurable via cache policy JSON.
- **Schema Versioning:** Introduce `FUNDAMENTALS_PERSONA_VERSION`; bump whenever prompt or formatting changes.

## Observability

- Emit metrics:
  - `cache.persona.fundamentals.hit/miss/store/error`
  - `cache.persona.fundamentals.tokens_saved`
  - `cache.persona.fundamentals.latency_saved_ms`
- Log persona cache decisions with key, fingerprint, and upstream change signals.
- Dashboard slices: per-symbol hit rate, time saved, stale detection.

## Risks & Mitigations

- **Partial drift:** Fundamentals change slightly but fingerprint misses due to normalization bug → add tests and include critical fields in hash.
- **Persona divergence:** Cached fundamentals might fall out of sync with updated prompt → require version bumps and track in config.
- **Cross-persona dependencies:** If other personas rely on fundamentals output structure, ensure cached payload matches expected schema.

## Deliverables Checklist

- [ ] Discovery notes (persona inputs + change signals).
- [ ] Persona cache repository & schema updates.
- [ ] Orchestrator modifications supporting persona cache injection.
- [ ] Metrics/logging instrumentation per persona.
- [ ] Tests (unit + integration + end-to-end).
- [ ] Feature flag + rollout/runbook updates.
