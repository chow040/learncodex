import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react"
import { ArrowDown, ArrowUp } from "lucide-react"
import {
  SiBitcoin,
  SiEthereum,
  SiSolana,
  SiBinance,
  SiDogecoin,
  SiRipple,
} from "@icons-pack/react-simple-icons"
import { formatDistanceToNowStrict } from "date-fns"

import { resolveMarketDataBaseUrl, resolveMarketDataWsUrl } from "../../lib/api"
import { Container } from "../ui/container"

type ConnectionState = "connecting" | "live" | "offline"

type DisplaySymbol = {
  symbol: string
  label: string
  Icon: ComponentType<{ size?: number; className?: string }>
}

interface PriceTicker {
  symbol: string
  price: number | null
  changePct: number | null
  volume24h?: number | null
  high24h?: number | null
  low24h?: number | null
  updatedAt?: string | null
  priceDelta?: number
}

const SYMBOL_ICON_MAP: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  BTC: SiBitcoin,
  ETH: SiEthereum,
  SOL: SiSolana,
  BNB: SiBinance,
  DOGE: SiDogecoin,
  XRP: SiRipple,
}

const DEFAULT_DISPLAY_SYMBOLS: DisplaySymbol[] = [
  { symbol: "BTC-USD", label: "BTC", Icon: SYMBOL_ICON_MAP.BTC },
  { symbol: "ETH-USD", label: "ETH", Icon: SYMBOL_ICON_MAP.ETH },
  { symbol: "SOL-USD", label: "SOL", Icon: SYMBOL_ICON_MAP.SOL },
  { symbol: "BNB-USD", label: "BNB", Icon: SYMBOL_ICON_MAP.BNB },
  { symbol: "DOGE-USD", label: "DOGE", Icon: SYMBOL_ICON_MAP.DOGE },
  { symbol: "XRP-USD", label: "XRP", Icon: SYMBOL_ICON_MAP.XRP },
]

const resolveDisplaySymbols = (): DisplaySymbol[] => {
  const envValue = import.meta.env?.VITE_MARKET_TICKERS as string | undefined
  if (!envValue) {
    return DEFAULT_DISPLAY_SYMBOLS
  }
  const tokens = envValue
    .split(",")
    .map((token) => token.trim().toUpperCase())
    .filter((token) => token.length > 0)
  if (!tokens.length) {
    return DEFAULT_DISPLAY_SYMBOLS
  }
  const seen = new Set<string>()
  const symbols: DisplaySymbol[] = []
  for (const symbol of tokens) {
    if (seen.has(symbol)) continue
    seen.add(symbol)
    const label = symbol.split("-")[0] || symbol
    const Icon = SYMBOL_ICON_MAP[label] ?? SYMBOL_ICON_MAP.BTC
    symbols.push({ symbol, label, Icon })
  }
  return symbols
}

const DISPLAY_SYMBOLS = resolveDisplaySymbols()

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number") return value
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

type PriceBannerProps = {
  fetchPrices?: () => Promise<Record<string, any>>
  wsFactory?: (url: string) => WebSocket
}

const defaultFetchPrices = async (baseUrl: string) => {
  const response = await fetch(`${baseUrl}/api/market/v1/prices`, { credentials: "include" })
  if (!response.ok) {
    throw new Error("Failed to load prices")
  }
  const payload = await response.json()
  return (payload?.symbols ?? {}) as Record<string, any>
}

const defaultWsFactory = (url: string) => new WebSocket(url)

