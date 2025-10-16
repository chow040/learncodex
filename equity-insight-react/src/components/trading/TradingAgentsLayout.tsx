import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'

type TradingAgentsLayoutProps = {
  configPanel: ReactNode
  mainContent: ReactNode
  hero?: ReactNode
  className?: string
  configWrapperClassName?: string
  mainColumnClassName?: string
}

export function TradingAgentsLayout({
  configPanel,
  mainContent,
  hero,
  className,
  configWrapperClassName,
  mainColumnClassName
}: TradingAgentsLayoutProps) {
  return (
    <div
      className={cn(
        'trading-theme relative min-h-screen w-full overflow-hidden text-foreground',
        className
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_10%,rgba(56,189,248,0.15),transparent_55%),radial-gradient(circle_at_0%_100%,rgba(168,85,247,0.1),transparent_60%),linear-gradient(160deg,rgba(0,0,0,0.35),rgba(0,0,0,0.6))]" />
      <div className="relative z-10 mx-auto flex w-full max-w-[1200px] flex-col px-6 py-10 lg:px-12 lg:py-14">
        {hero ? <div className="mb-10">{hero}</div> : null}
        <div className="flex flex-col gap-8">
          <div
            className={cn(
              'rounded-3xl border border-border/60 bg-card/75 p-6 shadow-[0_40px_80px_-45px_rgba(56,189,248,0.5)] backdrop-blur-xl sm:p-7 lg:p-8',
              configWrapperClassName
            )}
          >
            {configPanel}
          </div>
          <section className={cn('space-y-6', mainColumnClassName)}>{mainContent}</section>
        </div>
      </div>
    </div>
  )
}
