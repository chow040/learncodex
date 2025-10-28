import type { AutoTradePortfolioSnapshot } from '../types/autotrade.js'

const USER_PROMPT_SAMPLE = `It has been 6701 minutes since trading began. Current time: 2025-10-27 04:50:26.817544. Invocation count: 2655.

=== MARKET STATE ===
BTC: price 115301.5, EMA20 115244.852, MACD 65.392, RSI7 58.331.
ETH: price 4214.55, EMA20 4205.79, MACD 0.435, RSI7 63.509.
SOL, BNB, XRP, DOGE... (see dashboard for full payload)

=== ACCOUNT STATE ===
Sharpe 0.586, Cash 13654.1, Equity 22642.21.
Positions: BTC 0.12 (entry 107343), ETH 5.74 (4189.12), SOL 33.88 (198.82), XRP 3609 (2.44), DOGE 27858 (0.18), BNB 5.64 (1140.6).
Each position lists leverage, exit plan, confidence, and risk budget.

TASK: Evaluate trend, momentum, volatility, positioning, and funding for each asset. Respond with action buy/sell/hold, size%, confidence 0-1, stop, take, max slippage, rationale. Respect risk constraints and avoid conflicting exit plans.`

const CHAIN_OF_THOUGHT_SAMPLE = `1. Portfolio review shows all assets profitable; stops intact.
2. BTC maintains higher-timeframe momentum with RSI below overbought; funding neutral.
3. ETH consolidating but structure intact; maintain hold.
4. SOL momentum cooling but risk budget intact; hold.
5. XRP and DOGE near profit targets yet invalidations not hit; hold.
6. BNB short-term weakness offset by higher timeframe trend; hold.
Conclusion: hold across board; no new entries due to no-pyramiding rule.`

