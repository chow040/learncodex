import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { resolveApiBaseUrl } from "../lib/api"
import type {
  ExecuteAgentRunResponse,
  TradingAgentDetail,
  TradingAgentRunSummary,
  TradingAgentSummary,
} from "../types/tradingAgents"

type BaseOptions = {
  apiBaseUrl?: string
}

const agentsKey = (baseUrl: string) => ["tradingAgents", baseUrl] as const
const agentDetailKey = (baseUrl: string, agentId: string) => ["tradingAgentDetail", baseUrl, agentId] as const
const agentRunsKey = (baseUrl: string, agentId: string, limit?: number) =>
  ["tradingAgentRuns", baseUrl, agentId, limit ?? "default"] as const
const agentRunDetailKey = (baseUrl: string, agentId: string, runId: string) =>
  ["tradingAgentRunDetail", baseUrl, agentId, runId] as const

const parseErrorMessage = async (response: Response): Promise<string> => {
  try {
    const text = await response.text()
    if (!text) return response.statusText || "Request failed"
    const parsed = JSON.parse(text) as { error?: unknown }
    const message = typeof parsed.error === "string" ? parsed.error : response.statusText
    return message || "Request failed"
  } catch {
    return response.statusText || "Request failed"
  }
}

const fetchJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    credentials: "include",
    ...init,
  })
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response))
  }
  return (await response.json()) as T
}

export const useTradingAgentsList = (options?: BaseOptions) => {
  const baseUrl = resolveApiBaseUrl(options?.apiBaseUrl)
  return useQuery({
    queryKey: agentsKey(baseUrl),
    queryFn: () => fetchJson<TradingAgentSummary[]>(`${baseUrl}/api/trading-agents`),
    staleTime: 60_000,
  })
}

export const useTradingAgentDetail = (agentId?: string | null, options?: BaseOptions) => {
  const baseUrl = resolveApiBaseUrl(options?.apiBaseUrl)
  return useQuery({
    queryKey: agentId ? agentDetailKey(baseUrl, agentId) : ["tradingAgentDetail", baseUrl, "none"],
    queryFn: () => fetchJson<TradingAgentDetail>(`${baseUrl}/api/trading-agents/${agentId}`),
    enabled: Boolean(agentId),
    staleTime: 30_000,
  })
}

export const useTradingAgentRuns = (agentId?: string | null, params?: { limit?: number }, options?: BaseOptions) => {
  const baseUrl = resolveApiBaseUrl(options?.apiBaseUrl)
  const limit = params?.limit
  return useQuery({
    queryKey: agentId ? agentRunsKey(baseUrl, agentId, limit) : ["tradingAgentRuns", baseUrl, "none"],
    queryFn: async () => {
      const searchParams = new URLSearchParams()
      if (limit) searchParams.set("limit", String(limit))
      const qs = searchParams.toString()
      return fetchJson<TradingAgentRunSummary[]>(`${baseUrl}/api/trading-agents/${agentId}/runs${qs ? `?${qs}` : ""}`)
    },
    enabled: Boolean(agentId),
    staleTime: 15_000,
  })
}

export const useTradingAgentRunDetail = (
  agentId?: string | null,
  runId?: string | null,
  options?: BaseOptions,
) => {
  const baseUrl = resolveApiBaseUrl(options?.apiBaseUrl)
  return useQuery({
    queryKey: agentId && runId ? agentRunDetailKey(baseUrl, agentId, runId) : ["tradingAgentRunDetail", baseUrl, "none"],
    queryFn: () => fetchJson<TradingAgentRunSummary>(`${baseUrl}/api/trading-agents/${agentId}/runs/${runId}`),
    enabled: Boolean(agentId && runId),
  })
}

interface ExecuteRunInput {
  agentId: string
  payload: {
    tickers: string[]
    question?: string
    modelId?: string
    useMockData?: boolean
  }
}

export const useExecuteTradingAgentRun = (
  options?: BaseOptions & { onSuccess?: (result: ExecuteAgentRunResponse) => void },
) => {
  const baseUrl = resolveApiBaseUrl(options?.apiBaseUrl)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ agentId, payload }: ExecuteRunInput): Promise<ExecuteAgentRunResponse> => {
      const response = await fetch(`${baseUrl}/api/trading-agents/${agentId}/run`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response))
      }
      return (await response.json()) as ExecuteAgentRunResponse
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: agentDetailKey(baseUrl, variables.agentId) })
      queryClient.invalidateQueries({ queryKey: agentRunsKey(baseUrl, variables.agentId) })
      options?.onSuccess?.(result)
    },
  })
}
