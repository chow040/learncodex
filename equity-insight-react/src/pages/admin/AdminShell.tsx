import { NavLink, Outlet } from "react-router-dom"
import { Button } from "../../components/ui/button"
import { Home } from "lucide-react"

const navLinks: Array<{ to: string; label: string; description: string }> = [
  { to: "/admin", label: "Overview", description: "Status & quick links" },
  { to: "/admin/system-settings", label: "System Settings", description: "LLM + feature flags" },
  { to: "/admin/agents", label: "Agents", description: "Manage personas" },
]

const AdminShell = () => {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-64 flex-shrink-0 border-r border-border/60 bg-background/60 p-6 md:block">
        <div className="mb-8 space-y-1">
          <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground/70">Admin</p>
          <h1 className="text-2xl font-semibold tracking-tight">Control Center</h1>
          <Button variant="outline" size="sm" asChild className="mt-3 w-full">
            <NavLink to="/">
              <Home className="mr-2 h-4 w-4" />
              Back to Home
            </NavLink>
          </Button>
        </div>
        <nav className="space-y-2">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/admin"}
              className={({ isActive }) =>
                [
                  "block rounded-xl border px-4 py-3 transition",
                  isActive
                    ? "border-cyan-400/70 bg-cyan-500/10 text-cyan-100 shadow-cyan-500/20"
                    : "border-border/60 text-muted-foreground hover:border-cyan-400/40 hover:text-foreground",
                ].join(" ")
              }
            >
              <p className="text-sm font-semibold">{link.label}</p>
              <p className="text-xs text-muted-foreground">{link.description}</p>
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 bg-background p-4 sm:p-8">
        <MobileNav />
        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

const MobileNav = () => {
  return (
    <div className="mb-6 md:hidden">
      <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground/70">Admin</p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        {navLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === "/admin"}
            className={({ isActive }) =>
              [
                "rounded-lg border px-3 py-2",
                isActive ? "border-cyan-400/60 bg-cyan-500/10" : "border-border/60",
              ].join(" ")
            }
          >
            {link.label}
          </NavLink>
        ))}
      </div>
    </div>
  )
}

export default AdminShell
