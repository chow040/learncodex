CREATE TABLE IF NOT EXISTS http_cache (
  key TEXT PRIMARY KEY,
  data_json JSONB NOT NULL,
  data_fp TEXT NOT NULL,
  etag TEXT,
  last_modified TIMESTAMPTZ,
  as_of TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_http_cache_expires_at ON http_cache (expires_at);

CREATE TABLE IF NOT EXISTS assessment_cache (
  key TEXT PRIMARY KEY,
  input_fp TEXT NOT NULL,
  result_json JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  agent_version TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assessment_cache_expires_at ON assessment_cache (expires_at);
