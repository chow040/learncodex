# SEC EDGAR Fundamentals Integration Blueprint

## Objective
Shift the backend fundamentals workflow off Finnhub and onto the public SEC EDGAR data sets while maintaining comparable coverage for the trading agents and ensuring sustainable rate limiting, caching, and normalization.

## Reference Material
- SEC Fair Access policy & API docs: https://www.sec.gov/search-filings/edgar-application-programming-interfaces
- Current fundamentals tool: `backend/src/taEngine/langchain/tools/finnhubFundamentals.ts`
- Financials formatter: `backend/src/services/financialsFormatter.ts`
- Finnhub service wrapper: `backend/src/services/finnhubService.ts`

## Scope
- Fundamentals (income statement, balance sheet, cash flow) sourced via EDGAR XBRL facts.
- Filing metadata ingestion to support restatement handling and reporting cadence alignment.
- Local caching/persistence so agents can reuse previously fetched filings inside the daily workflow.
- No change to insider transactions/sentiment (still Finnhub) in this iteration.

## Constraints & Risks
- **Fair access:** enforce <10 req/sec and include a descriptive `User-Agent`.
- **Data variability:** issuers mix standard and custom taxonomy tags; need mapping heuristics and fallbacks.
- **Latency:** EDGAR responses are slower than cached third-party APIs; must batch/persist.
- **Coverage gaps:** Non-SEC filers (e.g., some foreign issuers) do not exist in EDGAR; maintain Finnhub fallback or flag unsupported tickers.

## Target Architecture
```
backend/src/services/
├─ secEdgar/
│  ├─ client.ts              // rate limited HTTP wrapper
│  ├─ factMapper.ts          // taxonomy → canonical metric mapping
│  ├─ filingCache.ts         // disk/redis persistence helpers
│  └─ index.ts               // exported service API
├─ fundamentalsService.ts    // new abstraction replacing Finnhub fundamentals calls
└─ financialsFormatter.ts    // reuse; accepts normalized filings

backend/src/taEngine/langchain/tools/
├─ finnhubFundamentals.ts    // deprecated after migration
└─ secEdgarFundamentals.ts   // new tool wired into registry
```

### Ticker → CIK Mapping Design
- Maintain a cached dataset sourced from `https://www.sec.gov/files/company_tickers.json` (or `company_tickers_exchange.json` for exchange metadata).
- Normalize lookups by uppercasing tickers and left-padding numeric CIKs to 10 digits before calling EDGAR endpoints.
- Refresh the mapping on a schedule (daily) or when a ticker lookup misses; store in JSON/Redis under `backend/cache/secEdgar/tickerIndex.json`.
- Expose helper `resolveCikForTicker(ticker: string): Promise<string | null>` within `secEdgar/index.ts` and surface warnings when a ticker is absent (foreign/OTC issuers).
- Log and debounce repeated misses to avoid hammering the SEC static file for unsupported tickers.

## Phase Breakdown & Tasks

### Phase 1 — Data Source Foundations
- [ ] Document SEC API contract (rate limits, required headers) inside `docs/` and CODIFY constants.
- [ ] Build ticker→CIK mapping utility using SEC `companyfacts` metadata or static seed (`backend/src/data`).
- [ ] Add environment variables (`SEC_EDGAR_BASE_URL`, `SEC_EDGAR_USER_AGENT`, optional cache path) to `backend/.env.example` and parser (`backend/src/config/env.ts`).

### Phase 2 — EDGAR Client Layer
- [ ] Create `secEdgar/client.ts` with axios/fetch wrapper, retry + backoff, throttling, and structured logging.
- [ ] Implement endpoints:
  - [ ] `getCompanyFacts(cik: string)`
  - [ ] `getCompanyConcept(cik: string, taxonomy: string, concept: string)`
  - [ ] `getSubmissions(cik: string)` to track new filings.
- [ ] Introduce shared error classification (`429`, `403`, schema issues) with actionable messages.

### Phase 3 — Normalization Pipeline
- [ ] Define canonical fundamentals schema (`NormalizedFiling`, `NormalizedFact`) under `secEdgar/types.ts`.
- [ ] Map high-priority metrics (Revenue, NetIncomeLoss, OperatingCashFlow, TotalAssets, TotalLiabilities, ShareholderEquity, SharesOutstanding) with lookup table + heuristic for custom tags.
- [ ] Enforce payload trimming so the fundamentals tool returns only the most recent four quarterly filings (and optionally the latest annual snapshot) to minimize token usage.
- [ ] Handle filing selection (most recent annual/quarterly, ignore amendments unless newer) and dedupe by `accessionNumber`.
- [ ] Implement caching layer (filesystem or Redis) with TTL + manual busting for amended filings.
- [ ] Extend `financialsFormatter.ts` to accept normalized EDGAR payloads while preserving existing output format.

### Phase 4 — Tool & Workflow Integration
- [ ] Introduce `secEdgarFundamentals.ts` tool mirroring Finnhub schema but calling the new service.
- [ ] Update `registerTool` usage in `researchManagerRunnable.ts` and other workflows to switch IDs or provide feature flag.
- [ ] Provide graceful fallback: if EDGAR data missing for ticker, log warning and call legacy Finnhub endpoint until parity confirmed.
- [ ] Remove direct Finnhub fundamentals dependencies (`getFinancialsReported`) once rollout complete.

### Phase 5 — Validation & Rollout
- [ ] Add integration tests under `backend/src/services/__tests__/secEdgarClient.test.ts` using recorded fixtures.
- [ ] Extend existing LangGraph tests to exercise the new tool path (mock EDGAR responses).
- [ ] Backfill cache with top tickers via scripted job; monitor run time and request volume.
- [ ] Update documentation & runbook (new rate limit considerations, fallback strategy).
- [ ] Sunset Finnhub environment variables once production cutover verified.

## Delivery Checklist
- [ ] All new env vars documented (`README.md`, `.env.example`) and parsed in `env.ts`.
- [ ] Automated tests cover client error handling and normalization of at least three issuers (large-cap, mid-cap, custom taxonomy).
- [ ] Trading agents output identical sections for fundamentals pre/post migration in regression comparison.
- [ ] Observability dashboards updated with EDGAR request counts and error rates.
- [ ] Operations notified of Fair Access obligations and escalation path for 403 blocks.
