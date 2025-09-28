// Mega menu schema lets us manage categories + quick links from a single structure.
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
  // Track which mega-menu bucket is active so we can display the matching panel.
  const [openPanel, setOpenPanel] = useState<string | null>(null)
  // Timer keeps the mega panel from collapsing instantly when moving from tab to content.
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
    closeTimerRef.current = window.setTimeout(() => setOpenPanel(null), 180)
  }

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
  }, [])

  return (
    <div className="home-layout">
      {/* Primary shell: hero + supporting panels + hover mega menu. */}
      <nav className="mega-nav" onMouseLeave={scheduleClose}>
        <div className="brand">Aurora Trading Desk</div>
        <ul className="mega-nav-list">
          {megaSections.map((section) => (
            <li key={section.id}>
              <button
                type="button"
                className={openPanel === section.id ? "active" : ""}
                onMouseEnter={() => openWithIntent(section.id)}
                onFocus={() => openWithIntent(section.id)}
                aria-expanded={openPanel === section.id}
              >
                {section.label}
              </button>
              {openPanel === section.id && (
                <div className="mega-panel" onMouseEnter={() => openWithIntent(section.id)} onMouseLeave={scheduleClose}>
                  <div className="mega-headline">
                    <h3>{section.headline}</h3>
                    <p>{section.description}</p>
                  </div>
                  <div className="mega-links">
                    {section.links.map((link) => (
                      <Link key={link.to} to={link.to} className="mega-link">
                        <span className="mega-link-title">{link.label}</span>
                        <span className="mega-link-detail">{link.detail}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
        <Link to="/equity-insight" className="nav-cta">Launch Terminal</Link>
      </nav>

      <header className="hero">
        <div className="hero-copy">
          <h1>Trade the narrative with conviction.</h1>
          <p>
            Build a disciplined playbook each session. Surface cross-asset context,
            drill into single-name structure, and sync execution plans across your desk.
          </p>
          <div className="hero-actions">
            <Link to="/equity-insight" className="primary">Open Equity Insight</Link>
            <Link to="/market-overview" className="secondary">Market Overview</Link>
          </div>
        </div>
        <div className="hero-glance">
          <div className="glance-card">
            <span className="label">UPCOMING CATALYSTS</span>
            <ul>
              <li>FOMC Minutes · 2:00 PM ET</li>
              <li>NVDA Earnings Call · 4:30 PM ET</li>
              <li>WTI Inventory Report · 10:30 AM ET</li>
            </ul>
          </div>
          <div className="glance-card">
            <span className="label">HEATMAP SNAPSHOT</span>
            <div className="heat-grid">
              {['SPX +0.6%', 'NDX +0.9%', 'RTY +0.3%', 'VIX 15.4', 'DXY 102.8', 'CL 79.10'].map((tile) => (
                <span key={tile}>{tile}</span>
              ))}
            </div>
          </div>
        </div>
      </header>

      <section className="home-panels">
        <article>
          <h2>Session Checklist</h2>
          <p>Set directional bias, define risk, and align trade windows with macro catalysts.</p>
          <Link to="/strategy-playbook">View Strategy Playbook →</Link>
        </article>
        <article>
          <h2>Actionable Equity Scans</h2>
          <p>Surface momentum, rotation, and liquidity screens to populate your watchlist.</p>
          <Link to="/equity-insight">Run Equity Insight →</Link>
        </article>
        <article>
          <h2>Desk P&L + Risk</h2>
          <p>Monitor live exposure, hedge ratios, and VAR shifts with our portfolio dashboard.</p>
          <Link to="/portfolio-desk">Open Portfolio Desk →</Link>
        </article>
      </section>
    </div>
  )
}

export default Home
