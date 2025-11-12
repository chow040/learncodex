import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, PauseCircle, PlayCircle, RefreshCw, ChevronDown } from "lucide-react"
import { formatDistanceToNowStrict } from "date-fns"

import { Container } from "../components/ui/container"
import { Button } from "../components/ui/button"
import { Badge } from "../components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table"
import { Switch } from "../components/ui/switch"
import { Separator } from "../components/ui/separator"
import { ScrollArea } from "../components/ui/scroll-area"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../components/ui/collapsible"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select"
import { cn } from "../lib/utils"
import { mockAutoTradingPortfolio } from "../mocks/autoTradingMockData"
import { useAutoTradingPortfolio } from "../hooks/useAutoTradingPortfolio"
import { useAutoTradingDecisions } from "../hooks/useAutoTradingDecisions"
import { useAutoTradingScheduler } from "../hooks/useAutoTradingScheduler"
import { usePortfolioHistory } from "../hooks/usePortfolioHistory"
import { useRuntimeMode } from "../hooks/useRuntimeMode"
import { SimulationBanner } from "../components/trading/SimulationBanner"
import { PortfolioValueChart } from "../components/trading/PortfolioValueChart"
import type { AutoTradePortfolioSnapshot, AutoTradeAction, AutoTradeRuntimeMode } from "../types/autotrade"

const actionBadgeClasses = (action: AutoTradeAction | string) => {
  switch (action) {
    case "buy":
      return "bg-emerald-500/20 text-emerald-200"
    case "sell":
      return "bg-rose-500/20 text-rose-200"
    case "close":
      return "bg-sky-500/20 text-sky-200"
    case "no_entry":
      return "bg-amber-500/20 text-amber-200"
    default:
      return "bg-slate-500/20 text-slate-200"
  }
}

const RUNTIME_MODE_LABELS: Record<AutoTradeRuntimeMode, string> = {
  simulator: "Simulator",
  paper: "Paper Trading",
  live: "Live Trading",
}

