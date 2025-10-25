# Risk Analyst Persona Refactor Blueprint

## Objective
Match the legacy Python structure by splitting the TypeScript risk debate personas into three distinct modules and renaming personas to align with `aggressive`, `conservative`, and `neutral` terminology.

## Proposed Structure
```
backend/src/taEngine/langchain/risk/
├─ aggressiveAnalystRunnable.ts
├─ conservativeAnalystRunnable.ts
├─ neutralAnalystRunnable.ts
├─ riskAnalystCommon.ts (shared helpers)
└─ index.ts (re-exports)
```

## Tasks

### 1. Extract persona-specific logic ✅
- [x] Move the prompt text and `build…UserMessage` for each persona into its own file.
- [x] Export `createAggressiveAnalystRunnable`, `createConservativeAnalystRunnable`, and `createNeutralAnalystRunnable`.
- [x] Reuse shared boilerplate via a helper in `riskAnalystCommon.ts` (hosts `buildAnalystRunnable`, `messageToString`, shared types).

### 2. Rename personas across the graph ✅
- [x] Update TypeScript types (`RiskDebatePersona`, metadata keys, debate history fields) to use `aggressive`, `conservative`, `neutral`.
- [x] Adjust all read/write points in `decisionWorkflow.ts`, `stateUtils.ts`, and related helpers.
- [x] Migrate memory persistence keys so past reflections align with new naming.

### 3. Wire up imports ✅
- [x] In `decisionWorkflow.ts`, import the new persona runners from `risk/index.ts` (or the specific files) and remove the old combined import.
- [x] Ensure the graph node creation uses the renamed functions.
- [x] Update graph edges to use new node names (`Aggressive`, `Conservative`, `Neutral`).

### 4. Clean up ✅
- [x] Delete the consolidated `riskAnalystRunnables.ts` once references are updated.
- [x] Run build/lint/tests to confirm no regressions.

### 5. Enhance decision output ✅
- [x] Add `aggressiveArgument`, `conservativeArgument`, `neutralArgument` fields to `TradingAgentsDecision` type.
- [x] Add `riskDebate` field for combined transcript.
- [x] Populate these fields in the decision workflow from state.
- [x] Update frontend types and UI to display individual risk analyst arguments.

## Validation Checklist
- [x] All persona prompts match the Python versions line-for-line.
- [x] Debate history persists under the new persona keys (`aggressive`, `conservative`, `neutral`).
- [x] Risk manager receives the same debate transcript structure.
- [x] Build/test pipeline completes without errors.
- [x] Individual risk analyst responses are visible in Trading Agents UI after assessment.
