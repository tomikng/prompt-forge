import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cartTotal } from '../src/cart.js'
test('sums single items', () => { assert.equal(cartTotal([{ price: 2.5, quantity: 1 }, { price: 1, quantity: 1 }]), 3.5) })
