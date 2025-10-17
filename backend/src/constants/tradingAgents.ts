export const TRADING_ANALYST_IDS = ['fundamental', 'market', 'news', 'social'] as const;

export type TradingAnalystId = (typeof TRADING_ANALYST_IDS)[number];

export const DEFAULT_TRADING_ANALYSTS: TradingAnalystId[] = [...TRADING_ANALYST_IDS];

export const isTradingAnalystId = (value: unknown): value is TradingAnalystId => {
  return typeof value === 'string' && TRADING_ANALYST_IDS.includes(value as TradingAnalystId);
};
