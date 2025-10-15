import * as React from 'react'

const TOAST_LIMIT = 5
const DEFAULT_DURATION = 5000
const EXIT_ANIMATION_MS = 320

type ToastVariant = 'default' | 'destructive'

type ToastAction = {
  altText: string
  label: string
  onClick?: () => void
}

type ToastOptions = {
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastAction
  variant?: ToastVariant
  duration?: number
}

export type ToasterToast = ToastOptions & {
  id: string
  createdAt: number
  open: boolean
}

type ToastContextValue = {
  toasts: ToasterToast[]
  toast: (options: ToastOptions) => string
  dismiss: (toastId?: string) => void
}

const ToastContext = React.createContext<ToastContextValue | undefined>(undefined)

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = React.useState<ToasterToast[]>([])
  const removalTimers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const remove = React.useCallback((toastId: string) => {
    const existing = removalTimers.current.get(toastId)
    if (existing) {
      clearTimeout(existing)
      removalTimers.current.delete(toastId)
    }
    setToasts((current) => current.filter((toast) => toast.id !== toastId))
  }, [])

  const scheduleRemoval = React.useCallback(
    (toastId: string, delay = EXIT_ANIMATION_MS) => {
      const existing = removalTimers.current.get(toastId)
      if (existing) clearTimeout(existing)
      const timeout = setTimeout(() => remove(toastId), delay)
      removalTimers.current.set(toastId, timeout)
    },
    [remove]
  )

  const dismiss = React.useCallback(
    (toastId?: string) => {
      if (!toastId) {
        setToasts((current) => {
          current.forEach((toast) => scheduleRemoval(toast.id))
          return current.map((toast) => ({ ...toast, open: false }))
        })
        return
      }

      setToasts((current) =>
        current.map((toast) => (toast.id === toastId ? { ...toast, open: false } : toast))
      )
      scheduleRemoval(toastId)
    },
    [scheduleRemoval]
  )

  const toast = React.useCallback(
    (options: ToastOptions) => {
      const id = Math.random().toString(36).slice(2, 11)
      const nextToast: ToasterToast = {
        ...options,
        id,
        createdAt: Date.now(),
        open: true
      }

      setToasts((current) => [nextToast, ...current].slice(0, TOAST_LIMIT))

      const duration = options.duration ?? DEFAULT_DURATION
      if (Number.isFinite(duration) && duration > 0) {
        const timeout = setTimeout(() => dismiss(id), duration)
        removalTimers.current.set(id, timeout)
      }

      return id
    },
    [dismiss]
  )

  React.useEffect(() => {
    return () => {
      removalTimers.current.forEach((timeout) => clearTimeout(timeout))
      removalTimers.current.clear()
    }
  }, [])

  const value = React.useMemo<ToastContextValue>(
    () => ({
      toasts,
      toast,
      dismiss
    }),
    [toasts, toast, dismiss]
  )

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

export const useToast = () => {
  const context = React.useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
