import 'dotenv/config';

const requiredEnvVars = ['OPENAI_API_KEY', 'FINNHUB_API_KEY'] as const;

requiredEnvVars.forEach((key) => {
  if (!process.env[key]) {
    console.warn(`Environment variable ${key} is not set.`);
  }
});

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number.parseInt(process.env.PORT ?? '4000', 10),
  openAiApiKey: process.env.OPENAI_API_KEY ?? '',
  openAiModel: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini',
  finnhubApiKey: process.env.FINNHUB_API_KEY ?? '',
  finnhubBaseUrl: process.env.FINNHUB_BASE_URL ?? 'https://finnhub.io/api/v1',
} as const;