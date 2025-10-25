import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'

import {
  useTradingProgress,
  type TradingProgressStage,
  type TradingProgressState,
  type TradingProgressStatus,
} from '../hooks/useTradingProgress'
import type { TradingAgentsDecision } from '../types/tradingAgents'

type ActiveRunInfo = {
  runId: string
  symbol: string
  modelId?: string | null
  analysts?: string[]
  startedAt?: number
  mode?: 'mock' | 'live'
}

type TradingRunSnapshot = {
  info: ActiveRunInfo
  status: TradingProgressStatus
  percent: number
  currentStage: TradingProgressStage | null
  currentLabel: string | null
  message: string | null
  error: string | null
  result: TradingAgentsDecision | null
  modelId: string | null
  analysts: string[]
  startedAt: number | null
  durationMs: number | null
  lastEventAt: number | null
  updatedAt: number
  mode: 'mock' | 'live' | null
}

type PersistedRunPayload = {
  info: ActiveRunInfo
  status: TradingProgressStatus
  percent: number
  currentStage: TradingProgressStage | null
  currentLabel: string | null
  message: string | null
  error: string | null
  result: TradingAgentsDecision | null
  modelId: string | null
  analysts: string[]
  startedAt: number | null
  durationMs: number | null
  lastEventAt: number | null
  updatedAt: number
  mode: 'mock' | 'live' | null
}

type PersistedState = {
  activeRunId: string | null
  runs: PersistedRunPayload[]
}

type TradingProgressContextValue = {
  activeRunId: string | null
  activeRun: ActiveRunInfo | null
  runs: TradingRunSnapshot[]
  progressState: TradingProgressState<TradingAgentsDecision>
  startTracking: (info: ActiveRunInfo) => void
  clearActiveRun: (runId?: string) => void
  focusRun: (runId: string | null) => void
  isHydrated: boolean
}

const TradingProgressContext = createContext<TradingProgressContextValue | undefined>(undefined)

const STORAGE_KEY = 'tradingAgents.activeRuns_v2'
const MAX_TRACKED_RUNS = 5

