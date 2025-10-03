import clsx from "clsx"
import { Link } from "react-router-dom"
import { useEffect, useRef, useState } from "react"

const megaSections = [
  {
    id: "research",
    label: "Research",
    headline: "Market Intelligence",
    description: "Deep dives for macro, sectors, and single-name catalysts.",
    links: [
      { to: "/equity-insight", label: "Equity Insight", detail: "Valuation + trade plan snapshot" },
      { to: "/market-overview", label: "Market Overview", detail: "Global indices, breadth, volatility" },
      { to: "/strategy-playbook", label: "Strategy Playbook", detail: "Session game plans & macro agenda" }
    ]
  },
  {
    id: "trading",
    label: "Trading",
    headline: "Execution Toolkit",
    description: "Tools to manage risk, structure trades, and monitor flow.",
    links: [
      { to: "/portfolio-desk", label: "Portfolio Desk", detail: "Positions, hedges, and risk budget" },
      { to: "/trade-ideas", label: "Trade Ideas", detail: "Tactical setups with entry/exit levels" },
      { to: "/equity-insight", label: "Earnings Prep", detail: "Key levels for reporting tickers" }
    ]
  },
  {
    id: "analytics",
    label: "Analytics",
    headline: "Signal Lab",
    description: "Quantitative overlays to confirm discretionary reads.",
    links: [
      { to: "/market-overview", label: "Breadth & Momentum", detail: "Cross-asset factor dashboards" },
      { to: "/equity-insight", label: "Single-Ticker Drill", detail: "Pattern, volume, and flow stats" },
      { to: "/portfolio-desk", label: "Risk Simulator", detail: "Stress-test scenarios & VAR" }
    ]
  }
]

const Home = () => {
  const [openPanel, setOpenPanel] = useState<string | null>(megaSections[0]?.id ?? null)
  const closeTimerRef = useRef<number | null>(null)

  const openWithIntent = (sectionId: string) => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    setOpenPanel(sectionId)
  }

  const scheduleClose = () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => setOpenPanel(megaSections[0]?.id ?? null), 180)
  }

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
  }, [])

  const activeSection = openPanel ? megaSections.find((section) => section.id === openPanel) ?? null : null

  return (
    <div className="min-h-screen px-4 py-10 sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-10">
        <nav className="glass-panel space-y-6 p-6 sm:p-8" onMouseLeave={scheduleClose}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="text-xl font-semibold text-white">Aurora Trading Desk</span>
            <Link to="/equity-insight" className="pill-button px-4 py-2 text-xs uppercase tracking-[0.3em]">
              Launch Terminal
            </Link>
          </div>
          <ul className="flex flex-wrap gap-2 text-sm text-slate-200">
            {megaSections.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  className={clsx(
                    "rounded-full px-4 py-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60",
                    openPanel === section.id ? "bg-white text-slate-900 shadow-sm" : "hover:bg-white/10"
                  )}
                  onMouseEnter={() => openWithIntent(section.id)}
                  onFocus={() => openWithIntent(section.id)}
                  aria-expanded={openPanel === section.id}
                >
                  {section.label}
                </button>
              </li>
            ))}
          </ul>
          {activeSection && (
            <div
              className="rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6"
              onMouseEnter={() => openWithIntent(activeSection.id)}
              onMouseLeave={scheduleClose}
            >
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-white">{activeSection.headline}</h3>
                <p className="text-sm text-slate-300">{activeSection.description}</p>
              </div>
              <div className="mt-5 grid gap-3">
                {activeSection.links.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-sky-400/30 hover:bg-sky-500/10"
                  >
                    <span className="block text-sm font-semibold text-white">{link.label}</span>
                    <span className="mt-1 block text-xs text-slate-300">{link.detail}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </nav>

        <header className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="glass-panel space-y-6 p-6 sm:p-8">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.35em] text-sky-300/80">Intraday Playbook</p>
              <h1 className="text-3xl font-semibold text-white sm:text-4xl">Trade the narrative with conviction.</h1>
              <p className="text-sm leading-relaxed text-slate-300">
                Build a disciplined playbook each session. Surface cross-asset context, drill into single-name structure,
                and sync execution plans across your desk.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/equity-insight" className="pill-button px-5 py-3 text-xs uppercase tracking-[0.3em]">
                Open Equity Insight
              </Link>
              <Link
                to="/market-overview"
                className="inline-flex items-center rounded-full border border-white/15 px-5 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-200 transition hover:border-white/30 hover:bg-white/10"
              >
                Market Overview
              </Link>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="glass-panel space-y-3 p-5">
              <span className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-300">Upcoming Catalysts</span>
              <ul className="space-y-2 text-sm text-slate-200">
                <li>FOMC Minutes - 2:00 PM ET</li>
                <li>NVDA Earnings Call - 4:30 PM ET</li>
                <li>WTI Inventory Report - 10:30 AM ET</li>
              </ul>
            </div>
            <div className="glass-panel space-y-3 p-5">
              <span className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-300">Heatmap Snapshot</span>
              <div className="grid grid-cols-3 gap-2 text-sm text-slate-100">
                {['SPX +0.6%', 'NDX +0.9%', 'RTY +0.3%', 'VIX 15.4', 'DXY 102.8', 'CL 79.10'].map((tile) => (
                  <span
                    key={tile}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center font-semibold"
                  >
                    {tile}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <article className="glass-panel space-y-3 p-6">
            <h2 className="text-lg font-semibold text-white">Session Checklist</h2>
            <p className="text-sm text-slate-300">
              Set directional bias, define risk, and align trade windows with macro catalysts.
            </p>
            <Link
              to="/strategy-playbook"
              className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-sky-200 hover:text-sky-100"
            >
              View Strategy Playbook
            </Link>
          </article>
          <article className="glass-panel space-y-3 p-6">
            <h2 className="text-lg font-semibold text-white">Actionable Equity Scans</h2>
            <p className="text-sm text-slate-300">
              Surface momentum, rotation, and liquidity screens to populate your watchlist.
            </p>
            <Link
              to="/equity-insight"
              className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-sky-200 hover:text-sky-100"
            >
              Run Equity Insight
            </Link>
          </article>
          <article className="glass-panel space-y-3 p-6">
            <h2 className="text-lg font-semibold text-white">Desk P&amp;L + Risk</h2>
            <p className="text-sm text-slate-300">
              Monitor live exposure, hedge ratios, and VAR shifts with our portfolio dashboard.
            </p>
            <Link
              to="/portfolio-desk"
              className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-sky-200 hover:text-sky-100"
            >
              Open Portfolio Desk
            </Link>
          </article>
        </section>
      </div>
    </div>
  )
}

export default Home
