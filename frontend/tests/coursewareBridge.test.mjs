import test from 'node:test'
import assert from 'node:assert/strict'
import { hasIsolatedCoursewareMarker, readCoursewareMessage } from '../src/utils/coursewareBridge.js'

const frame = {}, origin = 'http://school.local'
const event = data => ({ source: frame, origin, data })
const interaction = { type: 'ANIMATION_INTERACTION', interactionType: 'click', data: { value: 1 } }

test('only the actual same-origin frame can use the legacy bridge', () => {
  assert.deepEqual(readCoursewareMessage(event({ type: 'EDUSIMU_HELLO' }), frame, origin), { type: 'hello' })
  assert.equal(readCoursewareMessage({ ...event(interaction), source: {} }, frame, origin), null)
  assert.equal(readCoursewareMessage({ ...event(interaction), origin: 'null' }, frame, origin), null)
  assert.equal(readCoursewareMessage({ ...event(interaction), origin: 'https://other.local' }, frame, origin), null)
  assert.equal(readCoursewareMessage(event(interaction), null, origin), null)
})

test('isolated lessons cannot request a token or submit legacy interactions', () => {
  assert.equal(readCoursewareMessage(event({ type: 'EDUSIMU_HELLO' }), frame, origin, true), null)
  assert.equal(readCoursewareMessage(event(interaction), frame, origin, true), null)
  assert.equal(hasIsolatedCoursewareMarker('physics， edusimu-isolated-tongjiang-v1,3D'), true)
  assert.equal(hasIsolatedCoursewareMarker('prefix-edusimu-isolated-tongjiang-v1'), false)
})

test('quiz submissions accept structured answers in normal and isolated lessons', () => {
  const submission = { type: 'EDUSIMU_QUIZ_SUBMIT', version: 1, questionId: 'q1', answer: 'B', isCorrect: false, score: 0, mistakeTag: '方向判断反了' }
  const expected = { type: 'quiz-submit', questionId: 'q1', answer: 'B', isCorrect: false, score: 0, mistakeTag: '方向判断反了' }
  assert.deepEqual(readCoursewareMessage(event(submission), frame, origin), expected)
  assert.deepEqual(readCoursewareMessage(event(submission), frame, origin, true), expected)
  assert.deepEqual(
    readCoursewareMessage(event({ ...submission, answer: ['A', 'C'], score: undefined, mistakeTag: undefined }), frame, origin, true),
    { ...expected, answer: '["A","C"]', score: undefined, mistakeTag: undefined }
  )
})

test('malformed or oversized quiz submissions are rejected', () => {
  const submission = { type: 'EDUSIMU_QUIZ_SUBMIT', version: 1, questionId: 'q1', answer: 'B', isCorrect: false }
  const invalid = [
    { ...submission, version: 2 },
    { ...submission, questionId: '' },
    { ...submission, questionId: 'q'.repeat(81) },
    { ...submission, isCorrect: 0 },
    { ...submission, score: 0.5 },
    { ...submission, score: -1 },
    { ...submission, mistakeTag: 'x'.repeat(51) },
    { ...submission, answer: '题'.repeat(400) },
    { ...submission, answer: undefined },
    { ...submission, answer: () => true }
  ]
  for (const data of invalid) {
    assert.equal(readCoursewareMessage(event(data), frame, origin, true), null)
  }
  const cyclic = {}; cyclic.self = cyclic
  assert.equal(readCoursewareMessage(event({ ...submission, answer: cyclic }), frame, origin, true), null)
  assert.equal(readCoursewareMessage({ ...event(submission), origin: 'https://other.local' }, frame, origin, true), null)
})

test('valid interactions retain data while malformed or oversized messages are rejected', () => {
  assert.deepEqual(readCoursewareMessage(event(interaction), frame, origin), { type: 'interaction', interactionType: 'click', serialized: '{"value":1}' })
  for (const data of [null, [], { ...interaction, interactionType: '' }, { ...interaction, interactionType: ' '.repeat(2) }, { ...interaction, interactionType: 1 }, { ...interaction, data: 'x'.repeat(16385) }]) {
    assert.equal(readCoursewareMessage(event(data), frame, origin), null)
  }
  const cyclic = {}; cyclic.self = cyclic
  assert.equal(readCoursewareMessage(event({ ...interaction, data: cyclic }), frame, origin), null)
})
