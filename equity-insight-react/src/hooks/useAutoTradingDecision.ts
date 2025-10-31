import { useQuery } from "@tanstack/react-query"

import { resolveApiBaseUrl } from "../lib/api"
import type { AutoTradeDecision } from "../types/autotrade"
import { mockAutoTradingPortfolio } from "../mocks/autoTradingMockData"

interface ApiResponse {
  decision?: AutoTradeDecision
}

const fetchDecision = async (baseUrl: string, decisionId: string): Promise<AutoTradeDecision> => {
  const response = await fetch(`${baseUrl}/api/autotrade/v1/decisions/${encodeURIComponent(decisionId)}`, {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to load decision")
  }

  const payload = (await response.json()) as ApiResponse
  if (payload?.decision) {
    return payload.decision
  }
  throw new Error("Decision payload missing")
}

export const useAutoTradingDecision = (
  decisionId: string | undefined,
  options?: { apiBaseUrl?: string; enabled?: boolean },
) => {
  const baseUrl = resolveApiBaseUrl(options?.apiBaseUrl)
  const enabled = (options?.enabled ?? true) && Boolean(decisionId)

  return useQuery({
    queryKey: ["autoTradingDecision", decisionId, baseUrl],
    queryFn: () => fetchDecision(baseUrl, decisionId as string),
    enabled,
    staleTime: 30_000,
    retry: 1,
  })
}

export const getMockDecisionList = () => mockAutoTradingPortfolio.decisions
