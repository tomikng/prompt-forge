import { getUser } from './users.js'
export function profileHeader(id) { const u = getUser(id); return u ? `Hello, ${u.name}` : 'Hello, guest' }
