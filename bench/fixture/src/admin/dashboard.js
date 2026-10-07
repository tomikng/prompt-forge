import { fetchOrders } from '../api.js'
// Admin dashboard: order counts per user.
export async function adminStats() {
  const counts = {}
  for (const o of await fetchOrders()) counts[o.userId] = (counts[o.userId] ?? 0) + 1
  return counts
}