export const autoTradeMockPortfolio: AutoTradePortfolioSnapshot = {
  portfolioId: 'mock-portfolio',
  automationEnabled: true,
  mode: 'Paper trading',
  availableCash: 13654.1,
  equity: 22642.21,
  totalPnl: 2615.08,
  pnlPct: 12.32,
  sharpe: 0.58,
  drawdownPct: 3.1,
  lastRunAt: '2025-10-27T04:45:00Z',
  nextRunInMinutes: 5,
  positions: [
    {
      symbol: 'BTC',
      quantity: 0.12,
      entryPrice: 107343,
      markPrice: 115301.5,
      leverage: 10,
      pnl: 955.02,
      pnlPct: 8.91,
      confidence: 0.75,
      exitPlan: {
        profitTarget: 118136.15,
        stopLoss: 102026.675,
        invalidation: 'Close below 105000 on 3-minute candle',
      },
    },
    {
      symbol: 'ETH',
      quantity: 5.74,
      entryPrice: 4189.12,
      markPrice: 4214.55,
      leverage: 10,
      pnl: 145.97,
      pnlPct: 1.02,
      confidence: 0.65,
      exitPlan: {
        profitTarget: 4568.31,
        stopLoss: 4065.43,
        invalidation: 'Close below 4000 on 3-minute candle',
      },
    },
    {
      symbol: 'SOL',
      quantity: 33.88,
      entryPrice: 198.82,
      markPrice: 203.795,
      leverage: 10,
      pnl: 168.55,
      pnlPct: 2.43,
      confidence: 0.65,
      exitPlan: {
        profitTarget: 215,
        stopLoss: 192.86,
        invalidation: 'Close below 190 on 3-minute candle',
      },
    },
    {
      symbol: 'XRP',
      quantity: 3609,
      entryPrice: 2.44,
      markPrice: 2.64335,
      leverage: 10,
      pnl: 716.57,
      pnlPct: 8.5,
      confidence: 0.65,
      exitPlan: {
        profitTarget: 2.815,
        stopLoss: 2.325,
        invalidation: 'Close below 2.30 on 3-minute candle',
      },
    },
    {
      symbol: 'DOGE',
      quantity: 27858,
      entryPrice: 0.18,
      markPrice: 0.207175,
      leverage: 10,
      pnl: 629.62,
      pnlPct: 9.82,
      confidence: 0.65,
      exitPlan: {
        profitTarget: 0.212275,
        stopLoss: 0.175355,
        invalidation: 'Close below 0.180 on 3-minute candle',
      },
    },
    {
      symbol: 'BNB',
      quantity: 5.64,
      entryPrice: 1140.6,
      markPrice: 1145.45,
      leverage: 10,
      pnl: 27.35,
      pnlPct: 0.48,
      confidence: 0.65,
      exitPlan: {
        profitTarget: 1254.29,
        stopLoss: 1083.23,
        invalidation: 'Close below 1080 on 3-minute candle',
      },
    },
  ],
  decisions: [
    {
      id: 'run-001',
      symbol: 'BTC',
      action: 'hold',
      sizePct: 0,
      confidence: 0.78,
      rationale: 'Momentum intact on 4h; funding neutral; invalidation untouched.',
      createdAt: '2025-10-27T04:45:00Z',
      prompt: {
        systemPrompt:
          'You are AutoTrader, an LLM decision engine that manages a crypto derivatives portfolio. Respond with JSON decisions for each asset.',
        userPayload: USER_PROMPT_SAMPLE,
        chainOfThought: CHAIN_OF_THOUGHT_SAMPLE,
        invalidations: ['BTC closes below 105000 on a 3-minute candle', 'Funding > 0.01% with RSI > 80'],
        observationWindow: 'PT5M',
      },
    },
    {
      id: 'run-002',
      symbol: 'ETH',
      action: 'hold',
      sizePct: 0,
      confidence: 0.66,
      rationale: 'Range compression but higher-timeframe trend supportive.',
      createdAt: '2025-10-27T04:45:00Z',
      prompt: {
        systemPrompt:
          'You are AutoTrader, an LLM decision engine that manages a crypto derivatives portfolio. Respond with JSON decisions for each asset.',
        userPayload: USER_PROMPT_SAMPLE,
        chainOfThought: CHAIN_OF_THOUGHT_SAMPLE,
        invalidations: ['ETH closes below 4000 on 3-minute candle'],
        observationWindow: 'PT5M',
      },
    },
    {
      id: 'run-003',
      symbol: 'SOL',
      action: 'hold',
      sizePct: 0,
      confidence: 0.64,
      rationale: 'Momentum cooling; existing position within risk budget.',
      createdAt: '2025-10-27T04:45:00Z',
      prompt: {
        systemPrompt:
          'You are AutoTrader, an LLM decision engine that manages a crypto derivatives portfolio. Respond with JSON decisions for each asset.',
        userPayload: USER_PROMPT_SAMPLE,
        chainOfThought: CHAIN_OF_THOUGHT_SAMPLE,
        invalidations: ['SOL closes below 190 on 3-minute candle'],
        observationWindow: 'PT5M',
      },
    },
    {
      id: 'run-004',
      symbol: 'XRP',
      action: 'hold',
      sizePct: 0,
      confidence: 0.63,
      rationale: 'Macro structure improving; wait for funding tick shift.',
      createdAt: '2025-10-27T04:45:00Z',
      prompt: {
        systemPrompt:
          'You are AutoTrader, an LLM decision engine that manages a crypto derivatives portfolio. Respond with JSON decisions for each asset.',
        userPayload: USER_PROMPT_SAMPLE,
        chainOfThought: CHAIN_OF_THOUGHT_SAMPLE,
        invalidations: ['XRP closes below 2.30 on 3-minute candle'],
        observationWindow: 'PT5M',
      },
    },
  ],
  events: [
    { id: 'evt-001', label: 'Paper mode engaged', timestamp: '2025-10-27T00:00:00Z' },
    { id: 'evt-002', label: 'Risk cap raised to $750/trade', timestamp: '2025-10-26T18:20:00Z' },
    { id: 'evt-003', label: 'User deposited $10,000', timestamp: '2025-10-25T08:05:00Z' },
  ],
}

export const getMockDecisionById = (decisionId: string) =>
  autoTradeMockPortfolio.decisions.find((decision) => decision.id === decisionId)
