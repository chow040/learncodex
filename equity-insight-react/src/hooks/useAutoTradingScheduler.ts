import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { resolveAutotradeApiBaseUrl } from "../lib/api"
import type { AutoTradeSchedulerStatus } from "../types/autotrade"

interface SchedulerEnvelope {
  scheduler: AutoTradeSchedulerStatus
}

interface TriggerResponse {
  triggeredAt: string
  scheduler: AutoTradeSchedulerStatus
}

const schedulerQueryKey = (baseUrl: string) => ["autoTradingScheduler", baseUrl] as const

const fetchSchedulerStatus = async (baseUrl: string): Promise<AutoTradeSchedulerStatus> => {
  const response = await fetch(`${baseUrl}/internal/autotrade/v1/scheduler/status`, {
    credentials: "include",
  })
  if (!response.ok) {
    throw new Error("Failed to load scheduler status")
  }
  const payload = (await response.json()) as SchedulerEnvelope
  if (!payload?.scheduler) {
    throw new Error("Scheduler payload missing")
  }
  return payload.scheduler
}

const callSchedulerEndpoint = async (baseUrl: string, path: string): Promise<AutoTradeSchedulerStatus> => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    credentials: "include",
  })
  if (!response.ok) {
    throw new Error(`Scheduler endpoint ${path} failed`)
  }
  const payload = (await response.json()) as SchedulerEnvelope
  if (!payload?.scheduler) {
    throw new Error("Scheduler payload missing")
  }
  return payload.scheduler
}

const triggerSchedulerEndpoint = async (baseUrl: string): Promise<TriggerResponse> => {
  const response = await fetch(`${baseUrl}/internal/autotrade/v1/scheduler/trigger`, {
    method: "POST",
    credentials: "include",
  })
  if (!response.ok) {
    throw new Error("Failed to trigger scheduler")
  }
  const payload = (await response.json()) as TriggerResponse
  if (!payload?.scheduler) {
    throw new Error("Scheduler payload missing")
  }
  return payload
}

export const useAutoTradingScheduler = (options?: { apiBaseUrl?: string; enabled?: boolean }) => {
  const baseUrl = resolveAutotradeApiBaseUrl(options?.apiBaseUrl)
  const enabled = options?.enabled ?? true
  const queryClient = useQueryClient()

  const scheduler = useQuery({
    queryKey: schedulerQueryKey(baseUrl),
    queryFn: () => fetchSchedulerStatus(baseUrl),
    enabled,
    staleTime: 15_000,
    retry: 1,
  })

  const pauseMutation = useMutation({
    mutationFn: () => callSchedulerEndpoint(baseUrl, "/internal/autotrade/v1/scheduler/pause"),
    onSuccess: (data) => queryClient.setQueryData(schedulerQueryKey(baseUrl), data),
  })

  const resumeMutation = useMutation({
    mutationFn: () => callSchedulerEndpoint(baseUrl, "/internal/autotrade/v1/scheduler/resume"),
    onSuccess: (data) => queryClient.setQueryData(schedulerQueryKey(baseUrl), data),
  })

  const triggerMutation = useMutation({
    mutationFn: () => triggerSchedulerEndpoint(baseUrl),
    onSuccess: (data) => queryClient.setQueryData(schedulerQueryKey(baseUrl), data.scheduler),
  })

  return {
    scheduler: scheduler.data,
    isLoading: scheduler.isLoading,
    isError: scheduler.isError,
    refetch: scheduler.refetch,
    pause: pauseMutation.mutateAsync,
    resume: resumeMutation.mutateAsync,
    trigger: triggerMutation.mutateAsync,
    isPausing: pauseMutation.isPending,
    isResuming: resumeMutation.isPending,
    isTriggering: triggerMutation.isPending,
    error: scheduler.error,
  }
}
