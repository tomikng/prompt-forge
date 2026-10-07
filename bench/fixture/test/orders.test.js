import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ordersPageRows } from '../src/orders.js'
test('orders page rows are newest first with totals', async () => {
  const rows = await ordersPageRows()
  assert.equal(rows.length, 3000)
  assert.equal(rows[0].id, 'o2999')
  assert.equal(rows[0].customer, 'User 49')
  assert.equal(typeof rows[0].total, 'number')
})
