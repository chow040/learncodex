import { useQuery } from '@tanstack/react-query'

import type { TradingAnalystId } from './useTradingAssessments'

export interface TradingAssessmentDetail {
  runId: string
  symbol: string
  tradeDate: string
  decision: string | null
  modelId: string | null
  analysts: TradingAnalystId[]
  createdAt: string
  orchestratorVersion: string | null
  payload: unknown
  rawText: string | null
  promptHash: string | null
  logsPath: string | null
  executionMs: number | null
  traderPlan: string | null
  investmentPlan: string | null
  riskJudge: string | null
  investmentDebate: string | null
  bullArgument: string | null
  bearArgument: string | null
  aggressiveArgument: string | null
  conservativeArgument: string | null
  neutralArgument: string | null
  riskDebate: string | null
}

export interface UseTradingAssessmentDetailOptions {
  apiBaseUrl?: string
  enabled?: boolean
}

interface TradingAssessmentDetailApiResponse {
  runId: string
  symbol: string
  tradeDate: string
  decision: string | null
  modelId: string | null
  analysts?: string[] | null
  createdAt: string
  orchestratorVersion?: string | null
  payload?: unknown
  rawText?: string | null
  promptHash?: string | null
  logsPath?: string | null
  executionMs?: number | null
  traderPlan?: string | null
  investmentPlan?: string | null
  riskJudge?: string | null
  investmentDebate?: string | null
  bullArgument?: string | null
  bearArgument?: string | null
  aggressiveArgument?: string | null
  conservativeArgument?: string | null
  neutralArgument?: string | null
  riskDebate?: string | null
}

const DEFAULT_ANALYSTS: TradingAnalystId[] = ['fundamental', 'market', 'news', 'social']

const sanitizeAnalysts = (value: unknown): TradingAnalystId[] => {
  if (!Array.isArray(value)) return [...DEFAULT_ANALYSTS]
  const valid = value.filter(
    (entry): entry is TradingAnalystId =>
      typeof entry === 'string' && (DEFAULT_ANALYSTS as readonly string[]).includes(entry)
  )
  return valid.length > 0 ? valid : [...DEFAULT_ANALYSTS]
}

const resolveBaseUrl = (input?: string): string => {
  const provided = typeof input === 'string' && input.trim().length > 0 ? input.trim() : undefined
  const envBase = (import.meta.env?.VITE_API_BASE_URL as string | undefined)?.trim()
  const raw = provided ?? envBase
  if (!raw) {
    throw new Error('VITE_API_BASE_URL is not configured')
  }
  return raw.replace(/\/+$/, '')
}

const fetchTradingAssessmentDetail = async (
  runId: string,
  baseUrl: string
): Promise<TradingAssessmentDetail> => {
  const url = `${baseUrl}/api/trading/assessments/${encodeURIComponent(runId)}`
  const response = await fetch(url, { credentials: 'include' })

  if (!response.ok) {
    let errorMessage = 'Unable to load trading assessment.'
    try {
      const payload = (await response.json()) as { error?: string }
      if (payload?.error) {
        errorMessage = payload.error
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(errorMessage)
  }

  const payload = (await response.json()) as TradingAssessmentDetailApiResponse
  return {
    runId: payload.runId,
    symbol: payload.symbol,
    tradeDate: payload.tradeDate,
    decision: payload.decision ?? null,
    modelId: payload.modelId ?? null,
    analysts: sanitizeAnalysts(payload.analysts),
    createdAt: payload.createdAt,
    orchestratorVersion: payload.orchestratorVersion ?? null,
    payload: payload.payload ?? null,
    rawText: payload.rawText ?? null,
    promptHash: payload.promptHash ?? null,
    logsPath: payload.logsPath ?? null,
    executionMs:
      typeof payload.executionMs === 'number' && Number.isFinite(payload.executionMs)
        ? Math.trunc(payload.executionMs)
        : null,
    traderPlan: typeof payload.traderPlan === 'string' ? payload.traderPlan : null,
    investmentPlan: typeof payload.investmentPlan === 'string' ? payload.investmentPlan : null,
    riskJudge: typeof payload.riskJudge === 'string' ? payload.riskJudge : null,
    investmentDebate: typeof payload.investmentDebate === 'string' ? payload.investmentDebate : null,
    bullArgument: typeof payload.bullArgument === 'string' ? payload.bullArgument : null,
    bearArgument: typeof payload.bearArgument === 'string' ? payload.bearArgument : null,
    aggressiveArgument: typeof payload.aggressiveArgument === 'string' ? payload.aggressiveArgument : null,
    conservativeArgument: typeof payload.conservativeArgument === 'string' ? payload.conservativeArgument : null,
    neutralArgument: typeof payload.neutralArgument === 'string' ? payload.neutralArgument : null,
    riskDebate: typeof payload.riskDebate === 'string' ? payload.riskDebate : null
  }
}

export const useTradingAssessmentDetail = (
  runId: string | undefined,
  options?: UseTradingAssessmentDetailOptions
) => {
  const baseUrl = resolveBaseUrl(options?.apiBaseUrl)
  const enabled = (options?.enabled ?? true) && Boolean(runId && runId.trim().length > 0)

  return useQuery({
    queryKey: ['tradingAssessmentDetail', runId, baseUrl],
    queryFn: () => fetchTradingAssessmentDetail(runId as string, baseUrl),
    enabled,
    staleTime: 30_000,
    retry: 1
  })
}
