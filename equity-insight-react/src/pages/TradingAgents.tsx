import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, Loader2 } from 'lucide-react'

import { TradingAgentsLayout } from '../components/trading/TradingAgentsLayout'
import { TradingProgress } from '../components/trading/TradingProgress'
import { Button } from '../components/ui/button'
import { Checkbox } from '../components/ui/checkbox'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Badge } from '../components/ui/badge'
import { useToast } from '../components/ui/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { ScrollArea } from '../components/ui/scroll-area'
import { useTradingProgress } from '../hooks/useTradingProgress'
import { useTradingAssessments } from '../hooks/useTradingAssessments'
import type { TradingAssessmentSummary } from '../hooks/useTradingAssessments'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { cn } from '../lib/utils'
import { sendAnalyticsEvent } from '../lib/analytics'

type TradingAgentsDecision = {
  symbol: string
  decision?: string
  finalTradeDecision?: string
  tradeDate?: string
  traderPlan?: string
  investmentPlan?: string
  investmentJudge?: string
  riskJudge?: string
  rawJson?: unknown
  modelId?: string | null
  analysts?: string[]
  runId?: string
}

type AnalystOption = {
  id: string
  label: string
  description: string
  accent: string
}

const ANALYST_OPTIONS: AnalystOption[] = [
  {
    id: 'fundamental',
    label: 'Fundamental',
    description: 'Valuation, earnings quality, and financial health.',
    accent: 'bg-emerald-500/60 text-emerald-100'
  },
  {
    id: 'market',
    label: 'Market',
    description: 'Price action, volume, and order flow context.',
    accent: 'bg-sky-500/60 text-sky-100'
  },
  {
    id: 'news',
    label: 'News',
    description: 'Headline catalysts and sentiment scanning.',
    accent: 'bg-amber-500/60 text-amber-100'
  },
  {
    id: 'social',
    label: 'Social',
    description: 'Community chatter and alternative signals.',
    accent: 'bg-fuchsia-500/60 text-fuchsia-100'
  }
]

const MODEL_OPTIONS = [
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', description: 'Optimized for cost-sensitive daily workflows.' },
  { id: 'gpt-4o', label: 'GPT-4o', description: 'Premium accuracy for high-stakes runs.' },
  { id: 'gpt-5-mini', label: 'GPT-5 Mini', description: 'Next-gen reasoning with fast responses.' },
  { id: 'gpt-5-nano', label: 'GPT-5 Nano', description: 'Ultra-light deployment for rapid iterations.' },
  { id: 'gpt-5', label: 'GPT-5', description: 'Flagship capability balanced for most desks.' },
  { id: 'gpt-5-pro', label: 'GPT-5 Pro', description: 'Top-tier insights when every basis point counts.' }
]

const DEFAULT_ANALYST_SELECTION = ANALYST_OPTIONS.map((analyst) => analyst.id)

type AgentTextBlockProps = {
  text?: string
  emptyLabel?: string
}

const AgentTextBlock = ({ text, emptyLabel = 'No output provided yet.' }: AgentTextBlockProps) => {
  if (!text || typeof text !== 'string') {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>
  }

  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const blocks: ReactNode[] = []

  const isBullet = (line: string) => /^\s*[-*]\s+/.test(line)
  const isNumbered = (line: string) => /^\s*\d+[.)]\s+/.test(line)

  for (let i = 0; i < lines.length; ) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }

    if (isBullet(line) || isNumbered(line)) {
      const items: string[] = []
      const matcher = isBullet(line) ? isBullet : isNumbered
      while (i < lines.length && matcher(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, '').replace(/^\s*\d+[.)]\s+/, '').trim())
        i++
      }
      blocks.push(
        <ul key={`ul-${i}`} className="ml-4 list-disc space-y-1 text-sm text-muted-foreground">
          {items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      )
      continue
    }

    const paragraphLines: string[] = []
    while (i < lines.length && lines[i].trim() && !isBullet(lines[i]) && !isNumbered(lines[i])) {
      paragraphLines.push(lines[i])
      i++
    }
    blocks.push(
      <p key={`p-${i}`} className="text-sm leading-6 text-muted-foreground">
        {paragraphLines.join(' ').trim()}
      </p>
    )
  }

  return <div className="space-y-3">{blocks}</div>
}

