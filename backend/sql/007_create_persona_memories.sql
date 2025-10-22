CREATE TABLE IF NOT EXISTS persona_memories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    persona TEXT NOT NULL,
    symbol TEXT NOT NULL,
    situation TEXT,
    recommendation TEXT NOT NULL,
    embedding JSONB NOT NULL,
    trade_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_persona_memories_persona_symbol
    ON persona_memories (persona, symbol);

CREATE INDEX IF NOT EXISTS idx_persona_memories_created_at
    ON persona_memories (created_at DESC);
