import { z } from 'zod';
export const agentStatusSchema = z.enum(['active', 'disabled', 'experimental']);
export const agentHorizonSchema = z.enum(['intraday', 'swing', 'long_term']);
export const agentToneSchema = z.enum(['neutral', 'institutional', 'casual']);
export const agentRiskBiasSchema = z.enum(['conservative', 'balanced', 'aggressive']);
export const agentFocusSchema = z.enum(['technical', 'fundamental', 'macro', 'mixed']);
export const promptProfileTypeSchema = z.enum([
    'trading_agent_system',
    'rule_generator_system',
    'risk_guard_system',
]);
const nonEmptyString = z.string().min(1);
const systemSettingUpdateSchema = z.object({
    key: nonEmptyString,
    value: z.any(),
    scope: nonEmptyString.optional(),
});
export const systemSettingsPatchSchema = z.array(systemSettingUpdateSchema).min(1);
const agentCoreUpdateSchema = z
    .object({
    name: nonEmptyString.optional(),
    description: nonEmptyString.optional(),
    status: agentStatusSchema.optional(),
    defaultModel: nonEmptyString.optional(),
    defaultTemperature: z.number().min(0).max(2).optional(),
    defaultMaxTokens: z.number().int().positive().optional(),
    defaultHorizon: agentHorizonSchema.optional(),
    defaultTone: agentToneSchema.optional(),
    defaultRiskBias: agentRiskBiasSchema.optional(),
    defaultFocus: agentFocusSchema.optional(),
    promptProfileId: z.string().uuid().nullable().optional(),
})
    .partial();
const toolPolicyUpdateSchema = z
    .object({
    canUsePriceData: z.boolean().optional(),
    canUseIndicators: z.boolean().optional(),
    canUseNews: z.boolean().optional(),
    canUseFundamentals: z.boolean().optional(),
    canUseMacro: z.boolean().optional(),
    maxToolsPerRun: z.number().int().positive().optional(),
    allowCrossTicker: z.boolean().optional(),
})
    .partial();
const contextPolicyUpdateSchema = z
    .object({
    includePreviousAnalyses: z.boolean().optional(),
    includeUserNotes: z.boolean().optional(),
    includeGlobalSummary: z.boolean().optional(),
    maxAnalyses: z.number().int().min(0).optional(),
    maxContextTokens: z.number().int().positive().optional(),
})
    .partial();
export const agentUpdateSchema = z
    .object({
    agent: agentCoreUpdateSchema.optional(),
    toolPolicy: toolPolicyUpdateSchema.optional(),
    contextPolicy: contextPolicyUpdateSchema.optional(),
})
    .refine((payload) => Boolean(payload.agent || payload.toolPolicy || payload.contextPolicy), {
    message: 'At least one update payload is required',
});
export const createPromptProfileSchema = z.object({
    name: nonEmptyString,
    type: promptProfileTypeSchema,
    content: nonEmptyString,
    outputSchemaExample: nonEmptyString.optional(),
    basedOnProfileId: z.string().uuid().optional(),
});
export const updatePromptProfileSchema = z
    .object({
    name: nonEmptyString.optional(),
    content: nonEmptyString.optional(),
    outputSchemaExample: nonEmptyString.optional(),
    isActive: z.boolean().optional(),
})
    .refine((payload) => Object.keys(payload).length > 0, {
    message: 'No prompt profile fields provided',
});
export const assignPromptSchema = z.object({
    promptProfileId: z.string().uuid(),
});
export const promptPreviewSchema = z.object({
    tickers: z.array(nonEmptyString).min(1),
    question: z.string().optional(),
});
export const promptProfileQuerySchema = z.object({
    type: promptProfileTypeSchema.optional(),
    agentId: z.string().uuid().optional(),
});
//# sourceMappingURL=adminDashboard.js.map