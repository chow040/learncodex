# Repository Guidelines

## Project Structure & Module Organization
- `backend/`: Express API (TypeScript). Source in `src/` (config/routes/services), builds in `dist/`, migrations in `sql/`.
- `equity-insight-react/`: Vite + React 19 UI. Screens in `src/pages`, shared logic in `src/components`, assets in `public/`.
- `TradingAgents-main/`: (Optional reference) archived Python toolkit kept for historical context; the production orchestrator now runs entirely in TypeScript/LangGraph.
- `docs/`: Feature briefs and implementation notes. Record new product context here; helper scripts like `modifyOpenAIScript.mjs` stay at the root.

## Build, Test, and Development Commands
- **Backend**: `cd backend && npm install`, `npm run dev` for hot reload, `npm run lint` for the type gate, `npm run build && npm start` for a production smoke test.
- **Frontend**: `cd equity-insight-react && npm install`, `npm run dev` for the Vite server, `npm run build && npm run preview` before release.
- **Trading agents**: `cd TradingAgents-main && uv sync` (or `pip install -r requirements.txt`), then `python -m cli.main` to exercise the workflow.

## Coding Style & Naming Conventions
- Use two-space indentation in TypeScript, keep modules ES-native, and file new code beside peers (`routes`, `services`, `config`).
- Apply `camelCase` to values/functions and `PascalCase` to React components and TypeScript types; keep Tailwind utilities grouped logically.
- Python changes follow PEP 8 with type hints for new graph components and prompts.

## Documentation & Blueprints
- Record new product or architecture context in `docs/` and include a traceable checklist with every blueprint to track implementation progress.

## Testing Guidelines
- There is no Jest/Vitest suite; run `npm run lint` on every backend/frontend change and add focused `*.test.ts` coverage when touching endpoints.
- For the trading stack, POST to `/api/trading/decision/internal` (e.g. `curl -X POST http://localhost:4000/api/trading/decision/internal -H 'Content-Type: application/json' -d '{"symbol":"AAPL"}'`) and attach the JSON decision in your PR.
- Validate happy and failure paths for code that calls external APIs or emits trading output, and document any manual steps in the PR body.

## Commit & Pull Request Guidelines
- History favors short, imperative, lowercase subjects (e.g. `tighten risk guardrail`, `fix debate timing`). Prefix the impacted package when useful.
- PRs should link issues or docs, note user-visible impact, list executed commands/tests, and attach screenshots or terminal output for UI/CLI changes.

## Environment & Secrets
- Copy `backend/.env.example` and supply OpenAI, Finnhub, Reddit, and optional `DATABASE_URL`; never commit populated env files.
- Reuse the same API keys across backend scripts and the `TradingAgents-main` CLI to avoid inconsistent model responses and rate limits.
