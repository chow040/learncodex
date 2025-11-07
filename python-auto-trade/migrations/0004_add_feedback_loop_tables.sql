-- Migration 0004: Add Feedback Loop Tables
-- Purpose: Self-improving LLM trading system with learned rules
-- Created: 4 November 2025

-- ============================================================================
-- 1. LEARNED RULES TABLE
-- ============================================================================
-- Stores self-generated trading rules from LLM critiques
CREATE TABLE IF NOT EXISTS learned_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_text TEXT NOT NULL,
    rule_type VARCHAR(50) NOT NULL CHECK (rule_type IN ('risk_management', 'entry', 'exit', 'position_sizing')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_trade_id UUID,  -- References trade_outcomes(id), nullable for manual rules
    version VARCHAR(50) DEFAULT 'v1',
    active BOOLEAN DEFAULT TRUE,
    effectiveness_score REAL DEFAULT 0.5,
    times_applied INTEGER DEFAULT 0,
    created_by VARCHAR(50) DEFAULT 'system',  -- 'system' or 'manual'
    metadata JSONB,  -- Store critique, confidence, etc.
    CONSTRAINT check_effectiveness_score CHECK (effectiveness_score >= 0.0 AND effectiveness_score <= 1.0)
);

-- Indexes for efficient rule retrieval
CREATE INDEX IF NOT EXISTS idx_learned_rules_active 
    ON learned_rules(active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learned_rules_type 
    ON learned_rules(rule_type, active);
CREATE INDEX IF NOT EXISTS idx_learned_rules_effectiveness 
    ON learned_rules(effectiveness_score DESC) 
    WHERE active = TRUE;

COMMENT ON TABLE learned_rules IS 'Self-generated trading rules from LLM feedback loop';
COMMENT ON COLUMN learned_rules.rule_text IS 'Natural language rule text (e.g., "Avoid buying when RSI > 70")';
COMMENT ON COLUMN learned_rules.rule_type IS 'Category: risk_management, entry, exit, position_sizing';
COMMENT ON COLUMN learned_rules.effectiveness_score IS 'Win rate of decisions using this rule (0.0 to 1.0)';
COMMENT ON COLUMN learned_rules.times_applied IS 'Number of times rule was included in decision prompts';
COMMENT ON COLUMN learned_rules.metadata IS 'JSON: {critique: str, confidence: float, symbols: [str]}';


-- ============================================================================
-- 2. TRADE OUTCOMES TABLE
-- ============================================================================
-- Extends llm_decision_logs with trade execution results and critiques
CREATE TABLE IF NOT EXISTS trade_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    decision_id UUID,  -- References llm_decision_logs(id) if exists, nullable for simulation
    portfolio_id UUID,  -- References auto_portfolios(id) if exists
    symbol TEXT NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('BUY', 'SELL', 'CLOSE', 'HOLD')),
    entry_price NUMERIC(18, 8),
    exit_price NUMERIC(18, 8),
    quantity NUMERIC(28, 12),
    pnl_usd NUMERIC(18, 4),
    pnl_pct NUMERIC(10, 4),
    entry_timestamp TIMESTAMPTZ,
    exit_timestamp TIMESTAMPTZ,
    duration_seconds INTEGER,
    rationale TEXT,  -- Original decision rationale
    rule_ids UUID[],  -- Array of learned_rules IDs that were applied
    critique TEXT,  -- LLM self-critique after trade closes
    critique_timestamp TIMESTAMPTZ,
    generated_rule_id UUID,  -- References learned_rules(id) if rule was generated
    metadata JSONB,  -- Store additional context (market conditions, etc.)
    CONSTRAINT check_duration CHECK (duration_seconds >= 0)
);

