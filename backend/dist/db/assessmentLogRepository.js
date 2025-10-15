import { Pool } from 'pg';
import { env } from '../config/env.js';
import { db } from './client.js';
import { assessmentLogs } from './schema.js';
let pool = null;
const getPool = () => {
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
export const insertAssessmentLog = async ({ input, context, assessment, prompt, systemPrompt, }) => {
    const { rawText, ...assessmentWithoutRaw } = assessment;
    // Prefer Drizzle if configured; fall back to raw pg insert otherwise.
    if (db) {
        try {
            await db.insert(assessmentLogs).values({
                symbol: input.symbol,
                requestPayload: input,
                contextPayload: context ?? null,
                assessmentPayload: assessmentWithoutRaw,
                rawText: rawText ?? null,
                promptText: prompt,
                systemPrompt,
            });
            return;
        }
        catch (error) {
            console.error('Failed to persist assessment log via Drizzle', error);
            // continue to try raw pg
        }
    }
    const pgPool = getPool();
    if (!pgPool)
        return;
    try {
        await pgPool.query(`INSERT INTO assessment_logs (
        symbol,
        request_payload,
        context_payload,
        assessment_payload,
        raw_text,
        prompt_text,
        system_prompt
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
            input.symbol,
            JSON.stringify(input),
            context ? JSON.stringify(context) : null,
            JSON.stringify(assessmentWithoutRaw),
            rawText ?? null,
            prompt,
            systemPrompt,
        ]);
    }
    catch (error) {
        console.error('Failed to persist assessment log', error);
    }
};
export const closePool = async () => {
    if (pool) {
        await pool.end();
        pool = null;
    }
};
//# sourceMappingURL=assessmentLogRepository.js.map