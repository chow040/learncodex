import { useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, Clipboard, Loader2 } from 'lucide-react'

import { MarkdownViewer } from '../components/MarkdownViewer'
import { TradingAgentsLayout } from '../components/trading/TradingAgentsLayout'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { ScrollArea } from '../components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { useToast } from '../components/ui/use-toast'
import { cn } from '../lib/utils'
import { useTradingAssessmentDetail } from '../hooks/useTradingAssessmentDetail'
import type { TradingAnalystId } from '../hooks/useTradingAssessments'
import { sendAnalyticsEvent } from '../lib/analytics'

const ANALYST_LABELS: Record<TradingAnalystId, { label: string; accent: string }> = {
  fundamental: { label: 'Fundamental', accent: 'bg-emerald-500/60 text-emerald-100' },
  market: { label: 'Market', accent: 'bg-sky-500/60 text-sky-100' },
  news: { label: 'News', accent: 'bg-amber-500/60 text-amber-100' },
  social: { label: 'Social', accent: 'bg-fuchsia-500/60 text-fuchsia-100' }
}

const MODEL_LABELS: Record<string, string> = {
  'gpt-4o-mini': 'GPT-4o Mini',
  'gpt-4o': 'GPT-4o',
  'gpt-5-mini': 'GPT-5 Mini',
  'gpt-5-nano': 'GPT-5 Nano',
  'gpt-5': 'GPT-5',
  'gpt-5-pro': 'GPT-5 Pro'
}

const formatDateTime = (value: string | null | undefined, fallback = 'Unreported'): string => {
  if (!value) return fallback
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

const formatDuration = (value: number | null | undefined, fallback = '—'): string => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback
  }
  const minutes = value / 60000
  return `${minutes.toFixed(1)} min`
}

