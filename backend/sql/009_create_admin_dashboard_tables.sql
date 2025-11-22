DO $$ BEGIN
  CREATE TYPE agent_status AS ENUM ('active', 'disabled', 'experimental');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE agent_horizon AS ENUM ('intraday', 'swing', 'long_term');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE agent_tone AS ENUM ('neutral', 'institutional', 'casual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE agent_risk_bias AS ENUM ('conservative', 'balanced', 'aggressive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE agent_focus AS ENUM ('technical', 'fundamental', 'macro', 'mixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE prompt_profile_type AS ENUM (
    'trading_agent_system',
    'rule_generator_system',
    'risk_guard_system'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE agent_run_status AS ENUM ('running', 'success', 'error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL,
  scope TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_settings_scope_key ON system_settings(scope, key);

CREATE TABLE IF NOT EXISTS prompt_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type prompt_profile_type NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  content TEXT NOT NULL,
  output_schema_example TEXT,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prompt_profiles_type_version ON prompt_profiles(type, version);
CREATE INDEX IF NOT EXISTS idx_prompt_profiles_name ON prompt_profiles(name);

CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  status agent_status NOT NULL DEFAULT 'disabled',
  default_model TEXT NOT NULL,
  default_temperature NUMERIC(4,2) NOT NULL DEFAULT 0.7,
  default_max_tokens INTEGER NOT NULL DEFAULT 2000,
  default_horizon agent_horizon NOT NULL DEFAULT 'swing',
  default_tone agent_tone NOT NULL DEFAULT 'neutral',
  default_risk_bias agent_risk_bias NOT NULL DEFAULT 'balanced',
  default_focus agent_focus NOT NULL DEFAULT 'mixed',
  prompt_profile_id UUID REFERENCES prompt_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);

CREATE TABLE IF NOT EXISTS agent_tool_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
  can_use_price_data BOOLEAN NOT NULL DEFAULT TRUE,
  can_use_indicators BOOLEAN NOT NULL DEFAULT TRUE,
  can_use_news BOOLEAN NOT NULL DEFAULT FALSE,
  can_use_fundamentals BOOLEAN NOT NULL DEFAULT FALSE,
  can_use_macro BOOLEAN NOT NULL DEFAULT FALSE,
  max_tools_per_run INTEGER NOT NULL DEFAULT 5,
  allow_cross_ticker BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_context_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
  include_previous_analyses BOOLEAN NOT NULL DEFAULT FALSE,
  include_user_notes BOOLEAN NOT NULL DEFAULT FALSE,
  include_global_summary BOOLEAN NOT NULL DEFAULT FALSE,
  max_analyses INTEGER NOT NULL DEFAULT 5,
  max_context_tokens INTEGER NOT NULL DEFAULT 500,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  tickers JSONB NOT NULL,
  question TEXT,
  status agent_run_status NOT NULL DEFAULT 'running',
  decision_summary TEXT,
  confidence NUMERIC(5,4),
  tokens_prompt INTEGER,
  tokens_completion INTEGER,
  tokens_total INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_status
  ON agent_runs(agent_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_runs_user
  ON agent_runs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_run_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL UNIQUE REFERENCES agent_runs(id) ON DELETE CASCADE,
  system_prompt TEXT,
  assembled_prompt TEXT,
  context_block TEXT,
  tools_used JSONB,
  raw_output_text TEXT,
  parsed_output_json JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
