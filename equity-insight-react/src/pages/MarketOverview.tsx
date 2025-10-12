const MarketOverview = () => (
  <div className="min-h-screen px-4 py-10 sm:px-6 lg:px-10">
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.35em] text-sky-300/80">Cross-Asset Lens</p>
        <h1 className="text-3xl font-semibold text-white sm:text-4xl">Market Overview</h1>
        <p className="text-sm leading-relaxed text-slate-300">
          Track global indices, cross-asset correlations, and macro surprises to anchor directional bias.
          Integrate breadth, volatility, and factor dispersion before drilling into single-name setups.
        </p>
      </header>

      <div className="glass-panel space-y-6 p-6 sm:p-8">
        <div className="grid gap-6 md:grid-cols-2">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Index Dashboard</h2>
            <ul className="space-y-2 text-sm text-slate-300">
              <li>S&amp;P 500 futures vs. overnight range</li>
              <li>Relative strength: Growth vs. Value, Cyclicals vs. Defensives</li>
              <li>Global risk mood: FX carry, credit spreads, commodities</li>
            </ul>
          </section>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Volatility &amp; Breadth</h2>
            <ul className="space-y-2 text-sm text-slate-300">
              <li>VIX term structure, VVIX, MOVE &amp; FX vol</li>
              <li>Advance/decline, % of constituents above moving averages</li>
              <li>Intraday liquidity pockets &amp; auction summary</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  </div>
)

export default MarketOverview
