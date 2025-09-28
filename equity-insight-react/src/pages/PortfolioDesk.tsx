const PortfolioDesk = () => (
  <div className="content-shell">
    <h1>Portfolio Desk</h1>
    <p>
      Monitor live exposures, scenario stress, and hedge efficiency. Keep the desk aligned on capital usage
      while rotating between offensive and defensive positioning.
    </p>
    <div className="grid-two">
      <section>
        <h2>Risk Blocks</h2>
        <ul>
          <li>Net / gross exposure by asset class and strategy sleeve</li>
          <li>VAR vs. limits with shock scenarios (rates, USD, oil)</li>
          <li>Hedge coverage map: delta, gamma, and tail insurance</li>
        </ul>
      </section>
      <section>
        <h2>P&amp;L Monitor</h2>
        <ul>
          <li>Intraday P&amp;L attribution (alpha vs. beta vs. carry)</li>
          <li>Contribution heat map by trader, theme, and tenor</li>
          <li>Risk-adjusted return metrics to recalibrate sizing</li>
        </ul>
      </section>
    </div>
  </div>
)

export default PortfolioDesk
