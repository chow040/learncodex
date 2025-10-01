# Task: UI System (React + Tailwind)
- Scope: Build responsive views, component styling, and state wiring for Equity Insight pages using React 19 and Tailwind CSS.
- Include: hero layouts, navigation/mega menu, equity insights panels, social buzz cards, and reusable glassmorphism components.
- Exclude: backend logic, data fetching hooks (refer to backend tasks).
- Example prompts:
  - "Update the EquityInsight hero to display the latest assessment timestamp in the header using Tailwind badges."
  - "Create a reusable glass-panel Card component and replace existing markup across Home.tsx and MarketOverview.tsx."
  - "Add a responsive grid for the Social Buzz section showing Reddit + X posts with Tailwind typography classes."

# Task: Backend Services (Express Routes & OpenAI Pipeline)
- Scope: Implement/extend Express routes for finance, social, assessment endpoints; manage service calls (Finnhub, Reddit, X); normalize and hash sensitive fields; build prompt payloads; trigger OpenAI assessments.
- Include: TypeScript services, router wiring, error handling, request/response validation.
- Example prompts:
  - "Add an Express route /api/social/x that fetches X mentions, normalizes fields, hashes author IDs, and merges with Reddit insights."
  - "Refactor getRedditInsights to accept a ProviderCache dependency and short-circuit when cached data is fresh."
  - "Generate the ChatGPT prompt builder that locks valuation method by symbol and includes normalized Finnhub metrics."

# Task: Database Schema & Persistence (Postgres)
- Scope: Design/modify schema files (Drizzle + SQL) for storing assessments, caches, hashed identifiers, and valuation locks; manage migrations.
- Include: assessment_logs, provider_cache tables, valuation_settings per symbol.
- Example prompts:
  - "Add a provider_cache table with key, provider, payload_hash, expires_at, and last_used columns; wire into Drizzle schema."
  - "Create migration to store valuation_method_lock per symbol and enforce unique constraint."
  - "Extend assessment logs schema to persist hashed Reddit/X author IDs and social metrics."

# Task: Caching & SWR Strategy
- Scope: Define caching layers (provider cache, assessment cache), SWR usage in React (stale-while-revalidate rules), and cache invalidation semantics.
- Include: TTL rules, cache keys, revalidation triggers, locking behavior.
- Example prompts:
  - "Document SWR configuration for /api/social/reddit including revalidateOnFocus, revalidateIfStale, and cache key format."
  - "Implement provider cache middleware that hashes request payloads, stores responses, and respects TTL per provider."
  - "Add client-side SWR hook for useAssessment(symbol) that honors valuation lock and uses fallback data from history."

# Task: OpenAI Assessment Rules
- Scope: Codify how prompts are structured, required context fields, safety filters, and handling of ChatGPT responses.
- Include: prompt templates, risk rating normalization, truncation logic, retry/backoff, error messaging.
- Example prompts:
  - "Write the assessment prompt template that accepts normalized Finnhub metrics, social buzz summary, and valuation lock notes."
  - "Add post-processing to ensure ChatGPT risk ratings map to {Low, Medium, High} and log discrepancies."
  - "Implement exponential backoff with max 3 retries when OpenAI API returns 429 or 500 errors."

# Task: Deployment Notes (Docker & Future Ops)
- Scope: Track deployment requirements, Docker plans, env variables, build commands, and production hardening backlog.
- Include: Dockerfile TODOs, docker-compose targets, env secrets, monitoring hooks.
- Example prompts:
  - "Draft Dockerfile for backend with multi-stage build, copying dist/ and installing only production deps."
  - "Add docker-compose service definitions for backend, frontend, Postgres, and configure shared network + env files."
  - "List production env variables required for Finnhub, Reddit, X, OpenAI, and caching TTLs."
