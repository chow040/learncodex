# TradingAgent Caching & Change Detection Blueprint

Goal: Detect unchanged fundamentals (balance sheet, cash flow, income, etc.) and reuse prior results so the agent avoids unnecessary fetches and LLM assessments, reducing latency and token spend.

## Objectives

- Cut LLM assessment calls for unchanged fundamentals by ≥70%.
- Reduce fundamentals fetch latency by ≥60% via conditional requests and cache hits.
- Maintain correctness: no stale fundamentals >1 day past new filing/earnings.
- Provide clear observability: cache hit rate, saved tokens, and saved time.

## Success Metrics (acceptance criteria)

- [ ] ≥70% cache hit rate on fundamentals endpoints over 2 weeks.
- [ ] ≥60% reduction in median assessment latency when inputs unchanged.
- [ ] Token usage for fundamentals-driven assessments reduced by ≥50%.
- [ ] 0 incidents of serving data >1 day stale after a new 10-Q/10-K or earnings.
- [ ] Dashboards show hit/miss, 304 rates, and assessment reuse counts.

## Scope

- Data types: balance sheet, cash flow, income statements, company profile, dividends, splits. Excludes tick-level price data (handled separately).
- Vendors: generic; leverage `ETag`, `Last-Modified`, `asOfDate`, `updatedAt`, or `fiscalDateEnding` when available.
- Outputs: cached raw payloads and cached derived “assessment” artifacts.

## Architecture Overview

1. HTTP Cache Layer
   - Conditional GETs using `If-None-Match` and `If-Modified-Since`.
   - TTLs by data type as safety net; `stale-while-revalidate` option.
2. Fingerprinting
   - Canonicalize vendor payloads; compute stable hash (blake2b/sha256).
   - Include `schema_version` and `agent_version` in the fingerprint.
3. Derived Assessment Cache
   - Key by `assessment:vX:{symbol}:{input_fingerprint}` to reuse LLM outputs.
4. Policy + Calendar Awareness
   - TTLs tuned per data type and event-driven refresh (earnings/filings).
5. Observability
   - Metrics: hit/miss, 304 rate, time/tokens saved, stale returns.

## Phase Plan (with actionable tasks)

### Phase 0 — Discovery (0.5–1 day)

- [ ] Inventory fundamentals endpoints and vendors (balance sheet, cash flow, income, profile, dividends, splits).
- [ ] Verify upstream change signals per endpoint: `ETag`, `Last-Modified`, `asOfDate`, `updatedAt`, `fiscalDateEnding`.
- [ ] Identify current assessment inputs (which fields feed LLM prompts).
- [ ] Choose cache backend for MVP (SQLite or Redis) and retention size.

Deliverable: brief table of endpoints → change signals, and chosen backend.

### Phase 1 — Core Cache Layer (1–2 days)

- [ ] Implement canonicalization and fingerprint utility.
- [ ] Implement HTTP fetcher with conditional requests and TTL fallback.
- [ ] Add cache store with get/set, per-key metadata, and expirations.
- [ ] Define cache key scheme and TTL policy (see Policy section).
- [ ] Add per-key locking to prevent thundering herds (mutex/semaphore).

Deliverable: library module + unit tests for canonicalization and 304 flow.

### Phase 2 — Wire Up Fundamentals (1–2 days)

- [ ] Wrap each fundamentals fetch in HTTP cache layer.
- [ ] Store payload fingerprint and metadata (etag, last_modified, as_of).
- [ ] Implement event-aware refresh (earnings/filings) for fundamentals.
- [ ] Add config-driven TTLs per data type.

Deliverable: service functions returning `(data, fingerprint, meta)` for each endpoint.

### Phase 3 — Derived Assessment Cache (1 day)

- [ ] Compute composite input fingerprint for assessments (include all inputs, schema, and `agent_version`).
- [ ] Cache assessment results keyed by `assessment:{agent_version}:{symbol}:{input_fp}`.
- [ ] Add fast path to skip LLM call if fingerprint unchanged and not expired.
- [ ] Expose invalidation path when agent logic changes (bump `agent_version`).

Deliverable: assessment wrapper returning cached result when inputs identical.

### Phase 4 — Observability & Rollout (0.5–1 day)

