import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { env } from '../config/env.js';
import { db } from '../db/client.js';
import { agentContextPolicies, agentToolPolicies, agents, promptProfiles, systemSettings, } from '../db/schema.js';
const requireDatabase = () => {
    if (!db) {
        throw new Error('Database is not configured. Admin dashboard features require DATABASE_URL to be set.');
    }
    return db;
};
const toIsoString = (value) => {
    if (value instanceof Date)
        return value.toISOString();
    if (typeof value === 'string')
        return new Date(value).toISOString();
    return new Date().toISOString();
};
const toNumber = (value, fallback = 0) => {
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : fallback;
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    if (value === null || value === undefined)
        return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const mapSettingRow = (row) => ({
    id: row.id,
    key: row.key,
    value: row.value ?? null,
    scope: row.scope,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
});
const groupSettingsByScope = (rows) => {
    const grouped = rows.reduce((acc, row) => {
        const scopeKey = row.scope ?? 'general';
        const scoped = acc[scopeKey] ?? [];
        scoped.push(mapSettingRow(row));
        acc[scopeKey] = scoped;
        return acc;
    }, {});
    Object.keys(grouped).forEach((scope) => {
        const scoped = grouped[scope];
        if (scoped) {
            grouped[scope] = scoped.sort((a, b) => a.key.localeCompare(b.key));
        }
    });
    return grouped;
};
const mapPromptProfileRow = (row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    version: row.version ?? 1,
    content: row.content ?? '',
    outputSchemaExample: row.outputSchemaExample ?? null,
    isActive: Boolean(row.isActive),
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
});
const mapAgentSummaryRow = (row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    defaultModel: row.defaultModel,
    updatedAt: toIsoString(row.updatedAt),
});
const mapToolPolicyRow = (row) => ({
    canUsePriceData: Boolean(row.canUsePriceData),
    canUseIndicators: Boolean(row.canUseIndicators),
    canUseNews: Boolean(row.canUseNews),
    canUseFundamentals: Boolean(row.canUseFundamentals),
    canUseMacro: Boolean(row.canUseMacro),
    maxToolsPerRun: toNumber(row.maxToolsPerRun, 0),
    allowCrossTicker: Boolean(row.allowCrossTicker),
    updatedAt: toIsoString(row.updatedAt),
});
const mapContextPolicyRow = (row) => ({
    includePreviousAnalyses: Boolean(row.includePreviousAnalyses),
    includeUserNotes: Boolean(row.includeUserNotes),
    includeGlobalSummary: Boolean(row.includeGlobalSummary),
    maxAnalyses: toNumber(row.maxAnalyses, 0),
    maxContextTokens: toNumber(row.maxContextTokens, 0),
    updatedAt: toIsoString(row.updatedAt),
});
const listSystemSettingRows = async () => {
    const database = requireDatabase();
    return database.select().from(systemSettings).orderBy(systemSettings.scope, systemSettings.key);
};
export const listSystemSettingsByScope = async () => {
    const rows = await listSystemSettingRows();
    return groupSettingsByScope(rows);
};
export const upsertSystemSettings = async (updates) => {
    if (!updates.length) {
        return listSystemSettingsByScope();
    }
    const database = requireDatabase();
    const keys = updates.map((update) => update.key);
    const existingRows = await database
        .select()
        .from(systemSettings)
        .where(inArray(systemSettings.key, keys));
    const existingMap = new Map(existingRows.map((row) => [row.key, row]));
    const normalizedUpdates = updates.map((update) => {
        const existing = existingMap.get(update.key);
        const scope = existing?.scope ?? update.scope;
        if (!scope) {
            throw new Error(`Missing scope for new setting "${update.key}".`);
        }
        return {
            key: update.key,
            value: update.value ?? null,
            scope,
        };
    });
    await database
        .insert(systemSettings)
        .values(normalizedUpdates)
        .onConflictDoUpdate({
        target: systemSettings.key,
        set: {
            value: sql `excluded.value`,
            scope: sql `excluded.scope`,
            updatedAt: new Date(),
        },
    });
    return listSystemSettingsByScope();
};
export const listAgentSummaries = async () => {
    const database = requireDatabase();
    const rows = await database.select().from(agents).orderBy(agents.name);
    return rows.map(mapAgentSummaryRow);
};
const loadPromptProfileById = async (id) => {
    const database = requireDatabase();
    const [row] = await database.select().from(promptProfiles).where(eq(promptProfiles.id, id)).limit(1);
    return row ? mapPromptProfileRow(row) : null;
};
const loadToolPolicyByAgentId = async (agentId) => {
    const database = requireDatabase();
    const [row] = await database
        .select()
        .from(agentToolPolicies)
        .where(eq(agentToolPolicies.agentId, agentId))
        .limit(1);
    return row ? mapToolPolicyRow(row) : null;
};
const loadContextPolicyByAgentId = async (agentId) => {
    const database = requireDatabase();
    const [row] = await database
        .select()
        .from(agentContextPolicies)
        .where(eq(agentContextPolicies.agentId, agentId))
        .limit(1);
    return row ? mapContextPolicyRow(row) : null;
};
const mapAgentConfiguration = async (row) => {
    const [promptProfile, toolPolicy, contextPolicy] = await Promise.all([
        row.promptProfileId ? loadPromptProfileById(row.promptProfileId) : Promise.resolve(null),
        loadToolPolicyByAgentId(row.id),
        loadContextPolicyByAgentId(row.id),
    ]);
    return {
        ...mapAgentSummaryRow(row),
        description: row.description,
        defaultTemperature: toNumber(row.defaultTemperature, 0.7),
        defaultMaxTokens: toNumber(row.defaultMaxTokens, 2000),
        defaultHorizon: row.defaultHorizon,
        defaultTone: row.defaultTone,
        defaultRiskBias: row.defaultRiskBias,
        defaultFocus: row.defaultFocus,
        promptProfile,
        toolPolicy,
        contextPolicy,
    };
};
export const getAgentConfiguration = async (agentId) => {
    const database = requireDatabase();
    const [row] = await database.select().from(agents).where(eq(agents.id, agentId)).limit(1);
    if (!row)
        return null;
    return mapAgentConfiguration(row);
};
const hasValues = (payload) => Boolean(payload && Object.keys(payload).length > 0);
const sanitizeUpdatePayload = (payload) => {
    if (!payload)
        return {};
    return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
};
export const updateAgentConfiguration = async (agentId, input) => {
    const database = requireDatabase();
    return database.transaction(async (tx) => {
        const [existingAgent] = await tx.select().from(agents).where(eq(agents.id, agentId)).limit(1);
        if (!existingAgent) {
            throw new Error('Agent not found');
        }
        const agentUpdates = sanitizeUpdatePayload(input.agent);
        if (hasValues(agentUpdates)) {
            const updatePayload = {
                ...agentUpdates,
            };
            if ('promptProfileId' in agentUpdates) {
                const promptProfileId = agentUpdates.promptProfileId;
                if (promptProfileId === null) {
                    updatePayload.promptProfileId = null;
                }
                else if (typeof promptProfileId === 'string') {
                    const prompt = await tx
                        .select({ id: promptProfiles.id })
                        .from(promptProfiles)
                        .where(eq(promptProfiles.id, promptProfileId))
                        .limit(1);
                    if (!prompt[0]) {
                        throw new Error('Prompt profile not found');
                    }
                    updatePayload.promptProfileId = promptProfileId;
                }
                else {
                    throw new Error('promptProfileId must be a string or null');
                }
            }
            updatePayload.updatedAt = new Date();
            await tx.update(agents).set(updatePayload).where(eq(agents.id, agentId));
        }
        const toolUpdates = sanitizeUpdatePayload(input.toolPolicy);
        if (hasValues(toolUpdates)) {
            const [existingTool] = await tx
                .select()
                .from(agentToolPolicies)
                .where(eq(agentToolPolicies.agentId, agentId))
                .limit(1);
            if (existingTool) {
                await tx
                    .update(agentToolPolicies)
                    .set({ ...toolUpdates, updatedAt: new Date() })
                    .where(eq(agentToolPolicies.id, existingTool.id));
            }
            else {
                await tx.insert(agentToolPolicies).values({
                    agentId,
                    ...toolUpdates,
                });
            }
        }
        const contextUpdates = sanitizeUpdatePayload(input.contextPolicy);
        if (hasValues(contextUpdates)) {
            const [existingContext] = await tx
                .select()
                .from(agentContextPolicies)
                .where(eq(agentContextPolicies.agentId, agentId))
                .limit(1);
            if (existingContext) {
                await tx
                    .update(agentContextPolicies)
                    .set({ ...contextUpdates, updatedAt: new Date() })
                    .where(eq(agentContextPolicies.id, existingContext.id));
            }
            else {
                await tx.insert(agentContextPolicies).values({
                    agentId,
                    ...contextUpdates,
                });
            }
        }
        const [updatedAgent] = await tx.select().from(agents).where(eq(agents.id, agentId)).limit(1);
        if (!updatedAgent) {
            throw new Error('Agent not found after update');
        }
        return mapAgentConfiguration(updatedAgent);
    });
};
export const listPromptProfiles = async (options = {}) => {
    const database = requireDatabase();
    const filters = [];
    if (options.type) {
        filters.push(eq(promptProfiles.type, options.type));
    }
    if (options.agentId) {
        const [agentRow] = await database
            .select({ id: agents.id, promptProfileId: agents.promptProfileId })
            .from(agents)
            .where(eq(agents.id, options.agentId))
            .limit(1);
        if (!agentRow) {
            throw new Error('Agent not found for prompt filter');
        }
        if (agentRow.promptProfileId) {
            filters.push(eq(promptProfiles.id, agentRow.promptProfileId));
        }
        else {
            return [];
        }
    }
    const rows = filters.length === 0
        ? await database.select().from(promptProfiles).orderBy(desc(promptProfiles.createdAt))
        : filters.length === 1
            ? await database
                .select()
                .from(promptProfiles)
                .where(filters[0])
                .orderBy(desc(promptProfiles.createdAt))
            : await database
                .select()
                .from(promptProfiles)
                .where(and(...filters))
                .orderBy(desc(promptProfiles.createdAt));
    return rows.map((row) => {
        const detail = mapPromptProfileRow(row);
        const { content, outputSchemaExample, ...summary } = detail;
        return summary;
    });
};
export const getPromptProfile = async (id) => {
    return loadPromptProfileById(id);
};
export const createPromptProfile = async (input) => {
    const database = requireDatabase();
    return database.transaction(async (tx) => {
        if (input.basedOnProfileId) {
            const base = await tx
                .select()
                .from(promptProfiles)
                .where(eq(promptProfiles.id, input.basedOnProfileId))
                .limit(1);
            if (!base[0]) {
                throw new Error('Base prompt profile not found');
            }
        }
        const [latestVersionRow] = await tx
            .select({ version: promptProfiles.version })
            .from(promptProfiles)
            .where(eq(promptProfiles.type, input.type))
            .orderBy(desc(promptProfiles.version))
            .limit(1);
        const nextVersion = (latestVersionRow?.version ?? 0) + 1;
        const [created] = await tx
            .insert(promptProfiles)
            .values({
            name: input.name,
            type: input.type,
            version: nextVersion,
            content: input.content,
            outputSchemaExample: input.outputSchemaExample ?? null,
            isActive: false,
        })
            .returning();
        if (!created) {
            throw new Error('Failed to create prompt profile');
        }
        return mapPromptProfileRow(created);
    });
};
export const updatePromptProfile = async (id, input) => {
    const database = requireDatabase();
    const [existing] = await database.select().from(promptProfiles).where(eq(promptProfiles.id, id)).limit(1);
    if (!existing) {
        throw new Error('Prompt profile not found');
    }
    const updatePayload = sanitizeUpdatePayload(input);
    if (!hasValues(updatePayload)) {
        return mapPromptProfileRow(existing);
    }
    const [updated] = await database
        .update(promptProfiles)
        .set({ ...updatePayload, updatedAt: new Date() })
        .where(eq(promptProfiles.id, id))
        .returning();
    if (!updated) {
        throw new Error('Failed to update prompt profile');
    }
    return mapPromptProfileRow(updated);
};
export const assignPromptProfileToAgent = async (agentId, promptProfileId) => {
    const database = requireDatabase();
    const [prompt] = await database
        .select()
        .from(promptProfiles)
        .where(eq(promptProfiles.id, promptProfileId))
        .limit(1);
    if (!prompt) {
        throw new Error('Prompt profile not found');
    }
    await database
        .update(agents)
        .set({ promptProfileId, updatedAt: new Date() })
        .where(eq(agents.id, agentId));
    const updated = await getAgentConfiguration(agentId);
    if (!updated) {
        throw new Error('Agent not found after assignment');
    }
    return updated;
};
const buildBehaviorBlock = (agent) => {
    return [
        `Agent: ${agent.name}`,
        `Description: ${agent.description}`,
        `Default Horizon: ${agent.defaultHorizon}`,
        `Tone: ${agent.defaultTone}`,
        `Risk Bias: ${agent.defaultRiskBias}`,
        `Focus: ${agent.defaultFocus}`,
    ].join('\n');
};
const buildSystemPrompt = (agent, prompt) => {
    const behaviorBlock = buildBehaviorBlock(agent);
    const schemaSection = prompt.outputSchemaExample
        ? `\n\nExpected Output Format:\n${prompt.outputSchemaExample}`
        : '';
    return `${behaviorBlock}\n\n${prompt.content}${schemaSection}`;
};
const describeContextPolicy = (policy) => {
    if (!policy)
        return undefined;
    const lines = ['## Historical Context'];
    if (policy.includePreviousAnalyses) {
        lines.push(`- Include up to ${policy.maxAnalyses} previous analyses (token budget ${policy.maxContextTokens}).`);
    }
    if (policy.includeUserNotes) {
        lines.push('- Include user notes when available.');
    }
    if (policy.includeGlobalSummary) {
        lines.push('- Include the latest global macro summary.');
    }
    if (lines.length === 1) {
        lines.push('- No historical context is currently enabled.');
    }
    return lines.join('\n');
};
const buildUserBlock = (input) => {
    const tickersText = input.tickers.join(', ');
    const question = input.question?.trim() || 'General analysis';
    return ['## Analysis Request', `Tickers: ${tickersText}`, `Question: ${question}`].join('\n');
};
const estimateTokens = (...sections) => {
    const totalChars = sections.reduce((sum, section) => sum + section.length, 0);
    return Math.max(1, Math.ceil(totalChars / 4));
};
export const previewAgentPrompt = async (agentId, input) => {
    const agent = await getAgentConfiguration(agentId);
    if (!agent) {
        throw new Error('Agent not found');
    }
    if (!agent.promptProfile) {
        throw new Error('Agent does not have an assigned prompt profile');
    }
    const behaviorBlock = buildBehaviorBlock(agent);
    const systemPrompt = buildSystemPrompt(agent, agent.promptProfile);
    const contextBlock = describeContextPolicy(agent.contextPolicy);
    const userBlock = buildUserBlock(input);
    const assembledPrompt = [systemPrompt, contextBlock, userBlock]
        .filter((section) => Boolean(section))
        .join('\n\n');
    const tokenEstimate = estimateTokens(systemPrompt, contextBlock ?? '', userBlock);
    const result = {
        behaviorBlock,
        systemPrompt,
        userBlock,
        assembledPrompt,
        tokenEstimate,
    };
    if (contextBlock) {
        result.contextBlock = contextBlock;
    }
    return result;
};
const DEFAULT_SYSTEM_SETTINGS = [
    { key: 'llm.default_model', scope: 'llm', value: env.defaultTradingModel },
    { key: 'llm.default_temperature', scope: 'llm', value: 0.4 },
    { key: 'llm.default_max_tokens', scope: 'llm', value: 2000 },
    { key: 'feature.trading_agents_enabled', scope: 'feature', value: true },
    { key: 'feature.news_enabled', scope: 'feature', value: true },
    { key: 'feature.fundamentals_enabled', scope: 'feature', value: true },
    { key: 'feature.macro_enabled', scope: 'feature', value: true },
    { key: 'ui.explanation_length', scope: 'ui', value: 'standard' },
];
const DEFAULT_PROMPTS = [
    {
        name: 'Technical Analyst Prompt v1',
        type: 'trading_agent_system',
        content: 'You are an institutional-grade technical analyst. Combine multi-timeframe price action, volume, and momentum signals to propose a clear conviction with risk controls.',
        outputSchemaExample: `{
  "decision_summary": "BUY BTC while momentum is rising...",
  "confidence": 0.78,
  "rationale": [
    "Summarize strongest confluence",
    "Highlight key risks"
  ],
  "next_steps": [
    "Price level to watch",
    "Trigger that invalidates thesis"
  ]
}`,
        isActive: true,
    },
    {
        name: 'Macro Strategist Prompt v1',
        type: 'trading_agent_system',
        content: 'You are a macro strategist evaluating cross-asset trends, macro catalysts, and rate expectations to guide positioning.',
        outputSchemaExample: `{
  "decision_summary": "Rotate into defensives given tightening liquidity",
  "confidence": 0.64,
  "macro_highlights": [
    "Key data releases",
    "Liquidity backdrop",
    "Policy considerations"
  ]
}`,
        isActive: false,
    },
];
const DEFAULT_AGENTS = [
    {
        slug: 'technical_analyst',
        name: 'Technical Analyst',
        description: 'Focuses on price action, indicators, and volume structures to produce tactical trade plans.',
        status: 'active',
        defaultModel: env.defaultTradingModel,
        defaultTemperature: 0.35,
        defaultMaxTokens: 1500,
        defaultHorizon: 'swing',
        defaultTone: 'institutional',
        defaultRiskBias: 'balanced',
        defaultFocus: 'technical',
        promptProfileName: 'Technical Analyst Prompt v1',
        toolPolicy: {
            canUsePriceData: true,
            canUseIndicators: true,
            canUseNews: true,
            maxToolsPerRun: 6,
        },
        contextPolicy: {
            includePreviousAnalyses: true,
            maxAnalyses: 5,
            maxContextTokens: 600,
        },
    },
    {
        slug: 'macro_strategist',
        name: 'Macro Strategist',
        description: 'Reviews macro signals, policy expectations, and cross-asset flows to provide positioning guidance.',
        status: 'experimental',
        defaultModel: env.defaultTradingModel,
        defaultTemperature: 0.45,
        defaultMaxTokens: 2000,
        defaultHorizon: 'long_term',
        defaultTone: 'neutral',
        defaultRiskBias: 'conservative',
        defaultFocus: 'macro',
        promptProfileName: 'Macro Strategist Prompt v1',
        toolPolicy: {
            canUseFundamentals: true,
            canUseMacro: true,
            canUseNews: true,
            maxToolsPerRun: 4,
            allowCrossTicker: true,
        },
        contextPolicy: {
            includePreviousAnalyses: true,
            includeGlobalSummary: true,
            maxAnalyses: 3,
            maxContextTokens: 800,
        },
    },
];
export const seedAdminDashboardDefaults = async () => {
    const database = requireDatabase();
    return database.transaction(async (tx) => {
        let createdSettings = 0;
        for (const setting of DEFAULT_SYSTEM_SETTINGS) {
            const [existing] = await tx
                .select({ id: systemSettings.id })
                .from(systemSettings)
                .where(eq(systemSettings.key, setting.key))
                .limit(1);
            if (existing)
                continue;
            await tx.insert(systemSettings).values(setting);
            createdSettings += 1;
        }
        const promptIdMap = new Map();
        let createdPromptProfiles = 0;
        for (const promptDef of DEFAULT_PROMPTS) {
            const [existing] = await tx
                .select()
                .from(promptProfiles)
                .where(eq(promptProfiles.name, promptDef.name))
                .limit(1);
            if (existing) {
                promptIdMap.set(promptDef.name, existing.id);
                continue;
            }
            const [created] = await tx
                .insert(promptProfiles)
                .values({
                name: promptDef.name,
                type: promptDef.type,
                content: promptDef.content,
                outputSchemaExample: promptDef.outputSchemaExample,
                isActive: promptDef.isActive ?? false,
            })
                .returning({ id: promptProfiles.id });
            if (!created) {
                throw new Error('Failed to seed prompt profile');
            }
            promptIdMap.set(promptDef.name, created.id);
            createdPromptProfiles += 1;
        }
        let createdAgents = 0;
        for (const agentDef of DEFAULT_AGENTS) {
            const [existing] = await tx
                .select()
                .from(agents)
                .where(eq(agents.slug, agentDef.slug))
                .limit(1);
            if (existing) {
                if (existing.promptProfileId) {
                    promptIdMap.set(agentDef.promptProfileName, existing.promptProfileId);
                }
                continue;
            }
            const promptId = promptIdMap.get(agentDef.promptProfileName);
            if (!promptId) {
                throw new Error(`Missing prompt profile "${agentDef.promptProfileName}" for agent seed`);
            }
            const [agentRow] = await tx
                .insert(agents)
                .values({
                slug: agentDef.slug,
                name: agentDef.name,
                description: agentDef.description,
                status: agentDef.status,
                defaultModel: agentDef.defaultModel,
                defaultTemperature: agentDef.defaultTemperature,
                defaultMaxTokens: agentDef.defaultMaxTokens,
                defaultHorizon: agentDef.defaultHorizon,
                defaultTone: agentDef.defaultTone,
                defaultRiskBias: agentDef.defaultRiskBias,
                defaultFocus: agentDef.defaultFocus,
                promptProfileId: promptId,
            })
                .returning();
            if (!agentRow) {
                throw new Error('Failed to seed agent record');
            }
            createdAgents += 1;
            if (agentDef.toolPolicy) {
                await tx
                    .insert(agentToolPolicies)
                    .values({ agentId: agentRow.id, ...agentDef.toolPolicy })
                    .onConflictDoNothing();
            }
            if (agentDef.contextPolicy) {
                await tx
                    .insert(agentContextPolicies)
                    .values({ agentId: agentRow.id, ...agentDef.contextPolicy })
                    .onConflictDoNothing();
            }
        }
        return {
            createdSettings,
            createdPromptProfiles,
            createdAgents,
        };
    });
};
//# sourceMappingURL=adminDashboardService.js.map