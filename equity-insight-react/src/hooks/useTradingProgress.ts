import { useCallback, useEffect, useReducer, useRef } from 'react'

export type TradingProgressStage =
  | 'queued'
  | 'analysts'
  | 'investment_debate'
  | 'research_manager'
  | 'trader'
  | 'risk_debate'
  | 'risk_manager'
  | 'finalizing'

export type TradingProgressStatus = 'idle' | 'connecting' | 'streaming' | 'complete' | 'error'

export interface TradingProgressEvent {
  runId: string
  stage: TradingProgressStage
  label: string
  percent?: number
  message?: string
  iteration?: number
  timestamp: number
  modelId?: string
  analysts?: string[]
  mode?: 'mock' | 'live'
}

export interface TradingProgressCompletePayload<Result = unknown> {
  runId: string
  result: Result
}

export interface TradingProgressErrorPayload {
  runId: string
  message: string
}

export interface TradingProgressState<Result = unknown> {
  runId: string | null
  status: TradingProgressStatus
  events: TradingProgressEvent[]
  percent: number
  currentStage: TradingProgressStage | null
  currentLabel: string | null
  message: string | null
  error: string | null
  result: Result | null
  modelId: string | null
  analysts: string[]
  startedAt: number | null
  durationMs: number | null
  mode: 'mock' | 'live' | null
}

export interface UseTradingProgressOptions<Result = unknown> {
  /**
   * Base URL for API requests. Defaults to window.origin.
   */
  apiBaseUrl?: string
  /**
   * Optional parser that converts the completion payload into a typed result.
   */
  parseResult?: (input: unknown) => Result
  /**
   * When false the hook will stay idle even if a runId is provided.
   */
  enabled?: boolean
}

type Action<Result> =
  | { type: 'reset' }
  | { type: 'connect'; runId: string }
  | { type: 'progress'; event: TradingProgressEvent }
  | { type: 'complete'; payload: TradingProgressCompletePayload<Result> }
  | { type: 'error'; payload: TradingProgressErrorPayload }
  | { type: 'disconnect' }

const STAGE_FALLBACK_PERCENT: Record<TradingProgressStage, number> = {
  queued: 0,
  analysts: 15,
  investment_debate: 45,
  research_manager: 60,
  trader: 70,
  risk_debate: 85,
  risk_manager: 95,
  finalizing: 100
}

const createInitialState = <Result,>(): TradingProgressState<Result> => ({
  runId: null,
  status: 'idle',
  events: [],
  percent: 0,
  currentStage: null,
  currentLabel: null,
  message: null,
  error: null,
  result: null,
  modelId: null,
  analysts: [],
  startedAt: null,
  durationMs: null,
  mode: null
})

const reducer = <Result,>(state: TradingProgressState<Result>, action: Action<Result>): TradingProgressState<Result> => {
  switch (action.type) {
    case 'reset':
      return createInitialState<Result>()
    case 'connect':
      return {
        ...createInitialState<Result>(),
        runId: action.runId,
        status: 'connecting',
        startedAt: Date.now()
      }
    case 'progress': {
      const nextPercent = action.event.percent ?? (STAGE_FALLBACK_PERCENT[action.event.stage] ?? state.percent)
      const analysts = action.event.analysts ?? state.analysts
      const eventTimestamp = action.event.timestamp
      const startedAt =
        typeof state.startedAt === 'number'
          ? Math.min(state.startedAt, eventTimestamp)
          : typeof eventTimestamp === 'number'
            ? eventTimestamp
            : Date.now()
      const mode = action.event.mode ?? state.mode
      return {
        ...state,
        status: state.status === 'idle' ? 'streaming' : 'streaming',
        events: [...state.events, action.event],
        percent: Math.max(state.percent, nextPercent),
        currentStage: action.event.stage,
        currentLabel: action.event.label,
        message: action.event.message ?? state.message,
        modelId: action.event.modelId ?? state.modelId,
        analysts: Array.isArray(analysts) ? analysts : state.analysts,
        startedAt,
        durationMs: state.durationMs,
        mode
      }
    }
    case 'complete': {
      const resultRecord = action.payload.result as Record<string, unknown> | null
      const resultModelId = typeof resultRecord?.modelId === 'string' ? (resultRecord.modelId as string) : undefined
      const resultAnalysts = Array.isArray(resultRecord?.analysts)
        ? ([...(resultRecord.analysts as string[])] as string[])
        : undefined
      const resultExecutionMs =
        typeof resultRecord?.executionMs === 'number' && Number.isFinite(resultRecord.executionMs)
          ? Math.max(0, Math.trunc(resultRecord.executionMs))
          : null
      const startedAt = state.startedAt ?? state.events.at(0)?.timestamp ?? null
      const computedDuration =
        resultExecutionMs ??
        (startedAt ? Math.max(0, Date.now() - startedAt) : null)
      return {
        ...state,
        status: 'complete',
        result: action.payload.result,
        percent: Math.max(state.percent, 100),
        error: null,
        modelId: state.modelId ?? resultModelId ?? null,
        analysts: state.analysts.length > 0 ? state.analysts : resultAnalysts ?? [],
        durationMs: computedDuration,
        startedAt,
        mode: state.mode
      }
    }
    case 'error':
      return {
        ...state,
        status: 'error',
        error: action.payload.message,
        message: action.payload.message,
        durationMs: state.durationMs,
        mode: state.mode
      }
    case 'disconnect':
      return {
        ...state,
        status: state.status === 'complete' || state.status === 'error' ? state.status : 'idle'
      }
    default:
      return state
  }
}

