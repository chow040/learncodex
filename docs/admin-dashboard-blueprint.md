# Admin Dashboard Blueprint

**Objective:** Build a no-code configuration platform that allows admin users to manage system-wide LLM settings, trading analysis agents, prompts, and policies without requiring code changes or redeployment.

---

## 1. Purpose & Scope

### 1.1 Goal
Create an **Admin Dashboard** enabling admin users to configure:
- System-wide LLM settings and feature flags
- Trading analysis agents (Technical / Fundamental / Macro / Risk / Orchestrator)
- Agent prompts and behavior parameters
- Agent tools & context policies
- All without code changes or redeploy

### 1.2 Out-of-Scope (Initial Release)
- Real order execution / auto-trading controls
- User billing / subscriptions
- Complex multi-tenant permissions
- User-level custom agent configurations

---

## 2. Roles & Permissions

### 2.1 Admin Role
**Access:** `/admin` area

**Capabilities:**
- Manage system settings (LLM configuration, feature flags)
- Manage agents (definitions, default behaviors, status)
- Manage prompt profiles (text, schema, versioning)
- Configure agent tool & context policies
- Preview assembled prompts before deployment

### 2.2 User Role
**Access:** `/trading-agents` area

**Capabilities:**
- View available active agents
- Run analyses on tickers with optional questions
- Review personal run history
- View agent configurations (read-only)

**Restrictions:**
- Cannot edit system prompts
- Cannot change LLM or system settings
- Cannot modify tool/context policies

---

## 3. Core Use Cases

### 3.1 Admin Use Cases

**UC-A1: Agent Configuration Management**
- View all agents with current status (active/disabled/experimental)
- Modify agent parameters: model, temperature, max tokens
- Change default behavior: horizon, tone, risk bias, focus
- Enable/disable agents without code changes

**UC-A2: Prompt Profile Management**
- Create versioned prompt profiles for different agent types
- Edit prompt content and output schema descriptions
- Clone existing prompts to create new versions
- Assign specific prompt profiles to agents
- Mark prompt versions as active/inactive

**UC-A3: Tool Policy Configuration**
- Define which data sources each agent can access
- Set limits on tool usage per run
- Enable/disable cross-ticker analysis
- Configure max tools per agent execution

**UC-A4: Context Policy Configuration**
- Control historical context injection into prompts
- Set limits on previous analyses inclusion
- Define token budgets for context blocks
- Enable/disable user notes and global summaries

**UC-A5: System Settings Management**
- Configure default LLM models system-wide
- Set temperature and token limits per feature category
- Manage feature flags (trading agents, news, fundamentals, macro)
- Control UI behavior settings (explanation length, display modes)

**UC-A6: Prompt Preview & Testing**
- Preview fully assembled prompts for sample inputs
- Validate prompt structure before activating
- Test prompt changes with example tickers/questions

### 3.2 User Use Cases

**UC-U1: Agent Discovery**
- Browse available trading agents with descriptions
- View agent capabilities and data sources
- Understand agent focus areas and methodologies

**UC-U2: Analysis Execution**
- Select agent and input ticker symbols
- Provide optional analysis question
- Receive decision summary with confidence score

**UC-U3: History Review**
- View personal run history per agent
- Filter runs by date or ticker
- Drill into individual runs for detailed output

**UC-U4: Run Detail Inspection**
- View inputs (tickers, question, parameters)
- See decision summary and parsed output
- Review token usage and execution metadata

---

## 4. Data Model (Conceptual Entities)

### 4.1 User
**Purpose:** Authentication and role-based access control

**Fields:**
- `id`: Unique identifier
- `email`: User email address
- `role`: Enum (`admin`, `user`)
- `created_at`: Account creation timestamp
- `updated_at`: Last modification timestamp

### 4.2 System Setting
**Purpose:** Global configuration key-value store

**Fields:**
- `id`: Unique identifier
- `key`: Setting identifier (e.g., `"llm.default_model"`)
- `value`: Configuration value (JSON or text)
- `scope`: Category grouping (e.g., `"llm"`, `"feature"`, `"ui"`)
- `updated_at`: Last modification timestamp

**Common Settings:**
- `llm.default_model`: Default LLM model name
- `llm.default_temperature`: Default temperature value
- `llm.default_max_tokens`: Default token limit
- `feature.trading_agents_enabled`: Feature flag
- `feature.news_enabled`: Tool availability flag
- `ui.explanation_length`: UI display preference