const AutoTradingDashboard = () => {
  const { data, isLoading, isError } = useAutoTradingPortfolio()
  const portfolio: AutoTradePortfolioSnapshot = data ?? mockAutoTradingPortfolio
  
  // Portfolio history hook - currently disabled until backend API is ready
  // When enabled, pass the data to PortfolioValueChart component
  const { data: historyData } = usePortfolioHistory({
    portfolioId: portfolio.portfolioId,
    enabled: false, // Enable this when backend endpoint is ready
  })
  
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

  const {
    mode: runtimeMode,
    isLoading: isModeLoading,
    isUpdating: isModeUpdating,
    setMode: setRuntimeMode,
  } = useRuntimeMode()
  const navigate = useNavigate()

  const [selectedMode, setSelectedMode] = useState<AutoTradeRuntimeMode | undefined>(undefined)
  const { data: decisionList } = useAutoTradingDecisions()

  useEffect(() => {
    if (runtimeMode) {
      setSelectedMode(runtimeMode)
    }
  }, [runtimeMode])

  const automationEnabled = scheduler ? !scheduler.isPaused : portfolio.automationEnabled
  const effectiveMode = selectedMode ?? runtimeMode
  const currentModeLabel = effectiveMode ? RUNTIME_MODE_LABELS[effectiveMode] : "Detecting..."
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

  const totalUnrealizedPnl = useMemo(
    () => portfolio.positions.reduce((acc, position) => acc + position.pnl, 0),
    [portfolio.positions],
  )

  const totalRealizedPnl = useMemo(
    () => portfolio.closedPositions.reduce((acc, position) => acc + position.realizedPnl, 0),
    [portfolio.closedPositions],
  )

  const [isClosedPositionsOpen, setIsClosedPositionsOpen] = useState(false)

  const decisions = decisionList?.items ?? []

  const groupedDecisions = useMemo(() => {
    const groups = new Map<
      string,
      {
        id: string
        createdAt: string
        decisions: typeof decisions
      }
    >()

    for (const decision of decisions) {
      const key =
        decision.prompt?.userPayload ||
        decision.prompt?.chainOfThought ||
        decision.createdAt ||
        decision.id
      const existing = groups.get(key)
      if (existing) {
        existing.decisions.push(decision)
        if (new Date(decision.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
          existing.createdAt = decision.createdAt
          existing.id = decision.id
        }
      } else {
        groups.set(key, {
          id: decision.id,
          createdAt: decision.createdAt,
          decisions: [decision],
        })
      }
    }

    return Array.from(groups.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  }, [decisions])

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
              <span className="text-muted-foreground">Mode</span>
              <Select
                value={effectiveMode}
                onValueChange={(value) => {
                  const modeValue = value as AutoTradeRuntimeMode
                  setSelectedMode(modeValue)
                  void setRuntimeMode(modeValue)
                }}
                disabled={isModeLoading || isModeUpdating}
              >
                <SelectTrigger className="h-9 w-[180px] border-border/60 bg-card/80 text-left text-sm font-medium text-foreground">
                  <SelectValue placeholder="Select mode">{currentModeLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent className="border-border/50 bg-card/95 text-foreground backdrop-blur">
                  <SelectItem value="simulator">Simulator</SelectItem>
                  <SelectItem value="paper">Paper Trading</SelectItem>
                  <SelectItem value="live">Live Trading</SelectItem>
                </SelectContent>
              </Select>
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
          
          <PortfolioValueChart 
            data={historyData}
            currentEquity={portfolio.equity}
            initialEquity={20000}
          />
          
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
                  <Badge variant="outline">{currentModeLabel}</Badge>
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
                          {new Date(event.timestamp).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })}
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
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="uppercase tracking-widest">
                    {portfolio.positions.length} assets
                  </Badge>
                  <Badge
                    className={cn(
                      "uppercase tracking-widest",
                      totalUnrealizedPnl >= 0 ? "bg-emerald-500/20 text-emerald-200" : "bg-rose-500/20 text-rose-200",
                    )}
                  >
                    {totalUnrealizedPnl >= 0 ? "+" : ""}$
                    {totalUnrealizedPnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Entry</TableHead>
                      <TableHead className="text-right">Notional</TableHead>
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
                        <TableCell className="text-right">
                          ${(position.quantity * position.markPrice).toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-medium",
                            position.pnl >= 0 ? "text-emerald-400" : "text-rose-400",
                          )}
                        >
                          {position.pnl >= 0 ? "+" : ""}${position.pnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-medium",
                            position.pnlPct >= 0 ? "text-emerald-400" : "text-rose-400",
                          )}
                        >
                          {position.pnlPct >= 0 ? "+" : ""}
                          {position.pnlPct.toFixed(2)}%
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
            <Card className="border-border/60 lg:col-span-3">
              <Collapsible open={isClosedPositionsOpen} onOpenChange={setIsClosedPositionsOpen}>
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <CollapsibleTrigger className="flex flex-1 items-center gap-3 text-left group">
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2">
                        Closed Positions
                        <ChevronDown className={cn(
                          "h-4 w-4 text-muted-foreground transition-transform",
                          isClosedPositionsOpen && "rotate-180"
                        )} />
                      </CardTitle>
                      <CardDescription>Realized trades from recent exits · Last 30 days</CardDescription>
                    </div>
                  </CollapsibleTrigger>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="uppercase tracking-widest">
                      {portfolio.closedPositions.length} closed
                    </Badge>
                    <Badge
                      className={cn(
                        "uppercase tracking-widest",
                        totalRealizedPnl >= 0 ? "bg-emerald-500/20 text-emerald-200" : "bg-rose-500/20 text-rose-200",
                      )}
                    >
                      {totalRealizedPnl >= 0 ? "+" : ""}$
                      {totalRealizedPnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </Badge>
                  </div>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent>
                    {portfolio.closedPositions.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border/60 bg-background/60 p-6 text-sm text-muted-foreground">
                        No closed trades yet. Realized PnL will appear here once exits are triggered.
                      </div>
                    ) : (
                      <ScrollArea className="h-72 pr-6">
                        <Table>
                          <TableHeader>
                            <TableRow className="text-xs uppercase tracking-[0.25em]">
                              <TableHead className="w-[90px]">Symbol</TableHead>
                              <TableHead className="text-right">Qty</TableHead>
                              <TableHead className="text-right">Entry</TableHead>
                              <TableHead className="text-right">Exit</TableHead>
                              <TableHead className="text-right">PnL</TableHead>
                              <TableHead className="text-right">PnL %</TableHead>
                              <TableHead className="text-right">Closed</TableHead>
                              <TableHead>Reason</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {portfolio.closedPositions.map((position) => (
                              <TableRow key={`${position.symbol}-${position.exitTimestamp}`}>
                                <TableCell className="font-medium">{position.symbol}</TableCell>
                                <TableCell className="text-right">
                                  {position.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                </TableCell>
                                <TableCell className="text-right">
                                  ${position.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell className="text-right">
                                  ${position.exitPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    "text-right font-medium",
                                    position.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400",
                                  )}
                                >
                                  {position.realizedPnl >= 0 ? "+" : ""}$
                                  {position.realizedPnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    "text-right font-medium",
                                    position.realizedPnlPct >= 0 ? "text-emerald-400" : "text-rose-400",
                                  )}
                                >
                                  {position.realizedPnlPct >= 0 ? "+" : ""}
                                  {position.realizedPnlPct.toFixed(2)}%
                                </TableCell>
                                <TableCell className="text-right text-sm text-muted-foreground">
                                  {new Date(position.exitTimestamp).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}
                                </TableCell>
                                <TableCell className="max-w-[260px] text-xs text-muted-foreground">
                                  {position.reason ? position.reason : "—"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
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
                    {groupedDecisions.map((group, groupIndex) => (
                      <div
                        key={`${group.id}-${groupIndex}`}
                        className="rounded-lg border border-border/60 bg-background/80 p-4 shadow-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="uppercase tracking-widest">
                              {group.decisions.map((d) => d.symbol).join(" · ")}
                            </Badge>
                            <span className="text-xs uppercase text-muted-foreground">
                              {group.decisions.length} {group.decisions.length === 1 ? "asset" : "assets"}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(group.createdAt).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}
                          </span>
                        </div>
                        <Separator className="my-3" />
                        <div className="space-y-3">
                          {group.decisions.map((decision, decisionIndex) => (
                            <div key={`${decision.id}-${decisionIndex}`} className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="uppercase tracking-wider">
                                  {decision.symbol}
                                </Badge>
                                <Badge className={cn("uppercase tracking-wider", actionBadgeClasses(decision.action))}>
                                  {decision.action.replace(/_/g, " ").toUpperCase()}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  Size {decision.sizePct}% · Confidence {(decision.confidence * 100).toFixed(0)}%
                                </span>
                              </div>
                              <p className="text-sm leading-6 text-muted-foreground">{decision.rationale}</p>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <Button
                            variant="link"
                            className="h-auto px-0 text-xs text-primary"
                            onClick={() => navigate(`/auto-trading/decision/${group.id}`)}
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