export const TradingProgressProvider = ({ children }: PropsWithChildren<unknown>) => {
  const [runs, setRuns] = useState<Record<string, TradingRunSnapshot>>({})
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const envApiBaseUrl = (import.meta.env?.VITE_API_BASE_URL as string | undefined)?.trim()
  const apiBaseUrl = envApiBaseUrl ? envApiBaseUrl : undefined

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as PersistedState
        if (parsed && Array.isArray(parsed.runs)) {
          const nextRuns: Record<string, TradingRunSnapshot> = {}
          for (const entry of parsed.runs) {
            if (!entry?.info?.runId) continue
            const entryMode = entry.mode ?? entry.info.mode ?? null
            nextRuns[entry.info.runId] = {
              info: entryMode ? { ...entry.info, mode: entryMode } : { ...entry.info },
              status: entry.status,
              percent: entry.percent,
              currentStage: entry.currentStage,
              currentLabel: entry.currentLabel,
              message: entry.message,
              error: entry.error,
              result: entry.result ?? null,
              modelId: entry.modelId ?? null,
              analysts: Array.isArray(entry.analysts) ? [...entry.analysts] : [],
              startedAt: entry.startedAt ?? null,
              durationMs: entry.durationMs ?? null,
              lastEventAt: entry.lastEventAt ?? null,
              updatedAt: entry.updatedAt ?? Date.now(),
              mode: entryMode,
            }
          }
          setRuns(nextRuns)
          if (parsed.activeRunId && nextRuns[parsed.activeRunId]) {
            setActiveRunId(parsed.activeRunId)
          } else {
            const pending = Object.values(nextRuns).find(
              (run) => run.status === 'streaming' || run.status === 'connecting',
            )
            setActiveRunId(pending?.info.runId ?? null)
          }
        }
      }
    } catch (error) {
      console.warn('[TradingProgressProvider] Failed to parse stored runs', error)
    } finally {
      setHydrated(true)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !hydrated) return
    try {
      const payload: PersistedState = {
        activeRunId,
        runs: Object.values(runs),
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch (error) {
      console.warn('[TradingProgressProvider] Failed to persist runs', error)
    }
  }, [activeRunId, hydrated, runs])

  const { state: progressState, disconnect } = useTradingProgress<TradingAgentsDecision>(
    activeRunId,
    {
      enabled: hydrated && Boolean(activeRunId),
      parseResult: (input) => input as TradingAgentsDecision,
      apiBaseUrl,
    },
  )

  useEffect(() => {
    if (!activeRunId && progressState.status !== 'idle') {
      disconnect()
    }
  }, [activeRunId, disconnect, progressState.status])

  const startTracking = useCallback((info: ActiveRunInfo) => {
    const startedAt = info.startedAt ?? Date.now()
    const runMode: 'mock' | 'live' | null = info.mode ?? null
    setRuns((prev) => {
      const next: Record<string, TradingRunSnapshot> = {
        ...prev,
        [info.runId]: {
          info: runMode ? { ...info, startedAt, mode: runMode } : { ...info, startedAt },
          status: 'connecting',
          percent: 0,
          currentStage: null,
          currentLabel: null,
          message: null,
          error: null,
          result: null,
          modelId: info.modelId ?? null,
          analysts: Array.isArray(info.analysts) ? [...info.analysts] : [],
          startedAt,
          durationMs: null,
          lastEventAt: startedAt,
          updatedAt: Date.now(),
          mode: runMode,
        },
      }

      const entries = Object.values(next)
      if (entries.length > MAX_TRACKED_RUNS) {
        const overflow = entries
          .sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0))
          .slice(0, entries.length - MAX_TRACKED_RUNS)
        for (const entry of overflow) {
          delete next[entry.info.runId]
        }
      }

      return next
    })
    setActiveRunId(info.runId)
  }, [])

  const focusRun = useCallback(
    (runId: string | null) => {
      if (runId === activeRunId) return
      if (runId && !runs[runId]) return
      if (!runId) {
        disconnect()
      }
      setActiveRunId(runId)
    },
    [activeRunId, disconnect, runs],
  )

  const clearActiveRun = useCallback(
    (runId?: string) => {
      const targetId = runId ?? activeRunId
      if (!targetId) return
      setRuns((prev) => {
        if (!prev[targetId]) return prev
        const next = { ...prev }
        delete next[targetId]
        return next
      })
      if (targetId === activeRunId) {
        disconnect()
        setActiveRunId(null)
      }
    },
    [activeRunId, disconnect],
  )

  useEffect(() => {
    if (!activeRunId) return
    setRuns((prev) => {
      const existing = prev[activeRunId]
      if (!existing) return prev
      const lastEvent =
        progressState.events.length > 0
          ? progressState.events[progressState.events.length - 1]?.timestamp ?? existing.lastEventAt
          : existing.lastEventAt

      const mode = progressState.mode ?? existing.mode ?? null
      const updatedInfo = mode ? { ...existing.info, mode } : existing.info
      const updated: TradingRunSnapshot = {
        ...existing,
        info: updatedInfo,
        status: progressState.status,
        percent: progressState.percent,
        currentStage: progressState.currentStage,
        currentLabel: progressState.currentLabel,
        message: progressState.message,
        error: progressState.error,
        result: progressState.result ?? existing.result,
        modelId: progressState.modelId ?? existing.modelId ?? null,
        analysts:
          progressState.analysts.length > 0 ? [...progressState.analysts] : existing.analysts ?? [],
        startedAt: progressState.startedAt ?? existing.startedAt,
        durationMs: progressState.durationMs ?? existing.durationMs,
        lastEventAt: lastEvent ?? existing.lastEventAt,
        updatedAt: Date.now(),
        mode,
      }
      if (progressState.result) {
        updated.result = progressState.result
      }
      return {
        ...prev,
        [activeRunId]: updated,
      }
    })
  }, [activeRunId, progressState])

  const runsList = useMemo(() => {
    const statusRank = (status: TradingProgressStatus): number => {
      switch (status) {
        case 'streaming':
          return 0
        case 'connecting':
          return 1
        case 'complete':
          return 2
        case 'error':
          return 3
        case 'idle':
        default:
          return 4
      }
    }

    return Object.values(runs).sort((a, b) => {
      const diff = statusRank(a.status) - statusRank(b.status)
      if (diff !== 0) return diff
      return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
    })
  }, [runs])

  const activeRun = activeRunId ? runs[activeRunId]?.info ?? null : null

  const value = useMemo<TradingProgressContextValue>(
    () => ({
      activeRunId,
      activeRun,
      runs: runsList,
      progressState,
      startTracking,
      clearActiveRun,
      focusRun,
      isHydrated: hydrated,
    }),
    [activeRun, activeRunId, clearActiveRun, focusRun, hydrated, progressState, runsList, startTracking],
  )

  return <TradingProgressContext.Provider value={value}>{children}</TradingProgressContext.Provider>
}

export const useTradingProgressContext = (): TradingProgressContextValue => {
  const context = useContext(TradingProgressContext)
  if (!context) {
    throw new Error('useTradingProgressContext must be used within a TradingProgressProvider')
  }
  return context
}

export const useActiveRuns = () => {
  const { runs, activeRunId, focusRun, clearActiveRun } = useTradingProgressContext()
  return {
    runs,
    activeRunId,
    focusRun,
    clearActiveRun,
  }
}
