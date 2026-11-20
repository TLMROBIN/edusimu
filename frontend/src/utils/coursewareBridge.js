export const ISOLATED_TONGJIANG_MARKER = 'edusimu-isolated-tongjiang-v1'

export const hasIsolatedCoursewareMarker = (keywords = '') =>
  String(keywords).split(/[,，]/).some(keyword => keyword.trim() === ISOLATED_TONGJIANG_MARKER)

const readQuizSubmit = data => {
  if (data.version !== 1) return null
  if (typeof data.questionId !== 'string' || !data.questionId.trim() || data.questionId.length > 80) return null
  if (typeof data.isCorrect !== 'boolean') return null
  if (data.score !== undefined && (!Number.isInteger(data.score) || data.score < 0)) return null
  if (data.mistakeTag !== undefined && data.mistakeTag !== null && (typeof data.mistakeTag !== 'string' || data.mistakeTag.length > 50)) return null
  try {
    const answer = typeof data.answer === 'string' ? data.answer : JSON.stringify(data.answer)
    if (typeof answer !== 'string' || new TextEncoder().encode(answer).length > 1024) return null
    return {
      type: 'quiz-submit',
      questionId: data.questionId.trim(),
      answer,
      isCorrect: data.isCorrect,
      score: data.score,
      mistakeTag: data.mistakeTag?.trim() || undefined
    }
  } catch {
    return null
  }
}

export function readCoursewareMessage(event, frameWindow, origin, isolated = false) {
  if (!frameWindow || event.source !== frameWindow || event.origin !== origin) return null
  const data = event.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  if (data.type === 'EDUSIMU_QUIZ_SUBMIT') return readQuizSubmit(data)
  if (isolated) return null
  if (data.type === 'EDUSIMU_HELLO') return { type: 'hello' }
  if (data.type !== 'ANIMATION_INTERACTION') return null
  if (typeof data.interactionType !== 'string' || !data.interactionType.trim() || data.interactionType.length > 100) return null
  try {
    const serialized = JSON.stringify(data.data ?? null)
    if (serialized.length > 16384) return null
    return { type: 'interaction', interactionType: data.interactionType, serialized }
  } catch { return null }
}
