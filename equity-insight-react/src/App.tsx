import { Fragment } from "react"
import { Routes, Route, Navigate } from "react-router-dom"
import { AuthProvider } from "./contexts/AuthContext"
import { ProtectedRoute } from "./components/ProtectedRoute"
import Home from "./pages/Home"
import EquityInsight from "./pages/EquityInsight"
import TradeIdeas from "./pages/TradeIdeas"
import TradingAgents from "./pages/TradingAgents"
import TradingAgentsHistoryDetail from "./pages/TradingAgentsHistoryDetail"
import AutoTradingDashboard from "./pages/AutoTradingDashboard"
import AutoTradingDecisionDetail from "./pages/AutoTradingDecisionDetail"
import AutoTradingShell from "./pages/AutoTradingShell"
import PriceBanner from "./components/trading/PriceBanner"
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
          <Route path="/trade-ideas" element={
            <ProtectedRoute>
              <TradeIdeas />
            </ProtectedRoute>
          } />
          <Route path="/trading-agents" element={
            <ProtectedRoute>
              <TradingAgents />
            </ProtectedRoute>
          } />
          <Route path="/auto-trading" element={
            <ProtectedRoute>
              <div className="bg-background text-foreground">
                <PriceBanner />
                <AutoTradingShell />
              </div>
            </ProtectedRoute>
          }>
            <Route index element={<AutoTradingDashboard />} />
            <Route path="decision/:decisionId" element={<AutoTradingDecisionDetail />} />
          </Route>
          <Route path="/trading-agents/history/:runId" element={
            <ProtectedRoute>
              <TradingAgentsHistoryDetail />
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
