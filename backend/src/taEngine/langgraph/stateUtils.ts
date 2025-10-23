import type {
  DebateRoundEntry,
  GraphMetadata,
  InvestmentDebatePersona,
  RiskDebatePersona,
  RiskDebateRoundEntry,
} from './types.js';

const sanitizeContent = (content: string): string => content?.trim() ?? '';

export const createDebateRoundEntry = (
  persona: InvestmentDebatePersona,
  round: number,
  content: string,
): DebateRoundEntry => ({
  persona,
  round,
  content: sanitizeContent(content),
  timestamp: new Date().toISOString(),
});

export const createRiskDebateRoundEntry = (
  persona: RiskDebatePersona,
  round: number,
  content: string,
): RiskDebateRoundEntry => ({
  persona,
  round,
  content: sanitizeContent(content),
  timestamp: new Date().toISOString(),
});

export const withIncrementedInvestRound = (metadata: GraphMetadata, round?: number): GraphMetadata => ({
  ...metadata,
  invest_round: typeof round === 'number' ? round : Number(metadata.invest_round ?? 0) + 1,
});

export const withIncrementedRiskRound = (metadata: GraphMetadata, round?: number): GraphMetadata => ({
  ...metadata,
  risk_round: typeof round === 'number' ? round : Number(metadata.risk_round ?? 0) + 1,
});

export const canContinueInvestment = (metadata: GraphMetadata | undefined, maxRounds: number): boolean => {
  if (!metadata) return maxRounds > 0;
  if (metadata.invest_continue === false) return false;
  const completed = Number(metadata.invest_round ?? 0);
  return completed < maxRounds;
};

export const canContinueRisk = (metadata: GraphMetadata | undefined, maxRounds: number): boolean => {
  if (!metadata) return maxRounds > 0;
  if (metadata.risk_continue === false) return false;
  const completed = Number(metadata.risk_round ?? 0);
  return completed < maxRounds;
};
