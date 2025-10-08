import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react"
import { captureScreenshot, shareScreenshot } from "../utils/screenshot"

const API_BASE_URL = (() => {
  const envValue = import.meta.env.VITE_API_BASE_URL
  if (typeof envValue === 'string' && envValue.trim().length > 0) {
    return envValue.trim().replace(/\/$/, '')
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    const { hostname, port, origin } = window.location

    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1'
    const devPorts = new Set(['5173', '4173', '3000'])

    if (!isLocalHost || (port && !devPorts.has(port))) {
      return origin.replace(/\/$/, '')
    }
  }

  return 'http://localhost:4000'
})()
const DEFAULT_TRADE_ID = "workspace"

const MAX_SIZE_MB = 5
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']

const normalizeSectionId = (title: string) =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section'

const splitPoints = (content: string) =>
  content
    .split(/\n+/)
    .map((line) => line.trim().replace(/^[-*]\s*/, ''))
    .filter(Boolean)

const parseKeyValueLines = (content: string) => {
  const lines: string[] = []
  const map: Record<string, string> = {}

  for (const rawLine of content.split(/\n+/)) {
    const normalized = rawLine.trim().replace(/^[-*]\s*/, '')
    if (!normalized) continue

    lines.push(normalized)
    const match = /^([^:]+):\s*(.+)$/.exec(normalized)
    if (match) {
      map[match[1].toLowerCase()] = match[2].trim()
    }
  }

  return { lines, map }
}

interface ChartAnalysisUsage {
  prompt_tokens?: number
  completion_tokens?: number
  reasoning_tokens?: number
  total_tokens?: number
}

interface ChartAnalysisPayload {
  rawText: string
  sections: Record<string, string>
  annotations: Record<string, unknown> | null
  usage?: ChartAnalysisUsage
}

interface ChartAnalysisResponse {
  tradeIdeaId: string | null
  ticker?: string
  timeframe?: string
  analysis: ChartAnalysisPayload
}

interface ChartDebateUsage {
  prompt_tokens?: number
  completion_tokens?: number
  reasoning_tokens?: number
  total_tokens?: number
}

interface ChartDebatePayload {
  agentA: { rawText: string; sections: Record<string, string>; usage?: ChartDebateUsage }
  agentB: { rawText: string; sections: Record<string, string>; usage?: ChartDebateUsage }
  referee: { rawText: string; sections: Record<string, string>; consensusJson?: Record<string, unknown> | null; usage?: ChartDebateUsage }
  logFile?: string
}

interface DebateJobStep {
  step: string
  message: string
  detail?: string
  timestamp: string
}

interface DebateJobStatusResponse {
  jobId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  currentStep: string | null
  steps: DebateJobStep[]
  error?: string
  result?: ChartDebatePayload
}

const DEBATE_PROGRESS_FLOW: Array<{ step: string; label: string }> = [
  { step: 'trader_analyzing', label: 'Trader analyzing chart' },
  { step: 'trader_to_risk_manager', label: 'Trader → Risk Manager' },
  { step: 'risk_manager_reviewing', label: 'Risk manager reviewing' },
  { step: 'risk_manager_feedback', label: 'Risk manager feedback' },
  { step: 'trader_reassessing', label: 'Trader revises' },
  { step: 'referee_merging', label: 'Referee merges plan' },
]

