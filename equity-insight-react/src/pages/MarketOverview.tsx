const MarketOverview = () => (
  <div className="content-shell">
    <h1>Market Overview</h1>
    <p>
      Track global indices, cross-asset correlations, and macro surprises to anchor directional bias.
      Integrate breadth, volatility, and factor dispersion before drilling into single-name setups.
    </p>
    <div className="grid-two">
      <section>
        <h2>Index Dashboard</h2>
        <ul>
          <li>S&amp;P 500 futures vs. overnight range</li>
          <li>Relative strength: Growth vs. Value, Cyclicals vs. Defensives</li>
          <li>Global risk mood: FX carry, credit spreads, commodities</li>
        </ul>
      </section>
      <section>
        <h2>Volatility &amp; Breadth</h2>
        <ul>
          <li>VIX term structure, VVIX, MOVE &amp; FX vol</li>
          <li>Advance/decline, % of constituents above moving averages</li>
          <li>Intraday liquidity pockets &amp; auction summary</li>
        </ul>
      </section>
    </div>
  </div>
)

export default MarketOverview
