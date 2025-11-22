import 'dotenv/config';

const requiredEnvVars = ['OPENAI_API_KEY', 'FINNHUB_API_KEY', 'REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET'] as const;

requiredEnvVars.forEach((key) => {
  if (!process.env[key]) {
    console.warn(`Environment variable ${key} is not set.`);
  }
});

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not set. Assessment logs will not be persisted.');
}

const parseCsvList = (input: string | undefined): string[] => {
  if (!input) return [];
  return input
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
};

const parseBoolean = (input: string | undefined): boolean => {
  if (!input) return false;
  const normalized = input.trim().toLowerCase();
  if (!normalized) return false;
  return ['1', 'true', 'yes', 'y', 'on', 'enabled'].includes(normalized);
};

const parsePositiveInt = (input: string | undefined, fallback: number): number => {
  if (!input) return fallback;
  const parsed = Number.parseInt(input, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const DEFAULT_OPENAI_MODELS = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-5-mini',
  'gpt-5-nano',
  'gpt-5',
  'gpt-5-pro',
] as const;

const DEFAULT_GROK_MODELS = [
  'grok-beta',
  'grok-2-1212',
  'grok-2-vision-1212',
  'grok-4-fast',
  'grok-4-fast-reasoning',
  'grok-4-fast-reasoning-latest',
] as const;

const DEFAULT_GOOGLE_MODELS = [
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-thinking',
] as const;

const openAiModel = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODELS[0];
const grokApiKey = process.env.GROK_API_KEY ?? '';
const grokBaseUrl = process.env.GROK_BASE_URL ?? 'https://api.x.ai/v1';
const grokModel = process.env.GROK_MODEL ?? '';
const grokAllowedModels = parseCsvList(process.env.GROK_ALLOWED_MODELS);
const googleGenAiApiKey = process.env.GOOGLE_GENAI_API_KEY ?? '';
const googleGenAiModel = process.env.GOOGLE_GENAI_MODEL ?? '';
const googleGenAiAllowedModels = parseCsvList(process.env.GOOGLE_GENAI_ALLOWED_MODELS);

// Derive default trading model with priority: TRADING_DEFAULT_MODEL → OPENAI_MODEL → GROK_MODEL
const defaultTradingModel =
  process.env.TRADING_DEFAULT_MODEL ??
  (process.env.OPENAI_MODEL
    ? openAiModel
    : grokModel
      ? grokModel
      : googleGenAiModel || DEFAULT_OPENAI_MODELS[0]);

// Warn if a Grok model is configured but key is missing
if ((grokModel || grokAllowedModels.length > 0) && !grokApiKey) {
  console.warn('Grok model(s) configured but GROK_API_KEY is not set. Grok models will fail at runtime.');
}

if ((googleGenAiModel || googleGenAiAllowedModels.length > 0) && !googleGenAiApiKey) {
  console.warn(
    'Google GenAI model(s) configured but GOOGLE_GENAI_API_KEY is not set. Gemini models will fail at runtime.',
  );
}

// Merge OpenAI + Grok allow-lists
const tradingAllowedModels = (() => {
  const configured = parseCsvList(process.env.TRADING_ALLOWED_MODELS);
  
  if (configured.length > 0) {
    // If explicit TRADING_ALLOWED_MODELS is set, use it as the base
    const unique = new Set(configured);
    if (openAiModel) unique.add(openAiModel);
    if (grokModel) unique.add(grokModel);
    if (googleGenAiModel) unique.add(googleGenAiModel);
    return Array.from(unique);
  }
  
  // Otherwise merge OpenAI defaults + Grok allowed models
  const base = [...DEFAULT_OPENAI_MODELS];
  const grokModels =
    grokAllowedModels.length > 0 ? grokAllowedModels : grokModel ? [grokModel] : DEFAULT_GROK_MODELS;
  const googleModels =
    googleGenAiAllowedModels.length > 0
      ? googleGenAiAllowedModels
      : googleGenAiModel
        ? [googleGenAiModel]
        : DEFAULT_GOOGLE_MODELS;
  const unique = new Set([...base, ...grokModels, ...googleModels]);
  
  if (openAiModel) unique.add(openAiModel);
  if (grokModel) unique.add(grokModel);
  if (googleGenAiModel) unique.add(googleGenAiModel);
  
  return Array.from(unique);
})();

export const env = {
  openAiBaseUrl: process.env.OPENAI_BASE_URL ?? undefined,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number.parseInt(process.env.PORT ?? '4000', 10),
  autotradeServiceUrl: process.env.AUTOTRADE_SERVICE_URL ?? undefined,
  autotradeServiceKey: process.env.AUTOTRADE_SERVICE_KEY ?? undefined,
  openAiApiKey: process.env.OPENAI_API_KEY ?? '',
  openAiModel,
  grokApiKey,
  grokBaseUrl,
  grokModel,
  grokAllowedModels,
  googleGenAiApiKey,
  googleGenAiModel,
  googleGenAiAllowedModels,
  defaultTradingModel,
  tradingAllowedModels,
  finnhubApiKey: process.env.FINNHUB_API_KEY ?? '',
  finnhubBaseUrl: process.env.FINNHUB_BASE_URL ?? 'https://finnhub.io/api/v1',
  alphaVantageApiKey: process.env.ALPHAVANTAGE_API_KEY ?? '',
  redditClientId: process.env.REDDIT_CLIENT_ID ?? '',
  redditClientSecret: process.env.REDDIT_CLIENT_SECRET ?? '',
  redditUserAgent:
    process.env.REDDIT_USER_AGENT ?? 'EquityInsightApp/1.0 (+https://example.com/contact)',
  openAiEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
  databaseUrl: process.env.DATABASE_URL,
  // Debate round configuration (defaults to 1)
  investDebateRounds: Number.parseInt(process.env.INVEST_DEBATE_ROUNDS ?? '1', 10),
  riskDebateRounds: Number.parseInt(process.env.RISK_DEBATE_ROUNDS ?? '1', 10),
  // Chart Analyst (image debate) round defaults (separate from TradingAgents)
  chartDebateARounds: Number.parseInt(process.env.CHART_DEBATE_A_ROUNDS ?? '1', 10),
  chartDebateBRounds: Number.parseInt(process.env.CHART_DEBATE_B_ROUNDS ?? '1', 10),
  // Logging directories
  taLogDir: process.env.TA_LOG_DIR ?? undefined,
  chartDebateLogDir: process.env.CHART_DEBATE_LOG_DIR ?? undefined,
  // LangGraph-style limits (restored reasonable limits with longer timeouts)
  maxToolSteps: Number.parseInt(process.env.MAX_TOOL_STEPS ?? '5', 10),
  maxRecursionLimit: Number.parseInt(process.env.MAX_RECURSION_LIMIT ?? '100', 10),
  // Past results integration
  useDbMemories:
    (process.env.USE_DB_MEMORIES ?? '').toLowerCase() === 'false'
      ? false
      : Boolean(process.env.DATABASE_URL),
  usePastResultsInAssessments:
    (process.env.USE_PAST_RESULTS_IN_ASSESSMENTS ?? 'false').toLowerCase() === 'true',
  pastResultsWindowDays: Number.parseInt(process.env.PAST_RESULTS_WINDOW_DAYS ?? '90', 10),
  pastResultsMaxEntries: Number.parseInt(process.env.PAST_RESULTS_MAX_ENTRIES ?? '5', 10),
  tradingAssessmentHistoryEnabled:
    (process.env.TRADING_ASSESSMENT_HISTORY_ENABLED ?? 'false').toLowerCase() === 'true',
  tradingAgentsMockMode: parseBoolean(process.env.TRADING_AGENTS_USE_MOCK),
  tradingAgentsMockFixture: process.env.TRADING_AGENTS_MOCK_FIXTURE ?? undefined,
  tradingAgentsMockDurationMs: Math.max(
    parsePositiveInt(process.env.TRADING_AGENTS_MOCK_DURATION_MS, 20_000),
    1_000,
  ),
} as const;
