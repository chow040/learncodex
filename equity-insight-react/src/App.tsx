import { Fragment } from "react"
import { Routes, Route, Navigate } from "react-router-dom"
import { AuthProvider } from "./contexts/AuthContext"
import { ProtectedRoute } from "./components/ProtectedRoute"
import Home from "./pages/Home"
import EquityInsight from "./pages/EquityInsight"
import MarketOverview from "./pages/MarketOverview"
import PortfolioDesk from "./pages/PortfolioDesk"
import StrategyPlaybook from "./pages/StrategyPlaybook"
import TradeIdeas from "./pages/TradeIdeas"
import { Toaster } from "./components/ui/toaster"

const App = () => {
  return (
    <AuthProvider>
      <Fragment>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/equity-insight" element={
            <ProtectedRoute>
              <EquityInsight />
            </ProtectedRoute>
          } />
          <Route path="/market-overview" element={
            <ProtectedRoute>
              <MarketOverview />
            </ProtectedRoute>
          } />
          <Route path="/portfolio-desk" element={
            <ProtectedRoute>
              <PortfolioDesk />
            </ProtectedRoute>
          } />
          <Route path="/strategy-playbook" element={
            <ProtectedRoute>
              <StrategyPlaybook />
            </ProtectedRoute>
          } />
          <Route path="/trade-ideas" element={
            <ProtectedRoute>
              <TradeIdeas />
            </ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster />
      </Fragment>
    </AuthProvider>
  )
}

export default App
