import { Pool } from 'pg';

import { env } from '../config/env.js';
import type {
  AssessmentContext,
  AssessmentInput,
  AssessmentPayload,
} from '../services/openaiService.js';

let pool: Pool | null = null;

const getPool = (): Pool | null => {
  if (!env.databaseUrl) {
    return null;
  }

  if (!pool) {
    pool = new Pool({
      connectionString: env.databaseUrl,
      max: 5,
    });

    pool.on('error', (error) => {
      console.error('Unexpected PostgreSQL pool error', error);
    });
  }

  return pool;
};

export interface AssessmentLogEntry {
  input: AssessmentInput;
  context?: AssessmentContext;
  assessment: AssessmentPayload;
  prompt: string;
  systemPrompt: string;
}

export const insertAssessmentLog = async ({
  input,
  context,
  assessment,
  prompt,
  systemPrompt,
}: AssessmentLogEntry): Promise<void> => {
  const pgPool = getPool();
  if (!pgPool) {
    return;
  }

  const { rawText, ...assessmentWithoutRaw } = assessment;

  try {
    await pgPool.query(
      `INSERT INTO assessment_logs (
        symbol,
        request_payload,
        context_payload,
        assessment_payload,
        raw_text,
        prompt_text,
        system_prompt
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.symbol,
        JSON.stringify(input),
        context ? JSON.stringify(context) : null,
        JSON.stringify(assessmentWithoutRaw),
        rawText ?? null,
        prompt,
        systemPrompt,
      ],
    );
  } catch (error) {
    console.error('Failed to persist assessment log', error);
  }
};

export const closePool = async (): Promise<void> => {
  if (pool) {
    await pool.end();
    pool = null;
  }
};
