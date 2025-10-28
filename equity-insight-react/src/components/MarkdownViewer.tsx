import type { HTMLAttributes, ReactNode } from 'react'
import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { cn } from '../lib/utils'

type CodeProps = HTMLAttributes<HTMLElement> & {
  inline?: boolean
  className?: string
  children?: ReactNode
}

const CodeBlock = ({ inline = false, className, children, ...props }: CodeProps) => {
  const content = (
    <code className={cn('text-xs text-muted-foreground', className)} {...props}>
      {children}
    </code>
  )
  if (inline) {
    return <span className="rounded bg-border/50 px-[0.35rem] py-[0.15rem]">{content}</span>
  }
  return (
    <pre className="overflow-x-auto rounded-2xl border border-border/50 bg-background/60 p-4">
      {content}
    </pre>
  )
}

const markdownComponents: Components = {
  h1: ({ node, ...props }) => (
    <h3 className="text-lg font-semibold leading-7 text-foreground" {...props} />
  ),
  h2: ({ node, ...props }) => (
    <h4 className="text-base font-semibold leading-7 text-foreground" {...props} />
  ),
  h3: ({ node, ...props }) => (
    <h5 className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground" {...props} />
  ),
  h4: ({ node, ...props }) => (
    <h6 className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground/80" {...props} />
  ),
  p: ({ node, ...props }) => (
    <p className="text-sm leading-6 text-muted-foreground" {...props} />
  ),
  strong: ({ node, ...props }) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
  em: ({ node, ...props }) => (
    <em className="italic text-foreground/90" {...props} />
  ),
  ul: ({ node, ...props }) => (
    <ul className="ml-4 list-disc space-y-1 text-sm leading-6 text-muted-foreground" {...props} />
  ),
  ol: ({ node, ...props }) => (
    <ol className="ml-4 list-decimal space-y-1 text-sm leading-6 text-muted-foreground" {...props} />
  ),
  li: ({ node, ...props }) => <li className="marker:text-muted-foreground/70" {...props} />,
  blockquote: ({ node, ...props }) => (
    <blockquote className="border-l-2 border-border/60 pl-3 text-sm italic text-muted-foreground" {...props} />
  ),
  table: ({ node, ...props }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm text-muted-foreground" {...props} />
    </div>
  ),
  thead: ({ node, ...props }) => (
    <thead className="bg-border/30 text-xs uppercase tracking-[0.2em] text-muted-foreground/80" {...props} />
  ),
  th: ({ node, ...props }) => (
    <th className="border border-border/40 px-3 py-2 text-left font-semibold" {...props} />
  ),
  td: ({ node, ...props }) => (
    <td className="border border-border/40 px-3 py-2 align-top" {...props} />
  ),
  code: CodeBlock,
  a: ({ node, ...props }) => (
    <a
      className="text-cyan-300 underline decoration-dotted underline-offset-4 transition hover:text-cyan-200"
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
}

interface MarkdownViewerProps {
  content: string
  className?: string
}

export const MarkdownViewer = ({ content, className }: MarkdownViewerProps) => (
  <div className={cn('space-y-3 text-sm leading-6 text-muted-foreground', className)}>
    <ReactMarkdown remarkPlugins={[remarkGfm as any]} components={markdownComponents}>
      {content}
    </ReactMarkdown>
  </div>
)

export default MarkdownViewer
