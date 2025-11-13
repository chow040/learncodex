# Trading Agents Polling Architecture Blueprint

## Problem Statement

Trading Agents analysis takes 1-3 minutes to complete, which exceeds Vercel's serverless function timeout limits:
- **Vercel Hobby**: 10 seconds max
- **Vercel Pro**: 60 seconds max

Current SSE (Server-Sent Events) streaming approach fails with "Streaming connection lost" error on Vercel production.

## Solution: Background Jobs + Polling

Replace real-time SSE streaming with a polling-based architecture that works within Vercel's constraints.

---

## Architecture Overview

```
┌─────────────┐
│   Frontend  │
└──────┬──────┘
       │
       │ 1. POST /api/trading/run
       │    { symbol, modelId, analysts }
       ▼
┌─────────────────────────────┐
│  Backend (Vercel Function)  │
│  ┌─────────────────────┐   │
│  │ Create job record   │   │
│  │ runId = uuid()      │   │
│  │ status = "pending"  │   │
│  └─────────────────────┘   │
└──────────┬──────────────────┘
           │ Returns: { runId: "abc123", status: "pending" }
           │
           ▼
┌───────────────────────────────────────┐
│  Background Job (Separate Function)   │
│  ┌───────────────────────────────┐   │
│  │ 1. Start Trading Agents       │   │
│  │ 2. Save progress to DB        │   │
│  │ 3. Update status & results    │   │
│  └───────────────────────────────┘   │
└───────────────────────────────────────┘
           ▲
           │
    ┌──────┴──────┐
    │   Database  │
    │  (Supabase) │
    └─────────────┘
           ▲
           │
           │ 2. GET /api/trading/progress/:runId (every 2s)
           │
┌──────────┴──────┐
│    Frontend     │
│  Progress Bar   │
└─────────────────┘
```

---

## Database Schema

### New Table: `trading_agent_jobs`

```sql
CREATE TABLE trading_agent_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id VARCHAR(255) UNIQUE NOT NULL,
  user_id VARCHAR(255),
  symbol VARCHAR(10) NOT NULL,
  model_id VARCHAR(100) NOT NULL,
  analysts TEXT[] NOT NULL,
  
  -- Job status
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  -- Enum: 'pending', 'running', 'completed', 'failed', 'timeout'
  
  -- Progress tracking
  current_step VARCHAR(255),
  progress_percent INTEGER DEFAULT 0,
  steps JSONB,
  -- Format: [{ name: "Data Collection", status: "completed", progress: 100 }, ...]
  
  -- Results
  result JSONB,
  error TEXT,
  
  -- Metadata
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Performance tracking
  duration_ms INTEGER,
  llm_calls INTEGER DEFAULT 0,
  
  -- Indexes for queries
  INDEX idx_run_id (run_id),
  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at DESC)
);

-- Trigger for auto-updating updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_trading_agent_jobs_updated_at
  BEFORE UPDATE ON trading_agent_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

---

## API Endpoints

### 1. Start Job: `POST /api/trading/run`

**Request:**
```json
{
  "symbol": "AAPL",
  "modelId": "grok-4-fast",
  "analysts": ["invest", "risk", "sentiment"]
}
```

**Response (Immediate):**
```json
{
  "runId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "message": "Analysis started"
}
```

**Backend Logic:**
```typescript
router.post('/run', async (req, res) => {
  // 1. Validate request
  const { symbol, modelId, analysts } = validateRequest(req.body);
  
  // 2. Create job record
  const runId = crypto.randomUUID();
  await db.insert(tradingAgentJobs).values({
    runId,
    userId: req.user?.id,
    symbol,
    modelId,
    analysts,
    status: 'pending',
    createdAt: new Date(),
  });
  
  // 3. Trigger background job (non-blocking)
  startTradingAgentsJob(runId).catch(err => {
    console.error('Background job failed:', err);
    // Error will be saved to DB by the job itself
  });
  
  // 4. Return immediately
  res.json({
    runId,
    status: 'pending',
    message: 'Analysis started'
  });
});
```

---

### 2. Get Progress: `GET /api/trading/progress/:runId`

**Response (Polling):**
```json
{
  "runId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "running",
  "progress": 45,
  "currentStep": "Running Risk Analyst...",
  "steps": [
    {
      "name": "Data Collection",
      "status": "completed",
      "progress": 100
    },
    {
      "name": "Invest Analyst",
      "status": "completed",
      "progress": 100
    },
    {
      "name": "Risk Analyst",
      "status": "in-progress",
      "progress": 45
    },
    {
      "name": "Sentiment Analyst",
      "status": "pending",
      "progress": 0
    },
    {
      "name": "Final Assessment",
      "status": "pending",
      "progress": 0
    }
  ],
  "startedAt": "2025-11-12T15:30:00Z",
  "estimatedTimeRemaining": 60
}
```

**When Completed:**
```json
{
  "runId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "progress": 100,
  "currentStep": "Complete",
  "result": {
    "summary": "...",
    "investAnalyst": {...},
    "riskAnalyst": {...},
    "sentimentAnalyst": {...},
    "finalAssessment": {...}
  },
  "startedAt": "2025-11-12T15:30:00Z",
  "completedAt": "2025-11-12T15:32:30Z",
  "duration": 150000
}
```

**Backend Logic:**
```typescript
router.get('/progress/:runId', async (req, res) => {
  const { runId } = req.params;
  
  const job = await db
    .select()
    .from(tradingAgentJobs)
    .where(eq(tradingAgentJobs.runId, runId))
    .limit(1);
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  res.json({
    runId: job.runId,
    status: job.status,
    progress: job.progressPercent,
    currentStep: job.currentStep,
    steps: job.steps,
    ...(job.status === 'completed' && { result: job.result }),
    ...(job.status === 'failed' && { error: job.error }),
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    duration: job.durationMs,
  });
});
```

---

### 3. Background Job Function

**Location:** `backend/src/services/tradingAgentsJobRunner.ts`

```typescript
export async function startTradingAgentsJob(runId: string): Promise<void> {
  try {
    // 1. Get job details
    const job = await db.query.tradingAgentJobs.findFirst({
      where: eq(tradingAgentJobs.runId, runId)
    });
    
    if (!job) throw new Error('Job not found');
    
    // 2. Update status to running
    await updateJobStatus(runId, {
      status: 'running',
      startedAt: new Date(),
      currentStep: 'Initializing...',
      progress: 0,
    });
    
    // 3. Prepare progress callback
    const updateProgress = async (step: string, progress: number, steps: any[]) => {
      await updateJobStatus(runId, {
        currentStep: step,
        progress,
        steps,
      });
    };
    
    // 4. Run Trading Agents with progress callback
    const result = await runTradingAgentsAnalysis({
      symbol: job.symbol,
      modelId: job.modelId,
      analysts: job.analysts,
      onProgress: updateProgress, // ← NEW: Progress callback
    });
    
    // 5. Save final result
    await updateJobStatus(runId, {
      status: 'completed',
      progress: 100,
      currentStep: 'Complete',
      result,
      completedAt: new Date(),
      durationMs: Date.now() - job.startedAt.getTime(),
    });
    
  } catch (error) {
    // Save error to DB
    await updateJobStatus(runId, {
      status: 'failed',
      error: error.message,
      completedAt: new Date(),
    });
    
    throw error;
  }
}

