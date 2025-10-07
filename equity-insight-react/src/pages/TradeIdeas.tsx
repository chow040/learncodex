import { Fragment, useCallback, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react"
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

const TradeIdeas = () => {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<ChartAnalysisPayload | null>(null)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})
  const [ticker, setTicker] = useState('')
  const [timeframe, setTimeframe] = useState('')
  const [notes, setNotes] = useState('')
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const screenshotRef = useRef<HTMLDivElement | null>(null)

  const resetState = () => {
    setFile(null)
    setPreview(null)
    setError(null)
    setIsAnalyzing(false)
    setAnalysis(null)
    setOpenSections({})
  }

  const handleScreenshot = useCallback(async () => {
    if (!screenshotRef.current) {
      setError('Screenshot area not found')
      return
    }

    try {
      setIsCapturingScreenshot(true)
      setError(null)
      
      const filename = `trade-idea-${ticker || 'analysis'}-${new Date().toISOString().split('T')[0]}.png`
      
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
  }, [ticker])

  const handleShare = useCallback(async () => {
    if (!screenshotRef.current) {
      setError('Screenshot area not found')
      return
    }

    if (!navigator.share) {
      setError('Sharing not supported on this device')
      return
    }

    try {
      setIsCapturingScreenshot(true)
      setError(null)
      
      const filename = `trade-idea-${ticker || 'analysis'}-${new Date().toISOString().split('T')[0]}.png`
      
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
  }, [ticker])

  const analyzeFile = useCallback(
    async (selectedFile: File) => {
      setIsAnalyzing(true)
      setError(null)
      setAnalysis(null)
      setOpenSections({})

      const formData = new FormData()
      formData.append('image', selectedFile)

      const trimmedTicker = ticker.trim().toUpperCase()
      const trimmedTimeframe = timeframe.trim()
      const trimmedNotes = notes.trim()

      if (trimmedTicker) formData.append('ticker', trimmedTicker)
      if (trimmedTimeframe) formData.append('timeframe', trimmedTimeframe)
      if (trimmedNotes) formData.append('notes', trimmedNotes)

      const tradeIdeaId = trimmedTicker || DEFAULT_TRADE_ID

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/trading/trade-ideas/${encodeURIComponent(tradeIdeaId)}/chart-analysis`,
          {
            method: 'POST',
            body: formData,
          }
        )

        if (!response.ok) {
          let message = 'Failed to analyze chart.'
          try {
            const payload = await response.json()
            if (typeof payload?.error === 'string') {
              message = payload.error
            }
          } catch {
            // ignore JSON parse errors
          }
          throw new Error(message)
        }

        const payload = (await response.json()) as ChartAnalysisResponse
        if (!payload?.analysis) {
          throw new Error('Analysis payload missing from response.')
        }

        setAnalysis(payload.analysis)

        const entries = Object.entries(payload.analysis.sections ?? {})
        if (entries.length) {
          const initialId = normalizeSectionId(entries[0][0])
          setOpenSections({ [initialId]: true })
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to analyze chart.'
        setError(message)
      } finally {
        setIsAnalyzing(false)
      }
    },
    [notes, ticker, timeframe]
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

  const toggleSection = (id: string) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const uploadInstructions = useMemo(
    () => 'Upload a candlestick chart (PNG or JPG/WEBP, max 5MB) for AI pattern analysis.',
    []
  )

  const derivedSections = useMemo(() => {
    if (!analysis) return [] as Array<{ id: string; title: string; points: string[]; raw: string }>

    return Object.entries(analysis.sections ?? {}).map(([title, content]) => ({
      id: normalizeSectionId(title),
      title,
      points: splitPoints(content),
      raw: content,
    }))
  }, [analysis])

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
              Drop in your latest chart and let the desk AI highlight actionable structure, indicator context, and risk.
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
          <div className="grid gap-4 sm:grid-cols-[repeat(auto-fit,minmax(0,1fr))]">
            <label className="space-y-1 text-left">
              <span className="text-xs uppercase tracking-[0.3em] text-slate-400">Ticker</span>
              <input
                value={ticker}
                onChange={(event) => setTicker(event.target.value.toUpperCase())}
                placeholder="e.g. AAPL"
                className="w-full rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-slate-400 focus:border-sky-400 focus:outline-none"
              />
            </label>
            <label className="space-y-1 text-left">
              <span className="text-xs uppercase tracking-[0.3em] text-slate-400">Timeframe</span>
              <input
                value={timeframe}
                onChange={(event) => setTimeframe(event.target.value)}
                placeholder="e.g. 1h, Daily"
                className="w-full rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-slate-400 focus:border-sky-400 focus:outline-none"
              />
            </label>
            <label className="space-y-1 text-left sm:col-span-2">
              <span className="text-xs uppercase tracking-[0.3em] text-slate-400">Notes (optional)</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Context, setups, or specific questions for the analyst"
                rows={2}
                className="w-full resize-y rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:border-sky-400 focus:outline-none"
              />
            </label>
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
                Prep your levels before the open. Add field notes to guide the AI focus.
              </small>
            </div>

            <aside className="glass-panel space-y-4 p-6 sm:p-8" aria-live={isAnalyzing ? 'polite' : 'off'}>
              {isAnalyzing ? (
                <div className="flex flex-col items-center gap-3 text-center text-sm text-slate-200">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-sky-300" aria-hidden="true" />
                  <p className="font-semibold text-white">Analyzing chart...</p>
                  <small className="text-xs text-slate-400">
                    Identifying candlestick behaviour, chart structure, and risk/reward alignment.
                  </small>
                </div>
              ) : analysis ? (
                <div className="space-y-4">
                  {derivedSections.length > 0 ? (
                    derivedSections.map((section) => (
                      <article key={section.id} className="rounded-2xl border border-white/10 bg-white/5">
                        <header className="flex items-center justify-between px-4 py-3">
                          <button
                            type="button"
                            className="flex w-full items-center justify-between text-left text-sm font-semibold text-white"
                            onClick={() => toggleSection(section.id)}
                            aria-expanded={!!openSections[section.id]}
                          >
                            <span>{section.title}</span>
                            <span className="text-xs text-slate-400">{openSections[section.id] ? 'Hide' : 'Show'}</span>
                          </button>
                        </header>
                        {openSections[section.id] && (
                          <ul className="space-y-2 px-4 pb-4 text-sm text-slate-200">
                            {section.points.length > 0 ? (
                              section.points.map((point) => (
                                <li key={point} className="rounded-xl border border-white/10 bg-white/5 p-3">
                                  {point}
                                </li>
                              ))
                            ) : (
                              <li className="rounded-xl border border-white/10 bg-white/5 p-3 text-slate-300">
                                {section.raw}
                              </li>
                            )}
                          </ul>
                        )}
                      </article>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                      Analysis completed but no structured sections were returned. Review the raw transcript below.
                    </div>
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
                  Upload a chart to receive AI-generated trade structure, key levels, and risk framing.
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


