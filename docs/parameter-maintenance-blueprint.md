# Parameter Maintenance Blueprint

## Context & Pain Points
- Backend business flows embed human-facing labels and step definitions in code (`backend/src/services/chartDebateProgress.ts:1`, `equity-insight-react/src/components/trading/TradingProgress.tsx:12`). Updating these requires a deploy, and consumers cannot stage changes safely.
- Configuration is split between environment variables (`backend/src/config/env.ts:5`) and static arrays, making it hard to inspect the effective configuration or audit historical values.
- There is no privileged interface for operations staff to manage code values; product teams must ask engineering for every change, slowing iteration and creating risk of inconsistent data between backend and frontend.

## Goals
- Centralize code/lookup values (stage names, labels, thresholds, toggle flags) in a persistent store that supports versioning and audit history.
- Provide admin-facing CRUD APIs and UI tooling so authorized users can manage the parameter catalog without code changes.
- Deliver a runtime layer that resolves parameters with caching, schema validation, and fallbacks, minimizing impact on existing flows.

## Proposed Architecture

### Domain Model (PostgreSQL + Drizzle)
- `parameter_groups`: Canonical registry of parameter families (e.g. `trading.stages`, `debate.progress_labels`). Columns: `id`, `namespace`, `code`, `display_name`, `schema`, `description`, `is_active`, `created_at`, `updated_at`.
- `parameter_values`: Individual entries keyed to a group. Columns: `id`, `group_id`, `code`, `label`, `payload_json`, `sort_order`, `effective_from`, `effective_to`, `is_active`, timestamps.
- `parameter_versions`: Snapshot of prior revisions (JSON payload + metadata) captured via trigger; supports rollback/audit.
- `parameter_audit_logs`: (Optional initial phase) records who changed what and when. Populate via backend service layer.

### Backend Services (Express + Drizzle + Zod)
- `ParameterRepository`: Typed Drizzle layer for CRUD, paginated reads, and version history retrieval.
- `ParameterService`: Business logic for validation (Zod schema per group), conflict detection, caching and event hooks.
- `ParameterCache`: In-memory (LRU) plus optional Redis edge cache. Supports invalidation by group or key.
- API surface (under `/api/admin/parameters` protected by admin middleware):
  - `GET /groups` | `POST /groups`
  - `GET /groups/:code/values` | `POST` (create) | `PUT` (update) | `PATCH` (toggle active) | `DELETE`
  - `GET /groups/:code/values/:code/versions`
- Public runtime endpoints (or service methods) for downstream modules:
  - `GET /parameters/:namespace/:code` → resolved parameter with merged defaults.
  - Batch fetch to hydrate UI screens (`POST /parameters/batch`).

### Frontend (React Admin Console)
- New protected route `AdminParameters` under `/pages` (behind `ProtectedRoute.tsx`) that consumes the admin API via TanStack Query.
- Features: group list, inline value editing with JSON editor, effective dating UI, diff viewer for versions, audit log viewer.
- Client caching keyed by `namespace.code` alongside optimistic updates.
- UI components reuse existing `ui` primitives; consider virtualization for large code sets.

### Runtime Integration
- Introduce `parameterResolver` utility in backend services to fetch and cache values; replace hard-coded constructs incrementally:
  - `chartDebateProgress.ts` labels → hydrated from `debate.progress_labels`.
  - Trading workflow stages (`TradingProgress.tsx:12`) → server-provided list from `trading.stages`, exposed via existing progress websocket payload.
  - Debate round counts currently in env (`backend/src/config/env.ts:26`) → move defaults into `system.thresholds` with env fallback.
- LLM prompt templates can reference parameterized configs (e.g., risk thresholds) by injecting resolver outputs into LangGraph state.
- Provide CLI seeding script (`npm run seed:parameters`) to bootstrap core sets from YAML/JSON for repeatable environments.

### Security & Governance
- Gate admin endpoints with role-based auth (extend existing auth middleware to check `user.role === 'admin'`).
- Record change metadata (user id, IP) in `parameter_audit_logs`.
- Optionally emit change events (e.g., Redis pub/sub) so other services clear caches or trigger downstream pipelines.

## Implementation Roadmap
1. **Foundation**
   - Add Drizzle schema + migrations for core tables and triggers.
   - Implement `ParameterRepository` + `ParameterService` with caching and validation.
   - Build seed script and sample dataset.
2. **Read-Only Adoption**
   - Create resolver utility and replace read paths for debate labels and trading stages while keeping code defaults as fallback.
   - Add automated tests (Vitest or integration scripts) covering cache behaviour and schema validation.
3. **Admin Surface**
   - Implement admin API routes with RBAC.
   - Build React admin page with CRUD flows, leveraging optimistic updates and toast feedback.
   - Add audit log display + version diffing.
4. **Expansion**
   - Migrate additional parameter families (risk guardrails, model toggles, chart configs).
   - Integrate with TradingAgents Python tooling if still in use (expose REST endpoint for CLI to fetch parameters).
   - Evaluate externalized caching (Redis) for multi-instance deployments.

## Open Questions & Dependencies
- Authentication: extend current OAuth flow to issue roles/claims, or introduce simple role table?
- Should parameter schemas support nested validation (e.g., JSON schema) or is flat key/value sufficient?
- Do we require blue/green parameter activation (draft vs published) for high-risk changes?
- Observability: integrate with existing logging/metric stack to monitor cache hit rate and parameter changes.

## Development Checklist
- [ ] Foundation: Add Drizzle schema + migrations for parameter tables and triggers.
- [ ] Foundation: Implement `ParameterRepository` + `ParameterService` with validation and caching.
- [ ] Foundation: Build `npm run seed:parameters` script with sample dataset.
- [ ] Read-Only Adoption: Introduce resolver utility and replace hard-coded debate/trading values with parameter fetches.
- [ ] Read-Only Adoption: Add automated cache and schema validation tests.
- [ ] Admin Surface: Expose `/api/admin/parameters` CRUD endpoints guarded by RBAC.
- [ ] Admin Surface: Ship React admin page for parameter management with optimistic updates and diff viewer.
- [ ] Admin Surface: Persist audit log metadata for every change.
- [ ] Expansion: Migrate remaining parameter families (risk guardrails, model toggles, chart configs).
- [ ] Expansion: Add optional Redis-backed cache invalidation and TradingAgents CLI integration.

This blueprint sets the foundation for future work—begin with the foundation phase and iterate, ensuring each step maintains backward compatibility with the existing trading workflows.