const TradingAgents = () => {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000'
  const navigate = useNavigate()
  const { toast } = useToast()

  const [ticker, setTicker] = useState('')
  const [modelId, setModelId] = useState(MODEL_OPTIONS[0]?.id ?? '')
  const [selectedAnalysts, setSelectedAnalysts] = useState<string[]>(DEFAULT_ANALYST_SELECTION)
  const [tradingDecision, setTradingDecision] = useState<TradingAgentsDecision | null>(null)
  const [tradingError, setTradingError] = useState<string | null>(null)
  const [isTradingLoading, setIsTradingLoading] = useState(false)
  const [progressRunId, setProgressRunId] = useState<string | null>(null)

  const { state: progressState, disconnect: disconnectProgress } = useTradingProgress<TradingAgentsDecision>(
    progressRunId,
    {
      apiBaseUrl: API_BASE_URL,
      parseResult: (input) => input as TradingAgentsDecision,
      enabled: Boolean(progressRunId)
    }
  )

  const tradingRequestController = useRef<AbortController | null>(null)
  const tradingCancelPending = useRef(false)

  const {
    assessments: tradingHistory,
    query: tradingHistoryQuery
  } = useTradingAssessments(ticker, {
    apiBaseUrl: API_BASE_URL
  })

  const hero = (
    <div className="space-y-6">
      <Button
        type="button"
        variant="ghost"
        onClick={() => navigate('/')}
        className="inline-flex items-center gap-2 self-start rounded-full border border-border/60 bg-background/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground transition hover:border-cyan-400/60 hover:bg-cyan-500/10 hover:text-cyan-200"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back
      </Button>
      <div className="max-w-3xl space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">Trading Agents Command Center</h1>
        <p className="text-base leading-7 text-muted-foreground sm:text-lg">
          Configure the analyst cohort, choose your execution model, and watch LangGraph stages stream live as the desk
          debates the trade. This is the dedicated workspace for agent-driven market calls.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.3em] text-muted-foreground/70">
        <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1">
          Real-time SSE updates
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1">
          Analyst personas
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1">
          LangGraph workflow
        </span>
      </div>
    </div>
  )

  const selectedAnalystDetails = useMemo(() => {
    const ids = tradingDecision?.analysts ?? selectedAnalysts
    return ANALYST_OPTIONS.filter((analyst) => ids.includes(analyst.id))
  }, [tradingDecision?.analysts, selectedAnalysts])

  const showTradingProgress =
    progressState.runId !== null &&
    (progressState.status === 'connecting' || progressState.status === 'streaming')

  const handleAnalystToggle = (analystId: string) => {
    setSelectedAnalysts((prev) =>
      prev.includes(analystId) ? prev.filter((id) => id !== analystId) : [...prev, analystId]
    )
  }

  const runTradingAgents = async () => {
    const symbol = ticker.trim().toUpperCase()
    if (!symbol) {
      setTradingError('Enter a ticker symbol to run the agents.')
      return
    }

    if (selectedAnalysts.length === 0) {
      setTradingError('Select at least one analyst persona.')
      return
    }

    setIsTradingLoading(true)
    setTradingDecision(null)
    setTradingError(null)
    tradingCancelPending.current = false

    const controller = new AbortController()
    tradingRequestController.current?.abort()
    tradingRequestController.current = controller

    const runId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2, 10)

    setProgressRunId(runId)

    const fallbackMessage = 'Trading agents decision is unavailable right now.'

    try {
      const response = await fetch(`${API_BASE_URL}/api/trading/decision/internal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, runId, modelId, analysts: selectedAnalysts }),
        signal: controller.signal
      })

      if (response.ok) {
        const data: TradingAgentsDecision = await response.json()
        setTradingDecision(data)
        setTradingError(null)
      } else {
        setProgressRunId(null)
        disconnectProgress()
        const rawBody = await response.text()
        let message = fallbackMessage
        if (rawBody) {
          try {
            const parsed = JSON.parse(rawBody) as { error?: unknown }
            const extracted = String(parsed.error ?? '').trim()
            if (extracted) {
              message = extracted
            } else if (rawBody.trim()) {
              message = rawBody.trim()
            }
          } catch {
            if (rawBody.trim()) message = rawBody.trim()
          }
        }
        setTradingDecision(null)
        setTradingError(message)
        toast({
          title: 'Trading agents error',
          description: message,
          variant: 'destructive'
        })
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        if (!tradingCancelPending.current) {
          const message = 'Trading agents request was aborted.'
          setTradingDecision(null)
          setTradingError(message)
          toast({
            title: 'Trading agents aborted',
            description: message,
            variant: 'destructive'
          })
        }
      } else {
        console.error(error)
        setProgressRunId(null)
        disconnectProgress()
        const message = error instanceof Error ? `Trading agents error: ${error.message}` : fallbackMessage
        setTradingDecision(null)
        setTradingError(message)
        toast({
          title: 'Trading agents error',
          description: message,
          variant: 'destructive'
        })
      }
    } finally {
      if (tradingRequestController.current === controller) {
        tradingRequestController.current = null
      }
      tradingCancelPending.current = false
      setIsTradingLoading(false)
    }
  }

  const handleCancelTradingRun = () => {
    if (progressState.status !== 'connecting' && progressState.status !== 'streaming') {
      return
    }
    tradingCancelPending.current = true
    tradingRequestController.current?.abort()
    tradingRequestController.current = null
    disconnectProgress()
    setProgressRunId(null)
    setIsTradingLoading(false)
    setTradingDecision(null)
    setTradingError(null)
    toast({
      title: 'Trading run cancelled',
      description: 'Stopped listening for the workflow. You can rerun it at any time.'
    })
  }

  useEffect(() => {
    if (!progressState.runId) return

    if (progressState.status === 'complete' && progressState.result) {
      const result = progressState.result
      setTradingDecision(result)
      setTradingError(null)
      setIsTradingLoading(false)
      void tradingHistoryQuery.refetch()
      toast({
        title: 'Trading agents complete',
        description: `${result.symbol} decision ready: ${
          result.decision ?? result.finalTradeDecision ?? 'Review the output.'
        }`
      })
      disconnectProgress()
      setProgressRunId(null)
    } else if (progressState.status === 'error' && progressState.error) {
      const message = progressState.error
      setTradingDecision(null)
      setTradingError(message)
      setIsTradingLoading(false)
      void tradingHistoryQuery.refetch()
      toast({
        title: 'Trading agents error',
        description: message,
        variant: 'destructive'
      })
      disconnectProgress()
      setProgressRunId(null)
    }
  }, [progressState, disconnectProgress, toast])

  useEffect(() => {
    return () => {
      tradingRequestController.current?.abort()
      disconnectProgress()
    }
  }, [disconnectProgress])

  useEffect(() => {
    if (tradingDecision?.runId) {
      void tradingHistoryQuery.refetch()
    }
  }, [tradingDecision?.runId, tradingHistoryQuery])

  const normalizedTicker = ticker.trim().toUpperCase()
  const hasHistory = tradingHistory.length > 0
  const historyLoading = tradingHistoryQuery.status === 'pending' && !hasHistory
  const historyError =
    tradingHistoryQuery.status === 'error' && !hasHistory
      ? tradingHistoryQuery.error?.message ?? null
      : null
  const historyRefreshing = tradingHistoryQuery.isRefetching && hasHistory

  const formatTradeDate = (input: string): string => {
    if (!input) return '—'
    const normalized = input.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      const [year, month, day] = normalized.split('-').map((value) => Number.parseInt(value, 10))
      if ([year, month, day].some((part) => Number.isNaN(part))) {
        return normalized
      }
      const utcDate = new Date(Date.UTC(year, month - 1, day))
      return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
        timeZoneName: 'short'
      }).format(utcDate)
    }
    const parsed = new Date(normalized)
    if (Number.isNaN(parsed.getTime())) {
      return normalized
    }
    return parsed.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    })
  }

  const formatRunTimestamp = (input: string): string => {
    if (!input) return ''
    const parsed = new Date(input)
    if (Number.isNaN(parsed.getTime())) {
      return ''
    }
    return parsed.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    })
  }

  const isDefaultAnalystCohort = (analysts: string[]): boolean => {
    if (analysts.length !== DEFAULT_ANALYST_SELECTION.length) return false
    const sorted = [...analysts].sort()
    const baseline = [...DEFAULT_ANALYST_SELECTION].sort()
    return sorted.every((value, index) => value === baseline[index])
  }

  const resolveModelLabel = (id: string | null): string => {
    if (!id) return 'Unspecified'
    return MODEL_OPTIONS.find((option) => option.id === id)?.label ?? id
  }

  const decisionToneClasses = (decision: string | null): string => {
    const value = (decision ?? '').toUpperCase()
    switch (value) {
      case 'BUY':
        return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
      case 'SELL':
        return 'border-rose-500/40 bg-rose-500/10 text-rose-100'
      case 'HOLD':
        return 'border-amber-500/40 bg-amber-500/10 text-amber-100'
      default:
        return 'border-border/60 bg-border/10 text-muted-foreground'
    }
  }

  const logHistoryRowOpened = (assessment: TradingAssessmentSummary, source: 'row' | 'button' | 'keyboard') => {
    sendAnalyticsEvent('trading_history_row_opened', {
      runId: assessment.runId,
      symbol: assessment.symbol,
      decision: assessment.decision,
      modelId: assessment.modelId,
      analysts: assessment.analysts,
      source,
      triggeredAt: new Date().toISOString()
    })
  }

  const openHistoryDetail = (
    assessment: TradingAssessmentSummary,
    source: 'row' | 'button' | 'keyboard'
  ) => {
    if (!assessment.runId) return
    logHistoryRowOpened(assessment, source)
    const detailPath = `/trading-agents/history/${encodeURIComponent(assessment.runId)}`
    if (typeof window !== 'undefined') {
      window.open(detailPath, '_blank', 'noopener')
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    runTradingAgents()
  }

  const configPanel = (
    <form className="space-y-8" autoComplete="off" onSubmit={handleSubmit}>
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-slate-200/70">Configuration</p>
          <h2 className="text-2xl font-semibold text-foreground">Trading agents run</h2>
          <p className="text-sm text-muted-foreground">
            Tune the inputs for this LangGraph workflow. Disable personas to skip them for the next run.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs uppercase tracking-[0.3em] text-muted-foreground lg:inline">Ticker</span>
          <span className="rounded-full border border-border/60 bg-background/70 px-4 py-1 text-xs font-semibold uppercase tracking-[0.35em] text-muted-foreground">
            {ticker || '—'}
          </span>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)] lg:items-start">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Ticker Symbol</Label>
          <Input
            value={ticker}
            onChange={(event) => setTicker(event.target.value.toUpperCase())}
            placeholder="AAPL"
            maxLength={8}
            className="h-12 rounded-2xl border-border/40 bg-card/70 text-lg font-semibold tracking-[0.35em] text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-cyan-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
          <p className="text-xs text-muted-foreground/80">US-listed tickers only for now. We auto-uppercase your entry.</p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Model</Label>
          <Select value={modelId} onValueChange={setModelId}>
            <SelectTrigger className="h-12 rounded-2xl border-border/40 bg-card/70 text-left text-sm font-medium tracking-[0.05em] text-foreground focus:ring-2 focus:ring-cyan-400/70 focus:ring-offset-2 focus:ring-offset-background">
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
            <SelectContent className="border-border/40 bg-card/95 text-foreground backdrop-blur-xl">
              {MODEL_OPTIONS.map((model) => (
                <SelectItem key={model.id} value={model.id} className="text-sm text-foreground">
                  <div>
                    <p className="font-medium">{model.label}</p>
                    <p className="text-xs text-muted-foreground">{model.description}</p>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground/80">We honor this selection on the backend and fall back to the default env model when omitted.</p>
        </div>

        <div className="lg:col-span-2" />
      </div>

      <div className="space-y-4">
        <Label className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Analyst Personas</Label>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ANALYST_OPTIONS.map((analyst) => {
            const checked = selectedAnalysts.includes(analyst.id)
            return (
              <label
                key={analyst.id}
                className={cn(
                  'group flex items-start gap-3 rounded-2xl border border-border/50 bg-background/40 p-4 transition hover:border-cyan-400/50 hover:bg-cyan-500/10',
                  checked && 'border-cyan-400/70 bg-cyan-500/10'
                )}
              >
                <Checkbox
                  className="mt-1 border-border/60 bg-background/70 transition-colors focus-visible:ring-cyan-400/70 data-[state=checked]:border-cyan-400 data-[state=checked]:bg-cyan-500"
                  checked={checked}
                  onCheckedChange={() => handleAnalystToggle(analyst.id)}
                />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">{analyst.label}</p>
                  <p className="text-xs text-muted-foreground">{analyst.description}</p>
                  <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.3em]', analyst.accent)}>
                    Persona
                  </span>
                </div>
              </label>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground/70">
          Only checked personas participate in the LangGraph pipeline for this run.
        </p>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-xs text-muted-foreground/70">
          Streaming begins immediately after submission. Cancel anytime if the run feels off.
        </p>
        <Button
          type="submit"
          className="w-full rounded-2xl bg-cyan-500 px-6 py-3 text-xs font-semibold uppercase tracking-[0.35em] text-black transition hover:bg-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60 lg:w-auto"
          disabled={isTradingLoading}
        >
          {isTradingLoading ? 'Running…' : 'Run Trading Agents'}
        </Button>
      </div>
    </form>
  )

  const renderDecisionSummary = (decision: TradingAgentsDecision) => {
    const headline = decision.decision ?? decision.finalTradeDecision ?? 'Decision unavailable'
    const tradeDate = decision.tradeDate ? new Date(decision.tradeDate).toLocaleString() : 'Unreported'
    const resolvedModelId = decision.modelId ?? modelId
    const resolvedModelLabel = resolvedModelId
      ? MODEL_OPTIONS.find((option) => option.id === resolvedModelId)?.label ?? resolvedModelId
      : 'Unspecified'

    return (
      <div className="space-y-6">
        <Card className="border border-cyan-500/30 bg-cyan-500/10 shadow-lg shadow-cyan-500/20">
          <CardHeader>
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-200/80">Headline Decision</p>
            <CardTitle className="text-2xl font-semibold text-foreground">{headline}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.25em] text-muted-foreground/80">
              <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1">
                {decision.symbol}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1">
                Trade date: {tradeDate}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1">
                <span title={resolvedModelId ?? undefined}>Model: {resolvedModelLabel}</span>
              </span>
            </div>
            <p className="text-xs text-muted-foreground/70">
              Decisions stream from LangGraph once the workflow finalizes. Expand the tabs below for detailed output.
            </p>
          </CardContent>
        </Card>

        <Tabs defaultValue="summary" className="w-full">
          <TabsList className="grid w-full grid-cols-3 rounded-2xl bg-background/30 p-1 text-xs uppercase tracking-[0.25em] text-muted-foreground">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="analysts">Analysts</TabsTrigger>
            <TabsTrigger value="json">Raw JSON</TabsTrigger>
          </TabsList>
          <TabsContent value="summary" className="mt-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border border-border/60 bg-card/80">
                <CardHeader>
                  <CardTitle className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Trader Plan</CardTitle>
                </CardHeader>
                <CardContent>
                  <AgentTextBlock text={decision.traderPlan} emptyLabel="Trader plan unavailable." />
                </CardContent>
              </Card>
              <Card className="border border-border/60 bg-card/80">
                <CardHeader>
                  <CardTitle className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Investment Plan</CardTitle>
                </CardHeader>
                <CardContent>
                  <AgentTextBlock text={decision.investmentPlan} emptyLabel="Investment plan unavailable." />
                </CardContent>
              </Card>
              <Card className="border border-border/60 bg-card/80">
                <CardHeader>
                  <CardTitle className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Investment Judge</CardTitle>
                </CardHeader>
                <CardContent>
                  <AgentTextBlock text={decision.investmentJudge} emptyLabel="Judge commentary unavailable." />
                </CardContent>
              </Card>
              <Card className="border border-border/60 bg-card/80">
                <CardHeader>
                  <CardTitle className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Risk Judge</CardTitle>
                </CardHeader>
                <CardContent>
                  <AgentTextBlock text={decision.riskJudge} emptyLabel="Risk commentary unavailable." />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          <TabsContent value="analysts" className="mt-4">
            <div className="rounded-2xl border border-border/60 bg-card/80 p-6">
              <p className="text-sm text-muted-foreground">
                Analyst coverage is currently informational. The backend will soon respect persona filtering.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                {selectedAnalystDetails.length === 0 ? (
                  <span className="text-xs uppercase tracking-[0.25em] text-muted-foreground/80">
                    No analysts ran for this decision.
                  </span>
                ) : (
                  selectedAnalystDetails.map((analyst) => (
                    <Badge
                      key={analyst.id}
                      variant="outline"
                      className="border-cyan-400/60 bg-cyan-500/10 text-xs font-medium uppercase tracking-[0.25em] text-cyan-100"
                    >
                      {analyst.label}
                    </Badge>
                  ))
                )}
              </div>
            </div>
          </TabsContent>
          <TabsContent value="json" className="mt-4">
            <Card className="border border-border/60 bg-card/80">
              <CardHeader>
                <CardTitle className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Decision Payload</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[320px] rounded-2xl border border-border/50 bg-background/40 p-4 text-xs text-muted-foreground">
                  <pre className="whitespace-pre-wrap break-words">
                    {JSON.stringify(decision, null, 2)}
                  </pre>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    )
  }

  const renderHistoryPanel = () => {
    const hasTicker = normalizedTicker.length >= 2

    let body: ReactNode
    if (!hasTicker) {
      body = (
        <div className="rounded-2xl border border-dashed border-border/40 bg-background/30 p-6 text-sm text-muted-foreground">
          Start typing a symbol (at least two characters) to surface the most recent Trading Agents runs.
        </div>
      )
    } else if (historyLoading) {
      body = (
        <div className="flex items-center gap-3 rounded-2xl border border-border/40 bg-background/30 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-cyan-300" aria-hidden />
          Loading recent assessments for {normalizedTicker}…
        </div>
      )
    } else if (historyError) {
      body = (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-sm text-rose-100">
          {historyError}
        </div>
      )
    } else if (tradingHistory.length === 0) {
      body = (
        <div className="rounded-2xl border border-border/40 bg-background/30 p-6 text-sm text-muted-foreground">
          No prior Trading Agents runs recorded for {normalizedTicker}. Launch a run to populate history.
        </div>
      )
    } else {
      body = (
        <div className="space-y-4">
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px] uppercase tracking-[0.25em]">Trade date</TableHead>
                <TableHead className="w-[120px] uppercase tracking-[0.25em]">Decision</TableHead>
                <TableHead className="uppercase tracking-[0.25em]">Model</TableHead>
                <TableHead className="uppercase tracking-[0.25em]">Analysts</TableHead>
                <TableHead className="w-[180px] uppercase tracking-[0.25em]">Run ID</TableHead>
                <TableHead aria-label="actions" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tradingHistory.map((assessment) => {
                const analystsDisplay = assessment.analysts ?? []
                const modelLabel = resolveModelLabel(assessment.modelId)
                const customModel = assessment.modelId ? assessment.modelId !== MODEL_OPTIONS[0]?.id : false
                const defaultCohort = isDefaultAnalystCohort(analystsDisplay)
                const runRecordedAt = formatRunTimestamp(assessment.createdAt)
                return (
                  <TableRow
                    key={assessment.runId}
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer rounded-xl border-border/50 hover:bg-cyan-500/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/80"
                    onClick={() => openHistoryDetail(assessment, 'row')}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openHistoryDetail(assessment, 'keyboard')
                      }
                    }}
                  >
                    <TableCell className="font-medium text-foreground">
                      <span className="block">{formatTradeDate(assessment.tradeDate)}</span>
                      <span className="block text-xs text-muted-foreground/70">
                        Run logged {runRecordedAt || '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          'inline-flex min-w-[4rem] justify-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em]',
                          decisionToneClasses(assessment.decision)
                        )}
                      >
                        {assessment.decision ?? '—'}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-y-1 text-xs text-muted-foreground">
                      <span className="block font-semibold text-foreground">{modelLabel}</span>
                      {assessment.modelId && (
                        <span className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground/70">
                          {assessment.modelId}
                        </span>
                      )}
                      {customModel && (
                        <Badge variant="outline" className="mt-1 border-cyan-400/60 bg-cyan-500/10 text-[0.65rem] uppercase tracking-[0.3em] text-cyan-100">
                          Custom model
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {analystsDisplay.map((analyst) => {
                          const analystMeta = ANALYST_OPTIONS.find((option) => option.id === analyst)
                          return (
                            <Badge
                              key={analyst}
                              variant="outline"
                              className={cn(
                                'rounded-full border-border/60 bg-background/60 text-[0.65rem] uppercase tracking-[0.3em]',
                                analystMeta?.accent ?? ''
                              )}
                            >
                              {analystMeta?.label ?? analyst}
                            </Badge>
                          )
                        })}
                        {defaultCohort ? null : (
                          <Badge
                            variant="outline"
                            className="border-cyan-400/60 bg-cyan-500/10 text-[0.65rem] uppercase tracking-[0.3em] text-cyan-100"
                          >
                            Custom cohort
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                      {assessment.runId}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em]"
                        onClick={(event) => {
                          event.stopPropagation()
                          openHistoryDetail(assessment, 'button')
                        }}
                      >
                        View detail
                        <ArrowUpRight className="h-4 w-4" aria-hidden />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground/70">
            <span>
              Showing {tradingHistory.length} {tradingHistory.length === 1 ? 'result' : 'results'}
            </span>
            {tradingHistoryQuery.hasNextPage ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-full border-cyan-400/60 bg-cyan-500/10 px-3 py-1 text-[0.7rem] uppercase tracking-[0.3em] text-cyan-100 hover:bg-cyan-500/20"
                disabled={tradingHistoryQuery.isFetchingNextPage}
                onClick={() => tradingHistoryQuery.fetchNextPage()}
              >
                {tradingHistoryQuery.isFetchingNextPage ? (
                  <>
                    Loading…
                    <Loader2 className="ml-2 h-3 w-3 animate-spin" aria-hidden />
                  </>
                ) : (
                  'View more'
                )}
              </Button>
            ) : null}
          </div>
        </div>
      )
    }

    return (
      <div className="rounded-3xl border border-border/50 bg-background/40 p-6 shadow-[0_40px_90px_-45px_rgba(59,130,246,0.4)] sm:p-8">
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground/80">Assessment history</p>
            <h3 className="text-xl font-semibold text-foreground">
              Recent trading assessments {hasTicker ? `for ${normalizedTicker}` : ''}
            </h3>
          </div>
          <div className="relative flex items-start justify-between">
            <p className="text-sm text-muted-foreground">
              Pulls the latest Trading Agents runs directly from the command center API. Click a row to open the full
              payload in a new tab.
            </p>
            {historyRefreshing ? (
              <span className="pointer-events-none absolute -top-3 right-0 flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1 text-xs uppercase tracking-[0.25em] text-muted-foreground/70 shadow-md shadow-background/40">
                Refreshing…
                <Loader2 className="h-3 w-3 animate-spin text-cyan-300" aria-hidden />
              </span>
            ) : null}
          </div>
          {body}
        </div>
      </div>
    )
  }

  const mainContent = (
    <>
      <div className="rounded-3xl border border-border/50 bg-background/60 p-6 shadow-[0_40px_90px_-45px_rgba(0,0,0,0.6)] sm:p-8">
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground/80">Workflow Status</p>
            <h2 className="text-2xl font-semibold text-foreground">Live Run Monitor</h2>
            <p className="text-sm text-muted-foreground">
              Once you launch a run, each LangGraph stage streams here with cyan progress accents.
            </p>
          </div>

          {tradingError ? (
            <div className="rounded-2xl border border-amber-400/40 bg-amber-500/15 p-4 text-sm text-amber-100 shadow shadow-amber-500/20">
              {tradingError}
            </div>
          ) : tradingDecision ? (
            renderDecisionSummary(tradingDecision)
          ) : showTradingProgress ? (
            <TradingProgress state={progressState} onCancel={handleCancelTradingRun} />
          ) : (
            <div className="rounded-2xl border border-border/50 bg-muted/20 p-5 text-sm text-muted-foreground">
              Submit a ticker to start a trading run. Progress and results will appear here.
            </div>
          )}
        </div>
      </div>

      {renderHistoryPanel()}
    </>
  )

  return <TradingAgentsLayout hero={hero} configPanel={configPanel} mainContent={mainContent} />
}

export default TradingAgents
