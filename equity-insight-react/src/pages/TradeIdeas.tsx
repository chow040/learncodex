import { useCallback, useMemo, useRef, useState } from "react"

const MAX_SIZE_MB = 10
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'application/pdf']

const mockAnalysis = {
  summary: [
    'Price is consolidating below intraday VWAP with progressively higher lows.',
    'Momentum breadth is improving while volume remains above the 20-session average.'
  ],
  priceAction: [
    'Current structure forms a bull flag following the opening drive.',
    'Key trendline support from the morning low aligns with the 21 EMA on the 5-minute chart.'
  ],
  indicators: [
    'RSI (14) is curling higher from 45, suggesting momentum reset after prior extension.',
    'MACD histogram flipped green on the 3-minute chart while remaining positive on the 15-minute timeframe.'
  ],
  recommendations: [
    'Bias long on reclaim of pre-market high with risk below morning structure.',
    'Scale out into measured move at 1.5R; consider rolling stop once price closes above VWAP.'
  ]
}

const sections = [
  { id: 'summary', title: 'Summary', points: mockAnalysis.summary },
  { id: 'priceAction', title: 'Price Action', points: mockAnalysis.priceAction },
  { id: 'indicators', title: 'Indicators', points: mockAnalysis.indicators },
  { id: 'recommendations', title: 'Recommendations', points: mockAnalysis.recommendations }
]

const TradeIdeas = () => {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ summary: true })
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const resetState = () => {
    setFile(null)
    setPreview(null)
    setError(null)
    setIsAnalyzing(false)
    setOpenSections({ summary: true })
  }

  const handleFiles = useCallback((selectedFile: File | null) => {
    if (!selectedFile) return

    if (!ACCEPTED_TYPES.includes(selectedFile.type)) {
      setError('Unsupported format. Upload PNG, JPG, PDF, or SVG.')
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

    if (selectedFile.type === 'application/pdf') {
      setPreview('PDF_PREVIEW')
    } else {
      reader.readAsDataURL(selectedFile)
    }

    setIsAnalyzing(true)
    window.setTimeout(() => setIsAnalyzing(false), 30000)
  }, [])

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const droppedFile = event.dataTransfer.files?.[0]
    if (droppedFile) handleFiles(droppedFile)
  }

  const onFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] ?? null
    if (selectedFile) handleFiles(selectedFile)
  }

  const toggleSection = (id: string) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const uploadInstructions = useMemo(
    () => 'Upload a trading chart (e.g., candlestick with indicators) for AI analysis.',
    []
  )

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
          <button
            type="button"
            className="inline-flex items-center rounded-full border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-200 transition hover:border-white/30 hover:bg-white/10 disabled:opacity-40"
            onClick={resetState}
            disabled={!file && !preview}
          >
            Reset Workspace
          </button>
        </header>

        <section
          className="glass-panel space-y-4 p-6 sm:p-8"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
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
            <p className="text-xs text-slate-400">PNG, JPG, SVG, PDF up to {MAX_SIZE_MB}MB</p>
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

        {(file || preview) && (
          <section className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
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
                {preview === 'PDF_PREVIEW' ? (
                  <div className="max-w-sm text-center text-sm text-slate-300">
                    PDF preview unavailable -- open in a new tab for full detail.
                  </div>
                ) : (
                  <img src={preview ?? undefined} alt="Uploaded trading chart preview" className="w-full object-contain" />
                )}
              </div>
              <small className="block text-xs uppercase tracking-[0.3em] text-slate-400">
                Draw support/resistance by switching to markup mode.
              </small>
            </div>

            <aside className="glass-panel space-y-4 p-6 sm:p-8" aria-live={isAnalyzing ? 'polite' : 'off'}>
              {isAnalyzing ? (
                <div className="flex flex-col items-center gap-3 text-center text-sm text-slate-200">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-sky-300" aria-hidden="true" />
                  <p className="font-semibold text-white">Analyzing... ~30 seconds</p>
                  <small className="text-xs text-slate-400">
                    We are identifying price structure, momentum context, and risk levels.
                  </small>
                </div>
              ) : (
                <div className="space-y-4">
                  {sections.map((section) => (
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
                          {section.points.map((point) => (
                            <li key={point} className="rounded-xl border border-white/10 bg-white/5 p-3">
                              {point}
                            </li>
                          ))}
                        </ul>
                      )}
                    </article>
                  ))}
                  <footer className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-400">
                    AI-generated analysis for educational purposes, not financial advice.
                  </footer>
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

