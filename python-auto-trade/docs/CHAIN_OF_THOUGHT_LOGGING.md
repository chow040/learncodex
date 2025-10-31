# Chain of Thought Logging Enhancement

## Overview

Enhanced the evaluation log to capture the **full chain of thought (CoT)** from the LLM, not just the final decision. This provides complete visibility into the LLM's reasoning process, analysis steps, and thinking before reaching each decision.

## Changes Made

### 1. Extended `DecisionPayload` Schema

**File**: `src/autotrade_service/llm/schemas.py`

Added `chain_of_thought` field to capture LLM reasoning:

```python
class DecisionPayload(BaseModel):
    symbol: str
    action: DecisionAction
    # ... existing fields ...
    rationale: Optional[str] = None              # Final conclusion
    chain_of_thought: Optional[str] = None       # NEW: Full reasoning process
```

**Difference**:
- `rationale`: Short summary of why (e.g., "Breakout confirmed")
- `chain_of_thought`: Complete thinking process (analysis, tool calls, reasoning steps)

### 2. Extended `EvaluationLogEntry`

**File**: `src/autotrade_service/simulation/state.py`

Added `chain_of_thought` field to store the reasoning:

```python
@dataclass
class EvaluationLogEntry:
    timestamp: datetime
    symbol: str
    action: str
    confidence: float
    size_pct: float
    rationale: str               # Short conclusion
    price: float
    executed: bool = False
    chain_of_thought: str = ""   # NEW: Full LLM reasoning
```

### 3. Chain of Thought Extraction

**File**: `src/autotrade_service/pipelines/decision_pipeline.py`

Added method to extract CoT from LangChain messages:

```python
def _extract_chain_of_thought(self, messages: Sequence[BaseMessage]) -> str:
    """
    Extract chain of thought from AI messages.
    
    Collects all AI message content that appears before the final JSON decision.
    This captures the LLM's reasoning, analysis, and thinking process.
    """
    cot_parts: list[str] = []
    
    for msg in messages:
        if isinstance(msg, AIMessage):
            content = self._extract_text_from_message(msg)
            if content and content.strip():
                # Check if this is the final JSON response
                if content.strip().startswith("[") and content.strip().endswith("]"):
                    # This is the final decision JSON, don't include it in CoT
                    continue
                # Include any reasoning/thinking text
                cot_parts.append(content.strip())
    
    # Join all reasoning parts with newlines
    full_cot = "\n\n".join(cot_parts)
    return full_cot if full_cot else "No explicit chain of thought recorded"
```

**What it captures**:
- LLM's initial analysis of market data
- Tool call reasoning ("Let me check BTC price...")
- Intermediate conclusions
- Risk assessment thoughts
- Any step-by-step reasoning before final decision

