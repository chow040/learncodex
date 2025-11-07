import { useMemo } from "react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { format } from "date-fns"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card"
import { Badge } from "../ui/badge"
import { cn } from "../../lib/utils"

interface PortfolioDataPoint {
  timestamp: string
  equity: number
  cash: number
  positionsValue: number
}

interface PortfolioValueChartProps {
  data?: PortfolioDataPoint[]
  currentEquity: number
  initialEquity?: number
  className?: string
}

// Generate mock historical data for demonstration
const generateMockData = (currentEquity: number, initialEquity: number): PortfolioDataPoint[] => {
  const points: PortfolioDataPoint[] = []
  const now = new Date()
  const daysBack = 7 // Show last 7 days
  const pointsPerDay = 24 // Hourly data points
  
  let equity = initialEquity
  const volatility = 0.015 // 1.5% typical movement
  const drift = (currentEquity - initialEquity) / (daysBack * pointsPerDay) // Trend toward current value
  
  for (let i = daysBack * pointsPerDay; i >= 0; i--) {
    const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000)
    
    // Add some realistic price movement
    const randomMove = (Math.random() - 0.5) * equity * volatility
    equity = Math.max(equity + randomMove + drift, initialEquity * 0.85) // Don't drop below 85% of initial
    
    // Split equity between cash and positions (simulate trading activity)
    const cashRatio = 0.3 + Math.random() * 0.4 // 30-70% in cash
    const cash = equity * cashRatio
    const positionsValue = equity - cash
    
    points.push({
      timestamp: timestamp.toISOString(),
      equity: Math.round(equity * 100) / 100,
      cash: Math.round(cash * 100) / 100,
      positionsValue: Math.round(positionsValue * 100) / 100,
    })
  }
  
  // Ensure the last point matches current equity
  if (points.length > 0) {
    const last = points[points.length - 1]
    const cashRatio = 0.4 // Current ratio from dashboard
    last.equity = currentEquity
    last.cash = Math.round(currentEquity * cashRatio * 100) / 100
    last.positionsValue = Math.round((currentEquity - last.cash) * 100) / 100
  }
  
  return points
}

export const PortfolioValueChart = ({
  data,
  currentEquity,
  initialEquity = 20000,
  className,
}: PortfolioValueChartProps) => {
  const chartData = useMemo(() => {
    if (data && data.length > 0) {
      return data
    }
    return generateMockData(currentEquity, initialEquity)
  }, [data, currentEquity, initialEquity])

  const { totalChange, totalChangePct, highest, lowest } = useMemo(() => {
    if (chartData.length === 0) {
      return { totalChange: 0, totalChangePct: 0, highest: 0, lowest: 0 }
    }
    
    const initial = chartData[0].equity
    const change = currentEquity - initial
    const changePct = (change / initial) * 100
    
    const high = Math.max(...chartData.map(d => d.equity))
    const low = Math.min(...chartData.map(d => d.equity))
    
    return {
      totalChange: change,
      totalChangePct: changePct,
      highest: high,
      lowest: low,
    }
  }, [chartData, currentEquity])

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="rounded-lg border border-border/60 bg-background/95 p-3 shadow-lg backdrop-blur">
          <p className="text-xs text-muted-foreground mb-2">
            {format(new Date(data.timestamp), "MMM dd, HH:mm")}
          </p>
          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Total equity:</span>
              <span className="font-semibold text-foreground">
                ${data.equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Positions:</span>
              <span className="font-medium text-blue-400">
                ${data.positionsValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Cash:</span>
              <span className="font-medium text-purple-400">
                ${data.cash.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>
        </div>
      )
    }
    return null
  }

  return (
    <Card className={cn("border-border/60", className)}>
      <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <CardTitle>Total Account Value</CardTitle>
          <CardDescription>Portfolio equity over time · Last 7 days</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-right">
            <div className="text-2xl font-semibold text-foreground">
              ${currentEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="flex items-center justify-end gap-2 text-sm">
              <Badge
                className={cn(
                  "uppercase tracking-widest",
                  totalChange >= 0 ? "bg-emerald-500/20 text-emerald-200" : "bg-rose-500/20 text-rose-200"
                )}
              >
                {totalChange >= 0 ? "+" : ""}
                {totalChangePct.toFixed(2)}%
              </Badge>
              <span className={cn(
                "font-medium",
                totalChange >= 0 ? "text-emerald-400" : "text-rose-400"
              )}>
                {totalChange >= 0 ? "+" : ""}${totalChange.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-blue-500" />
            <span className="text-muted-foreground">Total equity</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-purple-500" />
            <span className="text-muted-foreground">Available cash</span>
          </div>
          <div className="ml-auto flex gap-4 text-xs">
            <div>
              <span className="text-muted-foreground">Peak: </span>
              <span className="font-medium text-emerald-400">
                ${highest.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Low: </span>
              <span className="font-medium text-rose-400">
                ${lowest.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>
        </div>
        
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="cashGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
            <XAxis
              dataKey="timestamp"
              tickFormatter={(timestamp) => format(new Date(timestamp), "MMM dd")}
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              width={60}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="equity"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#equityGradient)"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="cash"
              stroke="#a855f7"
              strokeWidth={1.5}
              fill="url(#cashGradient)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
