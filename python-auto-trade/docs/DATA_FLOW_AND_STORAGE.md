# Data Flow and Storage Architecture

## Overview

This document explains how data flows through the auto-trading system, from LLM decision-making to API responses, with special focus on the chain of thought logging and evaluation log storage.

---

## Table of Contents

1. [Complete Data Flow](#complete-data-flow)
2. [Chain of Thought Extraction](#chain-of-thought-extraction)
3. [Storage Locations](#storage-locations)
4. [Memory vs Disk](#memory-vs-disk)
5. [API Response Flow](#api-response-flow)
6. [Code References](#code-references)

---

## Complete Data Flow

### End-to-End Journey

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. SCHEDULER TRIGGERS                                            │
│    Every 3 minutes (configurable)                                │
│    File: src/autotrade_service/scheduler.py                      │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. DECISION PIPELINE EXECUTES                                    │
│    File: src/autotrade_service/pipelines/decision_pipeline.py   │
│                                                                   │
│    a) Load portfolio from JSON                                   │
│       portfolio = await fetch_latest_portfolio()                 │
│       ↓ Reads: logs/simulation_state.json                        │
│                                                                   │
│    b) Build prompt with portfolio context                        │
│       prompt = self._build_portfolio_prompt(portfolio, symbols)  │
│                                                                   │
│    c) Send to LLM agent (LangChain)                             │
│       final_state = await self._agent_graph.ainvoke(inputs)      │
│       messages: list[BaseMessage] = final_state["messages"]      │
│                                                                   │
│    d) Extract chain of thought from messages                     │
│       chain_of_thought = self._extract_chain_of_thought(messages)│
│       ↓ Extracts from: message.content (AIMessage objects)       │
│                                                                   │
│    e) Parse decisions from final JSON                            │
│       decisions_payload = parse_agent_output(messages)           │
│                                                                   │
│    f) Attach chain of thought to each decision                   │
│       for decision in decisions_payload.decisions:               │
│           decision.chain_of_thought = chain_of_thought           │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. BROKER EXECUTES DECISIONS                                     │
│    File: src/autotrade_service/simulation/broker.py             │
│                                                                   │
│    a) For each decision (BUY/SELL/HOLD/CLOSE):                  │
│       - Log to evaluation_log (in memory)                        │
│         self.portfolio.evaluation_log.append(                    │
│             EvaluationLogEntry(                                  │
│                 timestamp=timestamp,                             │
│                 symbol=symbol,                                   │
│                 action=action,                                   │
│                 confidence=decision.confidence,                  │
│                 rationale=decision.rationale,                    │
│                 chain_of_thought=decision.chain_of_thought,      │
│                 executed=False                                   │
│             )                                                    │
│         )                                                        │
│                                                                   │
│    b) Execute trade (if BUY/SELL/CLOSE)                         │
│       - Modify positions                                         │
│       - Mark evaluation as executed=True                         │
│       - Log to trade_log                                         │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. SAVE STATE TO DISK                                           │
│    File: src/autotrade_service/simulation/persistence.py        │
│                                                                   │
│    save_state(portfolio, "logs/simulation_state.json")          │
│    ↓                                                             │
│    Writes: {                                                     │
│      "portfolio_id": "simulation",                               │
│      "current_cash": 10000,                                      │
│      "positions": {...},                                         │
│      "trade_log": [...],                                         │
│      "evaluation_log": [                                         │
│        {                                                         │
│          "timestamp": "2025-10-31T10:03:00",                     │
│          "symbol": "BTC",                                        │
│          "action": "HOLD",                                       │
│          "confidence": 0.65,                                     │
│          "chain_of_thought": "Let me analyze..."                │
│        }                                                         │
│      ]                                                           │
│    }                                                             │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. API REQUEST (Later)                                          │
│    GET /internal/autotrade/v1/portfolio                         │
│    File: src/autotrade_service/api/routes.py                    │
│                                                                   │
│    async def get_portfolio():                                    │
│        snapshot = await fetch_latest_portfolio()                 │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. LOAD FROM DISK                                               │
│    File: src/autotrade_service/repositories.py                  │
│                                                                   │
│    if settings.simulation_enabled:                               │
│        portfolio = load_state(settings.simulation_state_path)    │
│        ↑ Reads: logs/simulation_state.json                       │
│        ↓ Deserializes to: SimulatedPortfolio (memory object)     │
│                                                                   │
│        return simulated_to_snapshot(portfolio)                   │
│        ↑ Converts to: AutoTradePortfolioSnapshot                 │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. CONVERT TO API RESPONSE                                      │
│    File: src/autotrade_service/simulation/manager.py            │
│                                                                   │
│    decisions = [                                                 │
│        AutoTradeDecision(                                        │
│            symbol=eval_entry.symbol,                             │
│            action=eval_entry.action,                             │
│            confidence=eval_entry.confidence,                     │
│            rationale=eval_entry.rationale,                       │
│            prompt=AutoTradeDecisionPrompt(                       │
│                chain_of_thought=eval_entry.chain_of_thought      │
│            )                                                     │
│        )                                                         │
│        for eval_entry in portfolio.evaluation_log[-30:]          │
│    ]                                                             │
│    ↓                                                             │
│    Returns last 30 evaluations                                   │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 8. RETURN API JSON                                              │
│    {                                                             │
│      "portfolio": {                                              │
│        "decisions": [                                            │
│          {                                                       │
│            "symbol": "BTC",                                      │
│            "action": "hold",                                     │
│            "confidence": 0.65,                                   │
│            "rationale": "Waiting for confirmation",              │
│            "prompt": {                                           │
│              "chain_of_thought": "Let me analyze BTC..."         │
│            }                                                     │
│          }                                                       │
│        ]                                                         │
│      }                                                           │
│    }                                                             │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 9. NODE.JS BACKEND PROXY                                        │
│    File: backend/src/services/autoTradeService.ts               │
│                                                                   │
│    Transforms snake_case → camelCase                             │
│    chain_of_thought → chainOfThought                             │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 10. REACT FRONTEND                                              │
│     File: equity-insight-react/src/hooks/useAutoTradingPortfolio│
│                                                                   │
│     const { data } = useAutoTradingPortfolio()                   │
│     data.decisions[0].prompt.chainOfThought                      │
│     ↓                                                            │
│     Display in UI: Auto Trading Dashboard → Decision Log        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Chain of Thought Extraction

