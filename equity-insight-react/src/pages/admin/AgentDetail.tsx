import { useEffect } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card"
import { Input } from "../../components/ui/input"
import { Textarea } from "../../components/ui/textarea"
import { Label } from "../../components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert"
import { useAdminAgentDetail, usePromptPreview, useUpdatePromptProfile } from "../../hooks/useAdminAgents"
import { useForm } from "react-hook-form"
import { useToast } from "../../components/ui/use-toast"

const labelClass = "text-xs uppercase tracking-wide text-muted-foreground"
const toolDirectives = [
  { code: "[[tool:PRICE_DATA]]", description: "Historical OHLCV + stats" },
  { code: "[[tool:INDICATORS]]", description: "Technical indicator summaries" },
  { code: "[[tool:NEWS]] / [[tool:NEWS_GLOBAL]]", description: "Company or global news" },
  { code: "[[tool:NEWS_SOCIAL]]", description: "Reddit/X chatter aggregation" },
  { code: "[[tool:FUNDAMENTALS]]", description: "Financial statements, ratios" },
  { code: "[[tool:MACRO]]", description: "Macro calendar + policy notes" },
]

const AgentDetail = () => {
  const params = useParams<{ agentId: string }>()
  const navigate = useNavigate()
  const agentId = params.agentId ?? ""
  const agentQuery = useAdminAgentDetail(agentId)
  const previewMutation = usePromptPreview(agentId)
  const updatePromptProfileMutation = useUpdatePromptProfile()
  const { toast } = useToast()
  const previewForm = useForm<{ tickers: string; question?: string }>({
    defaultValues: { tickers: "", question: "" },
  })
  const promptForm = useForm<{ content: string; outputSchemaExample?: string }>({
    defaultValues: { content: "", outputSchemaExample: "" },
  })

  if (!agentId) {
    return (
      <div className="space-y-4">
        <Card className="border border-border/60 bg-background/70">
          <CardHeader>
            <CardTitle>Agent not found</CardTitle>
            <CardDescription>
              The requested agent id is missing. Use the list view to pick an available persona.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => navigate("/admin/agents")}>
              Back to agents
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (agentQuery.isLoading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading agent configuration...</p>
      </div>
    )
  }

  if (agentQuery.isError || !agentQuery.data) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertTitle>Unable to load agent</AlertTitle>
          <AlertDescription>
            {agentQuery.error instanceof Error ? agentQuery.error.message : "Unknown error"}
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => navigate("/admin/agents")}>
          Back to list
        </Button>
      </div>
    )
  }

  const agent = agentQuery.data
  const promptProfile = agent.promptProfile
  const contextPolicy = agent.contextPolicy ?? null

  useEffect(() => {
    if (promptProfile) {
      promptForm.reset({
        content: promptProfile.content ?? "",
        outputSchemaExample: promptProfile.outputSchemaExample ?? "",
      })
    }
  }, [promptProfile, promptForm])

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground/70">Agent</p>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-semibold tracking-tight">{agent.name}</h2>
            <Badge className="bg-emerald-500/15 text-emerald-200">{agent.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">{agent.description}</p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/admin/agents">Back to list</Link>
        </Button>
      </div>

      <Card className="border border-border/60 bg-background/70">
        <CardHeader>
          <CardTitle>Run configuration snapshot</CardTitle>
          <CardDescription>Review core persona metadata and prompt assignment.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <p className={labelClass}>Slug</p>
            <p className="font-mono text-sm">{agent.slug}</p>
          </div>
          <div>
            <p className={labelClass}>Prompt profile</p>
            <p className="text-sm">{agent.promptProfile?.name ?? "Unassigned"}</p>
          </div>
          <div>
            <p className={labelClass}>Model</p>
            <p className="text-sm">{agent.defaultModel}</p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="context">Context</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="space-y-4">
          <Card className="border border-border/60 bg-background/70">
            <CardHeader>
              <CardTitle>Core details</CardTitle>
              <CardDescription>Edit persona metadata and prompt assignment.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input defaultValue={agent.name} readOnly />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Input defaultValue={agent.status} readOnly />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea defaultValue={agent.description} rows={3} readOnly />
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Default model</Label>
                  <Input defaultValue={agent.defaultModel} readOnly />
                </div>
                <div className="space-y-2">
                  <Label>Max tokens</Label>
                  <Input defaultValue={agent.defaultMaxTokens} readOnly />
                </div>
                <div className="space-y-2">
                  <Label>Horizon</Label>
                  <Input defaultValue={agent.defaultHorizon} readOnly />
                </div>
                <div className="space-y-2">
                  <Label>Tone</Label>
                  <Input defaultValue={agent.defaultTone} readOnly />
                </div>
                <div className="space-y-2">
                  <Label>Risk bias</Label>
                  <Input defaultValue={agent.defaultRiskBias} readOnly />
                </div>
                <div className="space-y-2">
                  <Label>Focus</Label>
                  <Input defaultValue={agent.defaultFocus} readOnly />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="context" className="space-y-4">
          <Card className="border border-border/60 bg-background/70">
            <CardHeader>
              <CardTitle>Persona prompt & context</CardTitle>
              <CardDescription>
                Prompts are edited here per persona. Include tool directives inline (e.g., <code>[[tool:NEWS max=2]]</code>).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Persona system prompt</Label>
                <Textarea rows={10} {...promptForm.register("content")} />
              </div>
              <div className="space-y-2">
                <Label>Output schema example</Label>
                <Textarea rows={6} {...promptForm.register("outputSchemaExample")} />
              </div>
              <div className="rounded-lg border border-border/50 bg-background/60 p-4 text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">Directive tips</p>
                <p className="text-xs">
                  Embed directives wherever the persona should call external data sources. LangGraph enforces limits based on
                  the directive metadata.
                </p>
                <ul className="mt-3 space-y-1">
                  {toolDirectives.map((tool) => (
                    <li key={tool.code}>
                      <code>{tool.code}</code> &mdash; {tool.description}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs">
                  Modifiers: <code>max=2</code>, <code>focus=&quot;liquidity&quot;</code>, <code>scope=&quot;ticker&quot;</code>
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border border-border/60 bg-background/70">
            <CardHeader>
              <CardTitle>Context policy</CardTitle>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">
                Mock only &mdash; context builder wiring pending
              </p>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Include previous analyses</Label>
                <Input defaultValue={contextPolicy?.includePreviousAnalyses ? "Enabled" : "Disabled"} readOnly />
              </div>
              <div className="space-y-2">
                <Label>Include global summary</Label>
                <Input defaultValue={contextPolicy?.includeGlobalSummary ? "Enabled" : "Disabled"} readOnly />
              </div>
              <div className="space-y-2">
                <Label>Max analyses</Label>
                <Input defaultValue={contextPolicy?.maxAnalyses ?? 0} readOnly />
              </div>
              <div className="space-y-2">
                <Label>Context tokens</Label>
                <Input defaultValue={contextPolicy?.maxContextTokens ?? 0} readOnly />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preview">
          <Card className="border border-border/60 bg-background/70">
            <CardHeader>
              <CardTitle>Prompt preview</CardTitle>
              <CardDescription>
                Enter sample tickers/question to inspect the assembled prompt. Preview is placeholder-only until API wiring.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form
                className="space-y-4"
                onSubmit={previewForm.handleSubmit((values) => {
                  const tickers = values.tickers
                    .split(",")
                    .map((ticker) => ticker.trim().toUpperCase())
                    .filter(Boolean)
                  if (!tickers.length) {
                    previewForm.setError("tickers", { message: "Enter at least one ticker" })
                    return
                  }
                  previewMutation.mutate({ tickers, ...(values.question ? { question: values.question } : {}) })
                })}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Sample tickers</Label>
                    <Input placeholder="AAPL, TSLA" {...previewForm.register("tickers")} />
                    {previewForm.formState.errors.tickers && (
                      <p className="text-xs text-red-400">{previewForm.formState.errors.tickers.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Sample question</Label>
                    <Input placeholder="Optional question" {...previewForm.register("question")} />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={previewMutation.isPending}>
                    {previewMutation.isPending ? "Generating…" : "Generate preview"}
                  </Button>
                  {previewMutation.isError && (
                    <p className="text-xs text-red-400">
                      {previewMutation.error instanceof Error ? previewMutation.error.message : "Preview failed"}
                    </p>
                  )}
                </div>
              </form>
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="border border-border/40 bg-background/60">
                  <CardHeader>
                    <CardTitle className="text-base">Behavior block</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {previewMutation.data?.behaviorBlock || "Run a preview to view the behavior block."}
                  </CardContent>
                </Card>
                <Card className="border border-border/40 bg-background/60">
                  <CardHeader>
                    <CardTitle className="text-base">User block</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {previewMutation.data?.userBlock || "Tickers + question will appear here."}
                  </CardContent>
                </Card>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="border border-border/40 bg-background/60">
                  <CardHeader>
                    <CardTitle className="text-base">Context block</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {previewMutation.data?.contextBlock || "No context loaded."}
                  </CardContent>
                </Card>
                <Card className="border border-border/40 bg-background/60">
                  <CardHeader>
                    <CardTitle className="text-base">Token estimate</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-semibold">
                      {previewMutation.data ? previewMutation.data.tokenEstimate : "--"}
                    </p>
                    <p className="text-sm text-muted-foreground">Tokens</p>
                  </CardContent>
                </Card>
              </div>
              {previewMutation.data?.systemPrompt && (
                <Card className="border border-border/40 bg-background/60">
                  <CardHeader>
                    <CardTitle className="text-base">System prompt</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {previewMutation.data.systemPrompt}
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <div className="flex flex-wrap justify-end gap-3">
        <Button
          variant="outline"
          disabled={updatePromptProfileMutation.isPending}
          onClick={() => promptForm.reset()}
        >
          Reset prompt
        </Button>
        <Button
          disabled={updatePromptProfileMutation.isPending || !promptProfile?.id}
          onClick={promptForm.handleSubmit((values) => {
            if (!promptProfile?.id || !agentId) {
              toast({ title: "Prompt profile missing", variant: "destructive" })
              return
            }
            updatePromptProfileMutation.mutate(
              {
                promptProfileId: promptProfile.id,
                payload: {
                  content: values.content,
                  outputSchemaExample: values.outputSchemaExample,
                },
                agentId,
              },
              {
                onSuccess: () => {
                  toast({
                    title: "Prompt updated",
                    description: "New prompt will apply to the next run.",
                  })
                },
                onError: (error) => {
                  toast({
                    title: "Failed to update prompt",
                    description: error instanceof Error ? error.message : "Unknown error",
                    variant: "destructive",
                  })
                },
              },
            )
          })}
        >
          {updatePromptProfileMutation.isPending ? "Saving…" : "Save prompt"}
        </Button>
      </div>
    </div>
  )
}

export default AgentDetail
