import { and, eq, desc } from 'drizzle-orm';
import OpenAI from 'openai';
import { env } from '../config/env.js';
import { db } from '../db/client.js';
import { personaMemories } from '../db/schema.js';
import { appendMemory as appendLocalMemory, getPastMemories as getLocalMemories, } from '../taEngine/memoryStore.js';
const FALLBACK_PERSONA_ROLES = {
    bull: null,
    bear: null,
    research_manager: 'manager',
    trader: 'trader',
    risk_manager: 'riskManager',
    risky: null,
    safe: null,
    neutral: null,
};
const openai = env.openAiApiKey
    ? new OpenAI({
        apiKey: env.openAiApiKey,
        ...(env.openAiBaseUrl ? { baseURL: env.openAiBaseUrl } : {}),
    })
    : null;
const EMBEDDING_MODEL = env.openAiEmbeddingModel ?? 'text-embedding-3-small';
const isDatabaseAvailable = Boolean(db);
const cosineSimilarity = (a, b) => {
    if (!a.length || a.length !== b.length)
        return -1;
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < a.length; i += 1) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    if (magA === 0 || magB === 0)
        return -1;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
};
const embedText = async (text) => {
    if (!openai) {
        throw new Error('OpenAI client not configured for embeddings.');
    }
    const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text,
    });
    const vector = response.data[0]?.embedding;
    if (!vector) {
        throw new Error('Embedding response missing vector.');
    }
    return vector;
};
const formatMemories = (entries) => entries
    .map((entry, index) => {
    const header = `Match ${index + 1} (similarity ${(entry.similarity * 100).toFixed(1)}%)`;
    const createdAt = entry.createdAt ? ` | Recorded ${entry.createdAt.toISOString()}` : '';
    const situation = entry.situation ? `\nSituation:\n${entry.situation}` : '';
    return `${header}${createdAt}\nRecommendation:\n${entry.recommendation}${situation}`;
})
    .join('\n\n');
const buildFallbackMemories = async (persona, symbol, limit) => {
    const role = FALLBACK_PERSONA_ROLES[persona];
    if (!role)
        return '';
    try {
        return await getLocalMemories(symbol, role, limit);
    }
    catch (error) {
        console.error('[PersonaMemory] Failed to load local fallback memories', error);
        return '';
    }
};
export const fetchPersonaMemories = async (persona, symbol, situation, limit = 2) => {
    if (!isDatabaseAvailable || !openai) {
        return buildFallbackMemories(persona, symbol, limit);
    }
    try {
        const [queryEmbedding, rows] = await Promise.all([
            embedText(situation),
            db
                .select({
                recommendation: personaMemories.recommendation,
                embedding: personaMemories.embedding,
                situation: personaMemories.situation,
                createdAt: personaMemories.createdAt,
            })
                .from(personaMemories)
                .where(and(eq(personaMemories.persona, persona), eq(personaMemories.symbol, symbol)))
                .orderBy(desc(personaMemories.createdAt))
                .limit(200),
        ]);
        if (!rows.length) {
            return buildFallbackMemories(persona, symbol, limit);
        }
        const toVector = (values) => {
            if (!Array.isArray(values))
                return null;
            const parsed = [];
            for (const item of values) {
                const num = typeof item === 'number' ? item : Number(item);
                if (!Number.isFinite(num))
                    return null;
                parsed.push(num);
            }
            return parsed;
        };
        const scored = rows
            .map((row) => {
            const embedding = toVector(row.embedding);
            if (!embedding)
                return null;
            const similarity = cosineSimilarity(queryEmbedding, embedding);
            if (similarity < 0)
                return null;
            return {
                similarity,
                recommendation: row.recommendation ?? '',
                situation: row.situation ?? null,
                createdAt: row.createdAt ? new Date(row.createdAt) : null,
            };
        })
            .filter((entry) => entry !== null)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, Math.max(limit, 1));
        if (!scored.length) {
            return buildFallbackMemories(persona, symbol, limit);
        }
        return formatMemories(scored);
    }
    catch (error) {
        console.error('[PersonaMemory] Failed to fetch persona memories', error);
        return buildFallbackMemories(persona, symbol, limit);
    }
};
export const recordPersonaMemory = async (options) => {
    const trimmedRecommendation = options.recommendation?.trim();
    if (!trimmedRecommendation)
        return;
    if (isDatabaseAvailable && openai) {
        try {
            const embedding = await embedText(options.situation);
            await db
                .insert(personaMemories)
                .values({
                persona: options.persona,
                symbol: options.symbol,
                situation: options.situation,
                recommendation: trimmedRecommendation,
                embedding,
                tradeDate: options.date,
            });
            return;
        }
        catch (error) {
            console.error('[PersonaMemory] Failed to persist persona memory to database', error);
            // fall back to local storage
        }
    }
    const fallbackRole = FALLBACK_PERSONA_ROLES[options.persona];
    if (!fallbackRole)
        return;
    try {
        await appendLocalMemory({
            symbol: options.symbol,
            date: options.date,
            role: fallbackRole,
            summary: trimmedRecommendation,
        });
    }
    catch (error) {
        console.error('[PersonaMemory] Failed to persist fallback memory', error);
    }
};
//# sourceMappingURL=personaMemoryService.js.map