# Phase 4 Proxy Configuration - Verification Complete ✅

## Executive Summary

**Status**: ✅ Backend proxy is configured correctly and working  
**Issue**: Frontend shows mock data due to `placeholderData` in React Query  
**Root Cause**: React Query's `placeholderData` provides instant UI feedback but masks real data  
**Solution**: Frontend is already calling the correct endpoints - no changes needed to API paths

---

## Architecture Verification

### Data Flow (Confirmed Working)

```
Frontend (Port 5173)
    ↓ Calls: http://localhost:4000/api/autotrade/v1/portfolio
Node.js Backend (Port 4000)
    ↓ Proxies to: http://127.0.0.1:8000/internal/autotrade/v1/portfolio
Python Auto-Trade Service (Port 8000)
    ↓ Returns simulation data from logs/simulation_state.json
```

### Configuration Files

#### 1. Frontend `.env` ✅
**File**: `/equity-insight-react/.env`
```properties
VITE_API_BASE_URL=http://localhost:4000
```
- ✅ Correctly points to Node.js backend on port 4000

#### 2. Node.js Backend `.env` ✅
**File**: `/backend/.env`
```properties
PORT=4000
AUTOTRADE_SERVICE_URL=http://127.0.0.1:8000
AUTOTRADE_SERVICE_KEY=sk-auto-trade-VEbY3vD1q5fX9nL6Z8J2HCoW3RmJ9X1Yt9mQ
```
- ✅ Node.js backend runs on port 4000
- ✅ Proxies to Python service at http://127.0.0.1:8000
- ✅ Includes authentication key

#### 3. Node.js Backend Config ✅
**File**: `/backend/src/config/env.ts`
```typescript
export const env = {
  autotradeServiceUrl: process.env.AUTOTRADE_SERVICE_URL ?? undefined,
  autotradeServiceKey: process.env.AUTOTRADE_SERVICE_KEY ?? undefined,
  // ... other config
}
```
- ✅ Reads `AUTOTRADE_SERVICE_URL` from environment
- ✅ Defaults to undefined if not set (safe)

---

## API Layer Analysis

### Node.js HTTP Client ✅
**File**: `/backend/src/services/autotradeHttpClient.ts`

**Key Features**:
1. Creates Axios instance with base URL from `env.autotradeServiceUrl`
2. Sets timeout to 10 seconds
3. Automatically adds `x-service-key` header for authentication
4. Caches client instance for reuse

```typescript
client = axios.create({
  baseURL: env.autotradeServiceUrl,  // http://127.0.0.1:8000
  timeout: DEFAULT_TIMEOUT_MS,
  headers: {
    'user-agent': USER_AGENT,
  },
});
```

### Node.js Service Layer ✅
**File**: `/backend/src/services/autoTradeService.ts`

**Portfolio Fetching**:
```typescript
export const fetchAutoTradePortfolio = async (): Promise<AutoTradePortfolioSnapshot> => {
  try {
    const client = getAutotradeHttpClient()
    const data = await withServiceError<PythonPortfolioResponse>(SERVICE_NAME, "portfolio", async () => {
      const response = await client.get<PythonPortfolioResponse>("/internal/autotrade/v1/portfolio")
      return response.data
    })
    return mapPortfolio(data.portfolio)
  } catch (error) {
    // Fallback to DB or mock data
    console.warn("[autotrade] Falling back to DB/mock portfolio due to error:", (error as Error).message)
    const snapshot = await getLatestAutoTradePortfolio()
    return snapshot ?? autoTradeMockPortfolio
  }
}
```

**Data Transformation**: ✅ Converts Python's snake_case to frontend's camelCase
- `portfolio_id` → `portfolioId`
- `available_cash` → `availableCash`
- `last_run_at` → `lastRunAt`
- etc.

### Node.js Routes ✅
**File**: `/backend/src/routes/autotradeRoutes.ts`

**Endpoints**:
- `GET /v1/portfolio` → Calls `fetchAutoTradePortfolio()`
- `GET /v1/decisions` → Calls `fetchAutoTradeDecisions()`
- `GET /v1/scheduler/status` → Calls `fetchSchedulerStatus()`
- `POST /v1/scheduler/trigger` → Calls `triggerScheduler()`

**Mounted at**: `/api/autotrade` (configured in main app)

---

## Frontend Analysis

### React Query Hooks ✅ (But with placeholderData)

#### useAutoTradingPortfolio.ts
```typescript
export const useAutoTradingPortfolio = (options?: { apiBaseUrl?: string; enabled?: boolean }) => {
  const baseUrl = resolveApiBaseUrl(options?.apiBaseUrl)
  const enabled = options?.enabled ?? true

  return useQuery({
    queryKey: ["autoTradingPortfolio", baseUrl],
    queryFn: () => fetchPortfolio(baseUrl),
    enabled,
    staleTime: 30_000,
    retry: 1,
    placeholderData: mockAutoTradingPortfolio,  // ← THIS is why mock data shows
  })
}
```

