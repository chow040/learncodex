-- Migration 0005: Runtime Trading Mode Settings
-- Purpose: Persist selected trading mode (simulator / paper / live)
-- Created: 8 November 2025

CREATE TABLE IF NOT EXISTS autotrade_runtime_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1,
    mode VARCHAR(20) NOT NULL CHECK (mode IN ('simulator','paper','live')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO autotrade_runtime_settings (id, mode)
VALUES (1, 'simulator')
ON CONFLICT (id) DO NOTHING;
