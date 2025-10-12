ALTER TABLE assessment_logs
  ADD COLUMN IF NOT EXISTS prompt_text TEXT,
  ADD COLUMN IF NOT EXISTS system_prompt TEXT;
