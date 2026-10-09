import { describe, expect, mock, test } from 'claude-code/testing'

import { isClearEnough, recentContext } from '../hooks/register'

const reply = (text: string) => ({ value: { isAnswered: true, text, usage: { inputTokens: 1, outputTokens: 1 } } }) as never
const ABOVE = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100 } }

// The first context reading is the floor (the fixed system prompt and tools); later ones add
// `tokens` of conversation on top.
const session = (on: Parameters<typeof mock.store>[0], tokens = 90_000, floor = 30_000) => {
  let calls = 0
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: calls++ === 0 ? floor : floor + tokens, window: 200_000 }, rateLimits: [] } }) as never)
  on('session.messages', () => ({ value: [
    { role: 'user', text: 'the orders page is slow' },
    { role: 'assistant', text: 'Fixed ordersPageRows in src/orders.js; tests pass.' },
  ] }) as never)
}
const isTopic = (e: { system?: string }) => (e.system ?? '').startsWith('You decide whether')
/** The fresh start runs after the hook returns: give it a moment. */
const sleep = (ms: number) => new Promise<void>(r => (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => void }).setTimeout(r, ms))
const NEW_TASK = 'In src/signup.js make validateSignup reject emails without an @, and run npm test.'
const WARMUP = 'look at the orders page first please'

test('prompts go out exactly as typed, with no model call, in a short session', async ($, on) => {
  let calls = 0
  let seen = ''
  mock.store(on)
  session(on, 5_000)
  on('model.complete', () => { calls += 1; return reply('NEW') })
  on('prompt.submit', (_$, e) => { seen = e.text; return { text: e.text } })
  await $.prompt.submit({ text: WARMUP, origin: { kind: 'composer' }, wait: false })
  await $.prompt.submit({ text: 'can u make the orders page faster its really slow, dont touch the api', origin: { kind: 'composer' }, wait: false })
  expect(calls).toBe(0)
  expect(seen).toBe('can u make the orders page faster its really slow, dont touch the api')
})

test('raw: goes out untouched, prefix stripped', async ($, on) => {
  let seen = ''
  mock.store(on)
  on('prompt.submit', (_$, e) => { seen = e.text; return { text: e.text } })
  await $.prompt.submit({ text: 'raw: do exactly this and nothing else please', origin: { kind: 'composer' }, wait: false })
  expect(seen).toBe('do exactly this and nothing else please')
})

test('a new task in a long session is held with a fresh-start offer; "h" sends it here', async ($, on) => {
  let seen = ''
  mock.store(on)
  session(on)
  on('model.complete', (_$, e) => reply(isTopic(e) ? 'NEW' : 'x'))
  on('prompt.submit', (_$, e) => { seen = e.text; return { text: e.text } })
  await $.prompt.submit({ text: WARMUP, origin: { kind: 'composer' }, wait: false })
  seen = ''
  const first = await $.prompt.submit({ text: NEW_TASK, origin: { kind: 'composer' }, wait: false })
  expect('drop' in first && first.drop).toContain('re-reads 90k tokens of old conversation')
  expect(seen).toBe('')
  const ui = await $.ui.mount({ plugin: 'prompt-forge', surface: 'terminal', ...ABOVE } as never)
  expect(await ui.find({ type: 'Button', key: 'fresh' })).toBeDefined()
  await ui.unmount()
  await $.prompt.submit({ text: 'h', origin: { kind: 'composer' }, wait: false })
  expect(seen).toBe(NEW_TASK)
})

test('"f" runs /clear, then sends the held prompt into the fresh conversation', async ($, on) => {
  const order: string[] = []
  mock.store(on)
  session(on)
  on('model.complete', (_$, e) => reply(isTopic(e) ? 'NEW' : 'x'))
  on('command.run', { command: 'clear' }, () => { order.push('clear'); return { text: '' } })
  on('prompt.submit', (_$, e) => { order.push(e.text); return { text: e.text } })
  await $.prompt.submit({ text: WARMUP, origin: { kind: 'composer' }, wait: false })
  order.length = 0
  await $.prompt.submit({ text: NEW_TASK, origin: { kind: 'composer' }, wait: false })
  await $.prompt.submit({ text: 'f', origin: { kind: 'composer' }, wait: false })
  await sleep(50)
  expect(order).toEqual(['clear', NEW_TASK])
})

test('"Send here" on the band sends the held prompt where you are', async ($, on) => {
  let seen = ''
  mock.store(on)
  session(on)
  on('model.complete', (_$, e) => reply(isTopic(e) ? 'NEW' : 'x'))
  on('prompt.submit', (_$, e) => { seen = e.text; return { text: e.text } })
  await $.prompt.submit({ text: WARMUP, origin: { kind: 'composer' }, wait: false })
  await $.prompt.submit({ text: NEW_TASK, origin: { kind: 'composer' }, wait: false })
  const ui = await $.ui.mount({ plugin: 'prompt-forge', surface: 'terminal', ...ABOVE } as never)
  await ui.press({ key: 'here' })
  expect(seen).toBe(NEW_TASK)
  await ui.unmount()
})

