export const ISOLATED_TONGJIANG_MARKER = 'edusimu-isolated-tongjiang-v1'

export const hasIsolatedCoursewareMarker = (keywords = '') =>
  String(keywords).split(/[,，]/).some(keyword => keyword.trim() === ISOLATED_TONGJIANG_MARKER)

export function readCoursewareMessage(event, frameWindow, origin, isolated = false) {
  if (!frameWindow || event.source !== frameWindow || event.origin !== origin || isolated) return null
  const data = event.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  if (data.type === 'EDUSIMU_HELLO') return { type: 'hello' }
  if (data.type !== 'ANIMATION_INTERACTION') return null
  if (typeof data.interactionType !== 'string' || !data.interactionType.trim() || data.interactionType.length > 100) return null
  try {
    const serialized = JSON.stringify(data.data ?? null)
    if (serialized.length > 16384) return null
    return { type: 'interaction', interactionType: data.interactionType, serialized }
  } catch { return null }
}
