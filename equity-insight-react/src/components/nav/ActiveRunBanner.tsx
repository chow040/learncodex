import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, X } from 'lucide-react'

import { useActiveRuns } from '../../contexts/TradingProgressContext'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'

const statusCopy = (runStatus: ReturnType<typeof useActiveRuns>['runs'][number]) => {
  const percentLabel = `${Math.max(0, Math.min(100, Math.round(runStatus.percent)))}%`
  switch (runStatus.status) {
    case 'streaming':
      return {
        label: `${percentLabel} · ${runStatus.currentLabel ?? runStatus.currentStage ?? 'Streaming'}`,
        tone: 'text-cyan-100',
        icon: <Loader2 className="h-4 w-4 animate-spin" aria-hidden />,
      }
    case 'connecting':
      return {
        label: 'Connecting…',
        tone: 'text-cyan-100',
        icon: <Loader2 className="h-4 w-4 animate-spin" aria-hidden />,
      }
    case 'complete':
      return {
        label: 'Complete',
        tone: 'text-emerald-100',
        icon: <CheckCircle2 className="h-4 w-4" aria-hidden />,
      }
    case 'error':
      return {
        label: runStatus.error ?? 'Error',
        tone: 'text-amber-200',
        icon: <AlertTriangle className="h-4 w-4" aria-hidden />,
      }
    default:
      return {
        label: 'Idle',
        tone: 'text-muted-foreground',
        icon: null,
      }
  }
}

export const ActiveRunBanner = () => {
  const { runs, focusRun, clearActiveRun } = useActiveRuns()
  const navigate = useNavigate()
  const [popoverOpen, setPopoverOpen] = useState(false)

  const highlighted = useMemo(() => {
    if (runs.length === 0) return null
    return runs.find((run) => run.status === 'streaming' || run.status === 'connecting') ?? runs[0]
  }, [runs])

  if (!highlighted) {
    return null
  }

  const { label, tone, icon } = statusCopy(highlighted)
  const canDismiss = highlighted.status === 'complete' || highlighted.status === 'error'

  const handleView = () => {
    focusRun(highlighted.info.runId)
    navigate('/trading-agents')
  }

  const handleDismiss = () => {
    if (!canDismiss) return
    clearActiveRun(highlighted.info.runId)
  }

  const handleSelectRun = (runId: string) => {
    focusRun(runId)
    setPopoverOpen(false)
    navigate('/trading-agents')
  }

  const handleDismissFromList = (runId: string, canClose: boolean) => {
    if (!canClose) return
    clearActiveRun(runId)
  }

  const totalRuns = runs.length

  return (
    <div className="sticky top-0 z-40 border-b border-cyan-500/40 bg-cyan-950/80 text-sm text-cyan-100 shadow-lg shadow-cyan-900/30 backdrop-blur md:text-base">
      <div className="mx-auto flex w-full max-w-[1200px] items-center gap-4 px-4 py-3 md:px-6">
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-cyan-200/90">
            <span>Trading Agents Run</span>
            <span className="text-cyan-400">·</span>
            <span>{highlighted.info.symbol}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className={cn('flex items-center gap-2 text-sm font-medium', tone)}>
              {icon}
              <span>{label}</span>
            </div>
            {highlighted.currentStage ? (
              <span className="hidden text-xs text-cyan-200/70 md:inline">
                Stage: {highlighted.currentStage.replace(/_/g, ' ')}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            className="inline-flex items-center gap-2 rounded-full border border-cyan-400/60 bg-cyan-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-500/30 md:px-4 md:py-2 md:text-sm"
            onClick={handleView}
          >
            View run
            <ArrowRight className="h-3.5 w-3.5 md:h-4 md:w-4" aria-hidden />
          </Button>
          {totalRuns > 1 ? (
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  className="inline-flex items-center gap-2 rounded-full border border-transparent px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-500/10 md:px-4 md:py-2 md:text-sm"
                >
                  {totalRuns} runs
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 border-cyan-500/40 bg-cyan-950/95 text-cyan-100 shadow-xl shadow-cyan-900/40 backdrop-blur">
                <div className="mb-2 text-xs uppercase tracking-[0.3em] text-cyan-300/80">
                  Active Trading Runs
                </div>
                <div className="space-y-3">
                  {runs.map((run) => {
                    const { label: runLabel, tone: runTone, icon: runIcon } = statusCopy(run)
                    const disableDismiss = !(run.status === 'complete' || run.status === 'error')
                    return (
                      <div
                        key={run.info.runId}
                        className={cn(
                          'rounded-2xl border border-cyan-800/60 bg-cyan-900/30 p-3 transition hover:border-cyan-500/50',
                          run.info.runId === highlighted.info.runId ? 'border-cyan-400/60' : null,
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs uppercase tracking-[0.35em] text-cyan-200/90">
                                {run.info.symbol}
                              </span>
                              <span className="text-[0.65rem] uppercase tracking-[0.35em] text-cyan-500/80">
                                {Math.round(run.percent)}%
                              </span>
                            </div>
                            <div className={cn('flex items-center gap-2 text-xs', runTone)}>
                              {runIcon}
                              <span className="line-clamp-1">{runLabel}</span>
                            </div>
                            {run.currentStage ? (
                              <div className="text-[0.65rem] uppercase tracking-[0.35em] text-cyan-200/60">
                                {run.currentStage.replace(/_/g, ' ')}
                              </div>
                            ) : null}
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              className="inline-flex items-center gap-1 rounded-full border border-cyan-400/60 bg-cyan-500/20 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-500/25"
                              onClick={() => handleSelectRun(run.info.runId)}
                            >
                              View
                            </Button>
                            <button
                              type="button"
                              onClick={() => handleDismissFromList(run.info.runId, !disableDismiss)}
                              disabled={disableDismiss}
                              className={cn(
                                'rounded-full border border-transparent p-1 text-xs text-cyan-200/70 transition',
                                disableDismiss
                                  ? 'cursor-not-allowed opacity-40'
                                  : 'hover:border-cyan-300/60 hover:text-cyan-50',
                              )}
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </PopoverContent>
            </Popover>
          ) : null}
          {canDismiss ? (
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-full border border-transparent p-2 text-cyan-200/70 transition hover:border-cyan-300/60 hover:text-cyan-50"
              aria-label="Dismiss run banner"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