**What it excludes**:
- Final JSON decision array (that's in `rationale`)
- Tool response data (raw numbers)

### 4. Attach CoT to Decisions

**File**: `src/autotrade_service/pipelines/decision_pipeline.py`

Modified `run_once()` to extract and attach CoT:

```python
# Extract chain of thought from all AI messages
chain_of_thought = self._extract_chain_of_thought(messages)

decisions_payload = parse_agent_output(messages)

# Attach chain of thought to each decision
for decision in decisions_payload.decisions:
    if not decision.chain_of_thought:
        decision.chain_of_thought = chain_of_thought
```

**Flow**:
1. LLM generates multiple messages (reasoning + final JSON)
2. Extract all reasoning text from AI messages
3. Attach same reasoning to all decisions in that evaluation cycle
4. Pass enriched decisions to broker

### 5. Store CoT in Evaluation Log

**File**: `src/autotrade_service/simulation/broker.py`

Updated to store the chain of thought:

```python
self.portfolio.evaluation_log.append(
    EvaluationLogEntry(
        timestamp=timestamp,
        symbol=symbol,
        action=action.value.upper(),
        confidence=decision.confidence or 0.0,
        size_pct=decision.size_pct or 0.0,
        rationale=decision.rationale or "",
        price=current_price,
        executed=False,
        chain_of_thought=decision.chain_of_thought or "",  # NEW
    )
)
```

### 6. Expose CoT in API Response

**File**: `src/autotrade_service/simulation/manager.py`

Updated to include CoT in decision prompt:

```python
decisions = [
    AutoTradeDecision(
        id=f"sim-{eval_entry.timestamp.isoformat()}-{eval_entry.symbol}",
        symbol=eval_entry.symbol,
        action=eval_entry.action.lower(),
        size_pct=eval_entry.size_pct,
        confidence=eval_entry.confidence,
        rationale=eval_entry.rationale,
        created_at=eval_entry.timestamp.isoformat(),
        prompt=AutoTradeDecisionPrompt(
            system_prompt="",
            user_payload="",
            chain_of_thought=eval_entry.chain_of_thought,  # NEW
            invalidations=[],
            observation_window="PT5M",
        ),
    )
    for eval_entry in portfolio.evaluation_log[-30:]
]
```

## What Gets Logged

### Example Chain of Thought

**Before** (rationale only):
```
"Breakout confirmed with volume spike"
```

**After** (full chain of thought):
```
Let me analyze BTC market conditions.

First, checking current price and indicators...

Looking at the data:
- Price: $107,450 (above EMA20 at $106,800)
- RSI14: 68 (approaching overbought but not extreme)
- MACD: 450 (bullish crossover confirmed)
- Volume: 1.5x average (significant buying pressure)

The price has broken above the consolidation range of $106,500-$107,000 with 
strong volume confirmation. This is a classic breakout pattern.

Risk assessment:
- Stop loss should be placed at $106,500 (below consolidation)
- Take profit target: $109,000 (next resistance level)
- Risk/reward ratio: 1:1.6 (favorable)

Higher timeframe (4H) also shows bullish structure with MACD positive.

Confidence: 80% - All technical indicators align for a high-probability long entry.

Decision: BUY with 10% position size
```

**And rationale**:
```
"Breakout confirmed with volume spike"
```

## Benefits

### 1. **Deep LLM Analysis**
Understand exactly how the LLM reached each decision:
- What data did it consider?
- What patterns did it identify?
- What was the reasoning flow?
- What risks did it assess?

### 2. **Better Debugging**
When a trade goes wrong:
```
Time: 10:03
Action: BUY BTC
Rationale: "Strong momentum"
Chain of Thought: "RSI at 85 but ignoring overbought signal 
                   because of strong trend continuation..."
Result: Price dumped 5 minutes later (RSI was warning signal!)
```

### 3. **LLM Prompt Tuning**
Identify reasoning patterns:
- Is the LLM over-weighting certain indicators?
- Does it properly assess risk/reward?
- Is the reasoning logical and complete?
- Are there reasoning gaps?

### 4. **Audit Trail**
Complete record of decision-making process:
- Regulators can see the reasoning
- Can reconstruct why decisions were made
- Prove due diligence was performed

### 5. **Training Data**
Use CoT for:
- Fine-tuning future models
- Creating few-shot examples
- Analyzing what good reasoning looks like

## Data Structure

### Storage Format

`logs/simulation_state.json`:
```json
{
  "evaluation_log": [
    {
      "timestamp": "2025-10-31T10:03:00",
      "symbol": "BTC",
      "action": "BUY",
      "confidence": 0.80,
      "size_pct": 10.0,
      "rationale": "Breakout confirmed with volume spike",
      "price": 107450.25,
      "executed": true,
      "chain_of_thought": "Let me analyze BTC market conditions.\n\nFirst, checking current price and indicators...\n\nLooking at the data:\n- Price: $107,450 (above EMA20 at $106,800)\n- RSI14: 68 (approaching overbought but not extreme)\n- MACD: 450 (bullish crossover confirmed)\n- Volume: 1.5x average (significant buying pressure)\n\nThe price has broken above the consolidation range of $106,500-$107,000 with strong volume confirmation. This is a classic breakout pattern.\n\nRisk assessment:\n- Stop loss: $106,500 (below consolidation)\n- Take profit: $109,000 (next resistance)\n- Risk/reward: 1:1.6 (favorable)\n\nHigher timeframe (4H) shows bullish structure.\n\nConfidence: 80% - All indicators align.\n\nDecision: BUY with 10% position size"
    }
  ]
}
```

### API Response

`GET /internal/autotrade/v1/portfolio`:
```json
{
  "portfolio": {
    "decisions": [
      {
        "id": "sim-2025-10-31T10:03:00-BTC",
        "symbol": "BTC",
        "action": "buy",
        "size_pct": 10.0,
        "confidence": 0.80,
        "rationale": "Breakout confirmed with volume spike",
        "created_at": "2025-10-31T10:03:00",
        "prompt": {
          "system_prompt": "",
          "user_payload": "",
          "chain_of_thought": "Let me analyze BTC market conditions...",
          "invalidations": [],
          "observation_window": "PT5M"
        }
      }
    ]
  }
}
```

## Frontend Display

### Decision Log Card (Enhanced)

**Before**:
```
BUY BTC (Conf: 80%)
"Breakout confirmed with volume spike"

[View prompt & CoT]  ← Clicking shows nothing useful
```

**After**:
```
BUY BTC (Conf: 80%) - Executed
"Breakout confirmed with volume spike"

[View Chain of Thought] ← Click to expand

━━━ Chain of Thought ━━━
Let me analyze BTC market conditions.

First, checking current price and indicators...

Looking at the data:
- Price: $107,450 (above EMA20 at $106,800)
- RSI14: 68 (approaching overbought but not extreme)
- MACD: 450 (bullish crossover confirmed)
- Volume: 1.5x average (significant buying pressure)

The price has broken above the consolidation range...
[Read more...]
━━━━━━━━━━━━━━━━━━━━━
```

## Testing

### 1. Trigger an Evaluation

```bash
curl -X POST http://localhost:8000/internal/autotrade/v1/scheduler/trigger
```

### 2. Check the Evaluation Log

```bash
cat logs/simulation_state.json | jq '.evaluation_log[-1]'
```

Expected output:
```json
{
  "timestamp": "2025-10-31T10:03:00",
  "symbol": "BTC",
  "action": "HOLD",
  "confidence": 0.65,
  "size_pct": 0.0,
  "rationale": "Waiting for support confirmation",
  "price": 107343.50,
  "executed": false,
  "chain_of_thought": "Analyzing BTC...\n\nCurrent price $107,343..."
}
```

### 3. Query via API

```bash
curl http://localhost:4000/api/autotrade/v1/portfolio | jq '.portfolio.decisions[0].prompt.chain_of_thought'
```

### 4. View in Frontend

Navigate to: Auto Trading Dashboard → Decision Log → Click on any decision → Click "View prompt & CoT"

## Analysis Examples

### Find Decisions with Weak Reasoning

```bash
# Chain of thought less than 100 characters (too brief)
jq '.evaluation_log[] | select(.chain_of_thought | length < 100)' logs/simulation_state.json
```

### Compare CoT Quality for Good vs Bad Trades

```python
import json

with open('logs/simulation_state.json') as f:
    data = json.load(f)

# Profitable trades
profitable = [e for e in data['evaluation_log'] if e['executed'] and 'profit' in str(e)]

# Losing trades  
losing = [e for e in data['evaluation_log'] if e['executed'] and 'loss' in str(e)]

# Compare average CoT length
avg_cot_profitable = sum(len(e['chain_of_thought']) for e in profitable) / len(profitable)
avg_cot_losing = sum(len(e['chain_of_thought']) for e in losing) / len(losing)

print(f"Profitable trades avg CoT length: {avg_cot_profitable}")
print(f"Losing trades avg CoT length: {avg_cot_losing}")
```

### Search for Specific Reasoning Patterns

```bash
# Find evaluations that mention "overbought"
jq '.evaluation_log[] | select(.chain_of_thought | contains("overbought"))' logs/simulation_state.json

# Find decisions where LLM ignored warning signals
jq '.evaluation_log[] | select(.chain_of_thought | contains("ignoring"))' logs/simulation_state.json
```

## Migration Notes

- **Backward compatible**: Old evaluation logs without `chain_of_thought` will default to empty string
- **No data loss**: Existing `rationale` field unchanged
- **Automatic**: Python backend will restart and start capturing CoT on next evaluation

## Summary

✅ **Before**: Only saw final decision rationale  
✅ **After**: Full chain of thought with complete reasoning

✅ **Benefit**: Deep insight into LLM decision-making process  
✅ **Use Case**: Debugging, tuning, auditing, training  
✅ **Storage**: Persisted in `logs/simulation_state.json`  
✅ **API**: Available via `prompt.chain_of_thought` field  
✅ **Frontend**: Expandable "View Chain of Thought" button

Now you can see **exactly** how the LLM thinks, not just what it decides!