const decisionToneClasses = (decision: string | null): string => {
  switch ((decision ?? '').toUpperCase()) {
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

const AgentTextBlock = ({ text, emptyLabel = 'No output provided yet.' }: { text?: string | null; emptyLabel?: string }) => {
  const trimmed = typeof text === 'string' ? text.trim() : ''
  if (!trimmed) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>
  }
  return <MarkdownViewer content={trimmed} />
}

const TradingAgentsHistoryDetail = () => {
  const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()
  if (!API_BASE_URL) {
    throw new Error('VITE_API_BASE_URL is not configured')
  }
  const { runId = '' } = useParams<{ runId: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()

  const { data, isLoading, isFetching, error, refetch } = useTradingAssessmentDetail(runId, {
    apiBaseUrl: API_BASE_URL
  })

  useEffect(() => {
    if (!data) return
    sendAnalyticsEvent('trading_history_detail_viewed', {
      runId: data.runId,
      symbol: data.symbol,
      decision: data.decision,
      modelId: data.modelId,
      viewedAt: new Date().toISOString()
    })
  }, [data])

  const modelLabel = useMemo(() => {
    if (!data?.modelId) return 'Unspecified'
    return MODEL_LABELS[data.modelId] ?? data.modelId
  }, [data?.modelId])

  const heroTitle = data ? `${data.symbol} • ${modelLabel}` : 'Fetching assessment…'

  const analysts = data?.analysts ?? []
  const defaultAnalysts = analysts.length === Object.keys(ANALYST_LABELS).length
  const decisionBadge = (
    <Badge
      variant="outline"
      className={cn(
        'inline-flex min-w-[5rem] justify-center rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em]',
        decisionToneClasses(data?.decision ?? null)
      )}
    >
      {data?.decision ?? '—'}
    </Badge>
  )

  const handleCopyRunId = async () => {
    try {
      await navigator.clipboard.writeText(runId)
      toast({ title: 'Copied', description: 'Run ID copied to clipboard.' })
    } catch (clipError) {
      toast({
        title: 'Copy failed',
        description: clipError instanceof Error ? clipError.message : 'Unable to copy run ID.',
        variant: 'destructive'
      })
    }
  }

  const handleCopyAssessment = async (
    role: TradingAnalystId,
    label: string,
    content: string | null | undefined
  ) => {
    const trimmed = typeof content === 'string' ? content.trim() : ''
    if (!trimmed) return
    try {
      await navigator.clipboard.writeText(trimmed)
      toast({
        title: 'Copied',
        description: `${label} assessment copied to clipboard.`
      })
      sendAnalyticsEvent('trading_history_analyst_copied', {
        runId: data?.runId ?? runId,
        role,
        copiedAt: new Date().toISOString()
      })
    } catch (clipError) {
      toast({
        title: 'Copy failed',
        description: clipError instanceof Error ? clipError.message : 'Unable to copy assessment.',
        variant: 'destructive'
      })
    }
  }

  const hero = (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={() => navigate('/trading-agents')}
          className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground transition hover:border-cyan-400/60 hover:bg-cyan-500/10 hover:text-cyan-200"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to runs
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={handleCopyRunId}
          className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground transition hover:border-cyan-400/60 hover:bg-cyan-500/10 hover:text-cyan-200"
        >
          <Clipboard className="h-4 w-4" aria-hidden />
          Copy run ID
        </Button>
      </div>
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground/80">Trading agents run detail</p>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">{heroTitle}</h1>
        <p className="text-base leading-7 text-muted-foreground sm:text-lg">
          Full payload, analysts, and metadata captured for run <span className="font-mono">{runId}</span>. Use this view
          for audits or comparative reviews across Trading Agents executions.
        </p>
      </div>
    </div>
  )

  const configPanel = (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground/70">Overview</p>
          <h2 className="text-xl font-semibold text-foreground">Run metadata</h2>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full border-cyan-400/60 bg-cyan-500/10 text-[0.7rem] uppercase tracking-[0.3em] text-cyan-100 hover:bg-cyan-500/20"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? (
            <>
              Refreshing…
              <Loader2 className="ml-2 h-3 w-3 animate-spin" aria-hidden />
            </>
          ) : (
            'Refresh'
          )}
        </Button>
      </header>

      {isLoading ? (
        <div className="flex items-center gap-3 rounded-2xl border border-border/50 bg-background/40 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-cyan-300" aria-hidden />
          Loading assessment metadata…
        </div>
      ) : error ? (
        <div className="space-y-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100">
          <p>{error.message}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            className="w-fit rounded-full uppercase tracking-[0.3em]"
          >
            Retry
          </Button>
        </div>
      ) : data ? (
        <dl className="grid gap-4 text-sm text-muted-foreground sm:grid-cols-2">
          <div className="space-y-1">
            <dt className="text-xs uppercase tracking-[0.3em] text-muted-foreground/70">Symbol</dt>
            <dd className="text-lg font-semibold text-foreground">{data.symbol}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs uppercase tracking-[0.3em] text-muted-foreground/70">Trade date</dt>
            <dd>{formatDateTime(data.tradeDate)}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs uppercase tracking-[0.3em] text-muted-foreground/70">Execution time</dt>
            <dd className="tabular-nums">{formatDuration(data.executionMs)}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs uppercase tracking-[0.3em] text-muted-foreground/70">Decision</dt>
            <dd>{decisionBadge}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs uppercase tracking-[0.3em] text-muted-foreground/70">Model</dt>
            <dd className="space-y-1">
              <p className="text-foreground">{modelLabel}</p>
              {data.modelId ? (
                <span className="block font-mono text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground/70">
                  {data.modelId}
                </span>
              ) : null}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs uppercase tracking-[0.3em] text-muted-foreground/70">Run ID</dt>
            <dd className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">{data.runId}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs uppercase tracking-[0.3em] text-muted-foreground/70">Created</dt>
            <dd>{formatDateTime(data.createdAt, 'Unknown')}</dd>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <dt className="text-xs uppercase tracking-[0.3em] text-muted-foreground/70">Orchestrator version</dt>
            <dd>{data.orchestratorVersion ?? 'Unspecified'}</dd>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <dt className="text-xs uppercase tracking-[0.3em] text-muted-foreground/70">Logs path</dt>
            <dd className="flex items-center gap-2 text-xs text-muted-foreground/80">
              {data.logsPath ? (
                <>
                  <span className="font-mono break-all">{data.logsPath}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full text-muted-foreground hover:text-cyan-200"
                    onClick={() => {
                      const logsPathValue = data.logsPath
                      if (!logsPathValue) return
                      const url = logsPathValue.startsWith('http')
                        ? logsPathValue
                        : `${API_BASE_URL.replace(/\/+$/, '')}/${logsPathValue.replace(/^\/+/, '')}`
                      window.open(url, '_blank', 'noopener')
                    }}
                    aria-label="Open logs"
                  >
                    <ArrowUpRight className="h-4 w-4" aria-hidden />
                  </Button>
                </>
              ) : (
                'No logs provided.'
              )}
            </dd>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <dt className="text-xs uppercase tracking-[0.3em] text-muted-foreground/70">Prompt hash</dt>
            <dd className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
              {data.promptHash ?? 'Unavailable'}
            </dd>
          </div>
        </dl>
      ) : null}
    </div>
  )

  const renderAnalysts = () => {
    if (!data) return null
    return (
      <Card className="border border-border/60 bg-card/80">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Analysts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {defaultAnalysts ? (
            <p className="text-sm text-muted-foreground">Full cohort participated in this run.</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              A custom analyst cohort ran. Personas listed below were active for this execution.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {analysts.map((analyst) => {
              const entry = ANALYST_LABELS[analyst]
              return (
                <Badge
                  key={analyst}
                  variant="outline"
                  className={cn(
                    'rounded-full border-border/60 bg-background/60 text-[0.65rem] uppercase tracking-[0.3em]',
                    entry?.accent ?? ''
                  )}
                >
                  {entry?.label ?? analyst}
                </Badge>
              )
            })}
          </div>
        </CardContent>
      </Card>
    )
  }

  const renderAnalystAssessments = () => {
    if (!data) return null
    const sections = data.analystAssessments ?? []
    const anyContent = sections.some((section) => section.content && section.content.trim().length > 0)

    return (
      <Card className="border border-border/60 bg-card/80">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
            Analyst assessments
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!anyContent ? (
            <p className="text-sm text-muted-foreground">
              No analyst assessments were captured for this run.
            </p>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            {sections.map((section) => {
              const meta = ANALYST_LABELS[section.role] ?? {
                label: section.role,
                accent: 'bg-border/20 text-muted-foreground'
              }
              const hasContent = typeof section.content === 'string' && section.content.trim().length > 0
              return (
                <div
                  key={section.role}
                  className="space-y-3 rounded-2xl border border-border/60 bg-background/40 p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-3 py-1 text-[0.65rem] uppercase tracking-[0.3em]',
                          meta.accent
                        )}
                      >
                        {meta.label} Analyst
                      </span>
                      <p className="text-xs text-muted-foreground/80">
                        Snapshot of the {meta.label.toLowerCase()} analyst&apos;s report at decision time.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Copy ${meta.label} analyst assessment`}
                      className="h-8 w-8 rounded-full text-muted-foreground hover:text-cyan-200 disabled:opacity-40"
                      disabled={!hasContent}
                      onClick={() => handleCopyAssessment(section.role, meta.label, section.content)}
                    >
                      <Clipboard className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                  <AgentTextBlock text={section.content} emptyLabel="Not captured for this analyst." />
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    )
  }

  const renderPayload = () => {
    if (!data) return null
    return (
      <Card className="border border-border/60 bg-card/80">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Trading agents payload</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[420px] rounded-2xl border border-border/50 bg-background/40 p-4 text-xs text-muted-foreground">
            <pre className="whitespace-pre-wrap break-words">
              {JSON.stringify(data.payload, null, 2)}
            </pre>
          </ScrollArea>
        </CardContent>
      </Card>
    )
  }

  const renderRawText = () => {
    if (!data) return null
    return (
      <Card className="border border-border/60 bg-card/80">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Raw model output</CardTitle>
        </CardHeader>
        <CardContent>
          {data.rawText ? (
            <ScrollArea className="max-h-[320px] rounded-2xl border border-border/50 bg-background/40 p-4 text-xs text-muted-foreground">
              <pre className="whitespace-pre-wrap break-words">{data.rawText}</pre>
            </ScrollArea>
          ) : (
            <p className="text-sm text-muted-foreground">No raw output stored for this run.</p>
          )}
        </CardContent>
      </Card>
    )
  }

  const renderDecisionPanels = () => {
    if (!data) return null
    const investmentDebateText = (() => {
      const debate = data.investmentDebate?.trim()
      if (debate) return debate
      const bull = data.bullArgument?.trim()
      const bear = data.bearArgument?.trim()
      const sections: string[] = []
      if (bull) sections.push(`### Bull Argument\n${bull}`)
      if (bear) sections.push(`### Bear Argument\n${bear}`)
      return sections.length > 0 ? sections.join('\n\n') : null
    })()

    const riskDebateText = (() => {
      const debate = data.riskDebate?.trim()
      if (debate) return debate
      const aggressive = data.aggressiveArgument?.trim()
      const conservative = data.conservativeArgument?.trim()
      const neutral = data.neutralArgument?.trim()
      const sections: string[] = []
      if (aggressive) sections.push(`### Aggressive Analyst\n${aggressive}`)
      if (conservative) sections.push(`### Conservative Analyst\n${conservative}`)
      if (neutral) sections.push(`### Neutral Analyst\n${neutral}`)
      return sections.length > 0 ? sections.join('\n\n') : null
    })()

    const personaPanels: Array<{ key: string; label: string; value?: string | null; fallback: string }> = [
      { key: 'trader-plan', label: 'Trader (Execution)', value: data.traderPlan, fallback: 'Trader plan unavailable.' },
      { key: 'investment-plan', label: 'Research Manager', value: data.investmentPlan, fallback: 'Research manager plan unavailable.' },
      { key: 'risk-judge', label: 'Risk Manager', value: data.riskJudge, fallback: 'Risk manager commentary unavailable.' },
      { key: 'investment-debate', label: 'Bull vs Bear Debate', value: investmentDebateText, fallback: 'Debate transcript unavailable.' },
      {
        key: 'risk-debate',
        label: 'Risk Debate (Full)',
        value: riskDebateText,
        fallback: 'Risk debate transcript unavailable.'
      },
      {
        key: 'aggressive-analyst',
        label: 'Aggressive Analyst',
        value: data.aggressiveArgument,
        fallback: 'Aggressive analyst argument unavailable.'
      },
      {
        key: 'conservative-analyst',
        label: 'Conservative Analyst',
        value: data.conservativeArgument,
        fallback: 'Conservative analyst argument unavailable.'
      },
      {
        key: 'neutral-analyst',
        label: 'Neutral Analyst',
        value: data.neutralArgument,
        fallback: 'Neutral analyst argument unavailable.'
      }
    ]

    const defaultPersona =
      personaPanels.find((panel) => panel.value && panel.value.trim())?.key ?? personaPanels[0]?.key ?? ''

    return (
      <Card className="border border-border/60 bg-card/80">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Decision outputs</CardTitle>
        </CardHeader>
        <CardContent>
          {personaPanels.length > 0 ? (
            <Tabs
              key={`history-persona-tabs-${data.runId}`}
              defaultValue={defaultPersona}
              className="space-y-4"
            >
              <TabsList className="flex h-auto flex-wrap gap-2 rounded-2xl bg-background/30 p-3">
                {personaPanels.map((panel) => (
                  <TabsTrigger
                    key={panel.key}
                    value={panel.key}
                    className="whitespace-nowrap rounded-full border border-border/60 bg-background/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground transition hover:bg-background/60 data-[state=active]:border-cyan-400/60 data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-100"
                  >
                    {panel.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {personaPanels.map((panel) => (
                <TabsContent key={panel.key} value={panel.key} className="mt-4 rounded-2xl border border-border/60 bg-background/40 p-6">
                  <AgentTextBlock text={panel.value ?? undefined} emptyLabel={panel.fallback} />
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            <div className="rounded-2xl border border-border/60 bg-background/40 p-6 text-sm text-muted-foreground">
              No persona outputs recorded for this run.
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  const mainContent = (
    <div className="space-y-6">
      {isLoading ? (
        <div className="flex items-center gap-3 rounded-3xl border border-border/50 bg-background/40 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-cyan-300" aria-hidden />
          Loading assessment detail…
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-rose-500/40 bg-rose-500/10 p-6 text-sm text-rose-100">
          {error.message}
        </div>
      ) : data ? (
        <>
          <Card className="border border-cyan-500/30 bg-cyan-500/10 shadow-lg shadow-cyan-500/20">
            <CardHeader>
              <p className="text-xs uppercase tracking-[0.35em] text-cyan-200/80">Decision snapshot</p>
              <CardTitle className="flex flex-wrap items-center gap-3 text-2xl font-semibold text-foreground">
                {decisionBadge}
                <span>{data.symbol}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.25em] text-muted-foreground/80">
                <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1">
                  Trade date: {formatDateTime(data.tradeDate)}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1">
                  Orchestrator: {data.orchestratorVersion ?? 'n/a'}
                </span>
              </div>
              <p>
                Review payload and analyst coverage below. Use the raw model output for auditing the original response
                returned by the agents pipeline.
              </p>
            </CardContent>
          </Card>
          {renderDecisionPanels()}
          {renderAnalystAssessments()}
          {renderAnalysts()}
          {renderPayload()}
          {renderRawText()}
        </>
      ) : null}
    </div>
  )

  return (
    <TradingAgentsLayout
      hero={hero}
      configPanel={configPanel}
      mainContent={mainContent}
      configWrapperClassName="border-border/60 bg-card/75"
    />
  )
}

export default TradingAgentsHistoryDetail
