const normalizeUrl = (value?: string): string | undefined => {
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed.replace(/\/+$/, "") : undefined
}

export const resolveApiBaseUrl = (input?: string): string => {
  const provided = normalizeUrl(input)
  const envBase = normalizeUrl(import.meta.env?.VITE_API_BASE_URL as string | undefined)
  const raw = provided ?? envBase
  if (!raw) {
    throw new Error("VITE_API_BASE_URL is not configured")
  }
  return raw
}

export const resolveAutotradeApiBaseUrl = (input?: string): string => {
  const provided = normalizeUrl(input)
  const autotradeBase = normalizeUrl(import.meta.env?.VITE_AUTOTRADE_API_BASE_URL as string | undefined)
  const fallback = normalizeUrl(import.meta.env?.VITE_API_BASE_URL as string | undefined)
  const raw = provided ?? autotradeBase ?? fallback
  if (!raw) {
    throw new Error("VITE_AUTOTRADE_API_BASE_URL (or VITE_API_BASE_URL) is not configured")
  }
  return raw
}

export const resolveMarketDataBaseUrl = (): string => {
  const envBase = normalizeUrl(import.meta.env?.VITE_MARKET_DATA_BASE_URL as string | undefined)
  if (envBase) {
    return envBase
  }
  return resolveApiBaseUrl()
}

export const resolveMarketDataWsUrl = (): string => {
  const wsEnv = (import.meta.env?.VITE_MARKET_DATA_WS_URL as string | undefined)?.trim()
  if (wsEnv) {
    return wsEnv
  }
  const base = resolveMarketDataBaseUrl()
  const trimmed = base.replace(/\/+$/, "")
  if (trimmed.startsWith("https://")) {
    return `${trimmed.replace("https://", "wss://")}/ws/market-data`
  }
  if (trimmed.startsWith("http://")) {
    return `${trimmed.replace("http://", "ws://")}/ws/market-data`
  }
  return `${trimmed}/ws/market-data`
}
