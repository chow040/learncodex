import { useCallback, useMemo, useRef, useState } from "react"

const MAX_SIZE_MB = 10
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'application/pdf']

// Static copy mimics the structure of an AI response so the UI can be developed without the backend.
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

// We map each analysis segment to a UI section for easier iteration/rendering.
const sections = [
  { id: 'summary', title: 'Summary', points: mockAnalysis.summary },
  { id: 'priceAction', title: 'Price Action', points: mockAnalysis.priceAction },
  { id: 'indicators', title: 'Indicators', points: mockAnalysis.indicators },
  { id: 'recommendations', title: 'Recommendations', points: mockAnalysis.recommendations }
]

const TradeIdeas = () => {
  // Local state tracks the chosen file, preview blob, and transient UI flags (loading/errors).
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ summary: true })
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Quick reset clears the workspace so traders can run multiple charts back-to-back.
  const resetState = () => {
    setFile(null)
    setPreview(null)
    setError(null)
    setIsAnalyzing(false)
    setOpenSections({ summary: true })
  }

  // Core validation/preview pipeline for both drag-drop and file picker interactions.
  const handleFiles = useCallback((selectedFile: File | null) => {
    if (!selectedFile) return

    // Guard against unsupported formats early and surface a human-readable error.
    if (!ACCEPTED_TYPES.includes(selectedFile.type)) {
      setError('Unsupported format. Upload PNG, JPG, PDF, or SVG.')
    return
    }

    // Enforce the 10MB ceiling to prevent oversized uploads from blocking the queue.
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
    // For PDF we skip inline preview (browser limitations) and display a placeholder notice.
    if (selectedFile.type === 'application/pdf') {
      setPreview('PDF_PREVIEW')
    } else {
      reader.readAsDataURL(selectedFile)
    }
    setIsAnalyzing(true)
    setTimeout(() => setIsAnalyzing(false), 30000)
  }, [])

  // Normalise drag/drop to feed the same validator used by the hidden file input.
  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const droppedFile = event.dataTransfer.files?.[0]
    if (droppedFile) handleFiles(droppedFile)
  }

  const onFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] ?? null
    if (selectedFile) handleFiles(selectedFile)
  }

  // Collapsible panels keep the insights scannable on smaller viewports.
  const toggleSection = (id: string) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const uploadInstructions = useMemo(
    () => 'Upload a trading chart (e.g., candlestick with indicators) for AI analysis.',
    []
  )

  return (
    <div className="trade-ideas-shell">
      <header className="trade-header">
        <div>
          <h1>Trade Ideas Analyzer</h1>
          <p>
            Drop in your latest chart and let the desk AI highlight actionable structure, indicator context, and risk.
          </p>
        </div>
        <button type="button" className="ghost" onClick={resetState} disabled={!file && !preview}>
          Reset Workspace
        </button>
      </header>

      {/* Upload deck contains drag/drop target and helper copy for new users. */}
      <section className="uploader" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
        <div className="upload-zone" aria-label="Upload trading chart">
          <div className="upload-cta">
            <button type="button" className="primary" onClick={() => fileInputRef.current?.click()}>
              Upload Chart
            </button>
            <span className="divider">or</span>
            <p>Drag & drop here</p>
          </div>
          <p className="upload-instruction">{uploadInstructions}</p>
          <p className="upload-meta">PNG, JPG, SVG, PDF up to {MAX_SIZE_MB}MB</p>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            className="visually-hidden"
            onChange={onFileSelect}
          />
        </div>
        {error && <div className="upload-error">{error}</div>}
      </section>

      {(file || preview) && (
        <section className="analysis-stage">
          {/* Once a file exists we split the canvas (chart preview) and AI output. */}
          <div className="chart-view">
            <div className="chart-toolbar">
              <span>{file?.name ?? 'Uploaded Chart'}</span>
              <div className="chart-actions">
                <button type="button">Zoom</button>
                <button type="button">Pan</button>
                <button type="button">Annotate</button>
              </div>
            </div>
            <div className="chart-frame">
              {preview === 'PDF_PREVIEW' ? (
                <div className="pdf-placeholder">PDF preview unavailable · open in new tab for full detail.</div>
              ) : (
                <img src={preview ?? undefined} alt="Uploaded trading chart preview" />
              )}
            </div>
            <small className="annotation-hint">Draw support/resistance by switching to markup mode.</small>
          </div>

          <aside className="analysis-panel" aria-live={isAnalyzing ? 'polite' : 'off'}>
            {isAnalyzing ? (
              <div className="analysis-loading">
                <div className="spinner" aria-hidden="true" />
                <p>Analyzing... ~30 seconds</p>
                <small>We are identifying price structure, momentum context, and risk levels.</small>
              </div>
            ) : (
              <div className="analysis-results">
                {sections.map((section) => (
                  <article key={section.id} className="analysis-section">
                    <header>
                      <button type="button" onClick={() => toggleSection(section.id)} aria-expanded={!!openSections[section.id]}>
                        {section.title}
                      </button>
                    </header>
                    {openSections[section.id] && (
                      <ul>
                        {section.points.map((point) => (
                          <li key={point}>{point}</li>
                        ))}
                      </ul>
                    )}
                  </article>
                ))}
                <footer className="analysis-footer">
                  <p>AI-generated analysis for educational purposes, not financial advice.</p>
                </footer>
              </div>
            )}
          </aside>
        </section>
      )}
    </div>
  )
}

export default TradeIdeas










