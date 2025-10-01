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
4. Create a Reddit script application at https://www.reddit.com/prefs/apps, then copy the generated client ID/secret into `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` (choose the script app type).
5. If `DATABASE_URL` is set, run the migrations in `sql/001_create_assessment_logs.sql` and `sql/002_add_prompt_columns.sql` against your PostgreSQL instance.
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

## Assessment Logging

When `DATABASE_URL` is configured, each successful `/api/assessment` request is persisted to PostgreSQL (see `src/db/schema.ts` for the Drizzle schema definition). The log stores the request payload, enriched Finnhub context, generated prompt/system prompt, structured AI response, and raw model output. Use the provided migration `sql/001_create_assessment_logs.sql` to create the `assessment_logs` table, and query it to audit past assessments.

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
