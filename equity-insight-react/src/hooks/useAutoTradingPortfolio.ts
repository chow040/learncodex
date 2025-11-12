import { useQuery } from "@tanstack/react-query"

import { resolveAutotradeApiBaseUrl } from "../lib/api"
import type { AutoTradePortfolioSnapshot } from "../types/autotrade"

interface ApiResponse {
  portfolio?: AutoTradePortfolioSnapshot
}

const fetchPortfolio = async (baseUrl: string): Promise<AutoTradePortfolioSnapshot> => {
  // Attempt to refresh the portfolio snapshot before reading it so the data reflects
  // the latest OKX state even when the LLM loop runs infrequently.
  try {
    await fetch(`${baseUrl}/internal/autotrade/v1/portfolio/sync`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ broadcast: true }),
    })
  } catch (error) {
    console.warn("Portfolio sync request failed", error)
  }

  const response = await fetch(`${baseUrl}/internal/autotrade/v1/portfolio`, {
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
  const baseUrl = resolveAutotradeApiBaseUrl(options?.apiBaseUrl)
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
