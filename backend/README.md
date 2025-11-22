# Equity Insight Backend

Node.js/Express API that powers the Equity Insight frontend with two integrations:

- Assessments via OpenAI's GPT models
- Market data via Finnhub
- Reddit sentiment via the official API search endpoint
- Optional PostgreSQL logging for ChatGPT assessment requests/responses

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the example environment variables and fill in your API keys:
   ```bash
   cp .env.example .env
   ```
3. Update `.env` with valid values for `OPENAI_API_KEY`, `FINNHUB_API_KEY`, `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, and optionally `DATABASE_URL` to enable assessment logging.
   
   **Model Configuration:**
   - By default, Trading Agents allow OpenAI models: `gpt-4o-mini`, `gpt-4o`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5`, `gpt-5-pro`
   - **Grok Integration:** To use Grok models from x.ai, add `GROK_API_KEY`, `GROK_MODEL` (e.g., `grok-beta`), and optionally `GROK_BASE_URL` (defaults to `https://api.x.ai/v1`)
   - **Google Gemini Integration:** To use Gemini models, add `GOOGLE_GENAI_API_KEY` plus `GOOGLE_GENAI_MODEL` (e.g., `gemini-1.5-flash`) and optionally `GOOGLE_GENAI_ALLOWED_MODELS`
   - The system automatically merges OpenAI, Grok, and Google models into a combined allow-list
   - Override the default model with `TRADING_DEFAULT_MODEL` (priority: `TRADING_DEFAULT_MODEL` → `OPENAI_MODEL` → `GROK_MODEL` → `GOOGLE_GENAI_MODEL`)
   - Customize the full allow-list with `TRADING_ALLOWED_MODELS` (comma-separated)
   - Default Grok models: `grok-beta`, `grok-2-1212`, `grok-2-vision-1212`
   - Default Google models: `gemini-1.5-flash`, `gemini-1.5-flash-8b`, `gemini-1.5-pro`, `gemini-2.0-flash`, `gemini-2.0-flash-thinking`
   
   Enable the Trading Agents assessment history endpoints by setting `TRADING_ASSESSMENT_HISTORY_ENABLED=true` (requires `DATABASE_URL` so results can be queried).

4. Create a Reddit script application at https://www.reddit.com/prefs/apps, then copy the generated client ID/secret into `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` (choose the script app type).
5. If `DATABASE_URL` is set, manage schema with Drizzle:
   - Generate SQL from the TypeScript schema: `npm run drizzle:generate`
   - Apply migrations: `npm run drizzle:migrate`
   - Explore the DB with Drizzle Studio: `npm run drizzle:studio`
6. Start the development server:
   ```bash
   npm run dev
   ```

The API listens on `http://localhost:4000` by default. Override the port by setting `PORT` in `.env`.

## Available Endpoints

### `POST /api/assessment`
Generate an equity assessment using ChatGPT.

Request body:
```json
{
  "symbol": "AAPL",
  "timeframe": "6 months",
  "strategyFocus": "swing trading",
  "additionalContext": "Prioritize risk controls"
}
```

Response body:
```json
{
  "summary": "High level insight",
  "riskRating": "medium",
  "opportunities": ["Catalyst", "Momentum"],
  "watchItems": ["Earnings date"],
  "nextSteps": ["Review technicals"],
  "rawText": "Original model response"
}
```

### `GET /api/finance/quote?symbol=AAPL`
Fetch real-time quote data from Finnhub.

Response body:
```json
{
  "symbol": "AAPL",
  "current": 220.02,
  "high": 222.15,
  "low": 218.9,
  "open": 219.5,
  "previousClose": 218.4,
  "timestamp": 1727572800
}
```

### `GET /api/finance/profile?symbol=AAPL`
Retrieve company fundamentals from Finnhub.

Response body:
```json
{
  "symbol": "AAPL",
  "name": "Apple Inc",
  "exchange": "NASDAQ",
  "currency": "USD",
  "ipo": "1980-12-12",
  "marketCapitalization": 3400000,
  "shareOutstanding": 15100,
  "logo": "https://logo.clearbit.com/apple.com",
  "weburl": "https://www.apple.com"
}
```

### `GET /api/trading/assessments?symbol=AAPL&limit=5`
Return the most recent Trading Agents assessments for a ticker when `TRADING_ASSESSMENT_HISTORY_ENABLED` is enabled and the database is configured.

Response body:
```json
{
  "items": [
    {
      "runId": "run_abcd1234",
      "symbol": "AAPL",
      "tradeDate": "2025-01-10",
      "decision": "BUY",
      "modelId": "gpt-4o-mini",
      "analysts": ["fundamental", "market", "news", "social"],
      "createdAt": "2025-01-10T18:22:41.000Z",
      "orchestratorVersion": "2025.01.10"
    }
  ],
  "nextCursor": "2025-01-08T17:11:20.000Z"
}
```

### `GET /api/trading/assessments/:runId`
Fetch the stored Trading Agents payload for a previous run. Returns `404` when the run does not exist or the flag is disabled.

Response body:
```json
{
  "runId": "run_abcd1234",
  "symbol": "AAPL",
  "tradeDate": "2025-01-10",
  "decision": "BUY",
  "modelId": "gpt-4o-mini",
  "analysts": ["fundamental", "market", "news", "social"],
  "createdAt": "2025-01-10T18:22:41.000Z",
  "orchestratorVersion": "2025.01.10",
  "payload": {
    "symbol": "AAPL",
    "tradeDate": "2025-01-10",
    "context": { "...": "..." }
  },
  "rawText": "{...}",
  "promptHash": "prompt_hash_value",
  "logsPath": "/var/log/ta_runs/run_abcd1234.json"
}
```

## Assessment Logging

When `DATABASE_URL` is configured, each successful `/api/assessment` request is persisted to PostgreSQL via Drizzle (see `src/db/schema.ts`). The log stores the request payload, enriched Finnhub context, generated prompt/system prompt, structured AI response, and raw model output. Use `npm run drizzle:generate` followed by `npm run drizzle:migrate` to create/update the `assessment_logs` table. Quick check: `npm run db:logs`.

## Production Build

```bash
npm run build
npm start
```

`npm run build` compiles TypeScript to `dist/`, and `npm start` runs the compiled output.

## Health Check

`GET /health` returns a simple uptime payload to help with monitoring.





### `GET /api/social/reddit?symbol=AAPL`
Fetch Reddit posts mentioning the ticker using the official API (requires `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET`).

Response body:
```json
{
  "ticker": "AAPL",
  "query": "AAPL stock",
  "totalPosts": 10,
  "totalUpvotes": 1243,
  "averageComments": 36.7,
  "topSubreddits": [
    { "name": "stocks", "mentions": 4 },
    { "name": "investing", "mentions": 3 }
  ],
  "posts": [
    {
      "id": "abc123",
      "title": "Why AAPL could rally into earnings",
      "url": "https://www.reddit.com/r/stocks/comments/abc123",
      "score": 512,
      "comments": 88,
      "subreddit": "stocks",
      "createdAt": "2025-01-01T12:34:56.000Z"
    }
  ],
  "lastUpdated": "2025-01-01T12:45:00.000Z"
}
```
