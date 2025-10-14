import clsx from 'clsx'
import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
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

const formatRelativeTime = (isoDate: string) => {
  const parsed = new Date(isoDate)
  if (Number.isNaN(parsed.getTime())) return 'Unknown'

  const diff = Date.now() - parsed.getTime()
  if (diff <= 0) return 'Just now'

  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`

  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

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

const coerceStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((item) => (typeof item === 'string' ? item.trim() : String(item ?? '').trim()))
        .filter((item) => item.length > 0)
    : []

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

type TradingAgentsDecision = {
  symbol: string
  tradeDate: string
  decision: string | null
  finalTradeDecision?: string | null
  investmentPlan?: string | null
  traderPlan?: string | null
  investmentJudge?: string | null
  riskJudge?: string | null
  marketReport?: string | null
  sentimentReport?: string | null
  newsReport?: string | null
  fundamentalsReport?: string | null
}



type RedditPostInsight = {
  id: string
  title: string
  url: string
  score: number
  comments: number
  subreddit: string
  createdAt: string
}

type RedditSubredditInsight = {
  name: string
  mentions: number
}

type RedditInsights = {
  ticker: string
  query: string
  totalPosts: number
  totalUpvotes: number
  averageComments: number
  topSubreddits: RedditSubredditInsight[]
  posts: RedditPostInsight[]
  lastUpdated: string
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

type AssessmentApiResponse = {
  summary?: string
  riskRating?: string
  opportunities?: unknown
  watchItems?: unknown
  nextSteps?: unknown
}

// Renders agent text in a reader-friendly way (paragraphs and bullet lists)
const StyledText = ({ text }: { text: string }) => {
  if (!text || typeof text !== 'string') {
    return <p className="text-slate-300">No content.</p>
  }

  const lines = text.replace(/\r\n?/g, '\n').split('\n')

  const blocks: ReactNode[] = []
  let i = 0

  const isBullet = (line: string) => /^\s*[-*]\s+/.test(line)
  const isNumbered = (line: string) => /^\s*\d+[.)]\s+/.test(line)

  while (i < lines.length) {
    const line = lines[i]

    // Skip excess blank lines but preserve paragraph breaks
    if (!line.trim()) {
      i++
      continue
    }

    if (isBullet(line) || isNumbered(line)) {
      const items: string[] = []
      const ordered = isNumbered(line)
      while (i < lines.length && (isBullet(lines[i]) || isNumbered(lines[i]) || !lines[i].trim())) {
        if (lines[i].trim()) {
          const cleaned = lines[i]
            .replace(/^\s*[-*]\s+/, '')
            .replace(/^\s*\d+[.)]\s+/, '')
            .trim()
          if (cleaned) items.push(cleaned)
        }
        i++
      }
      blocks.push(
        ordered ? (
          <ol key={blocks.length} className="ml-5 list-decimal space-y-2 text-slate-100/90 marker:text-slate-400">
            {items.map((it, idx) => (
              <li key={idx} className="leading-7">{it}</li>
            ))}
          </ol>
        ) : (
          <ul key={blocks.length} className="ml-5 list-disc space-y-2 text-slate-100/90 marker:text-slate-400">
            {items.map((it, idx) => (
              <li key={idx} className="leading-7">{it}</li>
            ))}
          </ul>
        )
      )
      continue
    }

    // Paragraph: collect consecutive non-empty, non-list lines
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !isBullet(lines[i]) && !isNumbered(lines[i])) {
      para.push(lines[i])
      i++
    }
    blocks.push(
      <p key={blocks.length} className="leading-7 text-slate-100/90 whitespace-pre-wrap break-words">
        {para.join(' ')}
      </p>
    )
  }

  return <div className="space-y-3">{blocks}</div>
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
  { id: 'social', label: 'Social Buzz' },
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


const Placeholder = ({ text }: { text: string }) => (
  <div className="glass-panel flex min-h-[22rem] items-center justify-center p-8 text-center text-slate-300">
    <p className="max-w-xl leading-relaxed">{text}</p>
  </div>
)

type SnapshotView = 'fundamental' | 'technical'

const EquityInsight = () => {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000'
  const USE_INTERNAL_TA = (import.meta.env.VITE_TA_USE_INTERNAL ?? 'true').toLowerCase() !== 'false'

  const [tickerInput, setTickerInput] = useState('')
  const [reportData, setReportData] = useState<{ ticker: string; data: ReportPayload } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [socialInsights, setSocialInsights] = useState<RedditInsights | null>(null)
  const [socialError, setSocialError] = useState<string | null>(null)
  const [tradingDecision, setTradingDecision] = useState<TradingAgentsDecision | null>(null)
  const [tradingError, setTradingError] = useState<string | null>(null)
  // New: top-level tab (research vs trading) and manual trading run state
  const [mainTab, setMainTab] = useState<'research' | 'trading'>('research')
  const [isTradingLoading, setIsTradingLoading] = useState(false)
  const [snapshotView, setSnapshotView] = useState<SnapshotView>('fundamental')
  const [assessmentError, setAssessmentError] = useState<string | null>(null)

  const scrollTargets = useRef<Record<string, HTMLElement | null>>({})

  const handleGenerate = async (nextTicker: string) => {
    const trimmed = nextTicker.trim().toUpperCase()
    if (!trimmed) return

    setTickerInput(trimmed)
    setIsLoading(true)
    setLoadError(null)
    setSocialInsights(null)
    setSocialError(null)
    setTradingDecision(null)
    setTradingError(null)
    setAssessmentError(null)

    try {
      const redditPromise: Promise<Response | null> = fetch(
        `${API_BASE_URL}/api/social/reddit?symbol=${encodeURIComponent(trimmed)}`
      ).catch(() => null)

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

      const redditResponse = await redditPromise

      if (redditResponse?.ok) {
        try {
          const redditData: RedditInsights = await redditResponse.json()
          setSocialInsights(redditData)
          setSocialError(null)
        } catch (error) {
          console.error(error)
          setSocialInsights(null)
          setSocialError('Unable to load Reddit activity right now.')
        }
      } else {
        setSocialInsights(null)
        setSocialError('Unable to load Reddit activity right now.')
      }

      let assessment: AssessmentApiResponse | null = null
      try {
        const assessmentResponse = await fetch(`${API_BASE_URL}/api/assessment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: trimmed })
        })

        if (!assessmentResponse.ok) {
          throw new Error(`Assessment request failed with status ${assessmentResponse.status}.`)
        }

        const rawAssessment = (await assessmentResponse.json()) as AssessmentApiResponse
        if (rawAssessment && typeof rawAssessment === 'object') {
          assessment = rawAssessment
        } else {
          throw new Error('Assessment response was not valid JSON.')
        }
      } catch (error) {
        console.error('Assessment request failed', error)
        setAssessmentError('AI assessment is unavailable right now. Showing baseline metrics instead.')
      }

      const safeCurrency =
        typeof profile.currency === 'string' && profile.currency.trim().length === 3
          ? profile.currency
          : 'USD'
      const formatCurrencyValue = (value: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: safeCurrency }).format(value)

      const formattedPrice =
        typeof quote.current === 'number' ? formatCurrencyValue(quote.current) : formatCurrencyValue(0)
      const marketCapValue =
        typeof profile.marketCapitalization === 'number' && profile.marketCapitalization > 0
          ? formatMarketCap(profile.marketCapitalization)
          : 'N/A'

      const formatMultiple = (value: number | null, decimals = 1) =>
        value !== null ? `${value.toFixed(decimals)}x` : 'N/A'
      const formatPercent = (value: number | null, decimals = 1) =>
        value !== null ? `${value.toFixed(decimals)}%` : 'N/A'
      const formatPercentWithSign = (value: number | null, decimals = 1) =>
        value !== null ? `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%` : 'N/A'
      const formatCurrencyOrNA = (value: number | null) => (value !== null ? formatCurrencyValue(value) : 'N/A')
      const formatFreeCashFlow = (value: number | null) => {
        if (value === null) return 'N/A'
        const rounded = value >= 100 ? value.toFixed(0) : value.toFixed(1)
        return `~$${rounded}B`
      }

      const priceToFcfRatio =
        typeof metrics.priceToFreeCashFlow === 'number' &&
        Number.isFinite(metrics.priceToFreeCashFlow) &&
        metrics.priceToFreeCashFlow > 0
          ? metrics.priceToFreeCashFlow
          : null
      const currentPrice =
        typeof quote.current === 'number' && Number.isFinite(quote.current) && quote.current > 0
          ? quote.current
          : null
      const fcfPerShare = priceToFcfRatio && currentPrice ? currentPrice / priceToFcfRatio : null
      const sharesOutstandingMillions =
        typeof profile.shareOutstanding === 'number' &&
        Number.isFinite(profile.shareOutstanding) &&
        profile.shareOutstanding > 0
          ? profile.shareOutstanding
          : null
      const freeCashFlowBillions =
        fcfPerShare !== null && sharesOutstandingMillions !== null
          ? (fcfPerShare * sharesOutstandingMillions) / 1000
          : null

      const riskRating = typeof assessment?.riskRating === 'string' ? assessment.riskRating.trim() : ''
      const riskLabel =
        riskRating.length > 0
          ? riskRating.charAt(0).toUpperCase() + riskRating.slice(1)
          : 'N/A'

      const opportunities = coerceStringArray(assessment?.opportunities)
      const watchItems = coerceStringArray(assessment?.watchItems)
      const nextSteps = coerceStringArray(assessment?.nextSteps)

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
      data.summary =
        typeof assessment?.summary === 'string' && assessment.summary.trim().length > 0
          ? assessment.summary
          : data.summary
      if (opportunities.length) data.keyDrivers = opportunities
      if (nextSteps.length) data.catalysts = nextSteps
      if (watchItems.length) data.risks = watchItems

      // Do not auto-invoke TradingAgents here anymore; user can run it manually from the Trading tab


      setReportData({ ticker: trimmed, data })
      setHistory((prev) => {
        const filtered = prev.filter((entry) => entry.ticker !== trimmed)
        return [{ ticker: trimmed, data }, ...filtered].slice(0, 12)
      })
      setSnapshotView('fundamental')
      scrollTargets.current.snapshot?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (error) {
      console.error(error)
      const fallbackMessage =
        error instanceof Error
          ? `Unable to generate report: ${error.message}`
          : 'Unable to generate report right now.'
      setLoadError(fallbackMessage)
    } finally {
      setIsLoading(false)
    }
  }

  // Manual trigger for TradingAgents from the Trading tab
  const runTradingAgents = async () => {
    const symbol = (reportData?.ticker ?? tickerInput.trim().toUpperCase())
    if (!symbol) {
      setTradingError('Enter a ticker first, then open the Trading Agents tab to run the report.')
      return
    }
    setIsTradingLoading(true)
    setTradingDecision(null)
    setTradingError(null)
    const tradingFallbackMessage = 'Trading agents decision is unavailable right now.'
    try {
      const route = USE_INTERNAL_TA ? '/api/trading/decision/internal' : '/api/trading/decision'
      const tradingResponse = await fetch(`${API_BASE_URL}${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol })
      })
      if (tradingResponse.ok) {
        const tradingData: TradingAgentsDecision = await tradingResponse.json()
        setTradingDecision(tradingData)
        setTradingError(null)
      } else {
        const rawBody = await tradingResponse.text()
        let message = tradingFallbackMessage
        if (rawBody) {
          try {
            const parsed = JSON.parse(rawBody) as { error?: unknown }
            const extracted = String(parsed.error ?? '').trim()
            if (extracted) message = extracted
            else if (rawBody.trim()) message = rawBody.trim()
          } catch {
            if (rawBody.trim()) message = rawBody.trim()
          }
        }
        setTradingDecision(null)
        setTradingError(message)
      }
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? `Trading agents error: ${error.message}` : tradingFallbackMessage
      setTradingDecision(null)
      setTradingError(message)
    } finally {
      setIsTradingLoading(false)
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

    if (loadError && !reportData) {
      return <Placeholder text={loadError} />
    }

    if (!reportData) {
      return (
        <Placeholder text="Provide a ticker symbol to see valuation metrics, trends, and qualitative insights." />
      )
    }

    const { ticker, data } = reportData

    const fundamentalMetrics = [
      { label: 'Last Price', value: data.price },
      { label: 'Market Cap', value: data.marketCap },
      { label: 'P/E (TTM)', value: data.pe },
      { label: 'EPS (TTM)', value: data.eps },
      { label: 'Revenue Growth', value: data.revenueGrowth },
      { label: 'Operating Margin', value: data.operatingMargin },
      { label: 'Dividend Yield', value: data.dividendYield },
      { label: 'Free Cash Flow', value: data.freeCashFlow },
      { label: 'Debt / Equity', value: data.debtToEquity },
      { label: 'Earnings Revision', value: data.earningsRevision },
      { label: 'Risk Rating (AI)', value: data.rating }
    ]

    const technicalStats = [
      { label: 'RSI (14)', value: data.technical.rsi, detail: data.technical.rsiBias },
      {
        label: 'MACD',
        value: data.technical.macdLine,
        detail: `Signal ${data.technical.macdSignal} / ${data.technical.macdView}`
      },
      {
        label: 'Price vs 50 DMA',
        value: data.technical.priceVs50,
        detail: `vs 200 DMA ${data.technical.priceVs200}`
      },
      {
        label: 'Momentum Score',
        value: data.technical.momentumScore,
        detail: data.technical.accDist
      },
      {
        label: 'Key Levels',
        value: `${data.technical.support} / ${data.technical.resistance}`,
        detail: 'Support / Resistance'
      },
      {
        label: 'Average Volume',
        value: data.technical.avgVolume,
        detail: `ATR (14): ${data.technical.atr}`
      }
    ]

    return (
      <div className="flex flex-col gap-6">
        {loadError && reportData ? (
          <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-100">
            {loadError}
          </div>
        ) : null}
        {assessmentError ? (
          <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-100">
            {assessmentError}
          </div>
        ) : null}
        <article
          id="snapshot"
          ref={(node) => {
            scrollTargets.current.snapshot = node
          }}
          className="glass-panel space-y-6 p-6 sm:p-8"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-sky-300/80">Signal Monitor</p>
              <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{ticker} Snapshot</h2>
              <p className="mt-2 text-sm text-slate-300">
                Blend of market structure, fundamentals, and AI insight.
              </p>
            </div>
            <div className="flex rounded-full bg-white/10 p-1 text-sm font-semibold">
              <button
                type="button"
                className={clsx(
                  'rounded-full px-4 py-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60',
                  snapshotView === 'fundamental'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-200 hover:bg-white/10'
                )}
                onClick={() => setSnapshotView('fundamental')}
              >
                Fundamental Pulse
              </button>
              <button
                type="button"
                className={clsx(
                  'rounded-full px-4 py-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60',
                  snapshotView === 'technical'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-200 hover:bg-white/10'
                )}
                onClick={() => setSnapshotView('technical')}
              >
                Technical Playbook
              </button>
            </div>
          </div>

          {snapshotView === 'fundamental' ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {fundamentalMetrics.map((metric) => (
                <div
                  key={metric.label}
                  className={clsx(
                    'rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-white/20',
                    metric.label === 'Risk Rating (AI)' && 'border-emerald-400/40 bg-emerald-400/10'
                  )}
                >
                  <p
                    className={clsx(
                      'text-xs uppercase tracking-[0.3em] text-slate-400',
                      metric.label === 'Risk Rating (AI)' && 'text-emerald-200'
                    )}
                  >
                    {metric.label}
                  </p>
                  <p
                    className={clsx(
                      'mt-3 text-lg font-semibold text-white',
                      metric.label === 'Risk Rating (AI)' && 'text-emerald-100'
                    )}
                  >
                    {metric.value}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {technicalStats.map((stat) => (
                  <div key={stat.label} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{stat.label}</p>
                    <p className="mt-3 text-xl font-semibold text-white">{stat.value}</p>
                    <p className="mt-2 text-sm text-slate-300">{stat.detail}</p>
                  </div>
                ))}
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-sky-400/30 bg-sky-500/10 p-5">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-100">Session Play</h3>
                  <p className="mt-2 text-sm text-slate-100/90">{data.technical.sessionPlan}</p>
                </div>
                <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-5">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-rose-100">Risk Controls</h3>
                  <p className="mt-2 text-sm text-slate-100/90">{data.technical.riskNote}</p>
                </div>
              </div>
            </div>
          )}
        </article>

        <article
          id="drivers"
          ref={(node) => {
            scrollTargets.current.drivers = node
          }}
          className="glass-panel space-y-4 p-6 sm:p-8"
        >
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-sky-300/80">Fundamentals</p>
            <h2 className="text-xl font-semibold text-white">Valuation Drivers</h2>
          </div>
          <ul className="space-y-3 text-sm leading-relaxed text-slate-200">
            {data.keyDrivers.map((item) => (
              <li key={item} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                {item}
              </li>
            ))}
          </ul>
        </article>

        <article
          id="scenarios"
          ref={(node) => {
            scrollTargets.current.scenarios = node
          }}
          className="glass-panel space-y-4 p-6 sm:p-8"
        >
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-sky-300/80">Price Map</p>
            <h2 className="text-xl font-semibold text-white">Scenario Targets</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.priceTargets.map((target) => (
              <div
                key={target.label}
                className="rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-sky-400/30"
              >
                <span className="inline-flex items-center rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-sky-100">
                  {target.probability}
                </span>
                <h3 className="mt-3 text-lg font-semibold text-white">{target.label}</h3>
                <div className="mt-2 text-2xl font-bold text-white">{target.price}</div>
                <p className="mt-2 text-sm text-slate-300">{target.note}</p>
              </div>
            ))}
          </div>
        </article>

        <article
          id="catalysts"
          ref={(node) => {
            scrollTargets.current.catalysts = node
          }}
          className="glass-panel space-y-6 p-6 sm:p-8"
        >
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-sky-300/80">Playbook</p>
            <h2 className="text-xl font-semibold text-white">Catalysts & Risks</h2>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-200">Catalysts</h3>
              <ul className="space-y-3 text-sm leading-relaxed text-slate-200">
                {data.catalysts.map((item) => (
                  <li key={item} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-rose-200">Risks</h3>
              <ul className="space-y-3 text-sm leading-relaxed text-slate-200">
                {data.risks.map((item) => (
                  <li key={item} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </article>

        <article
          id="social"
          ref={(node) => {
            scrollTargets.current.social = node
          }}
          className="glass-panel space-y-5 p-6 sm:p-8"
        >
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-sky-300/80">Reddit Intelligence</p>
            <h2 className="text-xl font-semibold text-white">Social Buzz</h2>
          </div>
          {socialError ? (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
              {socialError}
            </div>
          ) : socialInsights ? (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Total Posts (7d)</p>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    {socialInsights.totalPosts.toLocaleString('en-US')}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Total Upvotes</p>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    {socialInsights.totalUpvotes.toLocaleString('en-US')}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Avg Comments</p>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    {new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(
                      socialInsights.averageComments
                    )}
                  </p>
                </div>
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-200">Active Subreddits</h3>
                  {socialInsights.topSubreddits.length === 0 ? (
                    <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                      No subreddit activity detected.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {socialInsights.topSubreddits.map((item) => (
                        <li
                          key={item.name}
                          className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
                        >
                          <span className="font-semibold text-white">r/{item.name}</span>
                          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-200">
                            {item.mentions}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-200">Top Mentions</h3>
                  {socialInsights.posts.length === 0 ? (
                    <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                      No trending posts for this ticker yet.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {socialInsights.posts.slice(0, 5).map((post) => (
                        <li key={post.id}>
                          <a
                            href={post.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-sky-400/30 hover:bg-sky-500/10"
                          >
                            <span className="font-semibold text-white">{post.title}</span>
                            <span className="mt-2 block text-xs text-slate-300">
                              r/{post.subreddit} - {formatRelativeTime(post.createdAt)} - upvotes {post.score.toLocaleString('en-US')} - comments {post.comments.toLocaleString('en-US')}
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Search: {socialInsights.query} - Updated{' '}
                {new Date(socialInsights.lastUpdated).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit'
                })}
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
              No Reddit conversations available.
            </div>
          )}
        </article>

        {/* Trading section removed from research content; moved to its own tab below */}
        <article
          id="analyst"
          ref={(node) => {
            scrollTargets.current.analyst = node
          }}
          className="glass-panel space-y-4 p-6 sm:p-8"
        >
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-sky-300/80">Analyst Desk</p>
            <h2 className="text-xl font-semibold text-white">Analyst Take</h2>
          </div>
          <p className="leading-relaxed text-slate-200">{data.summary}</p>
        </article>

        <p className="text-xs uppercase tracking-[0.35em] text-slate-500">
          Mock data refreshed {data.asOf}
        </p>
      </div>
    )
  }, [assessmentError, isLoading, loadError, reportData, snapshotView, socialError, socialInsights, tradingDecision, tradingError])

  return (
    <div className="min-h-screen px-4 py-10 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 lg:flex-row">
        <aside className="order-2 flex flex-col gap-6 lg:order-1 lg:w-80">
          <div className="glass-panel space-y-3 p-6">
            <p className="text-xs uppercase tracking-[0.35em] text-sky-300/80">Navigator</p>
            <h2 className="text-2xl font-semibold text-white">Research Hub</h2>
            <p className="text-sm text-slate-300">
              Use quick picks or revisit a ticker to regenerate its mock insights.
            </p>
          </div>

          <section className="glass-panel space-y-4 p-6">
            <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-300">Quick Picks</h3>
            <div className="flex flex-wrap gap-2">
              {quickPicks.map((symbol) => (
                <button
                  key={symbol}
                  type="button"
                  className="pill-button px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em]"
                  onClick={() => handleGenerate(symbol)}
                >
                  {symbol}
                </button>
              ))}
            </div>
          </section>

          <section className="glass-panel space-y-4 p-6">
            <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-300">Report Sections</h3>
            <ul className="space-y-2">
              {reportSections.map((section) => (
                <li key={section.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-slate-200 transition hover:border-sky-400/30 hover:bg-sky-500/10 hover:text-white"
                    onClick={() => handleSectionScroll(section.id)}
                  >
                    <span>{section.label}</span>
                    <span className="text-xs text-slate-400">View</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="glass-panel space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-300">History</h3>
              <button
                type="button"
                className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400 transition hover:text-sky-200"
                onClick={() => setHistory([])}
              >
                Clear
              </button>
            </div>
            <ul className="space-y-3">
              {history.length === 0 ? (
                <li className="rounded-2xl border border-dashed border-white/20 p-4 text-sm text-slate-300">
                  No reports yet.
                </li>
              ) : (
                history.map((entry) => (
                  <li key={entry.ticker}>
                    <button
                      type="button"
                      className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-sky-400/30 hover:bg-sky-500/10"
                      onClick={() => handleGenerate(entry.ticker)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-semibold text-white">{entry.ticker}</span>
                        <span className="text-sm text-slate-300">{entry.data.price}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                        <span className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 font-semibold uppercase tracking-[0.3em] text-emerald-200">
                          {entry.data.rating}
                        </span>
                        <span>{entry.data.asOf}</span>
                      </div>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </section>
        </aside>

        <main className="order-1 flex-1 space-y-8 lg:order-2">
          <header className="space-y-3">
            <p className="text-xs uppercase tracking-[0.35em] text-sky-300/80">Aurora Desk</p>
            <h1 className="text-3xl font-semibold text-white sm:text-4xl">Equity Insight</h1>
            <p className="max-w-2xl text-slate-300">
              Generate a quick equity snapshot by entering a stock ticker symbol.
            </p>
          </header>

          <section className="glass-panel p-6 sm:p-8">
            <form autoComplete="off" onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-3">
                <label
                  htmlFor="ticker"
                  className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-300"
                >
                  Ticker Symbol
                </label>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    id="ticker"
                    name="ticker"
                    type="text"
                    placeholder="AAPL"
                    maxLength={8}
                    value={tickerInput}
                    onChange={(event) => setTickerInput(event.target.value.toUpperCase())}
                    className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-lg font-semibold uppercase tracking-[0.35em] text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                    required
                  />
                  <button type="submit" className="pill-button px-6 py-3 text-xs uppercase tracking-[0.3em]">
                    Generate
                  </button>
                </div>
              </div>
              <p className="text-sm text-slate-400">
                We blend Finnhub fundamentals, OpenAI commentary, and Reddit sentiment for rapid context.
              </p>
            </form>
          </section>

          {/* Top-level tabs: Research vs Trading */}
          <div className="glass-panel p-1 text-sm font-semibold">
            <div className="flex rounded-full bg-white/10 p-1">
              <button
                type="button"
                className={clsx(
                  'rounded-full px-4 py-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60',
                  mainTab === 'research' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-200 hover:bg-white/10'
                )}
                onClick={() => setMainTab('research')}
              >
                Research
              </button>
              <button
                type="button"
                className={clsx(
                  'rounded-full px-4 py-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60',
                  mainTab === 'trading' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-200 hover:bg-white/10'
                )}
                onClick={() => setMainTab('trading')}
              >
                Trading Agents
              </button>
            </div>
          </div>

          {mainTab === 'research' ? (
            <section className="space-y-6" aria-live="polite" aria-busy={isLoading}>
              {reportContent}
            </section>
          ) : (
            <section className="space-y-6" aria-live="polite" aria-busy={isTradingLoading}>
              <article className="glass-panel space-y-5 p-6 sm:p-8">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-sky-300/80">Trading Agents</p>
                    <h2 className="text-xl font-semibold text-white">Manual Run</h2>
                    <p className="mt-1 text-sm text-slate-300">Run the multi-agent trading assessment on demand.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-300">Ticker:</span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-semibold uppercase tracking-[0.3em] text-white">
                      {reportData?.ticker || tickerInput || '—'}
                    </span>
                    <button
                      type="button"
                      onClick={runTradingAgents}
                      disabled={isTradingLoading || !(reportData?.ticker || tickerInput)}
                      className={clsx(
                        'pill-button px-4 py-2 text-xs uppercase tracking-[0.3em]',
                        (isTradingLoading || !(reportData?.ticker || tickerInput)) && 'opacity-60'
                      )}
                    >
                      {isTradingLoading ? 'Running…' : 'Run Trading Agents'}
                    </button>
                  </div>
                </div>

                {tradingError ? (
                  <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                    {tradingError}
                  </div>
                ) : tradingDecision ? (
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-sky-400/30 bg-sky-500/10 p-5">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-100">Headline Decision</h3>
                      <p className="mt-2 text-lg font-semibold text-white">
                        {tradingDecision.decision ?? tradingDecision.finalTradeDecision ?? 'Decision unavailable'}
                      </p>
                      <p className="mt-2 text-xs text-slate-300">Trade date: {tradingDecision.tradeDate}</p>
                    </div>
                    {/* Stacked, single-column content cards for readability */}
                    <div className="space-y-4">
                      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400/80"></span>
                          <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-200">Trader Plan</h3>
                        </div>
                        <div className="mt-3 text-[0.95rem]">
                          <StyledText text={tradingDecision.traderPlan ?? 'No trader plan returned.'} />
                        </div>
                      </section>

                      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-2 w-2 rounded-full bg-sky-400/80"></span>
                          <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-200">Investment Plan</h3>
                        </div>
                        <div className="mt-3 text-[0.95rem]">
                          <StyledText text={tradingDecision.investmentPlan ?? 'No investment plan returned.'} />
                        </div>
                      </section>

                      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-2 w-2 rounded-full bg-indigo-400/80"></span>
                          <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-200">Investment Judge</h3>
                        </div>
                        <div className="mt-3 text-[0.95rem]">
                          <StyledText text={tradingDecision.investmentJudge ?? 'No judge commentary returned.'} />
                        </div>
                      </section>

                      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-2 w-2 rounded-full bg-rose-400/80"></span>
                          <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-200">Risk Judge</h3>
                        </div>
                        <div className="mt-3 text-[0.95rem]">
                          <StyledText text={tradingDecision.riskJudge ?? 'No risk commentary returned.'} />
                        </div>
                      </section>
                    </div>
                  </div>
                ) : (
                  <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                    {isTradingLoading ? 'Running trading agents…' : 'Click "Run Trading Agents" to generate the decision.'}
                  </p>
                )}
              </article>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}

export default EquityInsight