### What is Chain of Thought?

The chain of thought is the **LLM's reasoning process** before it makes a final decision. It includes:
- Initial analysis
- Tool call explanations ("Let me check BTC price...")
- Intermediate conclusions
- Risk assessments
- Step-by-step reasoning

### Where Does It Come From?

**Source:** LangChain message history

When the LLM agent executes, it creates a sequence of messages:

```python
messages: list[BaseMessage] = [
    HumanMessage("Analyze BTC, ETH. Portfolio: ..."),
    AIMessage("Let me check current market data for BTC..."),
    ToolMessage(name="live_market_data", content='{"BTC": {"price": 107343}}'),
    AIMessage("Looking at BTC data: Price at $107,343...\n\nRSI: 45..."),
    ToolMessage(name="indicator_calculator", content='{"RSI": 45, "MACD": -150}'),
    AIMessage("BTC Analysis:\n- Price: $107,343\n- RSI: 45...\n\nConclusion: HOLD"),
    AIMessage('[{"symbol": "BTC", "action": "HOLD", "confidence": 0.65, ...}]')
]
```

### Extraction Logic

**File:** `src/autotrade_service/pipelines/decision_pipeline.py`

**Method:** `_extract_chain_of_thought()`

```python
def _extract_chain_of_thought(self, messages: Sequence[BaseMessage]) -> str:
    """
    Extract chain of thought from AI messages.
    
    Collects all AI message content that appears before the final JSON decision.
    """
    cot_parts: list[str] = []
    
    for msg in messages:
        if isinstance(msg, AIMessage):  # Only LLM's messages
            content = self._extract_text_from_message(msg)
            if content and content.strip():
                # Skip the final JSON decision array
                if content.strip().startswith("[") and content.strip().endswith("]"):
                    continue
                # Collect all reasoning text
                cot_parts.append(content.strip())
    
    # Join all reasoning with newlines
    full_cot = "\n\n".join(cot_parts)
    return full_cot if full_cot else "No explicit chain of thought recorded"
```

### What Gets Extracted

✅ **Included:**
- AIMessage content (LLM reasoning)
- Intermediate thoughts
- Tool call explanations
- Analysis steps

