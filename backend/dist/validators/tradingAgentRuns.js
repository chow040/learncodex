import { z } from 'zod';
const tickerSchema = z
    .string()
    .min(1)
    .max(24)
    .transform((value) => value.trim().toUpperCase());
export const executeAgentRunSchema = z.object({
    tickers: z.array(tickerSchema).min(1),
    question: z
        .string()
        .trim()
        .min(1)
        .max(2000)
        .optional(),
    modelId: z
        .string()
        .trim()
        .min(1)
        .max(64)
        .optional(),
    useMockData: z.boolean().optional(),
});
export const listRunsQuerySchema = z.object({
    limit: z
        .string()
        .optional()
        .transform((value) => {
        if (!value)
            return undefined;
        const parsed = Number.parseInt(value, 10);
        return Number.isNaN(parsed) ? undefined : parsed;
    })
        .refine((value) => (value === undefined ? true : value > 0 && value <= 100), {
        message: 'limit must be between 1 and 100',
    })
        .optional(),
    ticker: tickerSchema.optional(),
});
//# sourceMappingURL=tradingAgentRuns.js.map