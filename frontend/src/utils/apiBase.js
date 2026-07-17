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

export const resolveAssetUrl = (url = '') => {
  const raw = String(url || '').trim()
  if (!raw) return ''
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) {
    return raw
  }
  const base = resolveApiBase()
  if (!base) return raw
  return raw.startsWith('/') ? `${base}${raw}` : `${base}/${raw}`
}
