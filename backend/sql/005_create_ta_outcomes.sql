CREATE TABLE IF NOT EXISTS ta_outcomes (
  id BIGSERIAL PRIMARY KEY,
  decision_id BIGINT NOT NULL REFERENCES ta_decisions(id) ON DELETE CASCADE,
  horizon TEXT NOT NULL,
  realized_return DOUBLE PRECISION,
  max_drawdown DOUBLE PRECISION,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ta_outcomes_decision_id
  ON ta_outcomes (decision_id);

CREATE INDEX IF NOT EXISTS idx_ta_outcomes_horizon
  ON ta_outcomes (horizon);