async function updateJobStatus(runId: string, updates: Partial<TradingAgentJob>) {
  await db
    .update(tradingAgentJobs)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(tradingAgentJobs.runId, runId));
}
```

---

## Frontend Changes

### 1. Update Hook: `useTradingProgress.ts`

**Replace SSE with Polling:**

```typescript
export const useTradingProgress = (runId: string | null, enabled: boolean) => {
  const [state, setState] = useState<ProgressState>({
    status: 'idle',
    progress: 0,
  });
  
  const pollInterval = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    if (!enabled || !runId) return;
    
    const pollProgress = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/trading/progress/${runId}`,
          { credentials: 'include' }
        );
        
        if (!response.ok) throw new Error('Failed to fetch progress');
        
        const data = await response.json();
        
        setState({
          status: data.status,
          progress: data.progress,
          currentStep: data.currentStep,
          steps: data.steps,
          result: data.result,
          error: data.error,
        });
        
        // Stop polling if completed or failed
        if (data.status === 'completed' || data.status === 'failed') {
          if (pollInterval.current) {
            clearInterval(pollInterval.current);
            pollInterval.current = null;
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
        setState(prev => ({
          ...prev,
          error: error.message,
        }));
      }
    };
    
    // Start polling every 2 seconds
    pollProgress(); // Initial fetch
    pollInterval.current = setInterval(pollProgress, 2000);
    
    return () => {
      if (pollInterval.current) {
        clearInterval(pollInterval.current);
        pollInterval.current = null;
      }
    };
  }, [runId, enabled]);
  
  return state;
};
```

### 2. Update Component: `TradingAgentsPage.tsx`

```typescript
const handleRunAnalysis = async () => {
  try {
    setIsRunning(true);
    
    // Start the job
    const response = await fetch(`${API_BASE_URL}/api/trading/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        symbol,
        modelId,
        analysts: selectedAnalysts,
      }),
    });
    
    const data = await response.json();
    setRunId(data.runId); // This triggers polling in useTradingProgress
    
  } catch (error) {
    console.error('Failed to start analysis:', error);
    setError(error.message);
    setIsRunning(false);
  }
};

// Progress tracking
const progressState = useTradingProgress(runId, isRunning);

