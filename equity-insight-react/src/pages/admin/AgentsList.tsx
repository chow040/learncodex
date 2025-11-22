import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card"
import { Input } from "../../components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert"
import { useAdminAgentsList } from "../../hooks/useAdminAgents"

const statusBadge = (status: string) => {
  switch (status) {
    case "active":
      return "bg-emerald-500/15 text-emerald-200"
    case "disabled":
      return "bg-gray-500/15 text-gray-100"
    case "experimental":
      return "bg-amber-500/15 text-amber-200"
    default:
      return "bg-border/40 text-muted-foreground"
  }
}

const AgentsList = () => {
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [search, setSearch] = useState<string>("")
  const navigate = useNavigate()
  const agentsQuery = useAdminAgentsList()

  const filteredRows = useMemo(() => {
    if (!agentsQuery.data) return []
    return agentsQuery.data.filter((agent) => {
      const matchesStatus = statusFilter === "all" || agent.status === statusFilter
      const query = search.trim().toLowerCase()
      const matchesSearch =
        !query || agent.name.toLowerCase().includes(query) || agent.slug.toLowerCase().includes(query)
      return matchesStatus && matchesSearch
    })
  }, [agentsQuery.data, statusFilter, search])

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground/70">Agents</p>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-3xl font-semibold tracking-tight">Persona directory</h2>
          <Badge variant="outline" className="border-purple-400/40 text-purple-100">
            UI scaffolding
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Browse trading personas fetched from the admin API. LangGraph currently supports a fixed persona set (market, news,
          social, fundamentals, risk), so creation/deletion remains read-only until the orchestrator supports dynamic personas.
        </p>
      </section>

      <Card className="border border-border/50 bg-background/70">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Slice the list by deployment status or search.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1.5fr,1fr]">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Search</p>
            <Input placeholder="Search name or slug" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Status</p>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="experimental">Experimental</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-border/60 bg-background/70">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Agents</CardTitle>
          <CardDescription>
            {agentsQuery.isLoading ? "Loading personas..." : `Total ${filteredRows.length} personas`}
          </CardDescription>
          </div>
          <Button size="sm" variant="outline" disabled>
            New agent (coming soon)
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {agentsQuery.isError && (
            <Alert variant="destructive">
              <AlertTitle>Unable to load agents</AlertTitle>
              <AlertDescription>
                {agentsQuery.error instanceof Error ? agentsQuery.error.message : "Unknown error"}
              </AlertDescription>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => agentsQuery.refetch()}>
                Retry
              </Button>
            </Alert>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Slug</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Model</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((agent) => (
                  <TableRow key={agent.id}>
                    <TableCell className="font-medium">{agent.name}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">{agent.slug}</TableCell>
                    <TableCell>
                      <Badge className={statusBadge(agent.status)}>{agent.status}</Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">{agent.defaultModel}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(agent.updatedAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="secondary" onClick={() => navigate(`/admin/agents/${agent.id}`)}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!agentsQuery.isLoading && filteredRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No agents match the selected filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default AgentsList