❌ **Excluded:**
- ToolMessage (raw data responses)
- HumanMessage (our prompts)
- Final JSON decision array

### Field Extraction

**Method:** `_extract_text_from_message()`

```python
def _extract_text_from_message(self, message: BaseMessage) -> str:
    content = message.content  # ← The actual field!
    
    if isinstance(content, str):
        return content
    
    if isinstance(content, list):
        # Multimodal messages (text + images, etc.)
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(item.get("text", ""))
        return "\n".join(parts)
    
    return str(content)
```

**Key:** Extracts from `message.content` field

---

## Storage Locations

### 1. In-Memory (Temporary)

#### DecisionPayload
**File:** `src/autotrade_service/llm/schemas.py`
```python
class DecisionPayload(BaseModel):
    symbol: str
    action: DecisionAction
    rationale: Optional[str] = None
    chain_of_thought: Optional[str] = None  # ← Stored during pipeline execution
```
**Lifetime:** Duration of one evaluation cycle

#### EvaluationLogEntry
**File:** `src/autotrade_service/simulation/state.py`
```python
@dataclass
class EvaluationLogEntry:
    timestamp: datetime
    symbol: str
    action: str
    confidence: float
    rationale: str
    chain_of_thought: str = ""  # ← Stored in portfolio object
    executed: bool = False
```

#### SimulatedPortfolio
**File:** `src/autotrade_service/simulation/state.py`
```python
@dataclass
class SimulatedPortfolio:
    portfolio_id: str
    current_cash: float
    positions: Dict[str, SimulatedPosition]
    trade_log: List[TradeLogEntry]
    evaluation_log: List[EvaluationLogEntry]  # ← Contains chain of thought
```
**Lifetime:** While Python service is running

---

### 2. Persistent Storage (Disk)

#### JSON File
**Location:** `logs/simulation_state.json`

**Structure:**
```json
{
  "portfolio_id": "simulation",
  "starting_cash": 10000.0,
  "current_cash": 10000.0,
  "positions": {},
  "trade_log": [],
  "evaluation_log": [
    {
      "timestamp": "2025-10-31T10:03:00.123456",
      "symbol": "BTC",
      "action": "HOLD",
      "confidence": 0.65,
      "size_pct": 0.0,
      "rationale": "Waiting for support confirmation",
      "price": 107343.50,
      "executed": false,
      "chain_of_thought": "Let me analyze BTC market conditions.\n\nFirst, checking current price and indicators...\n\nCurrent data:\n- Price: $107,343 (testing EMA20 support at $106,800)\n- RSI: 45 (neutral)\n- MACD: -150 (bearish but flattening)\n\nConclusion: HOLD and wait for confirmation"
    }
  ],
  "created_at": "2025-10-31T06:00:00",
  "updated_at": "2025-10-31T10:03:00"
}
```

**Written By:** `simulation/persistence.py` → `save_state()`
```python
def save_state(portfolio: SimulatedPortfolio, path: str | Path) -> bool:
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(portfolio.to_dict(), f, indent=2)
    temp_path.replace(file_path)  # Atomic write
```

**Read By:** `simulation/persistence.py` → `load_state()`
```python
def load_state(path: str | Path) -> Optional[SimulatedPortfolio]:
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return SimulatedPortfolio.from_dict(data)
```

**Lifetime:** Persists across service restarts

---

### 3. API Response (Network)

#### Python Backend Endpoint
**URL:** `GET /internal/autotrade/v1/portfolio`
**File:** `src/autotrade_service/api/routes.py`

```python
@router.get("/portfolio")
async def get_portfolio():
    snapshot = await fetch_latest_portfolio()
    return {"portfolio": asdict(snapshot)}
```

**Response Structure:**
```json
{
  "portfolio": {
    "decisions": [
      {
        "id": "sim-2025-10-31T10:03:00-BTC",
        "symbol": "BTC",
        "action": "hold",
        "confidence": 0.65,
        "rationale": "Waiting for support confirmation",
        "prompt": {
          "chain_of_thought": "Let me analyze BTC..."
        }
      }
    ]
  }
}
```

#### Node.js Backend Proxy
**URL:** `GET /api/autotrade/v1/portfolio`
**File:** `backend/src/services/autoTradeService.ts`

