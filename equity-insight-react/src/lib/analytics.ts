type AnalyticsPayload = Record<string, unknown>

const ANALYTICS_ENDPOINT = (import.meta.env?.VITE_ANALYTICS_ENDPOINT as string | undefined)?.trim()

const sendViaFetch = (body: string) => {
  if (!ANALYTICS_ENDPOINT) return false
  try {
    void fetch(ANALYTICS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true
    })
    return true
  } catch (error) {
    console.warn('[analytics] fetch failed', error)
    return false
  }
}

export const sendAnalyticsEvent = (event: string, payload: AnalyticsPayload): void => {
  const body = JSON.stringify({
    event,
    payload,
    timestamp: new Date().toISOString()
  })

  if (ANALYTICS_ENDPOINT && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const blob = new Blob([body], { type: 'application/json' })
    const success = navigator.sendBeacon(ANALYTICS_ENDPOINT, blob)
    if (success) return
  }

  if (sendViaFetch(body)) return

  console.info('[analytics]', event, payload)
}
