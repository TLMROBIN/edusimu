import assert from 'node:assert/strict'
import { normalizePathBase, resolveApiBase } from '../src/utils/apiBase.js'

assert.equal(normalizePathBase('/'), '')
assert.equal(normalizePathBase('/edusimu/'), '/edusimu')
assert.equal(resolveApiBase('', '/edusimu/'), '/edusimu')
assert.equal(resolveApiBase('/custom-api/', '/edusimu/'), '/custom-api')
