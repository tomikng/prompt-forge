import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateSignup } from '../src/signup.js'
test('rejects short passwords', () => { assert.equal(validateSignup({ email: 'a@b.co', password: '123' }).ok, false) })
