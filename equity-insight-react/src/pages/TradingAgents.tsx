import { Fragment, useEffect, useMemo, useState } from "react"
import { Loader2, RefreshCcw, Sparkles } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { useTradingAgentDetail, useTradingAgentRuns, useTradingAgentsList, useExecuteTradingAgentRun } from "../hooks/useTradingAgentsApi"
import type { TradingAgentRunSummary } from "../types/tradingAgents"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { Button } from "../components/ui/button"
import { Badge } from "../components/ui/badge"
import { Label } from "../components/ui/label"
import { Input } from "../components/ui/input"
import { Textarea } from "../components/ui/textarea"
import { Switch } from "../components/ui/switch"
import { useToast } from "../components/ui/use-toast"
import { cn } from "../lib/utils"

const formatUpdatedAt = (value?: string) => {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

const statusTone = (status: string) => {
  switch (status) {
    case "active":
      return "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
    case "experimental":
      return "bg-amber-500/10 text-amber-200 border-amber-500/30"
    default:
      return "bg-slate-500/10 text-slate-200 border-slate-500/30"
  }
}

const decisionTone = (decision?: string | null) => {
  switch ((decision ?? "").toUpperCase()) {
    case "BUY":
      return "text-emerald-300"
    case "SELL":
      return "text-rose-300"
    case "HOLD":
      return "text-amber-300"
    default:
      return "text-muted-foreground"
  }
}

const parseTickers = (input: string): string[] =>
  input
    .split(/[,\s]+/)
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean)