- [ ] Emit metrics: cache hits/misses, 304 count, time saved, tokens saved.
- [ ] Add logs for cache decisions and upstream change signals.
- [ ] Add dashboards and alert for post-event staleness >1 day.
- [ ] Roll out behind a feature flag; enable by cohort/symbol set.
- [ ] Document runbook for invalidation, backfills, and schema bumps.

Deliverable: dashboards + runbook; feature flag default ON post burn-in.

## Key Design Details

### Cache Keys

- Raw HTTP payloads: `http:{vendor}:{data_type}:{symbol}:{period}[:as_of]`
- Derived assessment: `assessment:{agent_version}:{symbol}:{input_fp}`

### TTL Policy (defaults)

- Statements (balance sheet, cash flow, income): 30–90 days; refresh at earnings and filings windows; hard TTL 90d.
- Company profile/metadata: 7 days.
- Dividends/splits: 1–7 days.
- News: 10–30 minutes.
- Prices/quotes: seconds (out of scope here).

### Data Store Options

Option A: SQLite (MVP, single process)

```sql
CREATE TABLE IF NOT EXISTS http_cache (
  key TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  data_fp TEXT NOT NULL,
  etag TEXT,
  last_modified TEXT,
  as_of TEXT,
  fetched_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  schema_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assessment_cache (
  key TEXT PRIMARY KEY,
  input_fp TEXT NOT NULL,
  result_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  agent_version TEXT NOT NULL
);
```

Option B: Redis (distributed, multi-worker)

- Keys as above; store metadata as Redis Hash; JSON in a string value (or RedisJSON).
- Use `SET key value EX ttl` for data, and a parallel hash for metadata, or a single packed JSON blob.

## Implementation Sketches

### Canonicalization + Fingerprint

Python

```python
import hashlib, json

def _norm(x):
    if isinstance(x, float):
        return round(x, 8)
    if isinstance(x, dict):
        return {k: _norm(x[k]) for k in sorted(x)}
    if isinstance(x, list):
        return [_norm(i) for i in x]
    return x

def canonical_json(obj) -> str:
    return json.dumps(_norm(obj), sort_keys=True, separators=(",", ":"))

def fingerprint(obj, salt="schema_v1") -> str:
    return hashlib.blake2b((salt + canonical_json(obj)).encode(), digest_size=16).hexdigest()
```

Node

```ts
import { createHash } from 'crypto'

const norm = (x: any): any => {
  if (typeof x === 'number') return Math.round(x * 1e8) / 1e8
  if (Array.isArray(x)) return x.map(norm)
  if (x && typeof x === 'object') return Object.keys(x).sort().reduce((o,k)=>{ o[k]=norm(x[k]); return o },{} as any)
  return x
}

export const canonicalJson = (obj: any) => JSON.stringify(norm(obj))
export const fingerprint = (obj: any, salt='schema_v1') => createHash('sha256').update(salt + canonicalJson(obj)).digest('hex').slice(0,32)
```

### HTTP Fetch with Conditional Requests

Python (requests)

```python
import time, requests

def fetch_json_with_http_cache(url, key, store, ttl=86400, schema_version='schema_v1'):
    meta = store.get_http(key) or {}
    headers = {}
    if meta.get('etag'): headers['If-None-Match'] = meta['etag']
    if meta.get('last_modified'): headers['If-Modified-Since'] = meta['last_modified']

    if meta and meta.get('expires_at', 0) > time.time():
        return meta['data'], meta['data_fp'], { **meta, 'source': 'cache_ttl' }

    r = requests.get(url, headers=headers, timeout=15)
    if r.status_code == 304 and meta:
        meta['expires_at'] = time.time() + ttl
        store.set_http(key, meta)
        return meta['data'], meta['data_fp'], { **meta, 'source': '304' }

    r.raise_for_status()
    data = r.json()
    data_fp = fingerprint(data, salt=schema_version)
    meta = {
      'data': data,
      'data_fp': data_fp,
      'etag': r.headers.get('ETag'),
      'last_modified': r.headers.get('Last-Modified'),
      'fetched_at': time.time(),
      'expires_at': time.time() + ttl,
      'schema_version': schema_version,
    }
    store.set_http(key, meta)
    return data, data_fp, { **meta, 'source': 'network' }
```

