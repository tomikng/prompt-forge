const users = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`u${i}`, { id: `u${i}`, name: `User ${i}` }]))
export function getUser(id) { return users[id] ?? null }
