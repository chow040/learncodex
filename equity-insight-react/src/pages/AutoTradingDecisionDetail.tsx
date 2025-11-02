import { useMemo } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, ClipboardCopy, FileText } from "lucide-react"

import { Container } from "../components/ui/container"
import { Button } from "../components/ui/button"
import { Badge } from "../components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { ScrollArea } from "../components/ui/scroll-area"
import { Separator } from "../components/ui/separator"
import { useToast } from "../components/ui/use-toast"
import { cn } from "../lib/utils"
import { getMockDecisionById } from "../mocks/autoTradingMockData"
import { useAutoTradingDecision } from "../hooks/useAutoTradingDecision"

const actionBadgeClasses = (action: string) => {
  switch (action) {
    case "buy":
      return "bg-emerald-500/20 text-emerald-200"
    case "sell":
      return "bg-rose-500/20 text-rose-200"
    default:
      return "bg-slate-500/20 text-slate-200"
  }
}

const formatDate = (iso: string) => new Date(iso).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })

const AutoTradingDecisionDetail = () => {
  const { decisionId = "" } = useParams<{ decisionId: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data, isLoading, isError } = useAutoTradingDecision(decisionId)

  const decision = useMemo(() => data ?? getMockDecisionById(decisionId), [data, decisionId])

  const handleCopy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast({ title: "Copied", description: `${label} copied to clipboard.` })
    } catch (error) {
      toast({
        title: "Copy failed",
        description: error instanceof Error ? error.message : "Unable to copy value.",
        variant: "destructive",
      })
    }
  }

  if (!isLoading && !decision) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background text-center">
        <FileText className="mb-4 h-10 w-10 text-muted-foreground" />
        <h1 className="text-2xl font-semibold text-foreground">Decision not found</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          This mock environment only exposes a handful of sample decisions. Return to the dashboard to explore the
          portfolio overview.
        </p>
        <Button asChild className="mt-6">
          <Link to="/auto-trading">Back to Auto Trading</Link>
        </Button>
      </div>
    )
  }

  if (!decision) {
    return null
  }

  const { prompt } = decision

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-background/90 backdrop-blur">
        <Container className="flex h-16 items-center justify-between">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Badge variant="secondary" className="uppercase tracking-[0.25em] text-xs">
            Prompt &amp; Chain of Thought
          </Badge>
        </Container>
      </header>

      <main className="py-10">
        <Container className="space-y-8">
          {isLoading ? (
            <div className="rounded-lg border border-border/60 bg-background/60 p-6 text-sm text-muted-foreground">
              Loading decision…
            </div>
          ) : null}
          {isError ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-6 text-sm text-amber-100">
              Decision API unavailable. Showing mock snapshot if available.
            </div>
          ) : null}
          <section className="grid gap-6 lg:grid-cols-3">
            <Card className="border-border/60 lg:col-span-2">
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-3">
                    <span className="text-sm uppercase tracking-[0.3em] text-muted-foreground/70">Decision</span>
                    <Badge className={cn("uppercase tracking-wider", actionBadgeClasses(decision.action))}>
                      {decision.action}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    {decision.symbol} — evaluated at {formatDate(decision.createdAt)}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    Confidence {(decision.confidence * 100).toFixed(0)}% • Size {decision.sizePct}%
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground/70">Summary</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{decision.rationale}</p>
                </div>
                <Separator />
                <div className="grid gap-4 text-sm text-muted-foreground sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground/70">Observation window</p>
                    <p className="mt-1 font-medium text-foreground">{prompt.observationWindow}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground/70">Invalidation hooks</p>
                    <ul className="mt-1 space-y-1">
                      {prompt.invalidations.map((item) => (
                        <li key={item}>• {item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common review shortcuts for this run</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  onClick={() => handleCopy("System prompt", prompt.systemPrompt)}
                >
                  Copy system prompt
                  <ClipboardCopy className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  onClick={() => handleCopy("User payload", prompt.userPayload)}
                >
                  Copy user payload
                  <ClipboardCopy className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  onClick={() => handleCopy("Chain of thought", prompt.chainOfThought)}
                >
                  Copy chain of thought
                  <ClipboardCopy className="h-4 w-4" />
                </Button>
                <Button variant="ghost" className="w-full" asChild>
                  <Link to="/auto-trading">Return to dashboard</Link>
                </Button>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle>System prompt</CardTitle>
                <CardDescription>Fixed instructions given to DeepSeek</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[32rem] rounded-md border border-border/50 bg-background/70">
                  <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs text-muted-foreground">
                    {prompt.systemPrompt}
                  </pre>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader>
                <CardTitle>User payload</CardTitle>
                <CardDescription>Structured telemetry sent alongside the prompt</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[32rem] rounded-md border border-border/50 bg-background/70">
                  <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs text-muted-foreground">
                    {prompt.userPayload}
                  </pre>
                </ScrollArea>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle>Chain of thought</CardTitle>
                <CardDescription>Reasoning captured for audit replay</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[32rem] rounded-md border border-border/50 bg-background/70">
                  <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs text-muted-foreground">
                    {prompt.chainOfThought}
                  </pre>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader>
                <CardTitle>Next steps</CardTitle>
                <CardDescription>Mock placeholders for downstream integrations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="rounded-lg border border-border/60 bg-background/70 p-4">
                  <p className="font-medium text-foreground">Telemetry</p>
                  <p className="mt-1">
                    In production this view links to object storage artefacts (prompt JSON, COT text) and correlates run
                    IDs with order placement logs.
                  </p>
                </div>
                <div className="rounded-lg border border-border/60 bg-background/70 p-4">
                  <p className="font-medium text-foreground">Upcoming enhancements</p>
                  <ul className="mt-1 space-y-1">
                    <li>• Show parsed JSON decision payload</li>
                    <li>• Surface funding/open-interest inputs used in the prompt</li>
                    <li>• Embed LangGraph dag run metadata</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </section>
        </Container>
      </main>
    </div>
  )
}

export default AutoTradingDecisionDetail
