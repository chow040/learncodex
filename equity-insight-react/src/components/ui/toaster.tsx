import * as React from 'react'
import { X } from 'lucide-react'

import { Toast, ToastAction, ToastClose, ToastDescription, ToastTitle, ToastViewport, ToastProvider as RadixToastProvider } from './toast'
import { useToast } from './use-toast'

export const Toaster: React.FC = () => {
  const { toasts, dismiss } = useToast()

  return (
    <RadixToastProvider>
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          open={toast.open}
          onOpenChange={(open) => {
            if (!open) dismiss(toast.id)
          }}
          className={toast.variant === 'destructive' ? 'border-rose-500/60 bg-rose-500/15 text-rose-50' : undefined}
        >
          <div className="flex flex-1 flex-col gap-1">
            {toast.title ? <ToastTitle>{toast.title}</ToastTitle> : null}
            {toast.description ? <ToastDescription>{toast.description}</ToastDescription> : null}
          </div>
          {toast.action ? (
            <ToastAction
              altText={toast.action.altText}
              onClick={() => {
                toast.action?.onClick?.()
                dismiss(toast.id)
              }}
            >
              {toast.action.label}
            </ToastAction>
          ) : null}
          <ToastClose asChild>
            <button type="button">
              <X className="h-4 w-4" aria-hidden />
              <span className="sr-only">Close</span>
            </button>
          </ToastClose>
        </Toast>
      ))}
      <ToastViewport />
    </RadixToastProvider>
  )
}
