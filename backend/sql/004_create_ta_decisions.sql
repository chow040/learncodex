CREATE TABLE IF NOT EXISTS ta_decisions (
  id BIGSERIAL PRIMARY KEY,
  run_id TEXT,
  symbol TEXT NOT NULL,
  trade_date DATE NOT NULL,
  decision_token TEXT NOT NULL CHECK (decision_token IN ('BUY','SELL','HOLD','NO DECISION')),
  investment_plan TEXT,
  trader_plan TEXT,
  risk_judge TEXT,
  payload JSONB,
  raw_text TEXT,
  model TEXT,
  prompt_hash TEXT,
  orchestrator_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ta_decisions_symbol_trade_date
  ON ta_decisions (symbol, trade_date);

CREATE INDEX IF NOT EXISTS idx_ta_decisions_symbol_created_at
  ON ta_decisions (symbol, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ta_decisions_run_id
  ON ta_decisions (run_id);

