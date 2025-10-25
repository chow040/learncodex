import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'

import { useTradingProgress, type TradingProgressState } from '../hooks/useTradingProgress'
import type { TradingAgentsDecision } from '../types/tradingAgents'

type ActiveRunInfo = {
  runId: string
  symbol: string
  modelId?: string | null
  analysts?: string[]
  startedAt?: number
}

type TradingProgressContextValue = {
  activeRun: ActiveRunInfo | null
  progressState: TradingProgressState<TradingAgentsDecision>
  startTracking: (info: ActiveRunInfo) => void
  clearActiveRun: () => void
  isHydrated: boolean
}

const TradingProgressContext = createContext<TradingProgressContextValue | undefined>(undefined)

const STORAGE_KEY = 'tradingAgents.activeRun_v1'

export const TradingProgressProvider = ({ children }: PropsWithChildren<unknown>) => {
  const [activeRun, setActiveRun] = useState<ActiveRunInfo | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const envApiBaseUrl = (import.meta.env?.VITE_API_BASE_URL as string | undefined)?.trim()
  const apiBaseUrl = envApiBaseUrl ? envApiBaseUrl : undefined

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as ActiveRunInfo
        if (parsed?.runId) {
          setActiveRun(parsed)
        }
      }
    } catch (error) {
      console.warn('[TradingProgressProvider] Failed to parse stored active run', error)
    } finally {
      setHydrated(true)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !hydrated) return
    try {
      if (activeRun) {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            ...activeRun,
            startedAt: activeRun.startedAt ?? Date.now(),
          }),
        )
      } else {
        window.localStorage.removeItem(STORAGE_KEY)
      }
    } catch (error) {
      console.warn('[TradingProgressProvider] Failed to persist active run', error)
    }
  }, [activeRun, hydrated])

  const { state: progressState, disconnect } = useTradingProgress<TradingAgentsDecision>(
    activeRun?.runId ?? null,
    {
      enabled: hydrated && Boolean(activeRun?.runId),
      parseResult: (input) => input as TradingAgentsDecision,
      apiBaseUrl,
    },
  )

  useEffect(() => {
    if (!activeRun && progressState.status !== 'idle') {
      disconnect()
    }
  }, [activeRun, disconnect, progressState.status])

  const startTracking = useCallback((info: ActiveRunInfo) => {
    setActiveRun({
      ...info,
      startedAt: info.startedAt ?? Date.now(),
    })
  }, [])

  const clearActiveRun = useCallback(() => {
    setActiveRun(null)
  }, [])

  const value = useMemo<TradingProgressContextValue>(
    () => ({
      activeRun,
      progressState,
      startTracking,
      clearActiveRun,
      isHydrated: hydrated,
    }),
    [activeRun, progressState, startTracking, clearActiveRun, hydrated],
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
