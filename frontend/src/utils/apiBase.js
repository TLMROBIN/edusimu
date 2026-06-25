export const normalizePathBase = (value = '') => {
  const raw = String(value || '').trim()
  if (!raw || raw === '/') {
    return ''
  }
  return `/${raw.replace(/^\/+|\/+$/g, '')}`
}

export const resolveApiBase = (
  apiBase = import.meta.env?.VITE_API_BASE || '',
  publicBase = import.meta.env?.BASE_URL || ''
) => normalizePathBase(apiBase) || normalizePathBase(publicBase)
