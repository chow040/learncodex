CREATE TABLE IF NOT EXISTS assessment_logs (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  request_payload JSONB NOT NULL,
  context_payload JSONB,
  assessment_payload JSONB NOT NULL,
  raw_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assessment_logs_symbol_created_at
  ON assessment_logs (symbol, created_at DESC);
