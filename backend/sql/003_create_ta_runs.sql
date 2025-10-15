CREATE TABLE IF NOT EXISTS ta_runs (
  id BIGSERIAL PRIMARY KEY,
  run_id TEXT UNIQUE,
  symbol TEXT NOT NULL,
  trade_date DATE NOT NULL,
  model TEXT,
  prompt_hash TEXT,
  orchestrator_version TEXT,
  logs_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ta_runs_symbol_trade_date
  ON ta_runs (symbol, trade_date);

