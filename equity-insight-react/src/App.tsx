import { Routes, Route, Navigate } from "react-router-dom"
import Home from "./pages/Home"
import EquityInsight from "./pages/EquityInsight"
import MarketOverview from "./pages/MarketOverview"
import PortfolioDesk from "./pages/PortfolioDesk"
import StrategyPlaybook from "./pages/StrategyPlaybook"
import TradeIdeas from "./pages/TradeIdeas"

const App = () => {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/equity-insight" element={<EquityInsight />} />
      <Route path="/market-overview" element={<MarketOverview />} />
      <Route path="/portfolio-desk" element={<PortfolioDesk />} />
      <Route path="/strategy-playbook" element={<StrategyPlaybook />} />
      <Route path="/trade-ideas" element={<TradeIdeas />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
