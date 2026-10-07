import { fetchOrders, fetchProducts } from './api.js'
import { getUser } from './users.js'

// Builds the rows of the orders page.
export async function ordersPageRows() {
  const orders = await fetchOrders()
  const rows = []
  for (const order of orders) {
    const products = JSON.parse(JSON.stringify(await fetchProducts()))
    let total = 0
    const items = []
    for (const line of order.lines) {
      const product = products.find(p => p.id === line.productId)
      total += product.price * line.quantity
      items.push(product.name)
    }
    rows.push({ id: order.id, customer: getUser(order.userId).name, items: items.join(', '), total, createdAt: order.createdAt })
    rows.sort((a, b) => b.createdAt - a.createdAt)
  }
  return rows
}