-- Indexes for trade analysis
CREATE INDEX IF NOT EXISTS idx_trade_outcomes_symbol 
    ON trade_outcomes(symbol, exit_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_trade_outcomes_portfolio 
    ON trade_outcomes(portfolio_id, exit_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_trade_outcomes_pnl 
    ON trade_outcomes(pnl_pct DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_trade_outcomes_critique 
    ON trade_outcomes(exit_timestamp DESC) 
    WHERE critique IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trade_outcomes_rule_ids 
    ON trade_outcomes USING GIN(rule_ids);

COMMENT ON TABLE trade_outcomes IS 'Closed trade results with PnL and LLM critiques';
COMMENT ON COLUMN trade_outcomes.rule_ids IS 'Array of rule UUIDs applied in the decision';
COMMENT ON COLUMN trade_outcomes.critique IS 'LLM self-critique explaining why trade won/lost';
COMMENT ON COLUMN trade_outcomes.generated_rule_id IS 'New rule generated from this trade critique';


-- ============================================================================
-- 3. PROMPT TEMPLATES TABLE
-- ============================================================================
-- Versioned prompt templates for decision, critique, and rule generation
CREATE TABLE IF NOT EXISTS prompt_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    template_type VARCHAR(50) NOT NULL CHECK (template_type IN ('decision', 'critique', 'rule_generation', 'base_system')),
    template_text TEXT NOT NULL,
    version VARCHAR(50) DEFAULT 'v1',
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB,
    CONSTRAINT unique_active_template UNIQUE (template_type, active) DEFERRABLE INITIALLY DEFERRED
);

-- Indexes for prompt retrieval
CREATE INDEX IF NOT EXISTS idx_prompt_templates_active 
    ON prompt_templates(template_type, active);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_version 
    ON prompt_templates(name, version);

COMMENT ON TABLE prompt_templates IS 'Versioned prompt templates for LLM interactions';
COMMENT ON COLUMN prompt_templates.template_type IS 'decision: trading decisions, critique: post-trade analysis, rule_generation: new rule creation';


-- ============================================================================
-- 4. RULE APPLICATIONS TABLE
-- ============================================================================
-- Tracks when and how learned rules were applied in decisions
CREATE TABLE IF NOT EXISTS rule_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID NOT NULL,  -- References learned_rules(id)
    decision_id UUID,  -- References llm_decision_logs(id) or simulation decision
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    outcome_pnl NUMERIC(10, 4),  -- Filled after trade closes
    was_effective BOOLEAN,  -- TRUE if trade was profitable
    metadata JSONB,  -- Store decision details
    CONSTRAINT fk_rule_applications_rule FOREIGN KEY (rule_id) REFERENCES learned_rules(id) ON DELETE CASCADE
);

-- Indexes for rule performance tracking
CREATE INDEX IF NOT EXISTS idx_rule_applications_rule 
    ON rule_applications(rule_id, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_rule_applications_decision 
    ON rule_applications(decision_id);
CREATE INDEX IF NOT EXISTS idx_rule_applications_effectiveness 
    ON rule_applications(was_effective, applied_at DESC) 
    WHERE was_effective IS NOT NULL;

COMMENT ON TABLE rule_applications IS 'Log of when learned rules were used in decisions';
COMMENT ON COLUMN rule_applications.was_effective IS 'TRUE if decision resulted in profit';


-- ============================================================================
-- 5. ADD FOREIGN KEY CONSTRAINT (deferred for initial deployment)
-- ============================================================================
-- Note: These FKs are commented out to allow flexible deployment
-- Uncomment after confirming llm_decision_logs and auto_portfolios tables exist

-- ALTER TABLE trade_outcomes 
--     ADD CONSTRAINT fk_trade_outcomes_decision 
--     FOREIGN KEY (decision_id) REFERENCES llm_decision_logs(id) ON DELETE SET NULL;

-- ALTER TABLE trade_outcomes 
--     ADD CONSTRAINT fk_trade_outcomes_portfolio 
--     FOREIGN KEY (portfolio_id) REFERENCES auto_portfolios(id) ON DELETE SET NULL;

-- ALTER TABLE learned_rules 
--     ADD CONSTRAINT fk_learned_rules_source_trade 
--     FOREIGN KEY (source_trade_id) REFERENCES trade_outcomes(id) ON DELETE SET NULL;

-- ALTER TABLE trade_outcomes 
--     ADD CONSTRAINT fk_trade_outcomes_generated_rule 
--     FOREIGN KEY (generated_rule_id) REFERENCES learned_rules(id) ON DELETE SET NULL;


-- ============================================================================
-- 6. SEED DATA - Initial Prompt Templates
-- ============================================================================

-- Base system prompt for feedback loop
INSERT INTO prompt_templates (name, template_type, template_text, version, active, metadata)
VALUES (
    'feedback_loop_base_system',
    'base_system',
    'You are a self-improving trading AI. You learn from past trades by analyzing outcomes and generating decision rules. Your goal is to maximize risk-adjusted returns while minimizing drawdowns.',
    'v1',
    TRUE,
    '{"author": "system", "purpose": "Base system prompt for feedback loop"}'
) ON CONFLICT (name) DO NOTHING;

-- Critique generation prompt
INSERT INTO prompt_templates (name, template_type, template_text, version, active, metadata)
VALUES (
    'trade_critique_v1',
    'critique',
    'Analyze this completed trade and provide a concise critique (1-2 sentences):

Trade Details:
- Symbol: {symbol}
- Action: {action}
- Entry: ${entry_price}
- Exit: ${exit_price}
- PnL: {pnl_pct}%
- Duration: {duration_minutes} minutes
- Original Rationale: {rationale}

Result: {result_label}

Why did this trade {outcome_verb}? Be specific and actionable.',
    'v1',
    TRUE,
    '{"author": "system", "max_tokens": 150}'
) ON CONFLICT (name) DO NOTHING;

-- Rule generation prompt
INSERT INTO prompt_templates (name, template_type, template_text, version, active, metadata)
VALUES (
    'rule_generation_v1',
    'rule_generation',
    'Based on this trade critique, write ONE new decision rule to improve future trading.

Critique: {critique}

Trade Context:
- Symbol: {symbol}
- PnL: {pnl_pct}%
- Action: {action}

Requirements:
- Be specific and actionable
- Start with a verb (e.g., "Avoid", "Only", "Require")
- Keep under 30 words
- Focus on {focus_instruction}

New Rule:',
    'v1',
    TRUE,
    '{"author": "system", "max_tokens": 100}'
) ON CONFLICT (name) DO NOTHING;


-- ============================================================================
-- 7. VIEWS FOR ANALYTICS
-- ============================================================================

-- View: Rule effectiveness summary
CREATE OR REPLACE VIEW rule_effectiveness_summary AS
SELECT 
    lr.id,
    lr.rule_text,
    lr.rule_type,
    lr.created_at,
    lr.times_applied,
    lr.effectiveness_score,
    COUNT(ra.id) AS total_applications,
    SUM(CASE WHEN ra.was_effective = TRUE THEN 1 ELSE 0 END) AS successful_applications,
    AVG(ra.outcome_pnl) AS avg_pnl,
    lr.active
FROM learned_rules lr
LEFT JOIN rule_applications ra ON lr.id = ra.rule_id
GROUP BY lr.id, lr.rule_text, lr.rule_type, lr.created_at, lr.times_applied, lr.effectiveness_score, lr.active;

COMMENT ON VIEW rule_effectiveness_summary IS 'Aggregated effectiveness metrics for learned rules';


-- View: Recent trade outcomes with critiques
CREATE OR REPLACE VIEW recent_trade_critiques AS
SELECT 
    to_.id,
    to_.symbol,
    to_.action,
    to_.pnl_pct,
    to_.exit_timestamp,
    to_.critique,
    lr.rule_text AS generated_rule,
    lr.rule_type,
    ARRAY_LENGTH(to_.rule_ids, 1) AS rules_applied_count
FROM trade_outcomes to_
LEFT JOIN learned_rules lr ON to_.generated_rule_id = lr.id
WHERE to_.critique IS NOT NULL
ORDER BY to_.exit_timestamp DESC
LIMIT 100;

COMMENT ON VIEW recent_trade_critiques IS 'Last 100 trades with LLM critiques and generated rules';


-- ============================================================================
-- 8. MIGRATION COMPLETE
-- ============================================================================
-- Run this SQL file using your preferred PostgreSQL client or ORM

-- Rollback script (if needed):
-- DROP VIEW IF EXISTS recent_trade_critiques CASCADE;
-- DROP VIEW IF EXISTS rule_effectiveness_summary CASCADE;
-- DROP TABLE IF EXISTS rule_applications CASCADE;
-- DROP TABLE IF EXISTS prompt_templates CASCADE;
-- DROP TABLE IF EXISTS trade_outcomes CASCADE;
-- DROP TABLE IF EXISTS learned_rules CASCADE;