// Update UI based on progress
useEffect(() => {
  if (progressState.status === 'completed') {
    setIsRunning(false);
    setResult(progressState.result);
  } else if (progressState.status === 'failed') {
    setIsRunning(false);
    setError(progressState.error);
  }
}, [progressState.status]);
```

---

## Implementation Steps

### Phase 1: Database Setup
- [ ] Create `trading_agent_jobs` table migration
- [ ] Add indexes for performance
- [ ] Test with sample data

### Phase 2: Backend API
- [ ] Create `POST /api/trading/run` endpoint
- [ ] Create `GET /api/trading/progress/:runId` endpoint
- [ ] Implement job status updates in DB
- [ ] Add progress tracking to Trading Agents runner

### Phase 3: Background Job Runner
- [ ] Extract Trading Agents logic into separate service
- [ ] Add progress callback mechanism
- [ ] Implement job lifecycle (pending → running → completed/failed)
- [ ] Add error handling and timeout protection

### Phase 4: Frontend Updates
- [ ] Replace SSE logic with polling in `useTradingProgress`
- [ ] Update UI components to use new polling hook
- [ ] Test progress bar updates
- [ ] Add error states and retry logic

### Phase 5: Testing
- [ ] Test with short-running jobs (mock mode)
- [ ] Test with real Trading Agents (1-3 min)
- [ ] Test error scenarios (timeout, API failures)
- [ ] Test concurrent jobs
- [ ] Load testing (multiple users)

### Phase 6: Deployment
- [ ] Deploy database migration
- [ ] Deploy backend changes
- [ ] Deploy frontend changes
- [ ] Monitor for issues

---

## Performance Considerations

### Database Queries
- Index on `runId` for fast lookups
- Index on `status` for filtering active jobs
- Index on `created_at` for pagination

### Polling Optimization
- **2-second interval** balances responsiveness vs server load
- Stop polling immediately when job completes
- Use HTTP caching headers to reduce unnecessary queries

### Cleanup Strategy
```sql
-- Delete old completed jobs (run daily)
DELETE FROM trading_agent_jobs
WHERE status IN ('completed', 'failed')
  AND completed_at < NOW() - INTERVAL '30 days';

-- Archive old jobs instead of deleting
INSERT INTO trading_agent_jobs_archive
SELECT * FROM trading_agent_jobs
WHERE completed_at < NOW() - INTERVAL '30 days';
```

---

## Monitoring & Observability

### Metrics to Track
- Average job duration
- Jobs per hour
- Failure rate
- Active polling connections
- Database query performance

### Logging
```typescript
console.log('[TradingAgentsJob] Started', { runId, symbol, modelId });
console.log('[TradingAgentsJob] Progress', { runId, step, progress });
console.log('[TradingAgentsJob] Completed', { runId, duration, llmCalls });
console.error('[TradingAgentsJob] Failed', { runId, error });
```

---

## Migration Strategy

### Option 1: Feature Flag
```typescript
const USE_POLLING = process.env.USE_POLLING_ARCHITECTURE === 'true';

if (USE_POLLING) {
  // New polling logic
} else {
  // Legacy SSE logic
}
```

### Option 2: Gradual Rollout
1. Deploy both endpoints (SSE + Polling)
2. Frontend uses SSE by default
3. Add UI toggle for users to opt-in to polling
4. Monitor performance
5. Switch default to polling
6. Remove SSE code after 1 month

---

## Benefits

✅ **Works on Vercel Free Tier** - No timeout issues
✅ **Better Error Recovery** - Can retry failed jobs
✅ **Job History** - All runs saved in database
✅ **Concurrent Jobs** - Multiple users can run simultaneously
✅ **Scalable** - Background jobs can run on separate infrastructure
✅ **User Experience** - Progress bar still updates smoothly (2s is imperceptible)

---

## Trade-offs

⚠️ **Not Real-Time** - 2-second delay vs instant SSE updates
⚠️ **More Database Queries** - Polling creates more DB load
⚠️ **Complexity** - Additional table and job management logic

---

## Future Enhancements

### Job Queue System
Instead of running jobs immediately, use a queue:
- **BullMQ** with Redis
- **pg-boss** with PostgreSQL
- **AWS SQS** for cloud-native

### WebSocket Fallback
For users who want real-time updates:
- Detect Vercel timeout
- Fallback to polling automatically
- Show "Switching to background mode" message

### Job Priority
```sql
ALTER TABLE trading_agent_jobs
ADD COLUMN priority INTEGER DEFAULT 0;
```

Run high-priority jobs first (e.g., paid users).

---

## Questions & Considerations

1. **How long to keep completed jobs?** → 30 days recommended
2. **Should we limit concurrent jobs per user?** → Yes, 3 max recommended
3. **What if job hangs forever?** → Add 10-minute timeout, mark as "timeout" status
4. **Can users cancel running jobs?** → Yes, add `POST /api/trading/cancel/:runId`

---

## Conclusion

Polling architecture is the most pragmatic solution for Vercel's serverless constraints. It maintains excellent user experience while working within free tier limits.

**Next Steps:**
1. Review this blueprint with team
2. Create database migration
3. Implement backend endpoints
4. Update frontend polling logic
5. Test thoroughly
6. Deploy to production

---

**Author:** AI Assistant  
**Date:** November 12, 2025  
**Status:** Blueprint - Ready for Implementation
