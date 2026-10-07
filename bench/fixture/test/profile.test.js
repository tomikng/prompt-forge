import { test } from 'node:test'
import assert from 'node:assert/strict'
import { profileHeader } from '../src/profile.js'
test('greets users', () => { assert.equal(profileHeader('u1'), 'Hello, User 1') })
