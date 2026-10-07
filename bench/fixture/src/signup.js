export function validateSignup({ email, password }) {
  const errors = []
  if (!password || password.length < 8) errors.push('password too short')
  return { ok: errors.length === 0, errors }
}
