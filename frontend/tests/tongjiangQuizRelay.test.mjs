import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

test('the isolated wrapper relays only a valid quiz from its opaque-origin lesson', () => {
  const template = readFileSync(new URL('../../scripts/tongjiang_isolated_wrapper.html', import.meta.url), 'utf8')
  const code = template.match(/<script>\n([\s\S]*?)<\/script>/)[1]
  const received = []
  const frame = { contentWindow: {} }
  const origin = 'http://edusimu.local'
  let onMessage
  runInNewContext(code, {
    parent: { postMessage: (...args) => received.push(args) },
    window: { addEventListener: (_name, callback) => { onMessage = callback } },
    location: { origin },
    document: {
      getElementById: id => id === 'lesson' ? frame : {
        textContent: JSON.stringify({
          slug: 'fixture', sourceBase64: Buffer.from('<html><head></head><body></body></html>').toString('base64')
        })
      }
    },
    localStorage: { getItem: () => null },
    atob, TextEncoder, TextDecoder
  })
  const quiz = { type: 'EDUSIMU_QUIZ_SUBMIT', version: 1, questionId: ' q1 ', answer: ['A', 'C'], isCorrect: true, score: 1 }
  const lessonEvent = { source: frame.contentWindow, origin: 'null' }
  for (const event of [
    { ...lessonEvent, source: {}, data: quiz },
    { ...lessonEvent, origin, data: quiz },
    { ...lessonEvent, data: { ...quiz, isCorrect: 'true' } },
    { ...lessonEvent, data: { ...quiz, answer: '题'.repeat(342) } },
    { ...lessonEvent, data: { type: 'EDUSIMU_HELLO' } },
    { ...lessonEvent, data: { type: 'EDUSIMU_CONTEXT', token: 'fixture' } }
  ]) onMessage(event)
  assert.equal(received.length, 0)
  onMessage({ ...lessonEvent, data: { ...quiz, token: 'fixture' } })
  assert.equal(received.length, 1)
  assert.equal(received[0][1], origin)
  assert.deepEqual(JSON.parse(JSON.stringify(received[0][0])), {
    ...quiz, questionId: 'q1', answer: '["A","C"]'
  })
  assert.match(template, /sandbox="allow-scripts allow-pointer-lock"/)
  assert.match(frame.srcdoc, /connect-src 'none'/)
})
