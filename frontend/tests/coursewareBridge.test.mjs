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

test('valid interactions retain data while malformed or oversized messages are rejected', () => {
  assert.deepEqual(readCoursewareMessage(event(interaction), frame, origin), { type: 'interaction', interactionType: 'click', serialized: '{"value":1}' })
  for (const data of [null, [], { ...interaction, interactionType: '' }, { ...interaction, interactionType: ' '.repeat(2) }, { ...interaction, interactionType: 1 }, { ...interaction, data: 'x'.repeat(16385) }]) {
    assert.equal(readCoursewareMessage(event(data), frame, origin), null)
  }
  const cyclic = {}; cyclic.self = cyclic
  assert.equal(readCoursewareMessage(event({ ...interaction, data: cyclic }), frame, origin), null)
})
