// items: [{ price, quantity }]
export function cartTotal(items) {
  let total = 0
  for (const item of items) total += item.price
  return Math.round(total * 100) / 100
}