test('a follow-up in a long session is never held', async ($, on) => {
  let seen = ''
  let topicCalls = 0
  mock.store(on)
  session(on)
  on('model.complete', (_$, e) => { if (isTopic(e)) topicCalls += 1; return reply('CONTINUES') })
  on('prompt.submit', (_$, e) => { seen = e.text; return { text: e.text } })
  await $.prompt.submit({ text: WARMUP, origin: { kind: 'composer' }, wait: false })
  await $.prompt.submit({ text: 'now add a test for that change please', origin: { kind: 'composer' }, wait: false })
  expect(seen).toBe('now add a test for that change please')
  expect(topicCalls).toBe(1)
})

test('below 30k tokens of conversation no check is made, however big the fixed part', async ($, on) => {
  let topicCalls = 0
  mock.store(on)
  session(on, 12_000, 60_000)
  on('model.complete', (_$, e) => { if (isTopic(e)) topicCalls += 1; return reply('NEW') })
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  await $.prompt.submit({ text: WARMUP, origin: { kind: 'composer' }, wait: false })
  await $.prompt.submit({ text: NEW_TASK, origin: { kind: 'composer' }, wait: false })
  expect(topicCalls).toBe(0)
})

test('a prompt with an image is never held, so the image always reaches Claude', async ($, on) => {
  let calls = 0
  let seen: { text: string; attachments?: readonly unknown[] } | undefined
  mock.store(on)
  session(on)
  on('model.complete', () => { calls += 1; return reply('NEW') })
  on('prompt.submit', (_$, e) => { seen = e; return { text: e.text } })
  await $.prompt.submit({ text: WARMUP, origin: { kind: 'composer' }, wait: false })
  const text = 'why does this look broken, fix it like in the screenshot [Image #1]'
  await $.prompt.submit({ text, attachments: [{ type: 'image', mediaType: 'image/png' }], origin: { kind: 'composer' }, wait: false } as never)
  expect(calls).toBe(0)
  expect(seen?.text).toBe(text)
  expect(seen?.attachments?.length).toBe(1)
})

test('/forge off sends everything as typed; /forge shows both switches', async ($, on) => {
  let calls = 0
  mock.store(on, { enabled: false })
  session(on)
  on('model.complete', () => { calls += 1; return reply('NEW') })
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  await $.prompt.submit({ text: WARMUP, origin: { kind: 'composer' }, wait: false })
  await $.prompt.submit({ text: NEW_TASK, origin: { kind: 'composer' }, wait: false })
  expect(calls).toBe(0)
  const out = await $.command.run({ command: 'forge', args: 'on' } as never)
  expect(out.text).toContain('Fresh start for new tasks in long sessions: ON')
  expect(out.text).toContain('Sonnet for small, clear tasks on a fresh context: ON')
})

test('recentContext keeps the newest text messages within budget', async () => {
  const msgs = [
    { role: 'user', text: 'old question' },
    { role: 'assistant', text: '' },
    { role: 'assistant', text: 'We built the prompt-forge plugin.' },
    { role: 'user', text: 'nice' },
  ]
  expect(recentContext(msgs)).toBe('user: old question\n\nassistant: We built the prompt-forge plugin.\n\nuser: nice')
  expect(recentContext(msgs, 60)).toBe('assistant: We built the prompt-forge plugin.\n\nuser: nice')
})

describe('isClearEnough', () => {
  test('specific prompts skip the forge', async () => {
    expect(isClearEnough('In src/users.js rename getUser to fetchUser and update every call site; run npm test and make sure it passes.')).toBe(true)
    expect(isClearEnough("In src/cart.js, make cartTotal multiply each item's price by its quantity, add a test with quantity 3 to test/cart.test.js, and run npm test.")).toBe(true)
    expect(isClearEnough('Fix the flaky retry test in tests/retry.test.ts by mocking the clock; npm test must pass 10 runs in a row.')).toBe(true)
  })
  test('vague, ambiguous and target-less prompts still get forged', async () => {
    expect(isClearEnough('can u make the orders page faster its really slow, dont touch the api')).toBe(false)
    expect(isClearEnough('the cart total is wrong when ppl buy more than one of something fix it')).toBe(false)
    expect(isClearEnough("rename it to something clearer, everywhere it's used")).toBe(false)
    expect(isClearEnough('make the tests pass, they should all be green')).toBe(false)
    expect(isClearEnough('it should work like before in src/app.ts')).toBe(false)
  })
})
