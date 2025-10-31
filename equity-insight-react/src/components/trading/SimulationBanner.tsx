import { AlertCircle, Database } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "../ui/alert"

interface SimulationBannerProps {
  mode: string
  lastUpdate?: string
  statePath?: string
}

export function SimulationBanner({ mode, lastUpdate, statePath }: SimulationBannerProps) {
  // Only show banner if mode contains "simulation" or "paper"
  const isSimulation = mode.toLowerCase().includes("simulation") || 
                       mode.toLowerCase().includes("paper")
  
  if (!isSimulation) {
    return null
  }

  return (
    <Alert className="border-amber-500/40 bg-amber-500/10 mb-6">
      <AlertCircle className="h-4 w-4 text-amber-500" />
      <AlertTitle className="text-amber-500 font-semibold">
        🎮 Simulation Mode Active
      </AlertTitle>
      <AlertDescription className="text-amber-100/90 mt-2">
        <div className="space-y-1">
          <p>
            This is <span className="font-semibold">paper trading</span> - no real money at risk. 
            All positions and trades are simulated.
          </p>
          {lastUpdate && (
            <p className="text-sm flex items-center gap-2 mt-2">
              <Database className="inline h-3 w-3" />
              Last updated: {new Date(lastUpdate).toLocaleString()}
            </p>
          )}
          {statePath && (
            <p className="text-xs text-amber-200/70 mt-1">
              State file: {statePath}
            </p>
          )}
        </div>
      </AlertDescription>
    </Alert>
  )
}
