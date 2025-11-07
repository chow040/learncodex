import { useQuery } from "@tanstack/react-query"
import { resolveApiBaseUrl } from "../lib/api"

export interface PortfolioHistoryDataPoint {
  timestamp: string
  equity: number
  cash: number
  positionsValue: number
  totalPnl?: number
  sharpe?: number
}

interface ApiResponse {
  history?: PortfolioHistoryDataPoint[]
}

const fetchPortfolioHistory = async (
  baseUrl: string,
  portfolioId: string,
  daysBack: number = 7
): Promise<PortfolioHistoryDataPoint[]> => {
  const response = await fetch(
    `${baseUrl}/api/autotrade/v1/portfolio/${portfolioId}/history?days=${daysBack}`,
    {
      credentials: "include",
    }
  )

  if (!response.ok) {
    throw new Error("Failed to load portfolio history")
  }

  const payload = (await response.json()) as ApiResponse
  if (payload?.history) {
    return payload.history
  }
  throw new Error("Portfolio history payload missing")
}

export const usePortfolioHistory = (options?: {
  apiBaseUrl?: string
  portfolioId?: string
  daysBack?: number
  enabled?: boolean
}) => {
  const baseUrl = resolveApiBaseUrl(options?.apiBaseUrl)
  const portfolioId = options?.portfolioId ?? "default"
  const daysBack = options?.daysBack ?? 7
  const enabled = options?.enabled ?? false // Disabled by default until API is ready

  return useQuery({
    queryKey: ["portfolioHistory", baseUrl, portfolioId, daysBack],
    queryFn: () => fetchPortfolioHistory(baseUrl, portfolioId, daysBack),
    enabled,
    staleTime: 60_000, // 1 minute
    refetchInterval: 60_000, // Refetch every minute
    retry: 1,
  })
}