### 4.3 Agent
**Purpose:** Trading analysis agent definition and configuration

**Fields:**
- `id`: Unique identifier
- `slug`: URL-friendly identifier (e.g., `"technical_analyst"`)
- `name`: Display name (e.g., `"Technical Analyst"`)
- `description`: Agent purpose and methodology description
- `status`: Enum (`active`, `disabled`, `experimental`)
- `default_model`: LLM model identifier (e.g., `"gpt-4.1"`)
- `default_temperature`: Numeric temperature setting
- `default_max_tokens`: Numeric token limit
- `default_horizon`: Enum (`intraday`, `swing`, `long_term`)
- `default_tone`: Enum (`neutral`, `institutional`, `casual`)
- `default_risk_bias`: Enum (`conservative`, `balanced`, `aggressive`)
- `default_focus`: Enum (`technical`, `fundamental`, `macro`, `mixed`)
- `prompt_profile_id`: Reference to active PromptProfile
- `created_at`: Creation timestamp
- `updated_at`: Last modification timestamp

### 4.4 Prompt Profile
**Purpose:** Versioned system prompts with schema definitions

**Fields:**
- `id`: Unique identifier
- `name`: Profile name (e.g., `"Technical Analyst Prompt v3"`)
- `type`: Prompt category (e.g., `trading_agent_system`, `rule_generator_system`, `risk_guard_system`)
- `version`: Integer version number (auto-incremented)
- `content`: System prompt text
- `output_schema_example`: Expected JSON response format description
- `tool_overrides`: Optional metadata describing required tools (parsed from inline directives)
- `is_active`: Boolean active status flag
- `created_at`: Creation timestamp
- `updated_at`: Last modification timestamp

**Versioning Strategy:**
- New versions created via clone or increment
- Only one version per type should be `is_active=true` per agent
- Historical versions preserved for audit trail
- Prompts may embed tool directives using the `[[tool:identifier]]` syntax (e.g., `[[tool:news]]`). When parsed, these directives update the agent's tool policy and must match supported tool identifiers (price, indicators, news, fundamentals, macro).

### 4.5 Agent Tool Policy
**Purpose:** Define data source and tool access permissions per agent

**Fields:**
- `id`: Unique identifier
- `agent_id`: Reference to Agent
- `can_use_price_data`: Boolean permission flag
- `can_use_indicators`: Boolean permission flag
- `can_use_news`: Boolean permission flag
- `can_use_fundamentals`: Boolean permission flag
- `can_use_macro`: Boolean permission flag
- `max_tools_per_run`: Integer limit on tool calls
- `allow_cross_ticker`: Boolean multi-ticker analysis flag

**Default Behavior:**
- If policy doesn't exist for an agent, use system defaults
- Policies created on first agent configuration save

### 4.6 Agent Context Policy
**Purpose:** Control historical context injection into agent prompts

**Fields:**
- `id`: Unique identifier
- `agent_id`: Reference to Agent
- `include_previous_analyses`: Boolean flag for past runs
- `include_user_notes`: Boolean flag for user annotations
- `include_global_summary`: Boolean flag for system-wide insights
- `max_analyses`: Integer limit on past runs to include
- `max_context_tokens`: Integer token budget for context block

**Token Management:**
- Context block respects `max_context_tokens` budget
- Prioritize most recent analyses if limit reached
- Truncate older analyses to fit within budget

### 4.7 Agent Run
**Purpose:** Record of single agent execution

**Fields:**
- `id`: Unique identifier
- `agent_id`: Reference to Agent
- `user_id`: Reference to User (nullable for system runs)
- `created_at`: Execution start timestamp
- `tickers`: Array of US stock ticker symbols (e.g., `["AAPL", "TSLA", "NVDA"]`)
- `question`: User-provided analysis question (text, nullable)
- `status`: Enum (`running`, `success`, `error`)
- `decision_summary`: Short decision text (e.g., `"BUY AAPL, HOLD TSLA"`)
- `confidence`: Numeric confidence score (0–1, nullable)
- `tokens_prompt`: Input token count (nullable)
- `tokens_completion`: Output token count (nullable)
- `tokens_total`: Total token usage (nullable)

