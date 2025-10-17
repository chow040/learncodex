import { useInfiniteQuery, type InfiniteData, type UseInfiniteQueryResult } from '@tanstack/react-query'

export type TradingAnalystId = 'fundamental' | 'market' | 'news' | 'social'

export interface TradingAssessmentSummary {
  runId: string
  symbol: string
  tradeDate: string
  decision: string | null
  modelId: string | null
  analysts: TradingAnalystId[]
  createdAt: string
  orchestratorVersion: string | null
}

export interface TradingAssessmentsPage {
  items: TradingAssessmentSummary[]
  nextCursor?: string
}

export interface UseTradingAssessmentsOptions {
  /**
   * Optional API base URL. Defaults to `VITE_API_BASE_URL` or `http://localhost:4000`.
   */
  apiBaseUrl?: string
  /**
   * Page size for the query (clamped between 1 and 20).
   */
  limit?: number
  /**
   * When false the hook stays idle.
   */
  enabled?: boolean
}

interface TradingAssessmentsApiResponse {
  items: Array<{
    runId: string
    symbol: string
    tradeDate: string
    decision: string | null
    modelId: string | null
    analysts?: string[] | null
    createdAt: string
    orchestratorVersion?: string | null
  }>
  nextCursor?: string
}

const DEFAULT_ANALYSTS: TradingAnalystId[] = ['fundamental', 'market', 'news', 'social']
const DEFAULT_LIMIT = 5
const MAX_LIMIT = 20
const MIN_SYMBOL_LENGTH = 2

const clampLimit = (limit?: number): number => {
  if (typeof limit !== 'number' || Number.isNaN(limit) || limit <= 0) {
    return DEFAULT_LIMIT
  }
  return Math.min(Math.max(Math.floor(limit), 1), MAX_LIMIT)
}

const sanitizeAnalysts = (value: unknown): TradingAnalystId[] => {
  if (!Array.isArray(value)) {
    return [...DEFAULT_ANALYSTS]
  }
  const valid = value.filter(
    (entry): entry is TradingAnalystId =>
      typeof entry === 'string' && (DEFAULT_ANALYSTS as readonly string[]).includes(entry)
  )
  return valid.length > 0 ? valid : [...DEFAULT_ANALYSTS]
}

const mapSummary = (input: TradingAssessmentsApiResponse['items'][number]): TradingAssessmentSummary => ({
  runId: input.runId,
  symbol: input.symbol,
  tradeDate: input.tradeDate,
  decision: input.decision ?? null,
  modelId: input.modelId ?? null,
  analysts: sanitizeAnalysts(input.analysts),
  createdAt: input.createdAt,
  orchestratorVersion: input.orchestratorVersion ?? null
})

const resolveBaseUrl = (input?: string): string => {
  const fallback = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4000'
  const fromEnv = (import.meta.env?.VITE_API_BASE_URL as string | undefined) ?? fallback
  const raw = input && input.trim().length > 0 ? input : fromEnv
  return raw.replace(/\/+$/, '')
}

const fetchTradingAssessments = async (
  symbol: string,
  limit: number,
  baseUrl: string,
  cursor?: string
): Promise<TradingAssessmentsPage> => {
  const search = new URLSearchParams({ symbol, limit: String(limit) })
  if (cursor) {
    search.set('cursor', cursor)
  }

  const url = `${baseUrl}/api/trading/assessments?${search.toString()}`
  const response = await fetch(url, {
    credentials: 'include'
  })

  if (!response.ok) {
    let reason = 'Unable to load trading assessments.'
    try {
      const payload = (await response.json()) as { error?: string }
      if (payload?.error) {
        reason = payload.error
      }
    } catch {
      // ignore parsing failure, keep fallback reason
    }
    throw new Error(reason)
  }

  const payload = (await response.json()) as TradingAssessmentsApiResponse
  return {
    items: payload.items.map(mapSummary),
    ...(payload.nextCursor ? { nextCursor: payload.nextCursor } : {})
  }
}

export interface UseTradingAssessmentsResult {
  assessments: TradingAssessmentSummary[]
  nextCursor?: string
  query: UseInfiniteQueryResult<InfiniteData<TradingAssessmentsPage>, Error>
}

export const useTradingAssessments = (
  symbol: string | null | undefined,
  options?: UseTradingAssessmentsOptions
): UseTradingAssessmentsResult => {
  const normalizedSymbol = typeof symbol === 'string' ? symbol.trim().toUpperCase() : ''
  const limit = clampLimit(options?.limit)
  const baseUrl = resolveBaseUrl(options?.apiBaseUrl)
  const enabled = (options?.enabled ?? true) && normalizedSymbol.length >= MIN_SYMBOL_LENGTH

  const query = useInfiniteQuery<TradingAssessmentsPage, Error, InfiniteData<TradingAssessmentsPage>>({
    queryKey: ['tradingAssessments', normalizedSymbol, limit, baseUrl],
    queryFn: ({ pageParam }) =>
      fetchTradingAssessments(normalizedSymbol, limit, baseUrl, pageParam as string | undefined),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled,
    refetchOnWindowFocus: false
  })

  const assessments = query.data?.pages.flatMap((page) => page.items) ?? []
  const nextCursor = query.data?.pages.at(-1)?.nextCursor

  return {
    assessments,
    nextCursor,
    query
  }
}