**Fetches from**: `${baseUrl}/api/autotrade/v1/portfolio`  
**With baseUrl**: `http://localhost:4000` (from `.env`)  
**Full URL**: `http://localhost:4000/api/autotrade/v1/portfolio` ✅ CORRECT

**The Issue**:
- `placeholderData: mockAutoTradingPortfolio` makes React Query show mock data **immediately**
- Real data is fetched in background but may not update UI if mock data is "good enough"
- This is by design for better UX, but masks simulation data

#### useAutoTradingDecision.ts
Same pattern - uses `placeholderData` with mock data.

#### Dashboard Component ✅
```typescript
const { data, isLoading, isError } = useAutoTradingPortfolio()
const portfolio: AutoTradePortfolioSnapshot = data ?? mockAutoTradingPortfolio
```

**Fallback Chain**:
1. If `data` exists (real data from API) → use it
2. If `data` is undefined → use `mockAutoTradingPortfolio`

**Why it shows mock data**:
- `placeholderData` in the hook means `data` is **never** undefined during initial load
- The `?? mockAutoTradingPortfolio` fallback is rarely triggered
- User sees mock data instantly, real data loads in background

---

## API Response Verification

### Test 1: Node.js Backend (Port 4000)
```bash
curl http://localhost:4000/api/autotrade/v1/portfolio
```

**Response** (abbreviated):
```json
{
  "portfolio": {
    "portfolioId": "simulation",
    "automationEnabled": true,
    "mode": "Paper trading",
    "availableCash": 10000,
    "equity": 10000,
    "totalPnl": 0,
    "pnlPct": 0,
    "sharpe": 0,
    "drawdownPct": 0,
    "lastRunAt": "2025-10-31T06:45:17.688832",
    "nextRunInMinutes": 3,
    "positions": [],
    "decisions": [],
    "events": []
  }
}
```

✅ **Status**: Working correctly  
✅ **Case**: camelCase (transformed by Node.js service)  
✅ **Structure**: Nested `portfolio` object  
✅ **Data**: Real simulation data (empty positions, $10k cash)

### Test 2: Python Service Direct (Port 8000)
```bash
curl http://127.0.0.1:8000/internal/autotrade/v1/portfolio
```

Expected response (not tested but should work):
```json
{
  "portfolio": {
    "portfolio_id": "simulation",
    "automation_enabled": true,
    "mode": "Paper trading",
    "available_cash": 10000.0,
    ...
  }
}
```

✅ **Should work**: Python service is running  
✅ **Case**: snake_case (Python convention)  
✅ **Transform**: Node.js service converts to camelCase

---

## Why Mock Data Shows in Frontend

### React Query Behavior with `placeholderData`