**Status Lifecycle:**
1. Created with `status=running`
2. Updated to `success` or `error` after execution
3. Immutable after completion

### 4.8 Agent Run Snapshot
**Purpose:** Audit trail with full prompt and output details

**Fields:**
- `id`: Unique identifier
- `run_id`: Reference to AgentRun
- `system_prompt`: Final system prompt text used
- `assembled_prompt`: Full prompt sent to LLM
- `context_block`: Historical context section
- `tools_used`: JSON array of tool calls with arguments
- `raw_output_text`: Raw LLM response text
- `parsed_output_json`: Structured output (JSON, nullable)
- `error_message`: Error details if `status=error` (nullable)

**Privacy Considerations:**
- Snapshots may contain sensitive data
- User view should redact or summarize system prompts
- Admin view has full access for debugging

---

## 5. Backend API Requirements

All endpoints require authentication. Admin endpoints require `role=admin`.

### 5.1 Admin – System Settings

**List All System Settings**
```
GET /api/admin/system-settings
```
- **Response:** All settings grouped by scope
- **Format:** `{ llm: [...], feature: [...], ui: [...] }`

**Update System Settings**
```
PATCH /api/admin/system-settings
```
- **Request:** Array of `{ key, value }` objects
- **Behavior:** Upsert (create if missing, update if exists)
- **Response:** Updated settings list

### 5.2 Admin – Agents

**List All Agents**
```
GET /api/admin/agents
```
- **Response:** Array of agent summary objects
- **Fields:** `id`, `slug`, `name`, `status`, `default_model`, `updated_at`

**Get Agent Configuration**
```
GET /api/admin/agents/:id
```
- **Response:** Complete agent configuration
- **Includes:**
  - Agent core fields
  - Linked PromptProfile
  - AgentToolPolicy
  - AgentContextPolicy

**Update Agent Configuration**
```
PATCH /api/admin/agents/:id
```
- **Request:** Partial updates for:
  - Agent fields
  - Tool policy fields
  - Context policy fields
- **Behavior:**
  - Create policies if they don't exist
  - Update existing policies
  - Validate prompt_profile_id if changed
- **Response:** Updated configuration

### 5.3 Admin – Prompt Profiles

**List Prompt Profiles**
```
GET /api/admin/prompt-profiles?type=...&agentId=...
```
- **Query Params:**
  - `type`: Filter by prompt type (optional)
  - `agentId`: Filter by assigned agent (optional)
- **Response:** Array of prompt profile summaries

**Get Prompt Profile Detail**
```
GET /api/admin/prompt-profiles/:id
```
- **Response:** Full prompt profile object

**Create Prompt Profile**
```
POST /api/admin/prompt-profiles
```
- **Request:**
  - `name`: Profile name
  - `type`: Prompt type
  - `content`: System prompt text
  - `output_schema_example`: Schema description
  - `basedOnProfileId`: Optional ID to clone from
- **Tool Directives:** `content` may include `[[tool:<id>]]` markers (e.g., `[[tool:news]]`) to request specific tools. Valid IDs: `price`, `indicators`, `news`, `fundamentals`, `macro`. The backend parses these markers and applies them to the agent's tool policy when assigned.
- **Behavior:**
  - Auto-increment version number for type
  - Set `is_active=false` by default
- **Response:** Created prompt profile

**Update Prompt Profile**
```
PATCH /api/admin/prompt-profiles/:id
```
- **Request:** Partial updates for:
  - `name`
  - `content`
  - `output_schema_example`
  - `is_active`
- **Response:** Updated prompt profile

**Assign Prompt Profile to Agent**
```
POST /api/admin/agents/:id/assign-prompt
```
- **Request:** `{ promptProfileId }`
- **Behavior:** Update `agent.prompt_profile_id`
- **Validation:** Ensure prompt profile exists and type matches agent
- **Response:** Updated agent

**Preview Assembled Prompt**
```
POST /api/admin/agents/:id/preview-prompt
```
- **Request:**
  - `tickers`: Sample US stock ticker array (e.g., `["AAPL", "MSFT"]`)
  - `question`: Sample question (optional)
- **Behavior:**
  - Build full prompt as would be sent to LLM
  - Do NOT execute LLM call
- **Response:**
  - `system_prompt`: Final system prompt
  - `assembled_prompt`: Complete prompt
  - `context_block`: Context section
  - `token_estimate`: Approximate token count

