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
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number.parseInt(process.env.PORT ?? '4000', 10),
  openAiApiKey: process.env.OPENAI_API_KEY ?? '',
  openAiModel: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini',
  finnhubApiKey: process.env.FINNHUB_API_KEY ?? '',
  finnhubBaseUrl: process.env.FINNHUB_BASE_URL ?? 'https://finnhub.io/api/v1',
  redditClientId: process.env.REDDIT_CLIENT_ID ?? '',
  redditClientSecret: process.env.REDDIT_CLIENT_SECRET ?? '',
  redditUserAgent:
    process.env.REDDIT_USER_AGENT ?? 'EquityInsightApp/1.0 (+https://example.com/contact)',
  databaseUrl: process.env.DATABASE_URL,
} as const;



