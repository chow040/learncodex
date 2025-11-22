import { useMemo } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Loader2 } from "lucide-react"

import { useTradingAgentRunDetail } from "../hooks/useTradingAgentsApi"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { cn } from "../lib/utils"

const decisionToneClasses = (decision: string | null | undefined): string => {
  switch ((decision ?? "").toUpperCase()) {
    case "BUY":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
    case "SELL":
      return "border-rose-500/40 bg-rose-500/10 text-rose-200"
    case "HOLD":
      return "border-amber-500/40 bg-amber-500/10 text-amber-200"
    default:
      return "border-border/60 bg-border/10 text-muted-foreground"
  }
}

const TradingAgentsHistoryDetail = () => {
  const { agentId = "", runId = "" } = useParams<{ agentId: string; runId: string }>()
  const navigate = useNavigate()
  const { data, isLoading, error, refetch, isFetching } = useTradingAgentRunDetail(agentId, runId)

  const formattedCreatedAt = useMemo(() => {
    if (!data?.createdAt) return ""
    const parsed = new Date(data.createdAt)
    if (Number.isNaN(parsed.getTime())) return data.createdAt
    return parsed.toLocaleString()
  }, [data?.createdAt])

  const questionBlock = data?.question?.trim()
  const tickers = data?.tickers?.join(", ")

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate("/trading-agents")}
            className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground transition hover:border-cyan-400/60 hover:bg-cyan-500/10 hover:text-cyan-200"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to agents
          </Button>
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <span>Agent</span>
            <Badge variant="outline" className="font-mono text-xs">
              {agentId}
            </Badge>
            <span>Run</span>
            <Badge variant="outline" className="font-mono text-xs">
              {runId}
            </Badge>
          </div>
        </div>

        <header className="space-y-3">
          <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground/70">Trading Agents run detail</p>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">Run summary</h1>
          <p className="text-base leading-7 text-muted-foreground sm:text-lg">
            View decision summary, tickers, and metadata produced by the trading agent orchestration.
          </p>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>Executed {formattedCreatedAt || "—"}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Refresh"}
            </Button>
          </div>
        </header>

        {isLoading && (
          <Card className="border-border/70 bg-background/60">
            <CardContent className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading run…
            </CardContent>
          </Card>
        )}

        {error && (
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="py-6 text-sm text-destructive">
              {error instanceof Error ? error.message : "Unable to load run details."}
            </CardContent>
          </Card>
        )}

        {data && (
          <div className="space-y-6">
            <Card className="border-border/70 bg-background/60">
              <CardHeader>
                <CardTitle className="text-xl font-semibold">Inputs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground/70">Tickers</p>
                  <p className="mt-1 font-mono text-lg">{tickers || "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground/70">Question</p>
                  <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{questionBlock || "No additional question supplied."}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-background/60">
              <CardHeader>
                <CardTitle className="text-xl font-semibold">Decision summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Badge
                  variant="outline"
                  className={cn(
                    "inline-flex min-w-[5rem] justify-center rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em]",
                    decisionToneClasses(data.decisionSummary),
                  )}
                >
                  {data.decisionSummary ?? "Pending"}
                </Badge>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground/70">Status</p>
                    <p className="mt-1 font-semibold capitalize">{data.status}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground/70">Confidence</p>
                    <p className="mt-1 font-semibold">{data.confidence ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground/70">Tokens</p>
                    <p className="mt-1 font-semibold">
                      {data.tokensTotal ?? "—"}
                      <span className="text-xs text-muted-foreground"> total</span>
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  This simplified view reflects the current MVP snapshot. Prompt previews and detailed context blocks will be added alongside Phase 4 storage work.
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

export default TradingAgentsHistoryDetail
