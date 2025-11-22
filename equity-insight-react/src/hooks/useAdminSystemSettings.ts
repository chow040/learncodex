import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { resolveApiBaseUrl } from "../lib/api"
import type { SystemSettingUpdateInput, SystemSettingsByScope } from "../types/admin"

type BaseOptions = {
  apiBaseUrl?: string
  enabled?: boolean
}

const settingsKey = (baseUrl: string) => ["adminSystemSettings", baseUrl] as const

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

const fetchSettings = async (url: string): Promise<SystemSettingsByScope> => {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
  })
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response))
  }
  return (await response.json()) as SystemSettingsByScope
}

const patchSettings = async (
  url: string,
  updates: SystemSettingUpdateInput[],
): Promise<SystemSettingsByScope> => {
  const response = await fetch(url, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  })
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response))
  }
  return (await response.json()) as SystemSettingsByScope
}

export const useAdminSystemSettings = (options?: BaseOptions) => {
  const baseUrl = resolveApiBaseUrl(options?.apiBaseUrl)
  return useQuery({
    queryKey: settingsKey(baseUrl),
    queryFn: () => fetchSettings(`${baseUrl}/api/admin/system-settings`),
    enabled: options?.enabled ?? true,
  })
}

type MutationOptions = BaseOptions & {
  onSuccess?: (settings: SystemSettingsByScope) => void
  onError?: (error: Error) => void
}

export const useUpdateAdminSystemSettings = (options?: MutationOptions) => {
  const baseUrl = resolveApiBaseUrl(options?.apiBaseUrl)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (updates: SystemSettingUpdateInput[]) =>
      patchSettings(`${baseUrl}/api/admin/system-settings`, updates),
    onSuccess: (data) => {
      queryClient.setQueryData(settingsKey(baseUrl), data)
      options?.onSuccess?.(data)
    },
    onError: (error: Error) => {
      options?.onError?.(error)
    },
  })
}