Transforms snake_case to camelCase:
```typescript
const mapDecisionPrompt = (prompt: PythonDecisionPrompt) => ({
  chainOfThought: prompt.chain_of_thought  // ← Transformed
})
```

#### Frontend Access
**Hook:** `useAutoTradingPortfolio()`
**File:** `equity-insight-react/src/hooks/useAutoTradingPortfolio.ts`

```typescript
const { data } = useAutoTradingPortfolio()
// Access: data.decisions[0].prompt.chainOfThought
```

---

## Memory vs Disk

### Write Path: Memory → Disk

```
┌──────────────────────────────────────┐
│ 1. LLM Decision Made                 │
│    DecisionPayload.chain_of_thought  │ (Memory)
└───────────────┬──────────────────────┘
                ↓
┌──────────────────────────────────────┐
│ 2. Broker Logs to Evaluation Log    │
│    EvaluationLogEntry{               │ (Memory)
│      chain_of_thought: "..."         │
│    }                                 │
└───────────────┬──────────────────────┘
                ↓
┌──────────────────────────────────────┐
│ 3. Added to Portfolio                │
│    portfolio.evaluation_log.append() │ (Memory)
└───────────────┬──────────────────────┘
                ↓
┌──────────────────────────────────────┐
│ 4. Saved to JSON File                │
│    save_state(portfolio, path)       │ (Disk) 💾
│    → logs/simulation_state.json      │
└──────────────────────────────────────┘
```

**When:** After each evaluation cycle (every 3 minutes)

### Read Path: Disk → Memory → API

```
┌──────────────────────────────────────┐
│ 1. API Request Received              │
│    GET /portfolio                    │
└───────────────┬──────────────────────┘
                ↓
┌──────────────────────────────────────┐
│ 2. Load from JSON File               │
│    portfolio = load_state(path)      │ (Disk → Memory) 💾
│    ← logs/simulation_state.json      │
└───────────────┬──────────────────────┘
                ↓
┌──────────────────────────────────────┐
│ 3. Convert to API Format             │
│    simulated_to_snapshot(portfolio)  │ (Memory)
│    Reads: evaluation_log[]           │
└───────────────┬──────────────────────┘
                ↓
┌──────────────────────────────────────┐
│ 4. Return JSON Response              │
│    {"portfolio": {"decisions": ...}} │ (Network)
│    Includes: chain_of_thought        │
└──────────────────────────────────────┘
```

**When:** Every time the API is called

### Why Not Direct File Access?

**Current:** Load JSON → Convert to Objects → Return via API

**Alternative:** Serve JSON file directly

