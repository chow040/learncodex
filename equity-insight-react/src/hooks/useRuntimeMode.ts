import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { resolveAutotradeApiBaseUrl } from "../lib/api"
import type { AutoTradeRuntimeMode } from "../types/autotrade"

type RuntimeModeResponse = {
  mode: AutoTradeRuntimeMode
}

const fetchRuntimeMode = async (baseUrl: string): Promise<AutoTradeRuntimeMode> => {
  const response = await fetch(`${baseUrl}/internal/autotrade/v1/runtime-mode`, {
    credentials: "include",
  })
  if (!response.ok) {
    throw new Error("Failed to load runtime mode")
  }
  const payload = (await response.json()) as RuntimeModeResponse
  return payload.mode
}

const updateRuntimeMode = async (baseUrl: string, mode: AutoTradeRuntimeMode): Promise<AutoTradeRuntimeMode> => {
  const response = await fetch(`${baseUrl}/internal/autotrade/v1/runtime-mode`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ mode }),
  })
  if (!response.ok) {
    throw new Error("Failed to update runtime mode")
  }
  const payload = (await response.json()) as RuntimeModeResponse
  return payload.mode
}

export const useRuntimeMode = (options?: { apiBaseUrl?: string; enabled?: boolean }) => {
  const baseUrl = resolveAutotradeApiBaseUrl(options?.apiBaseUrl)
  const enabled = options?.enabled ?? true
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ["runtimeMode", baseUrl],
    queryFn: () => fetchRuntimeMode(baseUrl),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })

  const mutation = useMutation({
    mutationFn: (mode: AutoTradeRuntimeMode) => updateRuntimeMode(baseUrl, mode),
    onSuccess: (mode) => {
      queryClient.setQueryData(["runtimeMode", baseUrl], mode)
      queryClient.invalidateQueries({ queryKey: ["autoTradingPortfolio", baseUrl] })
    },
  })

  return {
    mode: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    setMode: mutation.mutateAsync,
    isUpdating: mutation.isPending,
  }
}
