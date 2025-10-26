# Backend API Technical Specification

**Version**: 1.0  
**Last Updated**: October 26, 2025  
**Base URL**: `http://localhost:3000` (development)

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Authentication](#authentication)
4. [API Endpoints](#api-endpoints)
   - [Health Check](#health-check)
   - [Authentication Routes](#authentication-routes)
   - [Finance Routes](#finance-routes)
   - [Social Routes](#social-routes)
   - [Assessment Routes](#assessment-routes)
   - [Trading Routes](#trading-routes)
5. [Data Models](#data-models)
6. [Error Handling](#error-handling)
7. [Configuration](#configuration)

---

## Overview

The LearnCodex backend is a Node.js/Express API server that provides equity analysis, trading agent assessments, and financial data integration. It leverages multiple external services (Finnhub, Reddit, OpenAI) and implements a sophisticated multi-agent trading analysis system using LangChain/LangGraph.

### Key Features

- **Google OAuth 2.0 authentication** with PKCE flow
- **Real-time financial data** from Finnhub API
- **Social sentiment analysis** from Reddit
- **AI-powered equity assessments** using OpenAI
- **Multi-agent trading analysis** with debate-based decision making
- **Chart analysis** with vision AI models
- **Server-Sent Events (SSE)** for real-time progress updates
- **PostgreSQL database** for assessment history and user sessions

---

## Architecture

### Technology Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL (via Drizzle ORM)
- **AI/ML**: OpenAI API, LangChain, LangGraph
- **External APIs**: Finnhub (finance), Reddit (social sentiment)
- **Authentication**: Google OAuth 2.0 with PKCE
- **Session Management**: Cookie-based sessions

### Server Configuration

- **Default Port**: 3000
- **CORS**: Enabled for frontend (default: `http://localhost:5173`)
- **Timeouts**: 
  - Headers: 10 minutes (600s)
  - Request: Unlimited (for long-running trading agent calls)
  - Keep-Alive: ~11 minutes (650s)

---

## Authentication

### OAuth 2.0 Flow

The API uses Google OAuth 2.0 with PKCE (Proof Key for Code Exchange) for secure authentication.

**Flow Overview**:
1. Client initiates auth via `GET /api/auth/google`
2. User authenticates with Google
3. Google redirects to `GET /api/auth/google/callback`
4. Server creates session and sets `sessionId` cookie
5. Subsequent requests include cookie for authentication

### Protected Routes

Some routes require authentication via the `requireAuth` middleware. Protected routes check for a valid `sessionId` cookie and attach user information to the request.

---

## API Endpoints

### Health Check

#### `GET /health`

**Description**: Server health check endpoint.

**Authentication**: None

**Response**:
```json
{
  "status": "ok",
  "uptime": 12345.67
}
```

---

## Authentication Routes

Base path: `/api/auth`

### `GET /api/auth/google`

**Description**: Initiates Google OAuth 2.0 authentication flow.

**Authentication**: None

**Flow**:
1. Generates random state and PKCE code verifier/challenge
2. Stores verifier temporarily (in-memory, 5-minute TTL)
3. Redirects user to Google OAuth consent screen

**Response**: HTTP 302 redirect to Google OAuth URL

---

### `GET /api/auth/google/callback`

**Description**: OAuth callback endpoint after Google authentication.

**Authentication**: None (OAuth flow)

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `code` | string | Yes | Authorization code from Google |
| `state` | string | Yes | State token for CSRF protection |
| `error` | string | No | Error code if auth failed |

**Response**: HTTP 302 redirect to frontend with session cookie set

**Cookies Set**:
| Name | Type | HttpOnly | Secure | SameSite | MaxAge |
|------|------|----------|--------|----------|--------|
| `sessionId` | string | true | production only | lax | 7 days |

**Error Redirects**:
- `?error=oauth_denied`: User denied permission
- `?error=invalid_callback`: Missing/invalid callback parameters
- `?error=invalid_state`: PKCE state mismatch
- `?error=auth_failed`: Token exchange or user creation failed

---

### `POST /api/auth/logout`

**Description**: Logs out the current user and invalidates their session.

**Authentication**: None (works with or without valid session)

**Request Body**: None

**Response**:
```json
{
  "success": true
}
```

**Side Effects**: Clears `sessionId` cookie and invalidates session in database.

---

### `GET /api/auth/me`

**Description**: Retrieves current authenticated user profile.

**Authentication**: Required

**Response**:
```json
{
  "id": "uuid-string",
  "email": "user@example.com",
  "name": "John Doe",
  "picture": "https://...",
  "createdAt": "2025-10-26T00:00:00.000Z"
}
```

**Error Response** (401):
```json
{
  "error": "Unauthorized"
}
```

---

## Finance Routes

Base path: `/api/finance`

These routes provide real-time financial data from the Finnhub API.

### `GET /api/finance/quote`

**Description**: Retrieves real-time stock quote data for a symbol.

**Authentication**: None

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | Yes | Stock ticker symbol (e.g., AAPL) |

**Response**:
```json
{
  "symbol": "AAPL",
  "current": 178.50,
  "high": 180.25,
  "low": 177.80,
  "open": 179.00,
  "previousClose": 178.00,
  "timestamp": 1698345600
}
```

**Error Response** (400):
```json
{
  "error": "symbol query parameter is required"
}
```

---

### `GET /api/finance/profile`

**Description**: Retrieves company profile information.

**Authentication**: None

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | Yes | Stock ticker symbol |

**Response**:
```json
{
  "symbol": "AAPL",
  "name": "Apple Inc",
  "exchange": "NASDAQ",
  "currency": "USD",
  "ipo": "1980-12-12",
  "marketCapitalization": 2750000.0,
  "shareOutstanding": 15500.0,
  "logo": "https://...",
  "weburl": "https://www.apple.com"
}
```

---

### `GET /api/finance/metrics`

**Description**: Retrieves key financial metrics and ratios.

**Authentication**: None

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | Yes | Stock ticker symbol |

**Response**:
```json
{
  "symbol": "AAPL",
  "pe": 28.5,
  "eps": 6.25,
  "revenueGrowth": 8.5,
  "operatingMargin": 30.2,
  "dividendYield": 0.52,
  "priceToFreeCashFlow": 24.3,
  "debtToEquity": 1.8,
  "earningsRevision": 2.1
}
```

**Note**: Any metric may be `null` if data is unavailable.

---

## Social Routes

Base path: `/api/social`

### `GET /api/social/reddit`

**Description**: Retrieves Reddit sentiment analysis and discussions for a stock.

**Authentication**: None

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | Yes | Stock ticker symbol |
| `ticker` | string | No | Alias for symbol |

**Response**:
```json
{
  "symbol": "AAPL",
  "sentiment": "positive",
  "mentionCount": 145,
  "summary": "Reddit users are generally bullish on AAPL...",
  "topPosts": [
    {
      "title": "AAPL earnings beat expectations",
      "subreddit": "wallstreetbets",
      "score": 2450,
      "url": "https://reddit.com/...",
      "created": 1698345600
    }
  ]
}
```

---

## Assessment Routes

Base path: `/api/assessment`

### `POST /api/assessment`

**Description**: Generates an AI-powered equity assessment using OpenAI and comprehensive market data.

**Authentication**: None

**Request Body**:
```json
{
  "symbol": "AAPL",
  "timeframe": "short-term",
  "strategyFocus": "growth",
  "additionalContext": "Looking for entry point"
}
```

**Body Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | Yes | Stock ticker symbol |
| `timeframe` | string | No | Investment timeframe (e.g., short-term, long-term) |
| `strategyFocus` | string | No | Strategy focus (e.g., growth, value, income) |
| `additionalContext` | string | No | Additional context for the assessment |

**Response**:
```json
{
  "summary": "Apple Inc shows strong fundamentals with...",
  "riskRating": "medium",
  "opportunities": [
    "Strong services revenue growth",
    "Expanding into new markets"
  ],
  "watchItems": [
    "Supply chain constraints",
    "Regulatory scrutiny in EU"
  ],
  "nextSteps": [
    "Monitor Q4 earnings report",
    "Evaluate entry price below $175"
  ],
  "rawText": "Complete assessment text..."
}
```

**Risk Rating Values**: `"low"` | `"medium"` | `"high"`

**Context Data Gathered**:
- Real-time quote from Finnhub
- Company profile
- Financial metrics
- Recent news articles (past year, up to 20 articles)

**Error Response** (400):
```json
{
  "error": "symbol is required"
}
```

---

## Trading Routes

Base path: `/api/trading`

These routes implement the multi-agent trading analysis system with debate-based decision making.

### `POST /api/trading/decision/internal`

**Description**: Executes a comprehensive multi-agent trading analysis with real-time progress tracking.

**Authentication**: None

**Request Body**:
```json
{
  "symbol": "AAPL",
  "runId": "custom-run-123",
  "modelId": "gpt-4o",
  "analysts": ["fundamental", "market", "news", "social"],
  "useMockData": false
}
```

**Body Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | Yes | Stock ticker (1-5 uppercase letters) |
| `runId` | string | No | Custom run identifier (auto-generated if omitted) |
| `modelId` | string | No | OpenAI model ID (defaults to env config) |
| `analysts` | string[] | No | Array of analyst IDs to include (defaults to all) |
| `useMockData` | boolean | No | Use mock data instead of live APIs |

**Analyst IDs**: `"fundamental"` | `"market"` | `"news"` | `"social"`

**Response**:
```json
{
  "runId": "run_20251026_123456",
  "symbol": "AAPL",
  "tradeDate": "2025-10-26",
  "decision": "BUY",
  "finalTradeDecision": "Strong Buy with risk management",
  "executionMs": 45230,
  "investmentPlan": "Detailed investment plan...",
  "traderPlan": "Detailed trader plan...",
  "investmentJudge": "Investment judge analysis...",
  "riskJudge": "Risk assessment...",
  "marketReport": "Market analyst report...",
  "sentimentReport": "Social sentiment report...",
  "newsReport": "News analyst report...",
  "fundamentalsReport": "Fundamental analyst report...",
  "investmentDebate": "Bull vs Bear debate transcript...",
  "bullArgument": "Bull case argument...",
  "bearArgument": "Bear case argument...",
  "aggressiveArgument": "Aggressive risk position...",
  "conservativeArgument": "Conservative risk position...",
  "neutralArgument": "Neutral risk position...",
  "riskDebate": "Risk debate transcript...",
  "modelId": "gpt-4o",
  "analysts": ["fundamental", "market", "news", "social"]
}
```

**Decision Values**: `"BUY"` | `"SELL"` | `"HOLD"` | `null`

**Process Flow**:
1. Validates request and generates/assigns runId
2. Initializes progress tracking
3. Gathers market context from multiple sources
4. Runs specialist analysts in parallel
5. Conducts bull vs bear debate
6. Generates investment and trader plans
7. Conducts risk analysis debate
8. Produces final judge decision
9. Stores results in database (if history enabled)

**Error Response** (400):
```json
{
  "error": "symbol must be 1-5 uppercase letters",
  "field": "symbol"
}
```

---

### `GET /api/trading/decision/internal`

**Description**: Same as POST version but accepts parameters via query string. Useful for browser testing.

**Authentication**: None

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | Yes | Stock ticker symbol |
| `runId` | string | No | Custom run identifier |
| `modelId` | string | No | OpenAI model ID |
| `analysts` | string | No | Comma-separated analyst IDs |
| `useMockData` | boolean | No | Use mock data |

**Response**: Same as POST version

---

### `GET /api/trading/decision/internal/events/:runId`

**Description**: Server-Sent Events (SSE) stream for real-time progress updates during trading analysis.

**Authentication**: None

**URL Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `runId` | string | Run identifier to track |

**Response**: SSE stream with `Content-Type: text/event-stream`

**Event Types**:

**1. Progress Event**:
```
event: progress
data: {"runId":"run_123","stage":"gathering_data","label":"Gathering market data","percent":15,"modelId":"gpt-4o","analysts":["fundamental","market","news","social"],"mode":"live"}
```

**2. Completion Event**:
```
event: complete
data: {"runId":"run_123","symbol":"AAPL","decision":"BUY","executionMs":45230,...}
```

**3. Error Event**:
```
event: error
data: {"runId":"run_123","message":"Failed to fetch market data"}
```

**Progress Stages**:
- `queued`: Analysis queued
- `gathering_data`: Fetching market context
- `analyzing`: Running specialist analysts
- `debating`: Bull vs Bear debate
- `planning`: Generating plans
- `risk_analysis`: Risk assessment
- `final_decision`: Judge making decision
- `complete`: Analysis complete
- `error`: Analysis failed

---

### `GET /api/trading/assessments`

**Description**: Retrieves paginated list of past trading assessments for a symbol.

**Authentication**: None

**Feature Flag**: Requires `TRADING_ASSESSMENT_HISTORY_ENABLED=true`

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | Yes | Stock ticker symbol |
| `limit` | integer | No | Results per page (1-20, default 5) |
| `cursor` | string | No | Pagination cursor from previous response |

**Response**:
```json
{
  "items": [
    {
      "runId": "run_20251026_123456",
      "symbol": "AAPL",
      "tradeDate": "2025-10-26",
      "decision": "BUY",
      "modelId": "gpt-4o",
      "analysts": ["fundamental", "market", "news", "social"],
      "createdAt": "2025-10-26T10:30:00.000Z",
      "orchestratorVersion": "langgraph-v2",
      "executionMs": 45230
    }
  ],
  "nextCursor": "cursor_xyz"
}
```

**Error Responses**:

**404** (History disabled):
```json
{
  "error": "Not found"
}
```

**503** (Database unavailable):
```json
{
  "error": "Trading assessment history is unavailable"
}
```

**400** (Invalid parameters):
```json
{
  "error": "symbol must be 1-5 uppercase letters",
  "field": "symbol"
}
```

---

### `GET /api/trading/assessments/:runId`

**Description**: Retrieves detailed results for a specific trading assessment.

**Authentication**: None

**Feature Flag**: Requires `TRADING_ASSESSMENT_HISTORY_ENABLED=true`

**URL Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `runId` | string | Run identifier (max 128 chars) |

**Response**:
```json
{
  "runId": "run_20251026_123456",
  "symbol": "AAPL",
  "tradeDate": "2025-10-26",
  "decision": "BUY",
  "modelId": "gpt-4o",
  "analysts": ["fundamental", "market", "news", "social"],
  "createdAt": "2025-10-26T10:30:00.000Z",
  "orchestratorVersion": "langgraph-v2",
  "executionMs": 45230,
  "payload": {
    "symbol": "AAPL",
    "tradeDate": "2025-10-26",
    "context": { /* market context */ }
  },
  "rawText": "Complete decision text...",
  "promptHash": "sha256-hash",
  "logsPath": "/path/to/logs",
  "traderPlan": "Trader plan...",
  "investmentPlan": "Investment plan...",
  "riskJudge": "Risk assessment...",
  "investmentDebate": "Debate transcript...",
  "bullArgument": "Bull argument...",
  "bearArgument": "Bear argument...",
  "aggressiveArgument": "Aggressive position...",
  "conservativeArgument": "Conservative position...",
  "neutralArgument": "Neutral position...",
  "riskDebate": "Risk debate..."
}
```

**Error Response** (404):
```json
{
  "error": "Assessment not found"
}
```

---

### `POST /api/trading/trade-ideas/:tradeIdeaId/chart-analysis`

**Description**: Analyzes a stock chart image using vision AI models.

**Authentication**: None

**Content-Type**: `multipart/form-data`

**URL Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `tradeIdeaId` | string | Trade idea identifier |

**Form Fields**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `image` | file | Yes | Chart image (PNG, JPEG, WEBP, max 5MB) |
| `ticker` | string | No | Stock ticker symbol |
| `timeframe` | string | No | Chart timeframe (e.g., 1D, 1W, 1M) |
| `notes` | string | No | Additional context/notes |

**Response**:
```json
{
  "tradeIdeaId": "idea-123",
  "ticker": "AAPL",
  "timeframe": "1D",
  "analysis": {
    "rawText": "Complete analysis...",
    "sections": {
      "trend": "Uptrend with support at $175",
      "indicators": "RSI showing oversold...",
      "patterns": "Double bottom forming..."
    },
    "annotations": {
      "supportLevels": [175, 170],
      "resistanceLevels": [180, 185]
    },
    "usage": {
      "total_tokens": 1250,
      "prompt_tokens": 800,
      "completion_tokens": 450
    }
  }
}
```

**Supported Image Types**: `image/png`, `image/jpeg`, `image/jpg`, `image/webp`

**Error Response** (400):
```json
{
  "error": "image is required (multipart field name \"image\")"
}
```

---

### `POST /api/trading/trade-ideas/:tradeIdeaId/chart-debate`

**Description**: Performs multi-round debate analysis on a chart using two AI agents and a referee.

**Authentication**: None

**Content-Type**: `multipart/form-data`

**URL Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `tradeIdeaId` | string | Trade idea identifier |

**Form Fields**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `image` | file | Yes | Chart image (PNG, JPEG, WEBP, max 5MB) |
| `ticker` | string | No | Stock ticker symbol |
| `timeframe` | string | No | Chart timeframe |
| `notes` | string | No | Additional context |
| `aRounds` | integer | No | Number of Agent A turns (≥1, default from env) |
| `bRounds` | integer | No | Number of Agent B turns (≥0, default from env) |

**Response** (202 Accepted):
```json
{
  "jobId": "debate-job-abc123"
}
```

**Process**:
1. Returns immediately with `jobId`
2. Starts async debate process:
   - Agent A analyzes chart (bullish perspective)
   - Agent B analyzes chart (bearish perspective)
   - Multi-round debate between agents
   - Referee synthesizes consensus
3. Client polls job status via `/trade-ideas/chart-debate/jobs/:jobId`

---

### `GET /api/trading/trade-ideas/chart-debate/jobs/:jobId`

**Description**: Retrieves status and results of a chart debate job.

**Authentication**: None

**URL Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `jobId` | string | Job identifier from debate initiation |

**Response (In Progress)**:
```json
{
  "jobId": "debate-job-abc123",
  "status": "running",
  "tradeIdeaId": "idea-123",
  "ticker": "AAPL",
  "timeframe": "1D",
  "steps": [
    {"step": "started", "message": "Debate started", "timestamp": "2025-10-26T10:30:00.000Z"},
    {"step": "agentA_round1", "message": "Agent A analyzing...", "timestamp": "2025-10-26T10:30:05.000Z"}
  ]
}
```

**Response (Completed)**:
```json
{
  "jobId": "debate-job-abc123",
  "status": "completed",
  "tradeIdeaId": "idea-123",
  "ticker": "AAPL",
  "timeframe": "1D",
  "steps": [ /* ... */ ],
  "result": {
    "agentA": {
      "rawText": "Agent A full analysis...",
      "sections": {
        "thesis": "Bullish case...",
        "evidence": "Support levels holding..."
      },
      "usage": { /* token usage */ }
    },
    "agentB": {
      "rawText": "Agent B full analysis...",
      "sections": {
        "thesis": "Bearish case...",
        "evidence": "Resistance rejections..."
      },
      "usage": { /* token usage */ }
    },
    "referee": {
      "rawText": "Referee synthesis...",
      "sections": {
        "consensus": "Mixed signals with slight bullish bias",
        "keyPoints": "..."
      },
      "consensusJson": {
        "direction": "neutral-bullish",
        "confidence": 0.65
      },
      "usage": { /* token usage */ }
    },
    "logFile": "/path/to/debate-log.json"
  }
}
```

**Response (Failed)**:
```json
{
  "jobId": "debate-job-abc123",
  "status": "failed",
  "error": "Failed to analyze chart",
  "steps": [ /* ... */ ]
}
```

**Error Response** (404):
```json
{
  "error": "Job not found"
}
```

---

## Data Models

### User

```typescript
interface User {
  id: string;              // UUID
  email: string;
  name: string;
  picture: string;         // Avatar URL
  createdAt: string;       // ISO 8601
  updatedAt: string;       // ISO 8601
}
```

### Session

```typescript
interface Session {
  id: string;              // UUID
  userId: string;          // Foreign key to User
  createdAt: string;
  expiresAt: string;
  userAgent?: string;
  ipAddress?: string;
}
```

### TradingAgentsContext

```typescript
interface AgentsContext {
  market_price_history: string;       // Historical price data
  market_technical_report: string;    // Technical indicators
  social_stock_news: string;          // Social media mentions
  social_reddit_summary: string;      // Reddit sentiment
  news_company: string;               // Company news
  news_reddit: string;                // Reddit discussions
  news_global: string;                // Global market news
  fundamentals_summary: string;       // Key fundamentals
  fundamentals_balance_sheet: string; // Balance sheet data
  fundamentals_cashflow: string;      // Cash flow statement
  fundamentals_income_stmt: string;   // Income statement
  fundamentals_insider_transactions?: string; // Insider trades
}
```

### TradingAgentsDecision

```typescript
interface TradingAgentsDecision {
  symbol: string;
  tradeDate: string;              // YYYY-MM-DD
  decision: string | null;        // BUY | SELL | HOLD
  finalTradeDecision?: string | null;
  executionMs?: number | null;
  investmentPlan?: string | null;
  traderPlan?: string | null;
  investmentJudge?: string | null;
  riskJudge?: string | null;
  marketReport?: string | null;
  sentimentReport?: string | null;
  newsReport?: string | null;
  fundamentalsReport?: string | null;
  investmentDebate?: string | null;
  bullArgument?: string | null;
  bearArgument?: string | null;
  aggressiveArgument?: string | null;
  conservativeArgument?: string | null;
  neutralArgument?: string | null;
  riskDebate?: string | null;
  modelId?: string | null;
  analysts?: TradingAnalystId[];
}
```

### AssessmentLog

```typescript
interface AssessmentLog {
  id: number;
  symbol: string;
  request_payload: AssessmentInput;    // JSONB
  context_payload: AssessmentContext;  // JSONB
  assessment_payload: AssessmentPayload; // JSONB
  raw_text: string;
  prompt_text: string;
  system_prompt: string;
  created_at: string;                  // ISO 8601
}
```

### ChartAnalysis

```typescript
interface ChartAnalysisResult {
  rawText: string;
  sections: Record<string, string>;
  annotations: Record<string, unknown> | null;
  usage?: {
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    reasoning_tokens?: number;
  };
}
```

### ChartDebate

```typescript
interface ChartDebateResult {
  agentA: {
    rawText: string;
    sections: Record<string, string>;
    usage?: ResponseUsage;
  };
  agentB: {
    rawText: string;
    sections: Record<string, string>;
    usage?: ResponseUsage;
  };
  referee: {
    rawText: string;
    sections: Record<string, string>;
    consensusJson?: Record<string, unknown> | null;
    usage?: ResponseUsage;
  };
  logFile?: string;
}
```

---

## Error Handling

### Standard Error Response

All errors follow a consistent format:

```typescript
interface ErrorResponse {
  error: string;        // Human-readable error message
  field?: string;       // Optional field name that caused the error
}
```

### HTTP Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Successful request |
| 202 | Accepted | Async job accepted (chart debate) |
| 400 | Bad Request | Invalid parameters or missing required fields |
| 401 | Unauthorized | Authentication required but not provided |
| 404 | Not Found | Resource or endpoint not found |
| 500 | Internal Server Error | Unexpected server error |
| 503 | Service Unavailable | Dependent service unavailable |

### Error Categories

**Validation Errors** (400):
- Missing required parameters
- Invalid parameter format
- Out-of-range values

**Authentication Errors** (401):
- Missing or invalid session
- Expired session

**Not Found Errors** (404):
- Unknown endpoint
- Resource doesn't exist
- Feature disabled

**Service Errors** (500):
- External API failures
- Database errors
- Unexpected exceptions

### Error Examples

**Missing Parameter**:
```json
{
  "error": "symbol query parameter is required",
  "field": "symbol"
}
```

**Invalid Format**:
```json
{
  "error": "symbol must be 1-5 uppercase letters",
  "field": "symbol"
}
```

**Service Error**:
```json
{
  "error": "Failed to fetch market data from Finnhub API"
}
```

---

## Configuration

### Environment Variables

#### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:5173` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/db` |
| `OPENAI_API_KEY` | OpenAI API key | `sk-...` |
| `FINNHUB_API_KEY` | Finnhub API key | `...` |

#### OAuth Configuration

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL |

#### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `TRADING_AGENTS_MOCK_MODE` | `false` | Use mock data for trading agents |
| `TRADING_ASSESSMENT_HISTORY_ENABLED` | `true` | Enable assessment history |
| `DEFAULT_TRADING_MODEL` | `gpt-4o` | Default OpenAI model |
| `TRADING_ALLOWED_MODELS` | `gpt-4o,gpt-4o-mini` | Comma-separated allowed models |
| `FINNHUB_BASE_URL` | `https://finnhub.io/api/v1` | Finnhub API base URL |
| `CHART_ANALYSIS_MAX_IMAGE_BYTES` | `5242880` | Max chart image size (5MB) |
| `CHART_ANALYSIS_MAX_OUTPUT_TOKENS` | `5500` | Max tokens for chart analysis |

### Feature Flags

**Trading Assessment History**:
- Env: `TRADING_ASSESSMENT_HISTORY_ENABLED`
- Controls: `/api/trading/assessments/*` endpoints
- Requires: `DATABASE_URL` configured

**Mock Mode**:
- Env: `TRADING_AGENTS_MOCK_MODE`
- Controls: Whether to use mock data instead of live APIs
- Useful for: Development, testing, rate limit management

---

## Performance Considerations

### Timeouts

Long-running trading agent analyses can take 30-120 seconds. The server is configured with generous timeouts:
- **Headers timeout**: 10 minutes
- **Request timeout**: Unlimited
- **Keep-alive**: 11 minutes

### Caching

No built-in response caching. Consider implementing:
- Redis for session storage
- API response caching for financial data
- Assessment result caching

### Rate Limits

External API rate limits:
- **Finnhub**: 60 calls/minute (free tier)
- **OpenAI**: Account-specific limits
- **Reddit**: Configured in service

Implement rate limiting middleware for production deployments.

---

## Database Schema

### Key Tables

**`auth.users`**: User accounts from Google OAuth

**`auth.sessions`**: Active user sessions

**`public.assessment_logs`**: Equity assessment history

**`drizzle.ta_decisions`** (implied): Trading agent decision history

See `/backend/docs/db-schema.md` for complete schema documentation.

---

## Security Considerations

### Authentication

- OAuth 2.0 with PKCE flow prevents CSRF attacks
- HttpOnly cookies prevent XSS cookie theft
- Secure cookies in production (HTTPS only)
- Session expiration: 7 days

### Input Validation

- All ticker symbols validated against regex: `^[A-Z]{1,5}$`
- File upload size limits enforced
- MIME type validation for images
- SQL injection protection via Drizzle ORM

### CORS

- Configured for specific frontend origin
- Credentials enabled for cookie-based auth
- Do not use `*` in production

### API Keys

- Never expose API keys in responses
- Store in environment variables
- Rotate regularly

---

## Development

### Local Setup

```bash
cd backend
npm install
cp .env.example .env  # Configure environment variables
npm run dev           # Start development server
```

### Testing

```bash
npm test              # Run test suite
npm run test:watch    # Watch mode
```

### Database Migrations

```bash
npm run db:migrate    # Run migrations
npm run db:push       # Push schema changes
npm run db:studio     # Open Drizzle Studio
```

---

## Deployment

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure `DATABASE_URL` for production database
- [ ] Set `FRONTEND_URL` to production domain
- [ ] Enable HTTPS and secure cookies
- [ ] Configure proper CORS origins
- [ ] Set up monitoring and logging
- [ ] Implement rate limiting
- [ ] Configure database connection pooling
- [ ] Set up backup strategy
- [ ] Review timeout settings for load balancer

### Monitoring

Recommended metrics:
- Request latency (especially trading agent calls)
- Error rates by endpoint
- External API failure rates
- Database connection pool usage
- Memory and CPU usage
- Trading agent execution times

---

## Appendix

### Trading Agent Workflow

```
1. Request received → Validate parameters
2. Generate runId → Initialize progress tracking
3. Gather market context:
   - Price history (Finnhub)
   - Technical indicators
   - Company news
   - Reddit sentiment
   - Financial statements
4. Run specialist analysts in parallel:
   - Fundamental Analyst
   - Market Analyst
   - News Analyst
   - Social Sentiment Analyst
5. Investment debate (Bull vs Bear)
6. Generate Investment Plan
7. Generate Trader Plan
8. Risk analysis debate (Aggressive vs Conservative vs Neutral)
9. Final judge decision
10. Store results in database
11. Publish completion event via SSE
```

### SSE Event Flow

```
Client: GET /api/trading/decision/internal/events/:runId
Server: Sets up SSE stream
Server: event: progress (stage: queued, 0%)
Server: event: progress (stage: gathering_data, 15%)
Server: event: progress (stage: analyzing, 40%)
Server: event: progress (stage: debating, 60%)
Server: event: progress (stage: planning, 75%)
Server: event: progress (stage: risk_analysis, 85%)
Server: event: progress (stage: final_decision, 95%)
Server: event: complete (full decision payload)
Client: Closes connection
```

---

## Changelog

### Version 1.0 (2025-10-26)
- Initial API specification
- Documented all 18 endpoints
- Comprehensive data models
- Configuration and deployment guide

---

## Contact & Support

For questions or issues:
- Repository: `https://github.com/chow040/learncodex`
- Documentation: `/backend/docs/`

---

**End of API Specification**