❌ **Problems:**
- No data transformation (snake_case)
- No filtering (can't limit to last 30)
- No business logic
- Security risk (exposes raw file)
- No error handling

✅ **Benefits of Current Approach:**
- Controlled data exposure
- Format conversion (snake_case → camelCase)
- Filtering (last 30 evaluations)
- Consistent with other endpoints
- Easy to switch to database later

---

## API Response Flow

### Complete API Chain

```
React Frontend (5173)
    ↓ fetch("http://localhost:4000/api/autotrade/v1/portfolio")
Node.js Backend (4000)
    ↓ axios.get("http://localhost:8000/internal/autotrade/v1/portfolio")
Python Backend (8000)
    ↓ fetch_latest_portfolio()
    ↓ load_state("logs/simulation_state.json")
    ↓ simulated_to_snapshot(portfolio)
    ↓ return AutoTradePortfolioSnapshot
    ↓
Node.js Backend
    ↓ Transform snake_case → camelCase
    ↓ Add to cache (30s)
    ↓
React Frontend
    ↓ React Query cache (30s)
    ↓ Display in UI
```

### Response Transformation

**Python (snake_case):**
```json
{
  "prompt": {
    "chain_of_thought": "Let me analyze..."
  }
}
```

**Node.js (camelCase):**
```json
{
  "prompt": {
    "chainOfThought": "Let me analyze..."
  }
}
```

**Frontend (TypeScript):**
```typescript
interface AutoTradeDecision {
  prompt: {
    chainOfThought: string
  }
}
```

---

## Code References

### Key Files and Their Roles

| File | Purpose | Key Functions |
|------|---------|---------------|
| `pipelines/decision_pipeline.py` | LLM execution & CoT extraction | `run_once()`, `_extract_chain_of_thought()` |
| `simulation/state.py` | Data models | `EvaluationLogEntry`, `SimulatedPortfolio` |
| `simulation/broker.py` | Trade execution & logging | `execute()`, logs to `evaluation_log` |
| `simulation/persistence.py` | JSON file I/O | `save_state()`, `load_state()` |
| `simulation/manager.py` | Convert to API format | `simulated_to_snapshot()` |
| `repositories.py` | Data access layer | `fetch_latest_portfolio()` |
| `api/routes.py` | HTTP endpoints | `get_portfolio()` |
| `llm/schemas.py` | Decision payload schema | `DecisionPayload` |

### Data Structure Hierarchy

```
DecisionPipeline
    ↓ generates
DecisionPayload (with chain_of_thought)
    ↓ logged by
SimulatedBroker
    ↓ stores in
EvaluationLogEntry (with chain_of_thought)
    ↓ added to
SimulatedPortfolio.evaluation_log[]
    ↓ serialized by
portfolio.to_dict()
    ↓ written to
logs/simulation_state.json
    ↓ deserialized by
SimulatedPortfolio.from_dict()
    ↓ converted by
simulated_to_snapshot()
    ↓ returns
AutoTradePortfolioSnapshot
    ↓ with
AutoTradeDecision.prompt.chain_of_thought
```

---

## Access Patterns

### Query Chain of Thought

#### Via JSON File:
```bash
cat logs/simulation_state.json | jq '.evaluation_log[-1].chain_of_thought'
```

#### Via Python API:
```bash
curl http://localhost:8000/internal/autotrade/v1/portfolio | \
  jq '.portfolio.decisions[0].prompt.chain_of_thought'
```

#### Via Node.js API:
```bash
curl http://localhost:4000/api/autotrade/v1/portfolio | \
  jq '.portfolio.decisions[0].prompt.chainOfThought'
```

#### In Frontend Code:
```typescript
const { data } = useAutoTradingPortfolio()
const cot = data?.decisions[0]?.prompt?.chainOfThought
```

### View All Evaluations:
```bash
cat logs/simulation_state.json | jq '.evaluation_log[] | {
  timestamp,
  symbol,
  action,
  confidence,
  executed,
  cot_preview: .chain_of_thought[:100]
}'
```

---

## Storage Considerations

### File Size Growth

**Per Evaluation:**
- Metadata: ~200 bytes
- Rationale: ~100 bytes
- Chain of Thought: ~500-2000 bytes
- **Total:** ~800-2300 bytes per evaluation

**Over Time:**
- 1 day (480 evaluations): ~400 KB - 1.1 MB
- 1 week: ~2.8 MB - 7.7 MB
- 1 month: ~12 MB - 33 MB
- 1 year: ~144 MB - 396 MB

### Retention Strategy

**Current:** All evaluations stored indefinitely

**Options:**
1. **Keep last N evaluations** (e.g., 1000)
2. **Time-based retention** (e.g., last 30 days)
3. **Rotate to archive files** (e.g., monthly archives)
4. **Move to database** for long-term storage

**Recommendation:** Implement rotation after 30 days or 10,000 evaluations, whichever comes first.

---

## Summary

### Data Flow Pattern

**Write:** Memory → Disk (JSON file)  
**Read:** Disk (JSON file) → Memory → API  
**NOT:** Direct file serving

### Storage Locations

1. **Memory:** `DecisionPayload`, `EvaluationLogEntry`, `SimulatedPortfolio`
2. **Disk:** `logs/simulation_state.json`
3. **Network:** API responses (HTTP JSON)

### Key Points

✅ Chain of thought extracted from LangChain `message.content`  
✅ Stored in `evaluation_log` with every evaluation (BUY/SELL/HOLD)  
✅ Persisted to JSON file after each cycle  
✅ Loaded from JSON file when API is called  
✅ Transformed and returned via API  
✅ Cached in frontend for 30 seconds

### Future Enhancements

- Database storage for scalability
- Log rotation for size management
- Compression for older entries
- Search and filter capabilities
- Analytics dashboard for CoT analysis

---

**Last Updated:** 31 October 2025  
**System Version:** Simulation Mode with Evaluation Logging  
**Storage:** File-based (JSON)