### Assessment Cache Wrapper

```python
def cached_assessment(symbol, inputs, run_assessment, store, agent_version='v1', ttl=90*86400):
    in_fp = fingerprint(inputs, salt=f'schema_v1|{agent_version}')
    key = f'assessment:{agent_version}:{symbol}:{in_fp}'
    hit = store.get_assessment(key)
    if hit and hit['expires_at'] > time.time():
        return hit['result'], {'cache': 'hit', 'key': key}
    result = run_assessment(inputs)
    store.set_assessment(key, {
        'input_fp': in_fp,
        'result': result,
        'expires_at': time.time() + ttl,
        'agent_version': agent_version,
    })
    return result, {'cache': 'miss', 'key': key}
```

## Policy & Events

- Maintain a config file (e.g., `config/cache_policy.yaml`) mapping `data_type` → `ttl_seconds`, `refresh_on_events: [earnings, filings]`.
- Compute “next refresh” from earnings calendar or filing windows; schedule background refresh jobs; otherwise respect TTL.
- Always fall back to TTL even when vendor supports 304s (safety net).

Example policy (YAML)

```yaml
statements:
  ttl_seconds: 7776000   # 90 days
  refresh_on_events: [earnings, filings]
profile:
  ttl_seconds: 604800    # 7 days
dividends:
  ttl_seconds: 604800
splits:
  ttl_seconds: 604800
news:
  ttl_seconds: 1800      # 30 minutes
```

## Observability

- Metrics: `cache.http.hit`, `cache.http.miss`, `cache.http.304`, `cache.assessment.hit`, `tokens.saved`, `ms.saved`, `stale.served`.
- Logs: key, vendor signals used, source (`network`/`304`/`cache_ttl`), TTL decisions.
- Dashboards: hit rates by data type; assessment reuse rate; trends over time.

## Testing Strategy

- Unit: canonicalization determinism, hash stability, key formatting.
- Integration: simulate 304 flow; TTL expiry; event-driven refresh; assessment reuse.
- Property-based: random JSON structures → stable canonicalization.
- Regression: bump `schema_version`/`agent_version` invalidates as expected.

## Rollout Plan

1. Ship behind `FEATURE_CACHE_FUNDAMENTALS` flag.
2. Enable for a small symbol cohort; monitor hit rate and correctness.
3. Expand to all fundamentals; then enable assessment caching.
4. Post-rollout: set flag default ON and remove flag after 2 weeks.

## Runbook (Ops)

- Invalidate everything: bump `schema_version` and/or `agent_version`.
- Invalidate symbol: delete keys for that symbol prefix.
- Investigate stale data: check latest filing date vs cached `as_of`; inspect logs for 304s and TTL status.
- Backfill warm cache: prefetch most-used symbols daily.

## Risks & Mitigations

- Vendor does not support 304s: rely on content fingerprint + TTL.
- Restatements: monitor `updatedAt`/`revisionId`; refresh on detection.
- Input drift (you changed prompts/fields): include `agent_version` in key; bump on change.
- Over-caching: keep short TTLs for volatile endpoints; event-driven refresh.

## Deliverables Checklist

- [ ] Cache library module (HTTP + assessment + store).
- [ ] Configurable policy (YAML/JSON) for TTLs and events.
- [ ] Wrappers for each fundamentals endpoint returning `(data, fp, meta)`.
- [ ] Assessment wrapper with fingerprint reuse.
- [ ] Metrics + logs + dashboards.
- [ ] Tests (unit + integration).
- [ ] Rollout flag and runbook.

---

Appendix A — Example Keys

- `http:alphaVantage:balance_sheet:AAPL:annual`
- `http:finnhub:cash_flow:MSFT:quarterly:2024-06-30`
- `assessment:v3:GOOG:7f0a1bcd9e2234aa`

Appendix B — Next Steps (for this repo)

- [ ] Confirm language/runtime (Python/Node) and current HTTP client.
- [ ] Confirm vendors/endpoints and their change signals.
- [ ] Choose backend (SQLite/Redis) and add dependency.
- [ ] Implement Phase 1 modules; request code review.