const TradeIdeas = () => {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<ChartAnalysisPayload | null>(null)
  const [debate, setDebate] = useState<ChartDebatePayload | null>(null)
  const [useDebate, setUseDebate] = useState<boolean>(true)
  const [aRounds, setARounds] = useState<number>(1)
  const [bRounds, setBRounds] = useState<number>(1)
  const [timeframe, setTimeframe] = useState('')
  const [debateJobId, setDebateJobId] = useState<string | null>(null)
  const [debateJobStatus, setDebateJobStatus] = useState<'idle' | 'pending' | 'running' | 'completed' | 'failed'>('idle')
  const [debateJobSteps, setDebateJobSteps] = useState<DebateJobStep[]>([])
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const screenshotRef = useRef<HTMLDivElement | null>(null)
  const debatePollingRef = useRef<number | null>(null)

  const resetState = () => {
    if (debatePollingRef.current) {
      clearInterval(debatePollingRef.current)
      debatePollingRef.current = null
    }
    setDebateJobId(null)
    setDebateJobStatus('idle')
    setDebateJobSteps([])
    setFile(null)
    setPreview(null)
    setError(null)
    setIsAnalyzing(false)
    setAnalysis(null)
    setDebate(null)
  }

  const handleScreenshot = useCallback(async () => {
    if (!screenshotRef.current) {
      setError('Screenshot area not found')
      return
    }

    try {
      setIsCapturingScreenshot(true)
      setError(null)
      
      const filename = `trade-idea-analysis-${new Date().toISOString().split('T')[0]}.png`
      
      await captureScreenshot(screenshotRef.current, {
        filename,
        backgroundColor: '#0f172a', // Match your dark theme
        scale: 2,
        quality: 0.9
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to capture screenshot'
      setError(message)
    } finally {
      setIsCapturingScreenshot(false)
    }
  }, [])

  const handleShare = useCallback(async () => {
    if (!screenshotRef.current) {
      setError('Screenshot area not found')
      return
    }

    if (!('share' in navigator)) {
      setError('Sharing not supported on this device')
      return
    }

    try {
      setIsCapturingScreenshot(true)
      setError(null)
      
      const filename = `trade-idea-analysis-${new Date().toISOString().split('T')[0]}.png`
      
      await shareScreenshot(screenshotRef.current, {
        filename,
        backgroundColor: '#0f172a',
        scale: 2,
        quality: 0.9
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to share screenshot'
      setError(message)
    } finally {
      setIsCapturingScreenshot(false)
    }
  }, [])

  const analyzeFile = useCallback(
    async (selectedFile: File) => {
      if (debatePollingRef.current) {
        clearInterval(debatePollingRef.current)
        debatePollingRef.current = null
      }

      setIsAnalyzing(true)
      setError(null)
      setAnalysis(null)
      setDebate(null)
      setDebateJobId(null)
      setDebateJobSteps([])
      setDebateJobStatus(useDebate ? 'pending' : 'idle')

      const formData = new FormData()
      formData.append('image', selectedFile, selectedFile.name)

      const trimmedTimeframe = timeframe.trim()
      if (trimmedTimeframe) {
        formData.append('timeframe', trimmedTimeframe)
      }

      const tradeIdeaId = DEFAULT_TRADE_ID
      let shouldStopAnalyzing = !useDebate

      try {
        const endpoint = useDebate
          ? `${API_BASE_URL}/api/trading/trade-ideas/${encodeURIComponent(tradeIdeaId)}/chart-debate`
          : `${API_BASE_URL}/api/trading/trade-ideas/${encodeURIComponent(tradeIdeaId)}/chart-analysis`

        if (useDebate) {
          formData.append('aRounds', String(Math.max(1, aRounds || 1)))
          formData.append('bRounds', String(Math.max(0, bRounds || 0)))
        }

        const response = await fetch(endpoint, { method: 'POST', body: formData })

        const rawPayload = await response.text()
        let payload: any = {}
        if (rawPayload) {
          try {
            payload = JSON.parse(rawPayload)
          } catch (parseErr) {
            console.error('Unexpected debate response payload:', parseErr, rawPayload)
            throw new Error('Unexpected response from debate service.')
          }
        }

        if (!response.ok) {
          let message = 'Failed to analyze chart.'
          if (payload?.error && typeof payload.error === 'string') {
            message = payload.error
          } else if (rawPayload) {
            message = rawPayload
          }
          throw new Error(message)
        }

        if (useDebate) {
          const jobPayload = payload as { jobId?: string; error?: string }
          if (typeof jobPayload?.error === 'string') {
            throw new Error(jobPayload.error)
          }
          if (!jobPayload?.jobId) {
            throw new Error('Missing debate job identifier from response.')
          }
          setDebateJobStatus('running')
          setDebateJobId(jobPayload.jobId)
          shouldStopAnalyzing = false
        } else {
          const analysisPayload = payload as ChartAnalysisResponse
          if (!analysisPayload?.analysis) {
            throw new Error('Analysis payload missing from response.')
          }
          setAnalysis(analysisPayload.analysis)
          setDebate(null)
          shouldStopAnalyzing = true
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to analyze chart.'
        setError(message)
        if (useDebate) {
          setDebateJobStatus('failed')
          setDebateJobId(null)
        }
        shouldStopAnalyzing = true
      } finally {
        if (shouldStopAnalyzing) {
          setIsAnalyzing(false)
        }
      }
    },
    [timeframe, useDebate, aRounds, bRounds]
  )

  useEffect(() => {
    if (!debateJobId) {
      return undefined
    }

    let cancelled = false

    const fetchStatus = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/trading/trade-ideas/chart-debate/jobs/${encodeURIComponent(debateJobId)}`
        )

        const rawPayload = await response.text()
        let payload: DebateJobStatusResponse | null = null
        if (rawPayload) {
          try {
            payload = JSON.parse(rawPayload) as DebateJobStatusResponse
          } catch (parseErr) {
            console.error('Unexpected debate status payload:', parseErr, rawPayload)
            // leave payload null; we'll handle below
          }
        }

        if (!response.ok) {
          let message = 'Failed to fetch debate status.'
          if (payload?.error && typeof payload.error === 'string') {
            message = payload.error
          } else if (rawPayload) {
            message = rawPayload
          }
          throw new Error(message)
        }

        if (!payload) {
          throw new Error('Debate status response was empty or malformed.')
        }
        if (cancelled) return

        setDebateJobStatus(payload.status)
        setDebateJobSteps(payload.steps ?? [])

        if (payload.status === 'completed' && payload.result) {
          const result = payload.result
          setDebate(result)

          const consensus: ChartAnalysisPayload = {
            rawText: result.referee.rawText,
            sections: result.referee.sections,
            annotations: null,
            usage: result.referee.usage,
          }
          setAnalysis(consensus)
          setIsAnalyzing(false)
          setDebateJobId(null)
          if (debatePollingRef.current) {
            clearInterval(debatePollingRef.current)
            debatePollingRef.current = null
          }
        } else if (payload.status === 'failed') {
          setError(payload.error ?? 'Chart debate failed.')
          setIsAnalyzing(false)
          setDebateJobId(null)
          if (debatePollingRef.current) {
            clearInterval(debatePollingRef.current)
            debatePollingRef.current = null
          }
        }
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Failed to fetch debate status.'
        setError(message)
        setDebateJobStatus('failed')
        setIsAnalyzing(false)
        setDebateJobId(null)
        if (debatePollingRef.current) {
          clearInterval(debatePollingRef.current)
          debatePollingRef.current = null
        }
      }
    }

    void fetchStatus()
    debatePollingRef.current = window.setInterval(fetchStatus, 2000)

    return () => {
      cancelled = true
      if (debatePollingRef.current) {
        clearInterval(debatePollingRef.current)
        debatePollingRef.current = null
      }
    }
  }, [debateJobId])

  const debateProgressState = useMemo(
    () =>
      DEBATE_PROGRESS_FLOW.map((item) => {
        const completedSteps = new Set(debateJobSteps.map((step) => step.step))
        const currentStep = debateJobSteps.length ? debateJobSteps[debateJobSteps.length - 1].step : null
        const status: 'done' | 'active' | 'upcoming' =
          completedSteps.has(item.step) ? 'done' : currentStep === item.step ? 'active' : 'upcoming'
        return { ...item, status }
      }),
    [debateJobSteps]
  )

  const isDebateInProgress = useMemo(
    () => useDebate && (debateJobStatus === 'pending' || debateJobStatus === 'running'),
    [useDebate, debateJobStatus]
  )

  const handleFiles = useCallback(
    (selectedFile: File | null) => {
      if (!selectedFile) return

      if (!ACCEPTED_TYPES.includes(selectedFile.type)) {
        setError('Unsupported format. Upload PNG or JPG/WEBP images only.')
        return
      }

      if (selectedFile.size > MAX_SIZE_MB * 1024 * 1024) {
        setError(`File exceeds ${MAX_SIZE_MB}MB limit.`)
        return
      }

      setError(null)
      setFile(selectedFile)

      const reader = new FileReader()
      reader.onload = (event) => {
        if (typeof event.target?.result === 'string') {
          setPreview(event.target.result)
        }
      }
      reader.readAsDataURL(selectedFile)

      void analyzeFile(selectedFile)
    },
    [analyzeFile]
  )

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const droppedFile = event.dataTransfer.files?.[0]
    if (droppedFile) handleFiles(droppedFile)
  }

  const onFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] ?? null
    if (selectedFile) handleFiles(selectedFile)
  }

  const uploadInstructions = useMemo(
    () => 'Upload a candlestick chart (PNG or JPG/WEBP, max 5MB) for AI pattern analysis.',
    []
  )

  const systemJsonInfo = useMemo(() => {
    if (!analysis?.sections) return null

    const entry = Object.entries(analysis.sections).find(([key]) => {
      const normalizedKey = key.toLowerCase()
      return normalizedKey.includes('system') && normalizedKey.includes('json')
    })

    if (!entry) return null

    const [, value] = entry
    if (!value) return null

    const trimmed = value.trim()
    const sanitized = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()

    if (!sanitized) {
      return { raw: trimmed, data: null as Record<string, unknown> | null }
    }

    try {
      return { raw: sanitized, data: JSON.parse(sanitized) as Record<string, unknown> }
    } catch {
      return { raw: sanitized, data: null as Record<string, unknown> | null }
    }
  }, [analysis])

  const systemJsonDisplay = useMemo(() => {
    if (!systemJsonInfo) return null
    if (systemJsonInfo.data) {
      try {
        return JSON.stringify(systemJsonInfo.data, null, 2)
      } catch {
        return systemJsonInfo.raw
      }
    }
    return systemJsonInfo.raw
  }, [systemJsonInfo])

  const narrativeSections = useMemo(() => {
    if (!analysis?.sections) return [] as Array<{ id: string; title: string; points: string[]; raw: string }>

    const orderedTitles = ['Chart Observations', 'Pattern(s)', 'Trend', 'Key Levels', 'Volume / Indicator Confirmation', 'Chain-of-Thought Reasoning', 'Signal Strength Assessment', 'Potential Trade Setup', 'Rationale Note']

    return orderedTitles
      .map((title) => {
        const content = analysis.sections?.[title]
        if (!content) return null

        return {
          id: normalizeSectionId(title),
          title,
          points: splitPoints(content),
          raw: content,
        }
      })
      .filter(Boolean) as Array<{ id: string; title: string; points: string[]; raw: string }>
  }, [analysis])

  const biasSummary = useMemo(() => {
    const content = analysis?.sections?.['Bias Summary']?.trim()
    return content && content.length > 0 ? content : null
  }, [analysis])

  const signalStrengthInfo = useMemo(() => {
    const baseData = systemJsonInfo?.data
    if (!baseData) return null

    // Check for both signal_strength and signal_strength_score for flexibility
    const score = typeof baseData.signal_strength === 'number' ? baseData.signal_strength : 
                  typeof baseData.signal_strength_score === 'number' ? baseData.signal_strength_score : null

    return {
      score: score,
      class: typeof baseData.classification === 'string' ? baseData.classification : null,
      reasons: Array.isArray(baseData.reasons_for_strength) ? baseData.reasons_for_strength as string[] : []
    }
  }, [systemJsonInfo])

  const consensusSummary = useMemo(() => {
    if (!debate?.referee.consensusJson) return null
    
    const consensus = debate.referee.consensusJson
    return {
      summary: typeof consensus.summary === 'string' ? consensus.summary : null,
      recommendation: typeof consensus.recommendation === 'string' ? consensus.recommendation : null,
      confidence: typeof consensus.confidence === 'number' ? consensus.confidence : null,
      keyPoints: Array.isArray(consensus.key_points) ? consensus.key_points as string[] : []
    }
  }, [debate])

  const tradePlanSummary = useMemo(() => {
    const sectionContent = analysis?.sections?.['Potential Trade Setup'] ?? analysis?.sections?.['Trade Plan'] ?? ''
    const { lines, map } = parseKeyValueLines(sectionContent)

    const baseData = systemJsonInfo?.data

    const pickValue = (...keys: string[]): string | null => {
      if (baseData) {
        for (const key of keys) {
          const rawValue = baseData[key]
          if (rawValue !== undefined && rawValue !== null) {
            const asString = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue)
            if (asString.length > 0) {
              return asString
            }
          }
        }
      }

      for (const key of keys) {
        const fallback = map[key]
        if (fallback) {
          return fallback
        }
      }

      return null
    }

    return {
      direction: pickValue('direction'),
      entry: pickValue('entry_zone', 'entry'),
      stopLoss: pickValue('stop_loss', 'stop loss'),
      takeProfit: pickValue('take_profit', 'take profit'),
      riskReward: pickValue('risk_reward_ratio', 'risk/reward', 'risk reward'),
      lines,
    }
  }, [analysis, systemJsonInfo])

  const tradePlanHighlights = useMemo(
    () =>
      [
        { label: 'Entry', value: tradePlanSummary.entry },
        { label: 'Stop', value: tradePlanSummary.stopLoss },
        { label: 'Target', value: tradePlanSummary.takeProfit },
        { label: 'R/R', value: tradePlanSummary.riskReward },
      ].filter((item) => item.value),
    [
      tradePlanSummary.entry,
      tradePlanSummary.stopLoss,
      tradePlanSummary.takeProfit,
      tradePlanSummary.riskReward,
    ],
  )

  const directionStyling = useMemo(() => {
    const value = tradePlanSummary.direction?.toLowerCase() ?? ''

    if (value.includes('long') || value.includes('buy')) {
      return {
        primaryLabel: 'Buy',
        borderClass: 'border-emerald-400/40',
        backgroundClass: 'bg-gradient-to-br from-emerald-500/20 via-emerald-500/10 to-transparent',
        pillClass: 'bg-emerald-500/20 text-emerald-100',
        titleClass: 'text-emerald-200',
      }
    }

    if (value.includes('short') || value.includes('sell')) {
      return {
        primaryLabel: 'Sell',
        borderClass: 'border-rose-400/40',
        backgroundClass: 'bg-gradient-to-br from-rose-500/20 via-rose-500/10 to-transparent',
        pillClass: 'bg-rose-500/20 text-rose-100',
        titleClass: 'text-rose-200',
      }
    }

    return {
      primaryLabel: 'No Trade',
      borderClass: 'border-slate-400/30',
      backgroundClass: 'bg-gradient-to-br from-slate-500/20 via-slate-500/5 to-transparent',
      pillClass: 'bg-slate-500/20 text-slate-200',
      titleClass: 'text-slate-200',
    }
  }, [tradePlanSummary.direction])

  const annotationJson = useMemo(() => {
    if (!analysis?.annotations) return null
    try {
      return JSON.stringify(analysis.annotations, null, 2)
    } catch {
      return null
    }
  }, [analysis])
  const usageSummary = useMemo(() => {
    if (!analysis?.usage) return null

    const entries: Array<{ label: string; value: number | undefined }> = [
      { label: 'Total tokens', value: analysis.usage.total_tokens },
      { label: 'Prompt tokens', value: analysis.usage.prompt_tokens },
      { label: 'Completion tokens', value: analysis.usage.completion_tokens },
      { label: 'Reasoning tokens', value: analysis.usage.reasoning_tokens },
    ].filter((entry) => entry.value !== undefined)

    if (entries.length === 0) return null

    return (
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-slate-400">
        {entries.map((entry) => (
          <Fragment key={entry.label}>
            <dt>{entry.label}</dt>
            <dd>{entry.value}</dd>
          </Fragment>
        ))}
      </dl>
    )
  }, [analysis])

  return (
    <div className="min-h-screen px-4 py-10 sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.35em] text-sky-300/80">Pattern Lab</p>
            <h1 className="text-3xl font-semibold text-white sm:text-4xl">Trade Ideas Analyzer</h1>
            <p className="max-w-2xl text-sm leading-relaxed text-slate-300">
              Upload any chart image for instant AI analysis with Signal Strength assessment, trade plans, and risk evaluation.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(analysis || preview) && (
              <>
                <button
                  type="button"
                  className="inline-flex items-center rounded-full border border-sky-400/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-sky-200 transition hover:border-sky-400/50 hover:bg-sky-400/10 disabled:opacity-40"
                  onClick={handleScreenshot}
                  disabled={isCapturingScreenshot || (!analysis && !preview)}
                >
                  {isCapturingScreenshot ? 'Capturing...' : '📸 Screenshot'}
                </button>
                {typeof navigator !== 'undefined' && 'share' in navigator && (
                  <button
                    type="button"
                    className="inline-flex items-center rounded-full border border-green-400/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-green-200 transition hover:border-green-400/50 hover:bg-green-400/10 disabled:opacity-40"
                    onClick={handleShare}
                    disabled={isCapturingScreenshot || (!analysis && !preview)}
                  >
                    {isCapturingScreenshot ? 'Processing...' : '📤 Share'}
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              className="inline-flex items-center rounded-full border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-200 transition hover:border-white/30 hover:bg-white/10 disabled:opacity-40"
              onClick={resetState}
              disabled={!file && !preview && !analysis && !error}
            >
              Reset Workspace
            </button>
          </div>
        </header>

        <section
          className="glass-panel space-y-6 p-6 sm:p-8"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          <div className="max-w-sm mx-auto text-center">
            <span className="text-xs uppercase tracking-[0.3em] text-slate-400 block">Timeframe</span>
            <div className="mt-3 flex items-center justify-center gap-2">
              {['1 Hours', '4 Hours', '1 Day'].map((option) => {
                const isSelected = timeframe === option
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setTimeframe(isSelected ? '' : option)}
                    className={`rounded-full border px-4 py-1.5 text-xs uppercase tracking-[0.3em] transition ${
                      isSelected
                        ? 'border-sky-400 bg-sky-500/20 text-sky-100'
                        : 'border-white/15 bg-white/5 text-slate-200 hover:border-white/30 hover:bg-white/10'
                    }`}
                  >
                    {option}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-[11px] uppercase tracking-[0.25em] text-slate-500">
              Tap again to clear selection
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <input
                id="debate-toggle"
                type="checkbox"
                checked={useDebate}
                onChange={(e) => setUseDebate(e.target.checked)}
              />
              <label htmlFor="debate-toggle" className="text-xs uppercase tracking-[0.3em] text-slate-300">
                Debate Mode (A/B + Referee)
              </label>
            </div>
            {useDebate && (
              <div className="mt-3 grid grid-cols-2 gap-3 text-left">
                <label className="text-xs uppercase tracking-[0.25em] text-slate-400">
                  <span className="block mb-1">A Rounds</span>
                  <input
                    type="number"
                    min={1}
                    value={aRounds}
                    onChange={(e) => setARounds(parseInt(e.target.value || '1', 10))}
                    className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-slate-400 focus:border-sky-400 focus:outline-none"
                  />
                </label>
                <label className="text-xs uppercase tracking-[0.25em] text-slate-400">
                  <span className="block mb-1">B Rounds</span>
                  <input
                    type="number"
                    min={0}
                    value={bRounds}
                    onChange={(e) => setBRounds(parseInt(e.target.value || '0', 10))}
                    className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-slate-400 focus:border-sky-400 focus:outline-none"
                  />
                </label>
              </div>
            )}
          </div>

          <div
            className="rounded-3xl border-2 border-dashed border-white/15 bg-white/5 p-8 text-center transition hover:border-white/25"
            aria-label="Upload trading chart"
          >
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                className="pill-button px-5 py-3 text-xs uppercase tracking-[0.3em]"
                onClick={() => fileInputRef.current?.click()}
              >
                Upload Chart
              </button>
              <span className="text-xs uppercase tracking-[0.35em] text-slate-400">or</span>
              <p className="text-sm text-slate-200">Drag & drop here</p>
            </div>
            <p className="mt-4 text-sm text-slate-300">{uploadInstructions}</p>
            <p className="text-xs text-slate-400">Accepted: PNG, JPG, WEBP � {MAX_SIZE_MB}MB max</p>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(',')}
              className="hidden"
              onChange={onFileSelect}
            />
          </div>
          {error && (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {error}
            </div>
          )}
        </section>

        {(file || preview || analysis || isAnalyzing) && (
          <section ref={screenshotRef} className="flex flex-col gap-6">
            <div className="glass-panel space-y-4 p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-300">
                <span className="font-semibold text-white">{file?.name ?? 'Uploaded Chart'}</span>
                <div className="flex flex-wrap gap-2">
                  {['Zoom', 'Pan', 'Annotate'].map((action) => (
                    <button
                      key={action}
                      type="button"
                      className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-200 hover:border-white/30 hover:bg-white/10"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex min-h-[320px] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                {preview ? (
                  <img src={preview} alt="Uploaded trading chart preview" className="w-full object-contain" />
                ) : (
                  <div className="max-w-sm text-center text-sm text-slate-300">
                    Upload a chart image to preview it here.
                  </div>
                )}
              </div>
              <small className="block text-xs uppercase tracking-[0.3em] text-slate-400">
                Instant AI analysis with Signal Strength assessment and trade plans.
              </small>
            </div>

            <aside className="glass-panel space-y-4 p-6 sm:p-8" aria-live={isAnalyzing ? 'polite' : 'off'}>
              {isAnalyzing ? (
                <div className="space-y-4 text-sm text-slate-200">
                  <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-center sm:text-left">
                    <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-sky-300" aria-hidden="true" />
                    <div className="space-y-1">
                      <p className="font-semibold text-white">
                        {isDebateInProgress ? 'Coordinating debate...' : 'Analyzing chart...'}
                      </p>
                      <small className="text-xs text-slate-400">
                        {isDebateInProgress
                          ? 'Tracking trader and risk manager steps in real time.'
                          : 'Identifying candlestick behaviour, chart structure, and risk/reward alignment.'}
                      </small>
                    </div>
                  </div>
                  {useDebate ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left">
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-300">Debate Progress</p>
                      <ul className="mt-3 space-y-2">
                        {debateProgressState.map(({ step, label, status }) => {
                          const isDone = status === 'done'
                          const isActive = status === 'active'
                          return (
                            <li
                              key={step}
                              className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-xs uppercase tracking-[0.25em] ${
                                isDone
                                  ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                                  : isActive
                                    ? 'border-sky-400/40 bg-sky-500/10 text-sky-100'
                                    : 'border-white/10 bg-white/5 text-slate-400'
                              }`}
                            >
                              <span
                                className={`h-2 w-2 rounded-full ${
                                  isDone ? 'bg-emerald-300' : isActive ? 'bg-sky-300' : 'bg-slate-500'
                                }`}
                                aria-hidden="true"
                              />
                              <span>{label}</span>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : analysis ? (
                <div className="space-y-5">
                  {debate && (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-slate-300">
                      <p className="text-xs uppercase tracking-[0.3em] text-sky-300">Dual-Agent Debate</p>
                      <div className="mt-3 grid gap-4 md:grid-cols-3">
                        <details className="rounded-xl border border-white/10 bg-white/5 p-3" open>
                          <summary className="cursor-pointer text-xs uppercase tracking-[0.3em] text-slate-300">Agent A • Swing Trader</summary>
                          <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap text-xs text-slate-200">{debate.agentA.rawText}</pre>
                        </details>
                        <details className="rounded-xl border border-white/10 bg-white/5 p-3" open>
                          <summary className="cursor-pointer text-xs uppercase tracking-[0.3em] text-slate-300">Agent B • Risk Manager</summary>
                          <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap text-xs text-slate-200">{debate.agentB.rawText}</pre>
                        </details>
                        <details className="rounded-xl border border-white/10 bg-white/5 p-3" open>
                          <summary className="cursor-pointer text-xs uppercase tracking-[0.3em] text-slate-300">Referee • Consensus</summary>
                          <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap text-xs text-slate-200">{debate.referee.rawText}</pre>
                        </details>
                      </div>
                      {debate.logFile && (
                        <p className="mt-3 text-[10px] text-slate-500">Log saved: {debate.logFile}</p>
                      )}
                    </div>
                  )}
                  <article
                    className={`rounded-3xl border ${directionStyling.borderClass} ${directionStyling.backgroundClass} p-6 sm:p-7 shadow-lg shadow-slate-900/25 backdrop-blur`}
                  >
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-3">
                        <p className="text-xs uppercase tracking-[0.35em] text-slate-300">Trade Decision</p>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className={`text-3xl font-semibold ${directionStyling.titleClass}`}>
                            {directionStyling.primaryLabel}
                          </span>
                          {tradePlanSummary.direction && (
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] ${directionStyling.pillClass}`}
                            >
                              {tradePlanSummary.direction}
                            </span>
                          )}
                        </div>
                      </div>
                      {tradePlanHighlights.length > 0 && (
                        <dl className="grid gap-3 sm:grid-cols-2">
                          {tradePlanHighlights.map((item) => (
                            <div
                              key={item.label}
                              className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-right shadow-inner shadow-white/5"
                            >
                              <dt className="text-xs uppercase tracking-[0.3em] text-slate-300">{item.label}</dt>
                              <dd className="mt-1 text-sm font-semibold text-white">{item.value}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </div>
                    {tradePlanSummary.lines.length > 0 && (
                      <div className="mt-6 grid gap-2 text-sm text-slate-200 sm:grid-cols-2">
                        {tradePlanSummary.lines.map((line, index) => (
                          <div
                            key={`${line}-${index}`}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                          >
                            {line}
                          </div>
                        ))}
                      </div>
                    )}
                  </article>

                  {consensusSummary && (
                    <article className="rounded-3xl border border-sky-400/30 bg-gradient-to-br from-sky-500/15 via-sky-500/5 to-transparent p-6 sm:p-7 shadow-lg shadow-slate-900/25 backdrop-blur">
                      <div className="space-y-4">
                        <p className="text-xs uppercase tracking-[0.35em] text-sky-200">Consensus Summary</p>
                        
                        {consensusSummary.summary && (
                          <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4">
                            <p className="text-sm text-sky-100 leading-relaxed">{consensusSummary.summary}</p>
                          </div>
                        )}

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          {consensusSummary.recommendation && (
                            <div>
                              <p className="text-xs uppercase tracking-[0.3em] text-sky-300 mb-1">Recommendation</p>
                              <span className="text-lg font-semibold text-sky-100">{consensusSummary.recommendation}</span>
                            </div>
                          )}
                          
                          {consensusSummary.confidence !== null && (
                            <div>
                              <p className="text-xs uppercase tracking-[0.3em] text-sky-300 mb-1">Confidence</p>
                              <span className="text-lg font-semibold text-sky-100">{consensusSummary.confidence}%</span>
                            </div>
                          )}
                        </div>

                        {consensusSummary.keyPoints.length > 0 && (
                          <div>
                            <p className="text-xs uppercase tracking-[0.3em] text-sky-300 mb-3">Key Points</p>
                            <div className="grid gap-2 text-sm text-sky-100">
                              {consensusSummary.keyPoints.map((point, index) => (
                                <div
                                  key={`${point}-${index}`}
                                  className="rounded-xl border border-sky-400/20 bg-sky-500/10 px-3 py-2 flex items-start gap-2"
                                >
                                  <span className="text-sky-300 mt-0.5">•</span>
                                  <span>{point}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </article>
                  )}

                  {signalStrengthInfo && (
                    <article className="rounded-3xl border border-indigo-400/30 bg-gradient-to-br from-indigo-500/15 via-indigo-500/5 to-transparent p-6 sm:p-7 shadow-lg shadow-slate-900/25 backdrop-blur">
                      <div className="space-y-6">
                        <div className="text-center">
                          <p className="text-xs uppercase tracking-[0.35em] text-indigo-300 mb-4">Signal Strength Assessment</p>
                          
                          <div className="flex items-center justify-center gap-6">
                            {signalStrengthInfo.score !== null && (
                              <div className="text-center">
                                <div className="relative inline-flex items-center justify-center">
                                  <div className="text-5xl font-bold text-indigo-200 tabular-nums">
                                    {signalStrengthInfo.score}
                                  </div>
                                  <div className="text-2xl font-medium text-indigo-400 ml-1">/100</div>
                                </div>
                                <div className="mt-2">
                                  <div className="w-32 h-2 bg-slate-700 rounded-full mx-auto overflow-hidden">
                                    <div 
                                      className={`h-full transition-all duration-500 ${
                                        signalStrengthInfo.score >= 75 ? 'bg-emerald-500' :
                                        signalStrengthInfo.score >= 50 ? 'bg-amber-500' : 'bg-red-500'
                                      }`}
                                      style={{ width: `${Math.max(0, Math.min(100, signalStrengthInfo.score))}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {signalStrengthInfo.class && (
                              <div className="text-center">
                                <div className="text-xs uppercase tracking-[0.3em] text-indigo-400 mb-2">Classification</div>
                                <span className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold uppercase tracking-[0.2em] ${
                                  signalStrengthInfo.class === 'Strong' 
                                    ? 'bg-emerald-500/20 text-emerald-100 border border-emerald-500/30'
                                    : signalStrengthInfo.class === 'Moderate'
                                    ? 'bg-amber-500/20 text-amber-100 border border-amber-500/30' 
                                    : 'bg-red-500/20 text-red-100 border border-red-500/30'
                                }`}>
                                  {signalStrengthInfo.class}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {signalStrengthInfo.reasons.length > 0 && (
                          <div>
                            <p className="text-xs uppercase tracking-[0.35em] text-indigo-300 mb-4 text-center">Supporting Factors</p>
                            <div className="grid gap-3 sm:grid-cols-2">
                              {signalStrengthInfo.reasons.map((reason, index) => (
                                <div
                                  key={`${reason}-${index}`}
                                  className="rounded-xl border border-indigo-400/20 bg-indigo-500/10 px-4 py-3 flex items-start gap-3"
                                >
                                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center mt-0.5">
                                    <span className="text-indigo-300 text-xs font-bold">{index + 1}</span>
                                  </div>
                                  <span className="text-sm text-indigo-100 leading-relaxed">{reason}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </article>
                  )}

                  {narrativeSections.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      {narrativeSections.map((section) => (
                        <article key={section.id} className="rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6">
                          <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-300">
                            {section.title}
                          </h3>
                          <ul className="mt-3 space-y-2 text-sm text-slate-200">
                            {section.points.length > 0 ? (
                              section.points.map((point, index) => (
                                <li
                                  key={`${section.id}-${index}`}
                                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                                >
                                  {point}
                                </li>
                              ))
                            ) : (
                              <li className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-300">
                                {section.raw}
                              </li>
                            )}
                          </ul>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                      Analysis completed but no structured sections were returned. Review the raw transcript below.
                    </div>
                  )}

                  {biasSummary && (
                    <article className="rounded-2xl border border-sky-400/30 bg-sky-500/10 p-5 sm:p-6">
                      <h3 className="text-xs uppercase tracking-[0.35em] text-sky-200">Bias Summary</h3>
                      <p className="mt-2 text-sm text-sky-100">{biasSummary}</p>
                    </article>
                  )}

                  {analysis.rawText && (
                    <details className="rounded-2xl border border-white/10 bg-white/5">
                      <summary className="cursor-pointer px-4 py-3 text-xs uppercase tracking-[0.3em] text-slate-300">
                        Raw AI Narrative
                      </summary>
                      <pre className="max-h-64 overflow-auto px-4 pb-4 text-xs text-slate-200 whitespace-pre-wrap">
                        {analysis.rawText}
                      </pre>
                    </details>
                  )}

                  {systemJsonDisplay && (
                    <details className="rounded-2xl border border-white/10 bg-white/5">
                      <summary className="cursor-pointer px-4 py-3 text-xs uppercase tracking-[0.3em] text-slate-300">
                        System JSON
                      </summary>
                      <pre className="max-h-64 overflow-auto px-4 pb-4 text-xs text-slate-200 whitespace-pre">
                        {systemJsonDisplay}
                      </pre>
                    </details>
                  )}

                  {annotationJson && (
                    <details className="rounded-2xl border border-white/10 bg-white/5">
                      <summary className="cursor-pointer px-4 py-3 text-xs uppercase tracking-[0.3em] text-slate-300">
                        Overlay Instructions (JSON)
                      </summary>
                      <pre className="max-h-64 overflow-auto px-4 pb-4 text-xs text-slate-200 whitespace-pre">
                        {annotationJson}
                      </pre>
                    </details>
                  )}

                  {usageSummary && (
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Token Usage</p>
                      {usageSummary}
                    </div>
                  )}

                  <footer className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-400">
                    AI-generated analysis for educational purposes, not financial advice.
                  </footer>
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-sm text-slate-200">
                  Upload a chart to receive AI-generated analysis with Signal Strength scoring, trade plans, and risk assessment.
                </div>
              )}
            </aside>
          </section>
        )}
      </div>
    </div>
  )
}

export default TradeIdeas
