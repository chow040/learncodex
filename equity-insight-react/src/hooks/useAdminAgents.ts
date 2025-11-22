import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

import { resolveApiBaseUrl } from "../lib/api"
import type { AgentConfiguration, AgentSummary, PromptPreviewResult } from "../types/admin"

const fetchJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, { credentials: "include", ...init })
  if (!response.ok) {
    const text = await response.text().catch(() => "")
    let message = response.statusText || "Request failed"
    try {
      const parsed = JSON.parse(text)
      if (parsed && typeof parsed.error === "string") {
        message = parsed.error
      }
    } catch {
      // ignore
    }
    throw new Error(message)
  }
  return (await response.json()) as T
}

export const useAdminAgentsList = () => {
  const baseUrl = resolveApiBaseUrl()
  return useQuery({
    queryKey: ["adminAgents", baseUrl],
    queryFn: () => fetchJson<AgentSummary[]>(`${baseUrl}/api/admin/agents`),
  })
}

export const useAdminAgentDetail = (agentId?: string) => {
  const baseUrl = resolveApiBaseUrl()
  return useQuery({
    queryKey: ["adminAgentDetail", baseUrl, agentId ?? "none"],
    queryFn: () => fetchJson<AgentConfiguration>(`${baseUrl}/api/admin/agents/${agentId}`),
    enabled: Boolean(agentId),
  })
}

export const usePromptPreview = (agentId?: string) => {
  const baseUrl = resolveApiBaseUrl()
  return useMutation({
    mutationFn: async (payload: { tickers: string[]; question?: string }) => {
      if (!agentId) throw new Error("Agent id is required")
      return fetchJson<PromptPreviewResult>(`${baseUrl}/api/admin/agents/${agentId}/preview-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      })
    },
  })
}

export const useUpdatePromptProfile = () => {
  const baseUrl = resolveApiBaseUrl()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      promptProfileId,
      payload,
    }: {
      promptProfileId: string
      payload: { content?: string; outputSchemaExample?: string }
      agentId: string
    }) => {
      return fetchJson(`${baseUrl}/api/admin/prompt-profiles/${promptProfileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      })
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["adminAgentDetail", baseUrl, variables.agentId] })
      queryClient.invalidateQueries({ queryKey: ["adminAgents", baseUrl] })
    },
  })
}
