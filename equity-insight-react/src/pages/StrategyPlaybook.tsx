const StrategyPlaybook = () => (
  <div className="min-h-screen px-4 py-10 sm:px-6 lg:px-10">
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.35em] text-sky-300/80">Session Blueprint</p>
        <h1 className="text-3xl font-semibold text-white sm:text-4xl">Strategy Playbook</h1>
        <p className="text-sm leading-relaxed text-slate-300">
          Align the desk on directional bias, execution windows, and risk limits. Blend discretionary reads with
          quantitative confirmation for a consistent process every session.
        </p>
      </header>

      <div className="glass-panel space-y-6 p-6 sm:p-8">
        <div className="grid gap-6 md:grid-cols-2">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Session Plan</h2>
            <ul className="space-y-2 text-sm text-slate-300">
              <li>Morning call structure, macro catalysts, and flow watch</li>
              <li>Bias matrix: equities, rates, FX, commodities</li>
              <li>Execution windows around data releases and auctions</li>
            </ul>
          </section>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Trade Worksheet</h2>
            <ul className="space-y-2 text-sm text-slate-300">
              <li>Primary setups with entry, add, target, and stop levels</li>
              <li>Risk-per-trade and aggregate desk heat</li>
              <li>Checklists for confirmation signals before firing risk</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  </div>
)

export default StrategyPlaybook
