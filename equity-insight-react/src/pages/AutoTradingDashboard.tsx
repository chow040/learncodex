import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, PauseCircle, PlayCircle, RefreshCw } from "lucide-react"
import { formatDistanceToNowStrict } from "date-fns"

import { Container } from "../components/ui/container"
import { Button } from "../components/ui/button"
import { Badge } from "../components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table"
import { Switch } from "../components/ui/switch"
import { Separator } from "../components/ui/separator"
import { ScrollArea } from "../components/ui/scroll-area"
import { cn } from "../lib/utils"
import { mockAutoTradingPortfolio } from "../mocks/autoTradingMockData"
import { useAutoTradingPortfolio } from "../hooks/useAutoTradingPortfolio"
import { useAutoTradingScheduler } from "../hooks/useAutoTradingScheduler"
import { SimulationBanner } from "../components/trading/SimulationBanner"
import type { AutoTradePortfolioSnapshot } from "../types/autotrade"

const AutoTradingDashboard = () => {
  const { data, isLoading, isError } = useAutoTradingPortfolio()
  const portfolio: AutoTradePortfolioSnapshot = data ?? mockAutoTradingPortfolio
  const {
    scheduler,
    isLoading: isSchedulerLoading,
    isError: isSchedulerError,
    pause,
    resume,
    trigger,
    isPausing,
    isResuming,
    isTriggering,
  } = useAutoTradingScheduler()

  const [paperMode, setPaperMode] = useState(portfolio.mode.toLowerCase().includes("paper"))
  const navigate = useNavigate()

  useEffect(() => {
    setPaperMode(portfolio.mode.toLowerCase().includes("paper"))
  }, [portfolio])

  const automationEnabled = scheduler ? !scheduler.isPaused : portfolio.automationEnabled
  const lastRunIso = scheduler?.lastRunAt ?? portfolio.lastRunAt
  const nextRunIso = scheduler?.nextRunAt ?? null

  const handleAutomationToggle = async (checked: boolean) => {
    try {
      if (checked) {
        await resume()
      } else {
        await pause()
      }
    } catch (error) {
      console.warn("Failed to update scheduler state", error)
    }
  }

  const handleEvaluateNow = async () => {
    try {
      await trigger()
    } catch (error) {
      console.warn("Failed to trigger evaluation", error)
    }
  }

  const nextRunEta =
    nextRunIso != null
      ? formatDistanceToNowStrict(new Date(nextRunIso), { addSuffix: true })
      : `${portfolio.nextRunInMinutes} minutes`
  const primaryJob = scheduler?.jobs?.[0]

  const totalPositionsValue = useMemo(
    () =>
      portfolio.positions.reduce(
        (acc, position) => acc + position.quantity * position.markPrice,
        0,
      ),
    [portfolio.positions],
  )

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-background/90 backdrop-blur">
        <Container className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={() => navigate("/")}>
              <ArrowLeft className="h-4 w-4" />
              Back to platform
            </Button>
            <Badge variant={automationEnabled ? "default" : "secondary"} className="uppercase tracking-widest">
              {automationEnabled ? "Automation Active" : "Automation Paused"}
            </Badge>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Automation</span>
              <Switch
                checked={automationEnabled}
                onCheckedChange={(checked) => void handleAutomationToggle(checked)}
                disabled={isSchedulerLoading || isPausing || isResuming}
                aria-label="Toggle automation"
              />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Paper mode</span>
              <Switch checked={paperMode} onCheckedChange={setPaperMode} aria-label="Toggle paper trading mode" />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={isTriggering || isSchedulerLoading}
              onClick={() => void handleEvaluateNow()}
            >
              <RefreshCw className={cn("h-4 w-4", isTriggering && "animate-spin")} />
              Evaluate now
            </Button>
          </div>
        </Container>
      </header>

      <main className="py-10">
        <Container className="space-y-8">
          <SimulationBanner 
            mode={portfolio.mode} 
            lastUpdate={portfolio.lastRunAt}
          />
          {isLoading ? (
            <div className="rounded-lg border border-border/60 bg-background/60 p-6 text-sm text-muted-foreground">
              Loading portfolio…
            </div>
          ) : null}
          {isSchedulerError ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-6 text-sm text-amber-100">
              Scheduler controls unavailable. Showing cached data.
            </div>
          ) : null}
          {isError ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-6 text-sm text-amber-100">
              Live data unavailable. Displaying last known mock snapshot.
            </div>
          ) : null}
          <section className="grid gap-6 md:grid-cols-3">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle>Portfolio Health</CardTitle>
                <CardDescription>
                  Last run at {new Date(lastRunIso).toLocaleTimeString()} UTC
                  {primaryJob?.status === "running" ? " · Evaluation in progress" : null}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-baseline justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Equity</p>
                    <p className="text-2xl font-semibold">${portfolio.equity.toLocaleString()}</p>
                  </div>
                  <Badge className="bg-emerald-500/20 text-emerald-200">
                    PnL {portfolio.pnlPct.toFixed(2)}%
                  </Badge>
                </div>
                <div className="grid gap-2 text-sm text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Available cash</span>
                    <span className="text-foreground">${portfolio.availableCash.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Positions value</span>
                    <span className="text-foreground">${totalPositionsValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Sharpe (since inception)</span>
                    <span className="text-foreground">{portfolio.sharpe.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Max drawdown</span>
                    <span className="text-foreground">{portfolio.drawdownPct.toFixed(1)}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader>
                <CardTitle>Execution Controls</CardTitle>
                <CardDescription>All trades dispatched via Coinbase Advanced Trade sandbox</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Current mode</span>
                  <Badge variant="outline">{paperMode ? "Paper trading" : "Live trading"}</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Next evaluation</span>
                  <span className="text-foreground font-medium">
                    {isSchedulerLoading ? "Loading…" : nextRunEta}
                  </span>
                </div>
                {primaryJob ? (
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Scheduler status</span>
                    <span className="text-foreground font-medium capitalize">{primaryJob.status}</span>
                  </div>
                ) : null}
                <Separator />
                <div className="grid gap-3">
                  <Button
                    variant="outline"
                    className="justify-between"
                    disabled={!automationEnabled || isPausing || isSchedulerLoading}
                    onClick={() => void handleAutomationToggle(false)}
                  >
                    <div className="flex items-center gap-2">
                      <PauseCircle className="h-4 w-4" />
                      Pause automation
                    </div>
                    <span className="text-xs text-muted-foreground">Creates an audit event</span>
                  </Button>
                  <Button
                    className="justify-between bg-emerald-500/90 hover:bg-emerald-500"
                    disabled={isTriggering || isSchedulerLoading}
                    onClick={() => void handleEvaluateNow()}
                  >
                    <div className="flex items-center gap-2">
                      <PlayCircle className={cn("h-4 w-4", isTriggering && "animate-spin")} />
                      Trigger evaluation
                    </div>
                    <span className="text-xs text-emerald-100/90">Runs the next decision cycle now</span>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader>
                <CardTitle>Recent Events</CardTitle>
                <CardDescription>Latest updates to risk settings and funding</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ScrollArea className="h-32 pr-4">
                  <div className="space-y-3 text-sm">
                    {portfolio.events.map((event) => (
                      <div key={event.id} className="rounded-md border border-border/50 bg-background/80 p-3">
                        <p className="font-medium text-foreground">{event.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(event.timestamp).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <Button variant="ghost" size="sm" className="w-full">
                  View full log
                </Button>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 lg:grid-cols-3">
            <Card className="border-border/60 lg:col-span-2">
              <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Open Positions</CardTitle>
                  <CardDescription>Live mark-to-market overview for each asset</CardDescription>
                </div>
                <Badge variant="secondary" className="uppercase tracking-widest">
                  {portfolio.positions.length} assets
                </Badge>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Entry</TableHead>
                      <TableHead className="text-right">Mark</TableHead>
                      <TableHead className="text-right">PnL ($)</TableHead>
                      <TableHead className="text-right">PnL (%)</TableHead>
                      <TableHead className="text-right">Leverage</TableHead>
                      <TableHead>Exit plan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {portfolio.positions.map((position) => (
                      <TableRow key={position.symbol}>
                        <TableCell className="font-semibold">{position.symbol}</TableCell>
                        <TableCell className="text-right">{position.quantity.toLocaleString()}</TableCell>
                        <TableCell className="text-right">${position.entryPrice.toLocaleString()}</TableCell>
                        <TableCell className="text-right">${position.markPrice.toLocaleString()}</TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-medium",
                            position.pnl >= 0 ? "text-emerald-400" : "text-rose-400",
                          )}
                        >
                          {position.pnl >= 0 ? "+" : "-"}${Math.abs(position.pnl).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-medium",
                            position.pnlPct >= 0 ? "text-emerald-400" : "text-rose-400",
                          )}
                        >
                          {position.pnlPct >= 0 ? "+" : "-"}
                          {Math.abs(position.pnlPct).toFixed(2)}%
                        </TableCell>
                        <TableCell className="text-right">{position.leverage}×</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <div>Target {position.exitPlan.profitTarget}</div>
                          <div>Stop {position.exitPlan.stopLoss}</div>
                          <div className="truncate">{position.exitPlan.invalidation}</div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader>
                <CardTitle>Risk Snapshot</CardTitle>
                <CardDescription>LLM guardrails currently in force</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="rounded-lg border border-border/60 bg-background/70 p-4">
                  <p className="font-medium text-foreground">Risk limits</p>
                  <ul className="mt-2 space-y-1 text-muted-foreground">
                    <li>• Max leverage: 10×</li>
                    <li>• Max position size: 50% of equity</li>
                    <li>• Daily loss cap: $1,000</li>
                    <li>• Drawdown pause: 5%</li>
                  </ul>
                </div>
                <div className="rounded-lg border border-border/60 bg-background/70 p-4">
                  <p className="font-medium text-foreground">LLM behaviour</p>
                  <ul className="mt-2 space-y-1 text-muted-foreground">
                    <li>• Requires confidence ≥ 60% to trade</li>
                    <li>• Coexists with baseline momentum checks</li>
                    <li>• Funding spikes trigger automatic hold</li>
                    <li>• Consecutive losses ≥ 3 pause automation</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 lg:grid-cols-3">
            <Card className="border-border/60 lg:col-span-2">
              <CardHeader>
                <CardTitle>Decision Log</CardTitle>
                <CardDescription>Latest DeepSeek evaluations with rationale trail</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ScrollArea className="h-72 pr-6">
                  <div className="space-y-3">
                    {portfolio.decisions.map((decision) => (
                      <div
                        key={decision.id}
                        className="rounded-lg border border-border/60 bg-background/80 p-4 shadow-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="uppercase tracking-widest">
                              {decision.symbol}
                            </Badge>
                            <Badge
                              className={cn(
                                "uppercase tracking-wider",
                                decision.action === "hold"
                                  ? "bg-slate-500/20 text-slate-200"
                                  : decision.action === "buy"
                                    ? "bg-emerald-500/20 text-emerald-200"
                                    : "bg-rose-500/20 text-rose-200",
                              )}
                            >
                              {decision.action}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(decision.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <Separator className="my-3" />
                        <p className="text-sm leading-6 text-muted-foreground">{decision.rationale}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span>Size {decision.sizePct}%</span>
                          <span>Confidence {(decision.confidence * 100).toFixed(0)}%</span>
                          <Button
                            variant="link"
                            className="h-auto px-0 text-xs text-primary"
                            onClick={() => navigate(`/auto-trading/decision/${decision.id}`)}
                          >
                            View prompt &amp; CoT
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader>
                <CardTitle>Funding &amp; Open Interest</CardTitle>
                <CardDescription>Data feed wiring placeholder</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <div className="rounded-lg border border-dashed border-border/60 p-6 text-center">
                  <p className="font-medium text-foreground mb-2">Live metrics coming soon</p>
                  <p>
                    This mock dashboard references Coinbase Advanced Trade WebSocket for pricing and a secondary
                    provider for funding/open interest snapshots. The production build will hydrate these tiles in real
                    time.
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">Current snapshot</p>
                  <div className="grid gap-2 rounded-lg border border-border/60 bg-background/70 p-4">
                    <div className="flex justify-between">
                      <span>BTC funding</span>
                      <span className="font-medium text-emerald-400">+0.003%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>ETH open interest</span>
                      <span className="font-medium text-foreground">495,928 contracts</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Aggregated leverage ratio</span>
                      <span className="font-medium text-foreground">0.18</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        </Container>
      </main>
    </div>
  )
}

export default AutoTradingDashboard