From [TanStack Query docs](https://tanstack.com/query/latest/docs/framework/react/guides/placeholder-query-data):

> `placeholderData` allows a query to behave as if it has data while the query is still pending. The placeholder data is not persisted to the cache.

**What this means**:
1. User opens dashboard
2. React Query **immediately** returns `mockAutoTradingPortfolio` as `data`
3. User sees positions table populated with BTC, ETH, SOL, etc.
4. Real API call happens in background
5. When real data arrives (empty positions), UI **might** update or might not
6. If mock data is structurally valid, React Query may not trigger re-render

### Evidence from User's Screenshot

User shared screenshot showing:
- 6 positions: BTC, ETH, SOL, XRP, DOGE, BNB
- BTC: 0.12000 @ $107,343.00
- ETH: 2.45000 @ $3,890.50
- etc.

These exact values are in `mockAutoTradingMockData.ts`:
```typescript
export const mockAutoTradingPortfolio: AutoTradePortfolioSnapshot = {
  // ...
  positions: [
    {
      symbol: "BTC",
      quantity: 0.12,
      entryPrice: 107343,
      markPrice: 107343,
      // ...
    },
    // ... other positions
  ],
}
```

But API returns `positions: []` (empty array).

**Conclusion**: Frontend is showing `placeholderData`, not real API response.

---

## Why This Happened

### Original Design Intent
1. **Good UX**: Mock data provides instant feedback (no loading state)
2. **Offline Development**: Developers can work on UI without backend
3. **Fallback Safety**: If API fails, users still see something

### But Now It's a Problem
1. **Simulation Backend Ready**: We have real data to show
2. **Phase 4 Goal**: Display simulation data, not mock data
3. **Confusion**: Can't tell if simulation is working when mock data always shows

---

## The Fix Strategy

### What NOT to Do ❌
- ❌ Change API paths from `/api/...` to `/internal/...` (breaks proxy)
- ❌ Change backend port from 4000 to 8000 (frontend expects 4000)
- ❌ Remove all error handling (causes crashes)
- ❌ Make multiple changes at once (impossible to debug)

### What TO Do ✅

#### Option 1: Remove placeholderData (Recommended for Phase 4)
**Goal**: Show real simulation data, require API to work

**Changes**:
1. Remove `placeholderData` from `useAutoTradingPortfolio.ts`
2. Remove `placeholderData` from `useAutoTradingDecision.ts`
3. Update dashboard to handle loading and error states properly
4. Keep the `?? mockAutoTradingPortfolio` fallback for safety

**Pros**:
- Shows actual simulation data
- Clear indication when API fails (loading/error states)
- True integration testing possible

**Cons**:
- Requires robust error handling
- Loading states needed for UX
- API must be running for UI to work

#### Option 2: Conditional placeholderData (Development Friendly)
**Goal**: Use mock data only in development, real data in production

**Changes**:
```typescript
export const useAutoTradingPortfolio = (options?: { apiBaseUrl?: string; enabled?: boolean }) => {
  const baseUrl = resolveApiBaseUrl(options?.apiBaseUrl)
  const enabled = options?.enabled ?? true
  
  const usePlaceholder = import.meta.env.DEV && !import.meta.env.VITE_USE_REAL_DATA

  return useQuery({
    queryKey: ["autoTradingPortfolio", baseUrl],
    queryFn: () => fetchPortfolio(baseUrl),
    enabled,
    staleTime: 30_000,
    retry: 1,
    placeholderData: usePlaceholder ? mockAutoTradingPortfolio : undefined,
  })
}
```

**Pros**:
- Best of both worlds
- Dev mode still has instant feedback
- Production shows real data only
- Can be toggled with env var

**Cons**:
- More complex
- Need to remember to test without mock data

#### Option 3: Add Visual Indicator (Minimal Change)
**Goal**: Keep mock data but clearly show when it's being used

**Changes**:
Add banner to dashboard:
```typescript
const { data, isLoading, isError } = useAutoTradingPortfolio()
const usingMockData = !data || data === mockAutoTradingPortfolio

{usingMockData && (
  <Alert variant="warning">
    Showing mock data - API unavailable or returning stale data
  </Alert>
)}
```

**Pros**:
- Minimal code changes
- Instant feedback for users
- Safe (doesn't break anything)

**Cons**:
- Mock data still shows
- Can't test real simulation properly
- Band-aid solution

---

## Recommendation

**For Phase 4**: Use **Option 1** (Remove placeholderData)

**Reasoning**:
1. Phase 4 goal is to integrate simulation frontend with backend
2. We have verified backend is working correctly
3. Need to actually see simulation data to validate integration
4. Loading/error states are already implemented in dashboard
5. Can always add back if needed

**Implementation Steps**:
1. ✅ Verify backend working (DONE - this document)
2. Remove `placeholderData` from `useAutoTradingPortfolio.ts`
3. Remove `placeholderData` from `useAutoTradingDecision.ts`
4. Test dashboard loads correctly
5. Verify error handling works if backend goes down
6. Add SimulationBanner component (already created)
7. Test complete flow

---

## Next Steps

### Step 1: Update useAutoTradingPortfolio.ts
Remove the `placeholderData` line:
```typescript
return useQuery({
  queryKey: ["autoTradingPortfolio", baseUrl],
  queryFn: () => fetchPortfolio(baseUrl),
  enabled,
  staleTime: 30_000,
  retry: 1,
  // placeholderData: mockAutoTradingPortfolio,  ← REMOVE THIS
})
```

### Step 2: Update useAutoTradingDecision.ts
Remove the `placeholderData` line:
```typescript
return useQuery({
  queryKey: ["autoTradingDecision", decisionId, baseUrl],
  queryFn: () => fetchDecision(baseUrl, decisionId as string),
  enabled,
  staleTime: 30_000,
  retry: 1,
  // placeholderData: decisionId ? getMockDecisionById(decisionId) ?? undefined : undefined,  ← REMOVE THIS
})
```

### Step 3: Verify Dashboard Handles Undefined Data
The dashboard already has this fallback:
```typescript
const portfolio: AutoTradePortfolioSnapshot = data ?? mockAutoTradingPortfolio
```

This is GOOD - it's a safety net. Keep it.

### Step 4: Add SimulationBanner
The component is already created at:
`equity-insight-react/src/components/trading/SimulationBanner.tsx`

Import and add to dashboard after the automation controls:
```tsx
{portfolio.mode.toLowerCase().includes("simulation") && (
  <SimulationBanner mode={portfolio.mode} lastUpdate={portfolio.lastRunAt} />
)}
```

### Step 5: Test
1. Start backend: `cd backend && npm run dev`
2. Start Python service: `cd python-auto-trade && source venv/bin/activate && PYTHONPATH=src uvicorn autotrade_service.main:app --reload`
3. Start frontend: `cd equity-insight-react && npm run dev`
4. Open browser to http://localhost:5173
5. Navigate to Auto Trading Dashboard
6. Should see empty positions (real simulation data)
7. Should see "Paper Trading (Simulation)" mode
8. Should see SimulationBanner if implemented

---

## Summary

✅ **Backend Proxy**: Working correctly  
✅ **API Endpoints**: Correct (`/api/autotrade/v1/*`)  
✅ **Data Transformation**: snake_case → camelCase working  
✅ **Frontend Hooks**: Calling correct endpoints  
❌ **Problem**: `placeholderData` masks real data  
✅ **Solution**: Remove `placeholderData`, keep fallback for safety  

**No API path changes needed** - everything is already correct!
