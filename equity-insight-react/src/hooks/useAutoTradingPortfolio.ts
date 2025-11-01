import { useQuery } from "@tanstack/react-query"

import { resolveApiBaseUrl } from "../lib/api"
import type { AutoTradePortfolioSnapshot } from "../types/autotrade"

interface ApiResponse {
  portfolio?: AutoTradePortfolioSnapshot
}

const fetchPortfolio = async (baseUrl: string): Promise<AutoTradePortfolioSnapshot> => {
  const response = await fetch(`${baseUrl}/api/autotrade/v1/portfolio`, {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to load auto-trading portfolio")
  }

  const payload = (await response.json()) as ApiResponse
  if (payload?.portfolio) {
    return payload.portfolio
  }
  throw new Error("Portfolio payload missing")
}

export const useAutoTradingPortfolio = (options?: { apiBaseUrl?: string; enabled?: boolean }) => {
  const baseUrl = resolveApiBaseUrl(options?.apiBaseUrl)
  const enabled = options?.enabled ?? true

  return useQuery({
    queryKey: ["autoTradingPortfolio", baseUrl],
    queryFn: () => fetchPortfolio(baseUrl),
    enabled,
    staleTime: 15_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    retry: 1,
  })
}