const TradingAgents = () => {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [tickersInput, setTickersInput] = useState("")
  const [question, setQuestion] = useState("")
  const [modelId, setModelId] = useState("")
  const [useMockData, setUseMockData] = useState(false)

  const { data: agents, isLoading: agentsLoading, error: agentsError } = useTradingAgentsList()

  useEffect(() => {
    if (!selectedAgentId && agents?.length) {
      setSelectedAgentId(agents[0].id)
    }
  }, [agents, selectedAgentId])

  const { data: agentDetail, isLoading: detailLoading, refetch: refetchDetail } = useTradingAgentDetail(selectedAgentId)
  const {
    data: runs,
    isFetching: runsLoading,
    refetch: refetchRuns,
  } = useTradingAgentRuns(selectedAgentId, { limit: 20 })

  const runMutation = useExecuteTradingAgentRun({
    onSuccess: () => {
      toast({
        title: "Run started",
        description: "Your agent run has been submitted and will update shortly.",
      })
      setTickersInput("")
      setQuestion("")
      refetchRuns()
      refetchDetail()
    },
  })

  const handleRunSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedAgentId) {
      toast({ title: "Choose an agent", description: "Select an agent before running.", variant: "destructive" })
      return
    }
    const tickers = parseTickers(tickersInput)
    if (!tickers.length) {
      toast({
        title: "Add at least one ticker",
        description: "Provide comma-separated tickers for the run.",
        variant: "destructive",
      })
      return
    }
    runMutation.mutate({
      agentId: selectedAgentId,
      payload: {
        tickers,
        ...(question.trim() ? { question: question.trim() } : {}),
        ...(modelId.trim() ? { modelId: modelId.trim() } : {}),
        ...(useMockData ? { useMockData } : {}),
      },
    })
  }

  const runColumns = useMemo(() => runs ?? [], [runs])

  const handleNavigateToRun = (run: TradingAgentRunSummary) => {
    if (!selectedAgentId) return
    navigate(`/trading-agents/${selectedAgentId}/runs/${run.id}`)
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10 lg:flex-row">
        <section className="lg:w-1/3 space-y-6">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground/80">Trading Agents</p>
            <h1 className="text-3xl font-semibold tracking-tight">Choose an agent</h1>
            <p className="text-sm text-muted-foreground">
              Pick the research persona that aligns with your task. Agents pulled directly from the admin configuration.
            </p>
          </div>
          <div className="space-y-4">
            {agentsLoading && <p className="text-sm text-muted-foreground">Loading agents…</p>}
            {agentsError && (
              <p className="text-sm text-destructive">Unable to load agents: {agentsError instanceof Error ? agentsError.message : "Unknown error"}</p>
            )}
            {agents?.map((agent) => (
              <button
                key={agent.id}
                type="button"
                onClick={() => setSelectedAgentId(agent.id)}
                className={cn(
                  "w-full rounded-2xl border px-4 py-3 text-left transition",
                  selectedAgentId === agent.id
                    ? "border-cyan-400/70 bg-cyan-500/10 shadow-lg shadow-cyan-500/10"
                    : "border-border/70 bg-background/40 hover:border-cyan-300/50 hover:bg-cyan-500/5",
                )}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">{agent.name}</h3>
                    <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">{agent.focus} • {agent.horizon}</p>
                  </div>
                  <Badge variant="outline" className={cn("text-xs", statusTone(agent.status))}>
                    {agent.status}
                  </Badge>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{agent.description}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {agent.dataSources.map((source) => (
                    <span
                      key={source}
                      className="rounded-full border border-border/50 px-2 py-0.5 text-xs uppercase tracking-[0.2em] text-muted-foreground"
                    >
                      {source}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground/80">Updated {formatUpdatedAt(agent.updatedAt)}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="flex-1 space-y-8">
          <Card className="border-border/80 bg-background/70">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground/70">Agent Overview</p>
                <CardTitle className="text-2xl font-semibold">
                  {detailLoading ? "Loading agent…" : agentDetail?.name ?? "Select an agent"}
                </CardTitle>
              </div>
              {agentDetail?.promptProfile && (
                <Badge variant="secondary" className="text-xs">
                  Prompt v{agentDetail.promptProfile.version}: {agentDetail.promptProfile.name}
                </Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              {agentDetail ? (
                <Fragment>
                  <p className="text-sm leading-6 text-muted-foreground">{agentDetail.description}</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Defaults</p>
                      <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                        <p>Model: <span className="text-foreground">{agentDetail.defaultModel}</span></p>
                        <p>Horizon: <span className="text-foreground">{agentDetail.horizon}</span></p>
                        <p>Tone: <span className="text-foreground">{agentDetail.tone}</span></p>
                        <p>Risk: <span className="text-foreground">{agentDetail.riskBias}</span></p>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Tool Policy</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {agentDetail.toolPolicy ? (
                          Object.entries(agentDetail.toolPolicy)
                            .filter(([key]) => ["priceData", "indicators", "news", "fundamentals", "macro"].includes(key))
                            .map(([key, value]) => (
                              <Badge key={key} variant={value ? "default" : "outline"}>
                                {key}
                              </Badge>
                            ))
                        ) : (
                          <p className="text-sm text-muted-foreground">Not configured</p>
                        )}
                      </div>
                    </div>
                  </div>
                </Fragment>
              ) : (
                <p className="text-sm text-muted-foreground">{detailLoading ? "Loading agent details…" : "Select an agent to view details."}</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-background/70">
            <CardHeader>
              <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground/70">Run Analysis</p>
              <CardTitle className="text-2xl font-semibold">Submit tickers to this agent</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleRunSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="tickers">Tickers</Label>
                  <Input
                    id="tickers"
                    placeholder="e.g. AAPL, MSFT"
                    value={tickersInput}
                    onChange={(event) => setTickersInput(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="question">Question (optional)</Label>
                  <Textarea
                    id="question"
                    placeholder="Any additional context or question for the agent"
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    rows={3}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="model">Model override</Label>
                    <Input
                      id="model"
                      placeholder={agentDetail?.defaultModel ?? "Inherited from agent"}
                      value={modelId}
                      onChange={(event) => setModelId(event.target.value)}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-border/70 px-4 py-3">
                    <div>
                      <Label className="text-sm font-semibold">Use mock data</Label>
                      <p className="text-xs text-muted-foreground">Bypass live orchestration for testing.</p>
                    </div>
                    <Switch checked={useMockData} onCheckedChange={setUseMockData} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" disabled={runMutation.isPending || !selectedAgentId} className="inline-flex items-center gap-2">
                    {runMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Run agent
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setTickersInput("")
                      setQuestion("")
                      setModelId("")
                      setUseMockData(false)
                    }}
                  >
                    Reset form
                  </Button>
                </div>
                {runMutation.error && (
                  <p className="text-sm text-destructive">
                    {runMutation.error instanceof Error ? runMutation.error.message : "Unable to start run."}
                  </p>
                )}
              </form>
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-background/70">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground/70">Recent Runs</p>
                <CardTitle className="text-xl font-semibold">Latest activity</CardTitle>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => refetchRuns()}>
                <RefreshCcw className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {runsLoading && <p className="text-sm text-muted-foreground">Loading run history…</p>}
              {!runsLoading && runColumns.length === 0 && (
                <p className="text-sm text-muted-foreground">No runs yet for this agent.</p>
              )}
              <div className="space-y-3">
                {runColumns.map((run) => (
                  <div
                    key={run.id}
                    className="rounded-2xl border border-border/70 bg-background/40 px-4 py-3 transition hover:border-cyan-400/60 hover:bg-cyan-500/5"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">{new Date(run.createdAt).toLocaleString()}</p>
                        <p className="text-sm text-muted-foreground">Tickers: {run.tickers.join(", ")}</p>
                      </div>
                      <Badge variant="outline" className={cn("text-xs", statusTone(run.status))}>
                        {run.status}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className={cn("text-lg font-semibold", decisionTone(run.decisionSummary))}>
                        {run.decisionSummary ?? "Pending"}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" variant="secondary" size="sm" onClick={() => handleNavigateToRun(run)}>
                          View detail
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  )
}

export default TradingAgents