export const useTradingProgress = <Result = unknown>(
  runId: string | null | undefined,
  options?: UseTradingProgressOptions<Result>
) => {
  const { apiBaseUrl, parseResult, enabled = true } = options ?? {}
  const [state, dispatch] = useReducer(reducer<Result>, undefined, () => createInitialState<Result>())
  const sourceRef = useRef<EventSource | null>(null)
  const parseResultRef = useRef<typeof parseResult>(parseResult)

  useEffect(() => {
    parseResultRef.current = parseResult
  }, [parseResult])

  const closeSource = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close()
      sourceRef.current = null
      dispatch({ type: 'disconnect' })
    }
  }, [])

  useEffect(() => {
    if (!enabled || !runId) {
      closeSource()
      dispatch({ type: 'reset' })
      return
    }

    // Avoid re-connecting to the same runId.
    if (state.runId !== runId || sourceRef.current === null) {
      closeSource()
      dispatch({ type: 'connect', runId })

      const base = apiBaseUrl?.replace(/\/+$/, '') ?? window.location.origin
      const url = `${base}/api/trading/decision/internal/events/${encodeURIComponent(runId)}`
      const eventSource = apiBaseUrl
        ? new EventSource(url, { withCredentials: true })
        : new EventSource(url)
      sourceRef.current = eventSource

      const handleProgress = (event: MessageEvent<string>) => {
        try {
          const payload = JSON.parse(event.data) as TradingProgressEvent
          if (payload.runId !== runId) return
          dispatch({ type: 'progress', event: payload })
        } catch (error) {
          console.error('[useTradingProgress] Failed to parse progress event', error)
        }
      }

      const handleComplete = (event: MessageEvent<string>) => {
        try {
          const payload = JSON.parse(event.data) as TradingProgressCompletePayload
          if (payload.runId !== runId) return
          const parser = parseResultRef.current
          const result = parser ? parser(payload.result) : (payload.result as Result)
          dispatch({ type: 'complete', payload: { runId: payload.runId, result } })
          closeSource()
        } catch (error) {
          console.error('[useTradingProgress] Failed to parse completion event', error)
          dispatch({
            type: 'error',
            payload: { runId: runId ?? '', message: 'Unable to parse completion event.' }
          })
          closeSource()
        }
      }

      const handleError = (event: MessageEvent<string>) => {
        try {
          const payload = JSON.parse(event.data) as TradingProgressErrorPayload
          if (payload.runId !== runId) return
          dispatch({ type: 'error', payload })
        } catch {
          dispatch({
            type: 'error',
            payload: { runId: runId ?? '', message: 'Streaming connection failed.' }
          })
        } finally {
          closeSource()
        }
      }

      const handleGenericError = () => {
        dispatch({
          type: 'error',
          payload: { runId: runId ?? '', message: 'Streaming connection lost.' }
        })
        closeSource()
      }

      eventSource.addEventListener('progress', handleProgress)
      eventSource.addEventListener('complete', handleComplete)
      eventSource.addEventListener('error', handleError)
      eventSource.onerror = handleGenericError

      return () => {
        eventSource.removeEventListener('progress', handleProgress)
        eventSource.removeEventListener('complete', handleComplete)
        eventSource.removeEventListener('error', handleError)
        eventSource.onerror = null
        closeSource()
      }
    }
  }, [apiBaseUrl, closeSource, enabled, runId, state.runId])

  useEffect(() => closeSource, [closeSource])

  return {
    state,
    disconnect: closeSource
  }
}