const PriceBanner: React.FC<PriceBannerProps> = ({ fetchPrices, wsFactory }) => {
  const baseUrl = useMemo(() => resolveMarketDataBaseUrl(), [])
  const wsUrl = useMemo(() => resolveMarketDataWsUrl(), [])
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting")
  const [marketData, setMarketData] = useState<Record<string, PriceTicker>>({})
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const reconnectRef = useRef<number | null>(null)
  const pingRef = useRef<number | null>(null)

  const updateSnapshot = useCallback((payload: Record<string, any>) => {
    setMarketData((prev) => {
      const next = { ...prev }
      Object.entries(payload).forEach(([symbol, raw]) => {
        const newPrice = toNumber(
          raw?.price ?? raw?.last_price ?? raw?.ticker?.price ?? raw?.ticker?.last_price,
        )
        const changePct = toNumber(
          raw?.change_pct_24h ??
            raw?.change_pct ??
            raw?.ticker?.change_pct_24h ??
            raw?.ticker?.changePct24h,
        )

        const previousPrice = prev[symbol]?.price ?? null
        const entry: PriceTicker = {
          symbol,
          price: newPrice,
          changePct,
          volume24h: toNumber(raw?.volume_24h ?? raw?.ticker?.volume_24h),
          high24h: toNumber(raw?.high_24h ?? raw?.ticker?.high_24h),
          low24h: toNumber(raw?.low_24h ?? raw?.ticker?.low_24h),
          updatedAt: raw?.timestamp ?? raw?.ticker?.timestamp ?? null,
        }
        if (previousPrice != null && newPrice != null) {
          entry.priceDelta = newPrice - previousPrice
        }
        next[symbol] = entry
      })
      return next
    })
  }, [])

  const fetchInitialPrices = useCallback(async () => {
    try {
      const loader = fetchPrices ? fetchPrices : () => defaultFetchPrices(baseUrl)
      const symbols = await loader()
      if (symbols) {
        updateSnapshot(symbols)
        setLastUpdated(new Date().toISOString())
      }
    } catch (error) {
      console.warn("Failed to load initial market prices", error)
    }
  }, [baseUrl, fetchPrices, updateSnapshot])

  useEffect(() => {
    void fetchInitialPrices()
  }, [fetchInitialPrices])

  useEffect(() => {
    let ws: WebSocket | null = null

    const cleanupTimers = () => {
      if (pingRef.current) {
        window.clearInterval(pingRef.current)
        pingRef.current = null
      }
      if (reconnectRef.current) {
        window.clearTimeout(reconnectRef.current)
        reconnectRef.current = null
      }
    }

    const connect = () => {
      cleanupTimers()
      setConnectionState("connecting")
      const factory = wsFactory ?? ((url: string) => defaultWsFactory(url))
      ws = factory(wsUrl)

      ws.onopen = () => {
        setConnectionState("live")
        pingRef.current = window.setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send("ping")
          }
        }, 30_000)
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          if (message?.type === "market_update" && message?.data) {
            updateSnapshot(message.data)
            setLastUpdated(message.timestamp ?? new Date().toISOString())
          }
        } catch (error) {
          console.warn("Failed to parse market update", error)
        }
      }

      ws.onerror = () => {
        setConnectionState("offline")
      }

      ws.onclose = () => {
        setConnectionState("offline")
        cleanupTimers()
        reconnectRef.current = window.setTimeout(connect, 5_000)
      }
    }

    connect()

    return () => {
      cleanupTimers()
      ws?.close()
    }
  }, [baseUrl, updateSnapshot])

  const statusLabel = useMemo(() => {
    switch (connectionState) {
      case "live":
        return "Live"
      case "offline":
        return "Reconnecting"
      default:
        return "Connecting"
    }
  }, [connectionState])

  const statusColor = useMemo(() => {
    switch (connectionState) {
      case "live":
        return "bg-emerald-500"
      case "offline":
        return "bg-amber-500"
      default:
        return "bg-slate-400"
    }
  }, [connectionState])

const formatPrice = (price: number | null) => {
    if (price == null) return "--"
    if (price >= 1000) {
      return `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    }
    if (price >= 1) {
      return `$${price.toFixed(2)}`
    }
    return `$${price.toFixed(4)}`
  }

  const formatChange = (change: number | null) => {
    if (change == null) return "--"
    const prefixed = change >= 0 ? `+${change.toFixed(2)}%` : `${change.toFixed(2)}%`
    return prefixed
  }

  const renderTickerCard = (
    symbol: string,
    label: string,
    IconComponent: ComponentType<{ size?: number; className?: string }>,
  ) => {
    const data = marketData[symbol]

    if (!data) {
      return (
        <div key={symbol} className="flex min-w-[140px] flex-col gap-2">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="flex flex-col gap-2">
            <div className="h-5 w-24 animate-pulse rounded bg-muted" />
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          </div>
        </div>
      )
    }

    const changePositive = (data.changePct ?? 0) >= 0
    const highlight =
      typeof data.priceDelta === "number" && data.priceDelta !== 0
        ? data.priceDelta > 0
          ? "price-up"
          : "price-down"
        : null

    return (
      <div
        key={symbol}
        className="ticker-card flex min-w-[160px] items-center gap-3"
        data-highlight={highlight ?? undefined}
      >
        <IconComponent size={20} className="text-muted-foreground" aria-hidden />
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-muted-foreground">{label}</span>
          <span className="text-sm font-semibold text-foreground">{formatPrice(data.price)}</span>
        </div>
        <div
          className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
            changePositive ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
          }`}
        >
          {changePositive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          <span>{formatChange(data.changePct)}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <Container className="flex flex-col gap-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${statusColor}`} aria-live="polite" />
            <span>{statusLabel}</span>
          </div>
          {lastUpdated && (
            <div className="flex items-center gap-2 text-muted-foreground/80">
              <span className="hidden sm:inline">Updated</span>
              <span className="font-medium">
                {formatDistanceToNowStrict(new Date(lastUpdated), { addSuffix: true })}
              </span>
            </div>
          )}
        </div>
        <div className="flex w-full items-center gap-6 overflow-x-auto pb-1">
          {DISPLAY_SYMBOLS.map(({ symbol, label, Icon }) => renderTickerCard(symbol, label, Icon))}
        </div>
      </Container>
    </div>
  )
}

export default PriceBanner
