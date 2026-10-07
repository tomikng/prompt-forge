// Public API used by the mobile app. Do not change these signatures.
const products = Array.from({ length: 3000 }, (_, i) => ({ id: `p${i}`, name: `Product ${i}`, price: 5 + (i % 40) }))
const orders = Array.from({ length: 3000 }, (_, i) => ({
  id: `o${i}`, userId: `u${i % 50}`, createdAt: 1700000000000 + i * 60000,
  lines: [{ productId: `p${(i * 7) % 3000}`, quantity: 1 + (i % 3) }, { productId: `p${(i * 13) % 3000}`, quantity: 1 }],
}))
export async function fetchOrders() { return orders }
export async function fetchProducts() { return products }
