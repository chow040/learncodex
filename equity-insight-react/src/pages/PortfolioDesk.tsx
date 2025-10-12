const PortfolioDesk = () => (
  <div className="min-h-screen px-4 py-10 sm:px-6 lg:px-10">
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.35em] text-sky-300/80">Risk Command</p>
        <h1 className="text-3xl font-semibold text-white sm:text-4xl">Portfolio Desk</h1>
        <p className="text-sm leading-relaxed text-slate-300">
          Monitor live exposures, scenario stress, and hedge efficiency. Keep the desk aligned on capital usage while
          rotating between offensive and defensive positioning.
        </p>
      </header>

      <div className="glass-panel space-y-6 p-6 sm:p-8">
        <div className="grid gap-6 md:grid-cols-2">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Risk Blocks</h2>
            <ul className="space-y-2 text-sm text-slate-300">
              <li>Net / gross exposure by asset class and strategy sleeve</li>
              <li>VAR vs. limits with shock scenarios (rates, USD, oil)</li>
              <li>Hedge coverage map: delta, gamma, and tail insurance</li>
            </ul>
          </section>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">P&amp;L Monitor</h2>
            <ul className="space-y-2 text-sm text-slate-300">
              <li>Intraday P&amp;L attribution (alpha vs. beta vs. carry)</li>
              <li>Contribution heat map by trader, theme, and tenor</li>
              <li>Risk-adjusted return metrics to recalibrate sizing</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  </div>
)

export default PortfolioDesk