### 5.4 User – Trading Agents

**List Active Agents**
```
GET /api/trading-agents
```
- **Response:** Active agents only (`status=active`)
- **Fields:** User-safe subset (exclude sensitive configs)

**Get Agent Detail (User View)**
```
GET /api/trading-agents/:id
```
- **Response:**
  - Agent summary
  - Output schema description (redacted system prompt)
  - Tool policy summary
  - Context policy summary
  - Recent runs (limited to user's runs or public aggregate)

### 5.5 User – Agent Runs

**Execute Agent Run**
```
POST /api/trading-agents/:id/run
```
- **Request:**
  - `tickers`: Array of US stock ticker symbols (e.g., `["AAPL", "MSFT", "NVDA"]`)
  - `question`: Optional question text
  - `horizon`: Optional override (if allowed)
- **Response:**
  - `run`: AgentRun summary
  - Fields: `id`, `tickers`, `question`, `status`, `decision_summary`, `confidence`

**List Runs for Agent**
```
GET /api/trading-agents/:id/runs?limit=...&ticker=...
```
- **Query Params:**
  - `limit`: Max results (default 20)
  - `ticker`: Filter by ticker (optional)
- **Response:** Array of AgentRun summaries
- **Scope:** Current user's runs only

**Get Run Detail**
```
GET /api/trading-agents/:id/runs/:runId
```
- **Response:**
  - Full AgentRun object
  - AgentRunSnapshot (user-safe view)
- **Privacy:** Redact or summarize `system_prompt` in snapshot

---

## 6. LLM Orchestration Logic

When `/api/trading-agents/:id/run` is called, the backend executes this workflow:

### 6.1 Configuration Loading

**Step 1: Load Agent**
- Fetch Agent by `id`
- Validate `status=active`
- Load linked PromptProfile via `prompt_profile_id`

**Step 2: Load Policies**
- Fetch AgentToolPolicy for agent
- Fetch AgentContextPolicy for agent
- If policies don't exist, use system defaults from SystemSettings

**Step 3: Load System Defaults**
- Fetch relevant SystemSettings (e.g., `llm.*` settings)
- Use as fallback for any missing agent-level config

### 6.2 Context Building

**Step 1: Load Historical Context**
- If `context_policy.include_previous_analyses=true`:
  - Fetch recent AgentRun records for this agent
  - Optionally filter by user or ticker
  - Limit to `max_analyses`
  - Summarize as text block
- If `include_user_notes=true`:
  - Fetch user annotations (future extension)
- If `include_global_summary=true`:
  - Fetch system-wide insights (future extension)

**Step 2: Token Budget Management**
- Estimate token count for context block
- Truncate or summarize if exceeds `max_context_tokens`
- Prioritize most recent analyses

### 6.3 Prompt Assembly

**Step 1: Build Behavior Block**
```
Agent: {agent.name}
Description: {agent.description}
Default Horizon: {agent.default_horizon}
Tone: {agent.default_tone}
Risk Bias: {agent.default_risk_bias}
Focus: {agent.default_focus}
```

**Step 2: Combine System Prompt**
```
{behavior_block}

{prompt_profile.content}

Expected Output Format:
{prompt_profile.output_schema_example}
```

**Step 3: Build Context Block**
```
## Historical Context
{summarized_previous_analyses}

{optional_user_notes}

{optional_global_summary}
```

**Step 4: Build User Block**
```
## Analysis Request
Tickers: {tickers.join(', ')}
Question: {question || 'General analysis'}
```

**Final Assembled Prompt:**
```
{system_prompt}

{context_block}

{user_block}
```

### 6.4 LLM Execution

**Step 1: Create AgentRun Record**
- Create with `status=running`
- Record `tickers`, `question`, `created_at`

**Step 2: Call LLM**
- Use `agent.default_model` (or system override)
- Use `agent.default_temperature`
- Use `agent.default_max_tokens`
- Track token usage from API response

**Step 3: Parse Response**
- Extract structured JSON from output
- Generate `decision_summary` (short text)
- Extract `confidence` score if present
- Handle parsing errors gracefully

### 6.5 Persistence

**Step 1: Update AgentRun**
- Set `status=success` or `status=error`
- Store `decision_summary`, `confidence`
- Record token counts: `tokens_prompt`, `tokens_completion`, `tokens_total`

**Step 2: Create AgentRunSnapshot**
- Store `system_prompt` (from assembly)
- Store `assembled_prompt` (full prompt)
- Store `context_block`
- Store `tools_used` (if applicable)
- Store `raw_output_text`
- Store `parsed_output_json`
- Store `error_message` if failed

**Step 3: Return Response**
- Return AgentRun summary to client
- Include `id` for subsequent detail fetches

---

## 7. Admin Frontend Requirements

### 7.1 `/admin` (Dashboard Home)

**Layout:**
- Navigation sidebar with sections:
  - System Settings
  - Agents
  - Prompt Profiles
- Main content area with summary cards

**Summary Cards:**
1. **System Health**
   - Active agents count
   - Disabled agents count
   - Last configuration change timestamp

2. **Recent Activity**
   - Last 5 agent configuration changes
   - Last 5 prompt profile updates
   - Last 5 system setting changes

3. **Quick Links**
   - "Configure System Settings"
   - "Manage Agents"
   - "Edit Prompt Profiles"

### 7.2 `/admin/system` (System Settings)

**Section 1: LLM Settings**
- Default Model: Dropdown or text input
- Default Temperature: Slider (0–2) with numeric display (**mock only until LLM runtime exposes temperature**)
- Default Max Tokens: Numeric input (**mock only; persona-level budgets take precedence**)
- Token limits per category:
  - Trading agents
  - Risk analysis
  - Prompt generation

**Section 2: Feature Flags**
- Trading Agents: Toggle switch
- News Tool: Toggle switch
- Fundamentals Tool: Toggle switch
- Macro Tool: Toggle switch
- Social Sentiment Tool: Toggle switch

**Section 3: UI Settings**
- Explanation Length: Radio buttons (compact/normal/detailed)
- Default Chart Period: Dropdown
- Display Mode: Toggle (simple/advanced)

**Actions:**
- Save button (persists all changes)
- Reset to defaults button (with confirmation)
- Last updated timestamp display

### 7.3 `/admin/agents` (Agent List)

**Table Columns:**
- Name
- Slug
- Status (badge: active/disabled/experimental)
- Default Model
- Prompt Profile (linked name)
- Last Updated
- Actions (View/Edit button)

**Filters:**
- Status dropdown (all/active/disabled/experimental)
- Search by name or slug

**Actions:**
- Row click navigates to `/admin/agents/:agentId`
- "Create New Agent" button (future extension)

### 7.4 `/admin/agents/:agentId` (Agent Detail)

**Tab 1: General**

*Agent Info:*
- Name: Text input
- Description: Textarea
- Status: Dropdown (active/disabled/experimental)

*LLM Configuration:*
- Default Model: Text input or dropdown
- Max Tokens: Numeric input

*Behavior Defaults:*
- Horizon: Dropdown (intraday/swing/long_term)
- Tone: Dropdown (neutral/institutional/casual)
- Risk Bias: Dropdown (conservative/balanced/aggressive)
- Focus: Dropdown (technical/fundamental/macro/mixed)
- **Status:** Read-only mock data for now. Editing is deferred until we expose LangGraph model routing per persona.

**Tab 2: Context**

*Context Inclusion:*
- Include Previous Analyses: Checkbox
- Include User Notes: Checkbox
- Include Global Summary: Checkbox

*Prompt & Context Editing:*
- Persona prompt content textarea (full prompt text) with support for template tokens (see below)
- Output schema example textarea
- Tool syntax reference (e.g., `[[tool:NEWS]]`, `[[tool:PRICE_DATA max=2]]`)
- No prompt reuse across personas; each persona owns a single prompt definition.

*Context Limits & Examples:*
- Max Analyses: Numeric input
- Max Context Tokens: Numeric input with slider
- Block of examples showing how to call tools within the prompt/context (`[[tool:NEWS max=2]]`, `[[tool:PRICE_DATA]]`, etc.)
- **Status:** Remains mock-only until we wire up context builder endpoints.

*Template Tokens:*
- Admin-managed prompts can include `{{placeholder}}` variables that the backend resolves at runtime. Supported tokens (per persona) include:
  - All personas: `{{ticker}}`, `{{currentDate}}`, `{{question}}`, `{{tickersCommaSeparated}}`
  - Fundamentals: `{{fundamentalsSummary}}`, `{{balanceSheet}}`, `{{cashFlow}}`, `{{incomeStatement}}`, `{{insiderTransactions}}`
  - Market: `{{priceHistory}}`, `{{technicalReport}}`
  - News: `{{companyNews}}`, `{{globalNews}}`, `{{socialChatter}}`
  - Social: `{{socialBuzz}}`, `{{redditSummary}}`
- Future personas (debates/judges/risk/trader) will add their own token dictionaries.
- Backend will use a regex-based replacer (e.g., `/\{\{(\w+)\}\}/g`) during prompt assembly to swap tokens with actual values (see Section 5.4 plan).

**Tab 3: Preview**

*Input Form:*
- Sample Tickers: Text input (comma-separated)
- Sample Question: Textarea

*Preview Button:*
- Calls preview endpoint
- Displays loading state during request

*Preview Display:*
- Tabbed view or accordion showing:
  - Behavior Block
  - System Prompt
  - Context Block (if applicable)
  - User Block
  - Token Estimate

**Global Actions:**
- Save All Changes button
- Revert Changes button
- Last Saved timestamp

> **Note:** Dedicated prompt library screens were removed. Each persona now edits its prompt directly within the agent detail view, ensuring a 1:1 mapping between persona and prompt text.

## 8. User Frontend Requirements

### 8.1 `/trading-agents` (Agent List)

**Display:**
- Grid or list of active agents
- Each card/row shows:
  - Agent name
  - Short description
  - Tags: Focus type, horizon, model name
  - "Run Analysis" button

**Filters:**
- Focus type (technical/fundamental/macro/mixed)
- Horizon (intraday/swing/long_term)
- Search by name

**Actions:**
- Card click navigates to `/trading-agents/:agentId`

### 8.2 `/trading-agents/:agentId` (Agent Detail)

**Tab 1: Overview**

*Quick Run Form:*
- Tickers Input: Text field (comma-separated, e.g., "AAPL, TSLA, NVDA")
- Question Input: Textarea (optional)
- Run Button: Submit form

*Last Result Summary:*
- Execution timestamp
- Tickers analyzed
- Decision summary
- Confidence score (progress bar or numeric)
- "View Full Details" link to latest run

**Tab 2: Tools & Context** (Read-Only)

*Data Sources:*
- List of enabled data sources with icons
  - Price Data
  - Technical Indicators
  - News
  - Fundamentals
  - Macro Data

*Context Usage:*
- "Uses last X analyses for context"
- "Context token budget: Y tokens"

**Tab 3: Runs & Logs**

*Filters:*
- Date range picker
- Ticker filter (dropdown from user's past tickers)
- Status filter (all/success/error)

*Run Table:*
- Columns:
  - Timestamp
  - Tickers
  - Decision Summary (truncated)
  - Confidence
  - Status badge
- Row click opens run detail modal or page

*Run Detail View (Modal or Dedicated Page):*
- Input section:
  - Tickers
  - Question
  - Parameters used
- Output section:
  - Decision summary
  - Confidence score
  - Parsed output (formatted JSON)
  - Token usage
- Snapshot section (limited/redacted):
  - Context block summary
  - Tools used
  - Error message if failed

---

## 9. Non-Functional Requirements

### 9.1 Configurability
**Requirement:** All configuration changes made via Admin UI must take effect immediately for all future runs without requiring code changes, recompilation, or redeployment.

**Implementation:**
- Database-driven configuration
- Hot-reload of settings on each agent run
- No hard-coded prompts or model names in application code

### 9.2 Auditability
**Requirement:** Track all configuration changes for compliance and debugging.

**Implementation (Minimum):**
- `updated_at` timestamp on all mutable entities
- Future: `updated_by` user reference
- Future: Dedicated audit log table

**Audit Scope:**
- Agent configuration changes
- Prompt profile edits and version changes
- System setting updates
- Tool and context policy modifications

### 9.3 Security & Access Control
**Requirements:**
- Admin endpoints protected by role check (`role=admin`)
- User endpoints require authentication
- Input validation on all admin modifications
- Rate limiting on agent run endpoints
- Sanitization of user inputs (tickers, questions)

**Privacy:**
- User run snapshots redact sensitive system prompts
- Admin view has full access for debugging
- PII in questions/notes handled according to data policy

### 9.4 Performance
**Requirements:**
- Agent list queries optimized (indexed status field)
- Run history paginated (default 20, max 100)
- Context loading limited by token budget
- Preview endpoint does not call LLM (simulation only)

**Caching:**
- System settings cached in-memory with TTL
- Agent configurations cached until update
- Prompt profiles cached by version

### 9.5 Extensibility
**Design Goals:**
- Easy to add new agent types without schema changes
- Support for new prompt types via `type` field
- Tool policies extensible with new boolean flags
- Context policies support new inclusion types
- System settings accommodate new categories via `scope`

**Extension Points:**
- New tool flags: Add column to `agent_tool_policy`
- New prompt types: Add enum value, no migration needed for existing rows
- New system settings: Insert new key-value pairs
- New context sources: Add flags to `agent_context_policy`

### 9.6 Error Handling
**Requirements:**
- Validation errors return clear messages with field names
- LLM failures captured in `agent_run_snapshot.error_message`
- Partial configuration saves prevented (transaction boundaries)
- Rollback mechanism for failed prompt activations

**User Experience:**
- Graceful degradation if LLM unavailable
- Clear error messages in user language (no stack traces)
- Admin errors include technical details for debugging

### 9.7 Data Integrity
**Constraints:**
- Cannot delete agent if runs exist (soft delete or restrict)
- Cannot delete prompt profile if assigned to active agent
- Tool policy and context policy cascade with agent (optional)
- Active prompt profiles limited to one per type per agent

**Validation:**
- Model names validated against supported list
- Temperature range: 0–2
- Token limits: Positive integers with reasonable maxima
- Ticker symbols: Alphanumeric with hyphens
- Confidence scores: 0–1 range

---

## 10. Implementation Checklist

### Phase 1: Data Layer
- [x] Define database schema for all entities
- [x] Create migrations for tables
- [x] Implement seed data for default agents and system settings
- [x] Add indexes for performance-critical queries

### Phase 2: Backend API - Admin
- [x] System settings endpoints (list, update)
- [x] Agent CRUD endpoints (list, get, update)
- [x] Prompt profile endpoints (list, get, create, update, assign)
- [x] Preview prompt endpoint
- [x] Admin authentication middleware

### Phase 3: Backend API - User
- [x] Trading agents list endpoint (active only)
- [x] Agent detail endpoint (user view)
- [x] Run execution endpoint with orchestration logic
- [x] Run history endpoints (list, detail)

### Phase 4: LLM Orchestration
- [x] Configuration loading logic
  - [x] Load agent + prompt profile from admin DB before each run
  - [x] Merge system defaults + agent overrides for model/temperature/token limits
- [x] Context building with token budget
  - [x] Pull recent runs per user/agent respecting `max_analyses`
  - [x] Truncate summaries to `max_context_tokens` budget
- [x] Prompt assembly with behavior/context/user blocks
  - [x] Compose behavior, system, context, and user blocks using admin text
  - [x] Parse `[[tool:...]]` directives and log token estimate
- [ ] LangGraph LLM integration
  - [ ] Thread assembled prompt + context through `runDecisionGraph`
  - [x] Parameterize analyst/debate/trader runnables to accept runtime prompts
  - [ ] Bind tools dynamically based on tool policy/directives (enforce limits in LangGraph)
  - [ ] Fail-safe: if no admin prompt assigned, fall back to a default profile stored in the DB rather than code constants
- [ ] Persona-specific prompt/tool bindings
  - Market Analyst
    - [x] Replace `MARKET_SYSTEM_PROMPT` with runtime prompt text
    - [x] Respect tool directives when registering price/indicator tools
  - News Analyst
    - [x] Inject admin-managed prompt content
    - [x] Toggle news tools based on directives/policy
  - Social Analyst
    - [x] Parameterize prompt text/context
    - [x] Enforce social/news tool gating
  - Fundamentals Analyst
    - [x] Accept runtime prompt strings
    - [x] Honor fundamentals/macro tool flags
  - Debates & Judges (Bull/Bear, Research Manager, Trader, Risk personas)
    - [x] Transition system prompts to runtime values
    - [x] Share context/behavior blocks consistently
- [ ] Response parsing and error handling
  - [ ] Capture final decision tokens and analyst outputs back into `agent_runs`
  - [ ] Standardize error payloads + retry/abort semantics in LangGraph callbacks
- [x] Snapshot persistence
  - [x] Store full prompt/context/output/error metadata in `agent_run_snapshots`


### Phase 5A: Admin Frontend (UI scaffolding)
- [x] Admin dashboard home page (placeholder metrics/activity feed)
- [x] System settings page with forms (static data mocked or local state)
- [x] Agents list screen (table layout, filters)
- [x] Agent detail editor (tabs/forms without API wiring)
- [!] NOTE: Agent directory currently represents the fixed LangGraph personas (market, news, social, fundamentals, risk); adding new personas requires coordinated LangGraph configuration, so CRUD flows stay read-only until LangGraph supports dynamic agents.
- [x] Inline persona prompt editor on agent detail
- [x] Tool syntax reference copy (context tab)
- [x] Prompt preview panel (read-only mock form + output shell)
- [x] Navigation and routing

### Phase 5A2 Integration Checklist
- [ ] Wire dashboard tiles to backend summaries once endpoints exist
- [x] Connect system settings form to `/api/admin/system-settings`
- [x] Hook agents list/detail forms to admin agent endpoints
- [x] Persist persona prompt edits (prompt profile API)
- [x] Enable preview form to call the preview API and display sections
- [ ] Implement prompt template tokens + regex replacer in backend prompt loader

### Phase 5B: Prompt Migration
- [ ] Legacy prompt extraction
  - [ ] Seed initial prompt profiles in the admin DB with the existing persona prompts (market, news, social, fundamentals, debates)
  - [ ] Provide a migration script or manual checklist to ensure all hard-coded prompts are captured as editable profiles
- [ ] Legacy prompt cleanup
  - [ ] Remove remaining hard-coded persona prompts once LangGraph integration supports admin-managed text for all personas
  - [ ] Fail-safe: if no admin prompt assigned, fall back to a default profile stored in the DB rather than code constants

### Phase 6: User Frontend
- [x] Trading agents list page
- [x] Agent detail page with tabs
- [x] Quick run form
- [x] Run history table and filters
- [x] Run detail view/modal

### Phase 7: Testing & Validation
- [ ] Unit tests for orchestration logic
- [ ] Integration tests for API endpoints
- [ ] E2E tests for admin workflows
- [ ] E2E tests for user workflows
- [ ] Performance testing for run execution
- [ ] Security testing for role-based access

### Phase 8: Documentation & Deployment
- [ ] API documentation (OpenAPI/Swagger)
- [ ] Admin user guide
- [ ] Developer setup guide
- [ ] Migration guide from hard-coded config
- [ ] Production deployment runbook

---

## 11. Future Extensions

### 11.1 Advanced Features (Post-MVP)
- User-level custom agent configurations (override defaults)
- A/B testing framework for prompt versions
- Automated prompt optimization based on run outcomes
- Multi-model comparison runs (parallel execution)
- Agent performance analytics dashboard

### 11.2 Collaboration Features
- Shared prompt library across admins
- Prompt version diff viewer
- Comment system for prompt profiles
- Change approval workflow for production agents

### 11.3 Advanced Context Management
- User notes on tickers/runs
- Global market summary generation
- Cross-agent context sharing
- Vector embeddings for semantic context retrieval

### 11.4 Integration Points
- Webhook notifications for run completion
- Export run results to CSV/PDF
- Import prompt templates from external sources
- Integration with external knowledge bases

---

## 12. Success Criteria

### 12.1 Admin Experience
- [ ] Admin can modify any agent parameter in < 2 minutes
- [ ] Prompt changes propagate to new runs immediately
- [ ] Preview accurately reflects production prompt assembly
- [ ] Zero downtime for configuration changes

### 12.2 User Experience
- [ ] Agent runs complete in < 30 seconds (95th percentile)
- [ ] Decision summaries are clear and actionable
- [ ] Run history is easily searchable and filterable
- [ ] No exposed system internals in user views

### 12.3 System Quality
- [ ] 99.9% uptime for agent run endpoint
- [ ] All configuration changes logged for audit
- [ ] No hard-coded prompts or models in codebase
- [ ] Automated tests cover > 80% of orchestration logic

---

**Document Version:** 1.0  
**Last Updated:** 16 November 2025  
**Status:** Draft for Implementation
