import { useQuery } from "@tanstack/react-query"

import { resolveAutotradeApiBaseUrl } from "../lib/api"
import type { AutoTradeDecision } from "../types/autotrade"

interface DecisionsResponse {
  items: AutoTradeDecision[]
  nextCursor: string | null
}

const fetchDecisions = async (baseUrl: string): Promise<DecisionsResponse> => {
  const response = await fetch(`${baseUrl}/internal/autotrade/v1/decisions`, {
    credentials: "include",
  })
  if (!response.ok) {
    throw new Error("Failed to load auto-trading decisions")
  }
  const payload = (await response.json()) as DecisionsResponse
  return {
    items: payload?.items ?? [],
    nextCursor: payload?.nextCursor ?? null,
  }
}

export const useAutoTradingDecisions = (options?: { apiBaseUrl?: string; enabled?: boolean }) => {
  const baseUrl = resolveAutotradeApiBaseUrl(options?.apiBaseUrl)
  const enabled = options?.enabled ?? true

  return useQuery({
    queryKey: ["autoTradingDecisions", baseUrl],
    queryFn: () => fetchDecisions(baseUrl),
    enabled,
    staleTime: 30_000,
    retry: 1,
  })
}

