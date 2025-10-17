import { memo, useMemo } from 'react'
import { Loader2, CheckCircle2, Circle, AlertCircle, Dot } from 'lucide-react'

import { Progress } from '../ui/progress'
import { Button } from '../ui/button'
import type {
  TradingProgressState,
  TradingProgressStage,
  TradingProgressStatus
} from '../../hooks/useTradingProgress'
import { cn } from '../../lib/utils'

const STAGES: Array<{
  stage: TradingProgressStage
  label: string
  description: string
}> = [
  { stage: 'queued', label: 'Queued', description: 'Awaiting agent allocation' },
  { stage: 'analysts', label: 'Analyst Briefing', description: 'Gathering analyst reports' },
  { stage: 'investment_debate', label: 'Investment Debate', description: 'Bull vs Bear rounds' },
  { stage: 'research_manager', label: 'Research Manager', description: 'Synthesizing analyst views' },
  { stage: 'trader', label: 'Trader Plan', description: 'Drafting execution strategy' },
  { stage: 'risk_debate', label: 'Risk Debate', description: 'Stress testing positions' },
  { stage: 'risk_manager', label: 'Risk Manager', description: 'Approving trade posture' },
  { stage: 'finalizing', label: 'Finalizing', description: 'Persisting outputs & logs' }
]

type StageStatus = 'pending' | 'active' | 'complete' | 'error'

const iconForStage = (status: StageStatus) => {
  switch (status) {
    case 'complete':
      return <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />
    case 'active':
      return <Loader2 className="h-4 w-4 animate-spin text-sky-300" aria-hidden />
    case 'error':
      return <AlertCircle className="h-4 w-4 text-rose-300" aria-hidden />
    default:
      return <Circle className="h-4 w-4 text-muted-foreground" aria-hidden />
  }
}

const formatStatusLabel = (status: TradingProgressStatus): string => {
  switch (status) {
    case 'idle':
      return 'Idle'
    case 'connecting':
      return 'Connecting...'
    case 'streaming':
      return 'Running...'
    case 'complete':
      return 'Complete'
    case 'error':
      return 'Error'
  }
}

type TradingProgressProps<Result> = {
  state: TradingProgressState<Result>
  className?: string
  headline?: string
  onCancel?: () => void
  canCancel?: boolean
}

export const TradingProgress = memo(function TradingProgress<Result>({
  state,
  className,
  headline = 'Workflow Status',
  onCancel,
  canCancel
}: TradingProgressProps<Result>) {
  const percent = Math.max(0, Math.min(100, Math.round(state.percent)))
  const cancellable =
    typeof onCancel === 'function' &&
    (typeof canCancel === 'boolean' ? canCancel : true) &&
    (state.status === 'connecting' || state.status === 'streaming')
  const analystDisplay = state.analysts?.map((value) => value.charAt(0).toUpperCase() + value.slice(1))

  const stageStatuses = useMemo(() => {
    const completed = new Set<TradingProgressStage>()
    for (const event of state.events) {
      completed.add(event.stage)
    }

    const statuses = STAGES.map(({ stage }) => {
      if (state.status === 'error' && state.currentStage === stage) {
        return 'error'
      }
      if (state.status === 'complete' || (state.status === 'streaming' && completed.has(stage) && stage !== state.currentStage)) {
        return 'complete'
      }
      if (state.currentStage === stage || (!completed.has(stage) && state.status === 'connecting' && stage === 'queued')) {
        return 'active'
      }
      return completed.has(stage) ? 'complete' : 'pending'
    }) as StageStatus[]

    return statuses
  }, [state.currentStage, state.events, state.status])

  const currentLabel = state.currentLabel ?? 'Preparing run'
  const secondaryMessage =
    state.error && state.status === 'error'
      ? state.error
      : state.message && state.message !== currentLabel
      ? state.message
      : null

  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-card/95 p-5 shadow-sm transition',
        className
      )}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.35em] text-sky-200/70">{headline}</p>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {formatStatusLabel(state.status)}
            </span>
            {cancellable ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto rounded-full border border-border/60 bg-background px-3 py-1 text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground hover:border-rose-400/60 hover:bg-rose-500/10 hover:text-rose-200"
                onClick={onCancel}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Progress value={percent} className="h-2 flex-1" />
          <span className="text-sm font-semibold text-foreground tabular-nums">{percent}%</span>
        </div>
        {state.modelId || (state.analysts?.length ?? 0) > 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/40 bg-background/40 px-4 py-2 text-xs uppercase tracking-[0.25em] text-muted-foreground/80">
            {state.modelId ? <span>Model: {state.modelId}</span> : null}
            {state.analysts && state.analysts.length > 0 ? (
              <span>Analysts: {analystDisplay?.join(', ')}</span>
            ) : null}
          </div>
        ) : null}
        <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
          <p className="text-sm font-semibold text-foreground">{currentLabel}</p>
          {secondaryMessage ? <p className="mt-1 text-xs text-muted-foreground">{secondaryMessage}</p> : null}
          {state.currentStage && state.status !== 'error' ? (
            <p className="mt-2 inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-muted-foreground/80">
              <Dot className="h-5 w-5 text-sky-300" aria-hidden />
              {state.currentStage.replace(/_/g, ' ')}
            </p>
          ) : null}
        </div>
      </div>

      <ol className="mt-5 grid gap-3 md:grid-cols-2">
        {STAGES.map((stage, index) => {
          const status = stageStatuses[index]
          const event = state.events.find((item) => item.stage === stage.stage)
          return (
            <li
              key={stage.stage}
              className={cn(
                'flex items-start gap-3 rounded-xl border border-border/60 bg-background/40 p-3 text-sm transition',
                status === 'active' && 'border-sky-400/60 bg-sky-500/10',
                status === 'complete' && 'border-emerald-400/60 bg-emerald-500/10',
                status === 'error' && 'border-rose-400/60 bg-rose-500/10'
              )}
            >
              <span className="mt-0.5">{iconForStage(status)}</span>
              <div>
                <p className="font-semibold text-foreground">{stage.label}</p>
                <p className="text-xs text-muted-foreground">{stage.description}</p>
                {event?.iteration ? (
                  <p className="mt-1 text-xs text-muted-foreground/80">Iteration {event.iteration}</p>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
})
