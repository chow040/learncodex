import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_TRADING_ANALYSTS } from '../../constants/tradingAgents.js';

const fetchTradingAssessmentsBySymbolMock = vi.fn();
const fetchTradingAssessmentByRunIdMock = vi.fn();

vi.mock('../../db/taDecisionRepository.js', () => ({
  fetchTradingAssessmentsBySymbol: fetchTradingAssessmentsBySymbolMock,
  fetchTradingAssessmentByRunId: fetchTradingAssessmentByRunIdMock,
}));

const { getTradingAssessmentByRunId, getTradingAssessments } = await import('../tradingAssessmentsService.js');

beforeEach(() => {
  fetchTradingAssessmentsBySymbolMock.mockReset();
  fetchTradingAssessmentByRunIdMock.mockReset();
});

describe('getTradingAssessments', () => {
  it('defaults analysts when repository omits them', async () => {
    fetchTradingAssessmentsBySymbolMock.mockResolvedValue({
      items: [
        {
          runId: 'run-1',
          symbol: 'AAPL',
          tradeDate: '2025-01-10',
          decisionToken: 'BUY',
          modelId: 'gpt-4o-mini',
          createdAt: '2025-01-11T00:00:00.000Z',
          orchestratorVersion: null,
        },
      ],
    });

    const result = await getTradingAssessments('AAPL');

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      analysts: DEFAULT_TRADING_ANALYSTS,
    });
  });

  it('passes a clamped limit and cursor to the repository', async () => {
    fetchTradingAssessmentsBySymbolMock.mockResolvedValue({ items: [] });

    await getTradingAssessments('AAPL', { limit: 100, cursor: '2025-01-01T00:00:00Z' });

    expect(fetchTradingAssessmentsBySymbolMock).toHaveBeenCalledWith('AAPL', {
      limit: 20,
      cursor: '2025-01-01T00:00:00Z',
    });
  });

  it('falls back to default limit when provided value is invalid', async () => {
    fetchTradingAssessmentsBySymbolMock.mockResolvedValue({ items: [] });

    await getTradingAssessments('MSFT', { limit: -5 });

    expect(fetchTradingAssessmentsBySymbolMock).toHaveBeenCalledWith('MSFT', {
      limit: 5,
    });
  });

  it('returns analysts from repository when provided and preserves nextCursor', async () => {
    fetchTradingAssessmentsBySymbolMock.mockResolvedValue({
      items: [
        {
          runId: 'run-2',
          symbol: 'NVDA',
          tradeDate: '2025-01-09',
          decisionToken: 'SELL',
          modelId: null,
          analysts: ['market'],
          createdAt: '2025-01-09T18:00:00.000Z',
          orchestratorVersion: '1.2.3',
        },
      ],
      nextCursor: 'cursor-123',
    });

    const result = await getTradingAssessments('NVDA', { limit: 10 });

    expect(result.items[0]).toMatchObject({
      runId: 'run-2',
      analysts: ['market'],
      orchestratorVersion: '1.2.3',
    });
    expect(result.nextCursor).toBe('cursor-123');
  });
});

describe('getTradingAssessmentByRunId', () => {
  it('returns null when repository has no record', async () => {
    fetchTradingAssessmentByRunIdMock.mockResolvedValue(null);

    const result = await getTradingAssessmentByRunId('missing-run');

    expect(result).toBeNull();
  });

  it('maps repository detail rows to service shape', async () => {
    fetchTradingAssessmentByRunIdMock.mockResolvedValue({
      runId: 'run-3',
      symbol: 'TSLA',
      tradeDate: '2025-01-08',
      decisionToken: 'HOLD',
      modelId: 'gpt-5-mini',
      analysts: ['news', 'market'],
      createdAt: '2025-01-08T15:30:00.000Z',
      orchestratorVersion: '2.0.0',
      payload: {
        symbol: 'TSLA',
        tradeDate: '2025-01-08',
        context: {} as never,
      },
      rawText: '{"decision":"HOLD"}',
      promptHash: 'hash',
      logsPath: '/tmp/logs.json',
    });

    const result = await getTradingAssessmentByRunId('run-3');

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      runId: 'run-3',
      symbol: 'TSLA',
      analysts: ['news', 'market'],
      orchestratorVersion: '2.0.0',
      rawText: '{"decision":"HOLD"}',
      promptHash: 'hash',
      logsPath: '/tmp/logs.json',
    });
  });
});
