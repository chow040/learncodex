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

### 1. Extract persona-specific logic
- Move the prompt text and `build…UserMessage` for each persona into its own file.
- Export `createAggressiveAnalystRunnable`, `createConservativeAnalystRunnable`, and `createNeutralAnalystRunnable`.
- Reuse shared boilerplate via a helper in `riskAnalystCommon.ts` (hosts `buildAnalystRunnable`, `messageToString`, shared types).

### 2. Rename personas across the graph
- Update TypeScript types (`RiskDebatePersona`, metadata keys, debate history fields) to use `aggressive`, `conservative`, `neutral`.
- Adjust all read/write points in `decisionWorkflow.ts`, `stateUtils.ts`, and related helpers.
- Migrate memory persistence keys so past reflections align with new naming.

### 3. Wire up imports
- In `decisionWorkflow.ts`, import the new persona runners from `risk/index.ts` (or the specific files) and remove the old combined import.
- Ensure the graph node creation uses the renamed functions.

### 4. Clean up
- Delete the consolidated `riskAnalystRunnables.ts` once references are updated.
- Run build/lint/tests to confirm no regressions.

## Validation Checklist
- [ ] All persona prompts match the Python versions line-for-line.
- [ ] Debate history persists under the new persona keys.
- [ ] Risk manager receives the same debate transcript structure.
- [ ] Build/test pipeline completes without errors.
