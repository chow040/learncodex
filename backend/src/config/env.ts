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

export const env = {
  openAiBaseUrl: process.env.OPENAI_BASE_URL ?? undefined,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number.parseInt(process.env.PORT ?? '4000', 10),
  openAiApiKey: process.env.OPENAI_API_KEY ?? '',
  openAiModel: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini',
  finnhubApiKey: process.env.FINNHUB_API_KEY ?? '',
  finnhubBaseUrl: process.env.FINNHUB_BASE_URL ?? 'https://finnhub.io/api/v1',
  alphaVantageApiKey: process.env.ALPHAVANTAGE_API_KEY ?? '',
  redditClientId: process.env.REDDIT_CLIENT_ID ?? '',
  redditClientSecret: process.env.REDDIT_CLIENT_SECRET ?? '',
  redditUserAgent:
    process.env.REDDIT_USER_AGENT ?? 'EquityInsightApp/1.0 (+https://example.com/contact)',
  databaseUrl: process.env.DATABASE_URL,
  tradingAgentsPython: process.env.TRADING_AGENTS_PYTHON ?? 'python',
  tradingAgentsPath: process.env.TRADING_AGENTS_PATH,
  tradingAgentsResultsDir: process.env.TRADING_AGENTS_RESULTS_DIR ?? undefined,
  tradingAgentsTimeoutMs: Number.parseInt(process.env.TRADING_AGENTS_TIMEOUT ?? '600000', 10),
  tradingAgentsEngineMode: (process.env.TA_ENGINE_MODE ?? 'single').toLowerCase() as 'single' | 'multi',
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
  maxRecursionLimit: Number.parseInt(process.env.MAX_RECURSION_LIMIT ?? '15', 10),
  useLangchainAnalysts: (process.env.USE_LANGCHAIN_ANALYSTS ?? 'false').toLowerCase() === 'true',
  useLanggraphPipeline: (process.env.USE_LANGGRAPH_PIPELINE ?? 'true').toLowerCase() === 'true',
} as const;
