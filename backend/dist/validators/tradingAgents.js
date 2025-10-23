import { DEFAULT_TRADING_ANALYSTS, isTradingAnalystId } from '../constants/tradingAgents.js';
export const TICKER_REGEX = /^[A-Z]{1,5}$/;
export class TradingAgentsValidationError extends Error {
    field;
    constructor(message, field) {
        super(message);
        this.name = 'TradingAgentsValidationError';
        this.field = field;
    }
}
const normalizeRunId = (value) => {
    if (typeof value !== 'string')
        return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
};
const normalizeModelId = (value, options) => {
    if (typeof value === 'string' && value.trim().length > 0) {
        const candidate = value.trim();
        if (!options.allowedModels.includes(candidate)) {
            throw new TradingAgentsValidationError(`Model ${candidate} is not supported. Allowed models: ${options.allowedModels.join(', ')}`, 'modelId');
        }
        return candidate;
    }
    return options.defaultModel;
};
const normalizeAnalysts = (value) => {
    if (value === undefined || value === null) {
        return [...DEFAULT_TRADING_ANALYSTS];
    }
    if (!Array.isArray(value)) {
        throw new TradingAgentsValidationError('analysts must be an array of persona IDs', 'analysts');
    }
    const seen = new Set();
    for (const entry of value) {
        if (typeof entry !== 'string') {
            throw new TradingAgentsValidationError('analysts must contain string persona IDs', 'analysts');
        }
        const normalized = entry.trim().toLowerCase();
        if (!isTradingAnalystId(normalized)) {
            throw new TradingAgentsValidationError(`Unsupported analyst persona: ${entry}`, 'analysts');
        }
        seen.add(normalized);
    }
    if (seen.size === 0) {
        throw new TradingAgentsValidationError('Select at least one analyst persona', 'analysts');
    }
    return DEFAULT_TRADING_ANALYSTS.filter((id) => seen.has(id));
};
export const validateTradingAgentsRequest = (input, options) => {
    const symbolRaw = typeof input.symbol === 'string' ? input.symbol.trim().toUpperCase() : '';
    if (!symbolRaw) {
        throw new TradingAgentsValidationError('symbol is required', 'symbol');
    }
    if (!TICKER_REGEX.test(symbolRaw)) {
        throw new TradingAgentsValidationError('symbol must be 1-5 uppercase letters', 'symbol');
    }
    const modelId = normalizeModelId(input.modelId, options);
    const analysts = normalizeAnalysts(input.analysts);
    const runId = normalizeRunId(input.runId);
    return {
        symbol: symbolRaw,
        modelId,
        analysts,
        ...(runId ? { runId } : {}),
    };
};
//# sourceMappingURL=tradingAgents.js.map