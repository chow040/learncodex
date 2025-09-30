import { useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'

// Lightweight pseudo-random number generator lets us build deterministic mock data per ticker.
const createRng = (seed: number) => {
  let value = seed % 2147483647
  if (value <= 0) value += 2147483646
  return () => {
    value = (value * 16807) % 2147483647
    return value / 2147483647
  }
}

const seedFromTicker = (ticker: string) =>
  ticker.split('').reduce((acc, char, index) => acc + char.charCodeAt(0) * (index + 11), 0) + ticker.length * 97

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

const formatMarketCap = (billions: number) => (billions >= 1000 ? `$${(billions / 1000).toFixed(1)}T` : `$${billions.toFixed(1)}B`)

const pickItems = <T,>(source: T[], count: number, rng: () => number) => {
  const pool = [...source]
  const items: T[] = []
  while (pool.length && items.length < count) {
    const index = Math.floor(rng() * pool.length)
    items.push(pool.splice(index, 1)[0])
  }
  return items
}

const pickItem = <T,>(source: T[], rng: () => number) => source[Math.floor(rng() * source.length)]

type CompanyOverride = {
  summary: string
  catalysts: string[]
  risks: string[]
  keyDrivers: string[]
  rating: string
}

type Scenario = {
  label: string
  price: string
  probability: string
  note: string
}

type TechnicalSnapshot = {
  rsi: string
  rsiBias: string
  macdLine: string
  macdSignal: string
  macdView: string
  priceVs50: string
  priceVs200: string
  momentumScore: string
  support: string
  resistance: string
  accDist: string
  avgVolume: string
  atr: string
  sessionPlan: string
  riskNote: string
}

type ReportPayload = {
  price: string
  marketCap: string
  pe: string
  eps: string
  dividendYield: string
  revenueGrowth: string
  operatingMargin: string
  freeCashFlow: string
  debtToEquity: string
  earningsRevision: string
  rating: string
  summary: string
  keyDrivers: string[]
  catalysts: string[]
  risks: string[]
  priceTargets: Scenario[]
  technical: TechnicalSnapshot
  asOf: string
}

type HistoryEntry = {
  ticker: string
  data: ReportPayload
}

type FinnhubMetrics = {
  symbol: string
  pe: number | null
  eps: number | null
  revenueGrowth: number | null
  operatingMargin: number | null
  dividendYield: number | null
  priceToFreeCashFlow: number | null
  debtToEquity: number | null
  earningsRevision: number | null
}

const companyOverrides: Record<string, CompanyOverride> = {
  AAPL: {
    summary:
      'Apple balances resilient Services momentum with steady hardware refresh cycles.\nGross margin discipline funds ongoing buybacks and dividend growth.\nManagement continues to prioritize ecosystem lock-in and premium positioning.',
    catalysts: [
      'Upside from higher average selling prices as the Pro lineup refresh lands',
      'Acceleration in Services ARPU from bundled content tiers',
      'Ongoing share repurchase program tightening the float'
    ],
    risks: [
      'Regulatory pressure on App Store economics',
      'Hardware demand sensitivity to global consumer spending',
      'FX volatility weighing on reported revenue'
    ],
    keyDrivers: [
      'Mix shift toward Services bolsters blended gross margin trajectory',
      'Wearables attach rates extend lifetime value per customer',
      'Balance-sheet cash enables disciplined capital allocation'
    ],
    rating: 'Outperform'
  },
  MSFT: {
    summary:
      'Microsoft benefits from secular cloud adoption with Azure leading growth.\nOperating leverage from commercial cloud supports durable EPS compounding.\nBalance sheet strength keeps capital returns and investment capacity intact.',
    catalysts: [
      'Azure consumption trends re-accelerating with AI workloads',
      'Seat expansion from Microsoft 365 E5 upgrades across enterprise accounts',
      'Strategic partnerships extending Teams and Dynamics integrations'
    ],
    risks: [
      'Large-deal scrutiny in a slower macro spending environment',
      'Heightened competition in productivity suites and collaboration tools',
      'Cloud optimization efforts temper near-term Azure revenue growth'
    ],
    keyDrivers: [
      'Commercial cloud scale maintains premium operating margin profile',
      'AI integrations deepen switching costs across the product portfolio',
      'Net cash position supports balanced inorganic and organic investment'
    ],
    rating: 'Moderate Buy'
  }
}

const driverPool = [
  'Expanding subscription mix stabilizes revenue visibility',
  'Improving supply chain efficiency supports margin expansion',
  'Platform ecosystem unlocks incremental monetization pathways',
  'Cloud migration tailwinds sustain double-digit services growth',
  'Cost discipline keeps opex growth below revenue trajectory',
  'AI-driven tooling deepens customer engagement and wallet share'
]

const catalystPool = [
  'Management signaling disciplined M&A to broaden the platform moat',
  'Upside from international expansion where penetration remains low',
  'Margin tailwinds as infrastructure optimization programs scale',
  'New product roadmap expected to refresh premium pricing power',
  'Partnership pipeline opening cross-selling opportunities',
  'Share buybacks providing consistent EPS accretion'
]

const riskPool = [
  'Macro slowdown could delay enterprise purchasing decisions',
  'Competitive pricing pressure may limit near-term margin gains',
  'Higher rates increase discount rates applied to future cash flows',
  'Currency volatility continues to create translation headwinds',
  'Regulatory scrutiny could alter preferred business practices',
  'Supply chain constraints risk near-term fulfillment delays'
]

const bullNotes = [
  'Premium positioning supports sustained double-digit top-line growth.',
  'Margin expansion accelerates as scale efficiencies kick in.',
  'AI-enabled features unlock new cross-sell attach rates.'
]

const baseNotes = [
  'Execution tracks plan with mid-teens EPS growth and stable margins.',
  'Balanced demand keeps revenue growth in the high-single-digit range.',
  'Recurring revenue mix offsets cyclical softness in transactional lines.'
]

const bearNotes = [
  'Demand softens as customers delay upgrade cycles.',
  'Execution risk on the roadmap pushes out monetization gains.',
  'Macro volatility pressures valuation multiples toward long-term averages.'
]

const quickPicks = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA']

const reportSections = [
  { id: 'snapshot', label: 'Snapshot' },
  { id: 'drivers', label: 'Valuation Drivers' },
  { id: 'scenarios', label: 'Price Targets' },
  { id: 'catalysts', label: 'Catalysts & Risks' },
  { id: 'analyst', label: 'Analyst Take' }
]

const tradeBiasPool = ['Bullish momentum', 'Neutral consolidation', 'Mean-reversion setup', 'Distribution risk', 'Accumulation phase']
const tradePlanPool = [
  'Bias long on pullbacks into rising 21 EMA with stops below intraday VWAP.',
  'Range-trade pivots between defined support/resistance until a volume break confirms direction.',
  'Stagger entries around 50 DMA retest, targeting prior swing high with 2:1 reward-to-risk.',
  'Fade extensions into weekly resistance, using tight stops above the prior day high.',
  'Scale in above anchored VWAP when momentum breadth exceeds 60% and volume confirms.'
]
const riskNotesPool = [
  'Watch macro catalysts - elevated beta implies headline sensitivity.',
  'Position sizing: 50 bps of capital max with ATR-based stop below structure.',
  'Avoid holding through earnings - implied move pricing is elevated.',
  'Liquidity pockets appear around opening range; reduce size during lunch session.',
  'Confirm signals with broader sector rotation before committing full risk.'
]

const formatPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`

const generateTechnicalSnapshot = (rng: () => number, price: number): TechnicalSnapshot => {
  const rsi = 30 + rng() * 40
  const macdLine = (rng() * 3 - 1.5)
  const macdSignal = macdLine - (rng() * 0.6 - 0.3)
  const macdSpread = macdLine - macdSignal
  const priceVs50 = (rng() * 12 - 6)
  const priceVs200 = (rng() * 18 - 9)
  const momentumScore = (rng() * 40 + 30).toFixed(0)
  const atr = (price * (0.01 + rng() * 0.025)).toFixed(2)
  const avgVolume = `${(8 + rng() * 42).toFixed(1)}M`
  const supportLevel = price * (1 - (0.01 + rng() * 0.04))
  const resistanceLevel = price * (1 + (0.01 + rng() * 0.04))

  return {
    rsi: rsi.toFixed(1),
    rsiBias: rsi > 70 ? 'Overbought' : rsi < 30 ? 'Oversold' : rsi > 55 ? 'Positive momentum' : 'Neutral',
    macdLine: macdLine.toFixed(2),
    macdSignal: macdSignal.toFixed(2),
    macdView: macdSpread > 0 ? 'Bullish crossover' : macdSpread < 0 ? 'Bearish crossover' : 'Flat momentum',
    priceVs50: formatPercent(priceVs50),
    priceVs200: formatPercent(priceVs200),
    momentumScore: `${momentumScore}/100`,
    support: formatCurrency(supportLevel),
    resistance: formatCurrency(resistanceLevel),
    accDist: pickItem(tradeBiasPool, rng),
    avgVolume,
    atr: formatCurrency(parseFloat(atr)),
    sessionPlan: pickItem(tradePlanPool, rng),
    riskNote: pickItem(riskNotesPool, rng)
  }
}

const generateMockReport = (ticker: string): ReportPayload => {
  const upperTicker = ticker.toUpperCase()
  const override = companyOverrides[upperTicker]
  const rng = createRng(seedFromTicker(upperTicker))

  const price = Number((20 + rng() * 350).toFixed(2))
  const peRatio = Number((12 + rng() * 24).toFixed(1))
  const epsValue = Number((price / peRatio).toFixed(2))
  const dividendYieldValue = Number((0.2 + rng() * 2.2).toFixed(2))
  const marketCapBillions = 10 + rng() * 1800
  const revenueGrowthValue = Number((4 + rng() * 24).toFixed(1))
  const operatingMarginValue = Number((12 + rng() * 26).toFixed(1))
  const freeCashFlowValue = Number((0.4 + rng() * 35).toFixed(1))
  const debtToEquityValue = Number((0.15 + rng() * 1.1).toFixed(2))
  const earningsRevisionValue = Number((-5 + rng() * 13).toFixed(1))

  const ratingOptions = ['Outperform', 'Moderate Buy', 'Market Perform', 'Accumulate']
  const rating = override?.rating ?? ratingOptions[Math.floor(rng() * ratingOptions.length)]

  const baseSummary = `${upperTicker} posts ${revenueGrowthValue.toFixed(1)}% revenue growth with operating margins around ${operatingMarginValue.toFixed(1)}%.\n` +
    `Free cash flow near ~$${freeCashFlowValue.toFixed(1)}B supports balanced capital allocation while leverage stays manageable at ${debtToEquityValue}x.\n` +
    `Consensus earnings revisions are ${earningsRevisionValue >= 0 ? 'positive' : 'negative'} at ${Math.abs(earningsRevisionValue).toFixed(1)}% this quarter, aligning with a ${rating.toLowerCase()} stance.`

  const keyDrivers = override?.keyDrivers ?? pickItems(driverPool, 3, rng)
  const catalysts = override?.catalysts ?? pickItems(catalystPool, 3, rng)
  const risks = override?.risks ?? pickItems(riskPool, 3, rng)

  const bullPrice = price * (1 + 0.18 + rng() * 0.18)
  const basePrice = price * (1 + 0.05 + rng() * 0.08)
  const bearPrice = price * (1 - (0.08 + rng() * 0.12))

  const scenarioWeights = [0.3 + rng() * 0.1, 0.5 + rng() * 0.1, 0.2 + rng() * 0.08]
  const weightSum = scenarioWeights.reduce((sum, value) => sum + value, 0)
  const bullProbability = Math.round((scenarioWeights[0] / weightSum) * 100)
  const baseProbability = Math.round((scenarioWeights[1] / weightSum) * 100)
  let bearProbability = 100 - bullProbability - baseProbability
  if (bearProbability < 0) bearProbability = 0

  const priceTargets: Scenario[] = [
    {
      label: 'Bull Case',
      price: formatCurrency(bullPrice),
      probability: `${bullProbability}%`,
      note: pickItem(bullNotes, rng)
    },
    {
      label: 'Base Case',
      price: formatCurrency(basePrice),
      probability: `${baseProbability}%`,
      note: pickItem(baseNotes, rng)
    },
    {
      label: 'Bear Case',
      price: formatCurrency(bearPrice),
      probability: `${bearProbability}%`,
      note: pickItem(bearNotes, rng)
    }
  ]

  const summary = override?.summary ?? baseSummary

  return {
    price: formatCurrency(price),
    marketCap: formatMarketCap(marketCapBillions),
    pe: `${peRatio.toFixed(1)}x`,
    eps: formatCurrency(epsValue),
    dividendYield: `${dividendYieldValue.toFixed(2)}%`,
    revenueGrowth: `${revenueGrowthValue.toFixed(1)}%`,
    operatingMargin: `${operatingMarginValue.toFixed(1)}%`,
    freeCashFlow: `~$${freeCashFlowValue.toFixed(1)}B`,
    debtToEquity: `${debtToEquityValue.toFixed(2)}x`,
    earningsRevision: `${earningsRevisionValue >= 0 ? '+' : ''}${earningsRevisionValue.toFixed(1)}%`,
    rating,
    summary,
    keyDrivers,
    catalysts,
    risks,
    priceTargets,
    technical: generateTechnicalSnapshot(rng, price),
    asOf: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }
}

const Placeholder = ({ text }: { text: string }) => <div className="placeholder">{text}</div>

type SnapshotView = 'fundamental' | 'technical'

const EquityInsight = () => {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000'

  // Form + report state drives the UI.
  const [tickerInput, setTickerInput] = useState('')
  const [reportData, setReportData] = useState<{ ticker: string; data: ReportPayload } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [snapshotView, setSnapshotView] = useState<SnapshotView>('fundamental')

  // Refs keep track of scrolling targets.
  const scrollTargets = useRef<Record<string, HTMLElement | null>>({})

  
  const handleGenerate = async (nextTicker: string) => {
    const trimmed = nextTicker.trim().toUpperCase()
    if (!trimmed) return

    setTickerInput(trimmed)
    setIsLoading(true)

    try {
      const [quoteResponse, profileResponse, metricsResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/finance/quote?symbol=${encodeURIComponent(trimmed)}`),
        fetch(`${API_BASE_URL}/api/finance/profile?symbol=${encodeURIComponent(trimmed)}`),
        fetch(`${API_BASE_URL}/api/finance/metrics?symbol=${encodeURIComponent(trimmed)}`)
      ])

      if (!quoteResponse.ok || !profileResponse.ok || !metricsResponse.ok) {
        throw new Error('Failed to fetch market data.')
      }

      const quote = await quoteResponse.json()
      const profile = await profileResponse.json()
      const metrics: FinnhubMetrics = await metricsResponse.json()

      const assessmentResponse = await fetch(`${API_BASE_URL}/api/assessment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: trimmed })
      })

      if (!assessmentResponse.ok) {
        throw new Error('Failed to fetch assessment data.')
      }

      const assessment = await assessmentResponse.json()

      const safeCurrency = typeof profile.currency === 'string' && profile.currency.trim().length === 3 ? profile.currency : 'USD'
      const formatCurrencyValue = (value: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: safeCurrency }).format(value)

      const formattedPrice = typeof quote.current === 'number' ? formatCurrencyValue(quote.current) : formatCurrencyValue(0)
      const marketCapValue =
        typeof profile.marketCapitalization === 'number' && profile.marketCapitalization > 0
          ? formatMarketCap(profile.marketCapitalization)
          : 'N/A'

      const formatMultiple = (value: number | null, decimals = 1) =>
        value !== null ? value.toFixed(decimals) + 'x' : 'N/A'
      const formatPercent = (value: number | null, decimals = 1) =>
        value !== null ? value.toFixed(decimals) + '%' : 'N/A'
      const formatPercentWithSign = (value: number | null, decimals = 1) =>
        value !== null ? (value >= 0 ? '+' : '') + value.toFixed(decimals) + '%' : 'N/A'
      const formatCurrencyOrNA = (value: number | null) => (value !== null ? formatCurrencyValue(value) : 'N/A')
      const formatFreeCashFlow = (value: number | null) => {
        if (value === null) return 'N/A'
        const rounded = value >= 100 ? value.toFixed(0) : value.toFixed(1)
        return '~$' + rounded + 'B'
      }
      const priceToFcfRatio =
        typeof metrics.priceToFreeCashFlow === 'number' && Number.isFinite(metrics.priceToFreeCashFlow) && metrics.priceToFreeCashFlow > 0
          ? metrics.priceToFreeCashFlow
          : null
      const currentPrice =
        typeof quote.current === 'number' && Number.isFinite(quote.current) && quote.current > 0 ? quote.current : null
      const fcfPerShare = priceToFcfRatio && currentPrice ? currentPrice / priceToFcfRatio : null
      const sharesOutstandingMillions =
        typeof profile.shareOutstanding === 'number' && Number.isFinite(profile.shareOutstanding) && profile.shareOutstanding > 0
          ? profile.shareOutstanding
          : null
      const freeCashFlowBillions =
        fcfPerShare !== null && sharesOutstandingMillions !== null
          ? (fcfPerShare * sharesOutstandingMillions) / 1000
          : null

      const riskLabel =
        typeof assessment.riskRating === 'string' && assessment.riskRating.length > 0
          ? assessment.riskRating.charAt(0).toUpperCase() + assessment.riskRating.slice(1)
          : 'N/A'

      const opportunities = Array.isArray(assessment.opportunities) ? assessment.opportunities : []
      const watchItems = Array.isArray(assessment.watchItems) ? assessment.watchItems : []
      const nextSteps = Array.isArray(assessment.nextSteps) ? assessment.nextSteps : []

      const data = generateMockReport(trimmed)
      data.price = formattedPrice
      data.marketCap = marketCapValue
      data.pe = formatMultiple(metrics.pe)
      data.eps = formatCurrencyOrNA(metrics.eps)
      data.revenueGrowth = formatPercent(metrics.revenueGrowth, 2)
      data.operatingMargin = formatPercent(metrics.operatingMargin, 1)
      data.dividendYield = formatPercent(metrics.dividendYield, 2)
      data.freeCashFlow = formatFreeCashFlow(freeCashFlowBillions)
      data.debtToEquity = formatMultiple(metrics.debtToEquity, 2)
      data.earningsRevision = formatPercentWithSign(metrics.earningsRevision, 1)
      data.rating = riskLabel
      data.summary = typeof assessment.summary === 'string' ? assessment.summary : data.summary
      if (opportunities.length) data.keyDrivers = opportunities
      if (nextSteps.length) data.catalysts = nextSteps
      if (watchItems.length) data.risks = watchItems

      setReportData({ ticker: trimmed, data })
      setHistory((prev) => {
        const filtered = prev.filter((entry) => entry.ticker !== trimmed)
        return [{ ticker: trimmed, data }, ...filtered].slice(0, 12)
      })
      setSnapshotView('fundamental')
      scrollTargets.current.snapshot?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (error) {
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    handleGenerate(tickerInput)
  }

  const handleSectionScroll = (sectionId: string) => {
    scrollTargets.current[sectionId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const reportContent = useMemo(() => {
    if (isLoading) {
      return <Placeholder text="Analyzing fundamentals..." />
    }

    if (!reportData) {
      return <Placeholder text="Provide a ticker symbol to see valuation metrics, trends, and qualitative insights." />
    }

    const { ticker, data } = reportData

    return (
      <>
        <article className="report-section" id="snapshot" ref={(node) => { scrollTargets.current.snapshot = node }}>
          <div className="snapshot-header">
            <h2>{ticker} Snapshot</h2>
            <div className="snapshot-tabs" role="tablist" aria-label="Snapshot view selector">
              <button
                type="button"
                role="tab"
                aria-selected={snapshotView === 'fundamental'}
                className={snapshotView === 'fundamental' ? 'active' : ''}
                onClick={() => setSnapshotView('fundamental')}
              >
                Fundamental Pulse
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={snapshotView === 'technical'}
                className={snapshotView === 'technical' ? 'active' : ''}
                onClick={() => setSnapshotView('technical')}
              >
                Technical Playbook
              </button>
            </div>
          </div>

          {snapshotView === 'fundamental' ? (
            <div className="report-grid" role="tabpanel">
              <div className="metric"><span>Last Price</span><strong>{data.price}</strong></div>
              <div className="metric"><span>Market Cap</span><strong>{data.marketCap}</strong></div>
              <div className="metric"><span>P/E (TTM)</span><strong>{data.pe}</strong></div>
              <div className="metric"><span>EPS (TTM)</span><strong>{data.eps}</strong></div>
              <div className="metric"><span>Revenue Growth</span><strong>{data.revenueGrowth}</strong></div>
              <div className="metric"><span>Operating Margin</span><strong>{data.operatingMargin}</strong></div>
              <div className="metric"><span>Dividend Yield</span><strong>{data.dividendYield}</strong></div>
              <div className="metric"><span>Free Cash Flow</span><strong>{data.freeCashFlow}</strong></div>
              <div className="metric"><span>Debt / Equity</span><strong>{data.debtToEquity}</strong></div>
              <div className="metric"><span>Earnings Revision</span><strong>{data.earningsRevision}</strong></div>
              <div className="metric"><span>Risk Rating (AI)</span><strong className="metric-rating">{data.rating}</strong></div>
            </div>
          ) : (
            <div className="technical-grid" role="tabpanel">
              <div className="technical-card">
                <div className="technical-label">RSI (14)</div>
                <div className="technical-value">{data.technical.rsi}</div>
                <div className="technical-subtext">{data.technical.rsiBias}</div>
              </div>
              <div className="technical-card">
                <div className="technical-label">MACD</div>
                <div className="technical-value">{data.technical.macdLine}</div>
                <div className="technical-subtext">Signal {data.technical.macdSignal} / {data.technical.macdView}</div>
              </div>
              <div className="technical-card">
                <div className="technical-label">Price vs 50 DMA</div>
                <div className="technical-value">{data.technical.priceVs50}</div>
                <div className="technical-subtext">vs 200 DMA {data.technical.priceVs200}</div>
              </div>
              <div className="technical-card">
                <div className="technical-label">Momentum Score</div>
                <div className="technical-value">{data.technical.momentumScore}</div>
                <div className="technical-subtext">{data.technical.accDist}</div>
              </div>
              <div className="technical-card">
                <div className="technical-label">Key Levels</div>
                <div className="technical-value">{data.technical.support} / {data.technical.resistance}</div>
                <div className="technical-subtext">Support / Resistance</div>
              </div>
              <div className="technical-card">
                <div className="technical-label">Average Volume</div>
                <div className="technical-value">{data.technical.avgVolume}</div>
                <div className="technical-subtext">ATR (14): {data.technical.atr}</div>
              </div>
              <div className="technical-bloc">
                <h3>Session Play</h3>
                <p>{data.technical.sessionPlan}</p>
              </div>
              <div className="technical-bloc risk">
                <h3>Risk Controls</h3>
                <p>{data.technical.riskNote}</p>
              </div>
            </div>
          )}
        </article>

        <article className="report-section" id="drivers" ref={(node) => { scrollTargets.current.drivers = node }}>
          <h2>Valuation Drivers</h2>
          <ul className="insight-list">{data.keyDrivers.map((item) => <li key={item}>{item}</li>)}</ul>
        </article>

        <article className="report-section" id="scenarios" ref={(node) => { scrollTargets.current.scenarios = node }}>
          <h2>Scenario Price Targets</h2>
          <div className="scenario-grid">
            {data.priceTargets.map((target) => (
              <div className="scenario-card" key={target.label}>
                <span className="tag">{target.probability}</span>
                <h3>{target.label}</h3>
                <div className="target-price">{target.price}</div>
                <p>{target.note}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="report-section" id="catalysts" ref={(node) => { scrollTargets.current.catalysts = node }}>
          <h2>Catalysts & Risks</h2>
          <div className="report-split">
            <div>
              <h3>Catalysts</h3>
              <ul className="insight-list">{data.catalysts.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
            <div>
              <h3>Risks</h3>
              <ul className="insight-list">{data.risks.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          </div>
        </article>

        <article className="report-section" id="analyst" ref={(node) => { scrollTargets.current.analyst = node }}>
          <h2>Analyst Take</h2>
          <p className="analysis">{data.summary}</p>
        </article>

        <p className="timestamp">Mock data refreshed {data.asOf}</p>
      </>
    )
  }, [isLoading, reportData, snapshotView])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>Research Hub</h2>
          <p>Use quick picks or revisit a ticker to regenerate its mock insights.</p>
        </div>

        <section className="sidebar-section">
          <h3>Quick Picks</h3>
          <div className="quick-picks">
            {quickPicks.map((symbol) => (
              <button key={symbol} type="button" onClick={() => handleGenerate(symbol)}>
                {symbol}
              </button>
            ))}
          </div>
        </section>

        <section className="sidebar-section">
          <h3>Report Sections</h3>
          <ul className="section-nav">
            {reportSections.map((section) => (
              <li key={section.id}>
                <button type="button" onClick={() => handleSectionScroll(section.id)}>
                  {section.label}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="sidebar-section">
          <div className="sidebar-section-heading">
            <h3>History</h3>
            <button type="button" className="clear-history" onClick={() => setHistory([])}>
              Clear
            </button>
          </div>
          <ul className="history-list">
            {history.length === 0 ? (
              <li className="history-empty">No reports yet.</li>
            ) : (
              history.map((entry) => (
                <li key={entry.ticker}>
                  <button type="button" className="history-item" onClick={() => handleGenerate(entry.ticker)}>
                    <div className="history-heading">
                      <span className="history-ticker">{entry.ticker}</span>
                      <span className="history-price">{entry.data.price}</span>
                    </div>
                    <div className="history-sub">
                      <span className="history-rating tag">{entry.data.rating}</span>
                      <span className="history-time">{entry.data.asOf}</span>
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>
      </aside>

      <main>
        <header>
          <h1>Equity Insight</h1>
          <p>Generate a quick equity snapshot by entering a stock ticker symbol.</p>
        </header>

        <section className="card">
          <form autoComplete="off" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="ticker">Ticker symbol</label>
              <div className="ticker-row">
                <input
                  id="ticker"
                  name="ticker"
                  type="text"
                  placeholder="AAPL"
                  maxLength={8}
                  value={tickerInput}
                  onChange={(event) => setTickerInput(event.target.value.toUpperCase())}
                  required
                />
                <button type="submit">Generate Report</button>
              </div>
            </div>
          </form>
        </section>

        <section className="card report" aria-live="polite" aria-busy={isLoading}>
          {reportContent}
        </section>
      </main>
    </div>
  )
}

export default EquityInsight

