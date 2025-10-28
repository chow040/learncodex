export const resolveApiBaseUrl = (input?: string): string => {
  const provided = typeof input === "string" && input.trim().length > 0 ? input.trim() : undefined
  const envBase = (import.meta.env?.VITE_API_BASE_URL as string | undefined)?.trim()
  const raw = provided ?? envBase
  if (!raw) {
    throw new Error("VITE_API_BASE_URL is not configured")
  }
  return raw.replace(/\/+$/, "")
}
