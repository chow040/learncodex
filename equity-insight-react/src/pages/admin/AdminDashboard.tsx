import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Badge } from "../../components/ui/badge"
import { ShieldCheck, Sparkles } from "lucide-react"
import { useNavigate } from "react-router-dom"

const summaryStats = [
  { label: "Active agents", value: "4", trend: "+1 vs last week" },
  { label: "Prompts awaiting review", value: "2", trend: "Needs assignment" },
  { label: "Feature flags", value: "5", trend: "3 enabled" },
  { label: "Last change", value: "12 min ago", trend: "System settings" },
]

const recentEvents = [
  {
    title: "Market analyst prompt updated",
    actor: "Alvin Wong",
    timestamp: "10 min ago",
    detail: "Runtime context tightened to 600 tokens.",
  },
  {
    title: "Risk guardrails toggled",
    actor: "Wei Chowhan",
    timestamp: "1 hr ago",
    detail: "Macro data feed temporarily disabled.",
  },
  {
    title: "New prompt profile draft",
    actor: "Jane Patel",
    timestamp: "Yesterday",
    detail: "Bull/Bear debate persona v2.",
  },
]

const quickLinks = [
  {
    label: "System Settings",
    description: "LLM defaults, feature flags, UX knobs.",
    action: "Configure",
    variant: "secondary" as const,
    to: "/admin/system-settings",
    icon: ShieldCheck,
  },
  {
    label: "Manage Agents",
    description: "Persona defaults, tools, context policy.",
    action: "Open",
    variant: "outline" as const,
    disabled: false,
    icon: Sparkles,
    to: "/admin/agents",
  },
]

const AdminDashboard = () => {
  const navigate = useNavigate()

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground/70">Overview</p>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-3xl font-semibold tracking-tight">Prompt & Agent Control</h2>
          <Badge variant="outline" className="border-cyan-400/40 text-cyan-200">
            Phase 5A scaffolding
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Configure models, feature flags, prompt profiles, and persona behavior without redeploying the backend. Data below
          is placeholder until API wiring lands in the integration checklist.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryStats.map((item) => (
          <Card key={item.label} className="border border-border/60 bg-background/70">
            <CardHeader className="pb-2">
              <CardDescription>{item.label}</CardDescription>
              <CardTitle className="text-3xl tracking-tight">{item.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{item.trend}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="border border-border/60 bg-background/70 lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Latest prompt, agent, and system changes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {recentEvents.map((event) => (
              <div key={event.title} className="rounded-xl border border-border/60 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{event.title}</p>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground/70">
                    {event.timestamp}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {event.actor} &middot; {event.detail}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border border-border/60 bg-background/70">
          <CardHeader>
            <CardTitle>Quick links</CardTitle>
            <CardDescription>Jump into the most used admin workflows.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {quickLinks.map((link) => {
              const Icon = link.icon
              return (
                <div
                  key={link.label}
                  className="rounded-xl border border-border/60 p-4 hover:border-cyan-400/40 transition"
                >
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    <Icon className="h-4 w-4" />
                    {link.label}
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">{link.description}</p>
                  <Button
                    size="sm"
                    variant={link.variant}
                    disabled={link.disabled || !link.to}
                    onClick={() => {
                      if (!link.disabled && link.to) {
                        navigate(link.to)
                      }
                    }}
                  >
                    {link.action}
                  </Button>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

export default AdminDashboard
