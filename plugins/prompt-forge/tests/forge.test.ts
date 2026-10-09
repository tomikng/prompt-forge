import { describe, expect, mock, test } from 'claude-code/testing'

import { freshNote, isClearEnough, recentContext, slugOf } from '../hooks/register'

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
const isTopic = (e: { system?: string }) => (e.system ?? '').startsWith('You decide where')
/** Fakes the host: which commands succeed, and what `superset ws list` returns. */
const host = (on: Parameters<typeof mock.store>[0], ok: (argv: readonly string[]) => boolean, workspaces: unknown[] = [], stdout: Record<string, string> = {}) => {
  const calls: string[][] = []
  on('session.cwd', () => ({ value: '/home/me/.superset/worktrees/shop/orders-speed' }) as never)
  on('process.run', (_$, e) => {
    const argv = (e as unknown as { argv: string[] }).argv
    calls.push([...argv])
    if (argv[0] === 'superset' && argv[1] === 'ws' && argv[2] === 'list') return { value: { exitCode: 0, stdout: JSON.stringify(workspaces), stderr: '' } } as never
    const said = Object.entries(stdout).find(([k]) => argv.join(' ').includes(k))
    if (said) return { value: { exitCode: 0, stdout: said[1], stderr: '' } } as never
    return { value: { exitCode: ok(argv) ? 0 : 1, stdout: '', stderr: '' } } as never
  })
  return calls
}
const WS = { id: 'ws-1', name: 'orders-speed', projectId: 'p-1', worktreePath: '/home/me/.superset/worktrees/shop/orders-speed' }

/** The fresh start runs after the hook returns: give it a moment. */
const sleep = (ms: number) => new Promise<void>(r => (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => void }).setTimeout(r, ms))
const NEW_TASK = 'In src/signup.js make validateSignup reject emails without an @, and run npm test.'
const WARMUP = 'look at the orders page first please'

test('prompts go out exactly as typed, with no model call, in a short session', async ($, on) => {
  let calls = 0
  let seen = ''
  mock.store(on)
  session(on, 5_000)
  on('model.complete', () => { calls += 1; return reply('UNRELATED') })
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
  on('model.complete', (_$, e) => reply(isTopic(e) ? 'RELATED' : 'x'))
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

test('"f" with no way to open a session falls back to /clear, then sends the prompt', async ($, on) => {
  const order: string[] = []
  mock.store(on)
  session(on)
  on('model.complete', (_$, e) => reply(isTopic(e) ? 'RELATED' : 'x'))
  on('command.run', { command: 'clear' }, () => { order.push('clear'); return { text: '' } })
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '' } }) as never)
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
  on('model.complete', (_$, e) => reply(isTopic(e) ? 'RELATED' : 'x'))
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
  on('model.complete', (_$, e) => { if (isTopic(e)) topicCalls += 1; return reply('UNRELATED') })
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
  on('model.complete', () => { calls += 1; return reply('UNRELATED') })
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
  on('model.complete', () => { calls += 1; return reply('UNRELATED') })
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

test('"f" opens a new terminal window and leaves this session as it is', async ($, on) => {
  const sent: string[] = []
  let cleared = false
  mock.store(on)
  session(on)
  on('model.complete', (_$, e) => reply(isTopic(e) ? 'RELATED' : 'x'))
  on('command.run', { command: 'clear' }, () => { cleared = true; return { text: '' } })
  const calls = host(on, argv => argv.join(' ').includes('command -v xdg-terminal-exec') || argv[0] === 'setsid')
  on('prompt.submit', (_$, e) => { sent.push(e.text); return { text: e.text } })
  await $.prompt.submit({ text: WARMUP, origin: { kind: 'composer' }, wait: false })
  sent.length = 0
  const held = await $.prompt.submit({ text: NEW_TASK, origin: { kind: 'composer' }, wait: false })
  expect('drop' in held && held.drop).toContain('"f" for a new terminal, or "h" to send it here')
  await $.prompt.submit({ text: 'f', origin: { kind: 'composer' }, wait: false })
  await sleep(50)
  expect(calls.some(a => a[0] === 'setsid' && a.includes('xdg-terminal-exec') && a.at(-1) === NEW_TASK)).toBe(true)
  expect(cleared).toBe(false)
  expect(sent).toEqual([])
})

test('with newSession: superset, a related task gets a new terminal in the same workspace', { options: { newSession: 'superset' } }, async ($, on) => {
  mock.store(on)
  session(on)
  on('model.complete', (_$, e) => reply(isTopic(e) ? 'RELATED' : 'x'))
  const calls = host(on, argv => argv[0] === 'superset', [WS])
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  await $.prompt.submit({ text: WARMUP, origin: { kind: 'composer' }, wait: false })
  const held = await $.prompt.submit({ text: NEW_TASK, origin: { kind: 'composer' }, wait: false })
  expect('drop' in held && held.drop).toContain('"f" for a new terminal')
  await $.prompt.submit({ text: 'f', origin: { kind: 'composer' }, wait: false })
  await sleep(50)
  expect(calls.find(a => a[1] === 'agents')).toEqual(['superset', 'agents', 'create', '--local', '--workspace', 'ws-1', '--agent', 'claude', '--prompt', NEW_TASK])
})

test('with newSession: superset, an unrelated task can get its own workspace with "w"', { options: { newSession: 'superset' } }, async ($, on) => {
  mock.store(on)
  session(on)
  on('model.complete', (_$, e) => reply(isTopic(e) ? 'UNRELATED' : 'x'))
  const calls = host(on, argv => argv[0] === 'superset', [WS])
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  await $.prompt.submit({ text: WARMUP, origin: { kind: 'composer' }, wait: false })
  const held = await $.prompt.submit({ text: NEW_TASK, origin: { kind: 'composer' }, wait: false })
  expect('drop' in held && held.drop).toContain('"w" for a new Superset workspace')
  const ui = await $.ui.mount({ plugin: 'prompt-forge', surface: 'terminal', ...ABOVE } as never)
  expect(await ui.find({ type: 'Button', key: 'workspace' })).toBeDefined()
  await ui.unmount()
  await $.prompt.submit({ text: 'w', origin: { kind: 'composer' }, wait: false })
  await sleep(50)
  const create = calls.find(a => a[1] === 'ws' && a[2] === 'create')
  expect(create).toEqual(['superset', 'ws', 'create', '--local', '--project', 'p-1', '--name', slugOf(NEW_TASK), '--branch', slugOf(NEW_TASK), '--agent', 'claude', '--prompt', NEW_TASK])
})

test('newSession: clear always uses /clear', { options: { newSession: 'clear' } }, async ($, on) => {
  const order: string[] = []
  mock.store(on)
  session(on)
  on('model.complete', (_$, e) => reply(isTopic(e) ? 'RELATED' : 'x'))
  host(on, () => true, [WS])
  on('command.run', { command: 'clear' }, () => { order.push('clear'); return { text: '' } })
  on('prompt.submit', (_$, e) => { order.push(e.text); return { text: e.text } })
  await $.prompt.submit({ text: WARMUP, origin: { kind: 'composer' }, wait: false })
  order.length = 0
  await $.prompt.submit({ text: NEW_TASK, origin: { kind: 'composer' }, wait: false })
  await $.prompt.submit({ text: 'f', origin: { kind: 'composer' }, wait: false })
  await sleep(50)
  expect(order).toEqual(['clear', NEW_TASK])
})

test('by default (auto) Superset is never touched, even inside a workspace', async ($, on) => {
  mock.store(on)
  session(on)
  on('model.complete', (_$, e) => reply(isTopic(e) ? 'UNRELATED' : 'x'))
  const calls = host(on, argv => argv.join(' ').includes('command -v xdg-terminal-exec') || argv[0] === 'setsid', [WS])
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  await $.prompt.submit({ text: WARMUP, origin: { kind: 'composer' }, wait: false })
  const held = await $.prompt.submit({ text: NEW_TASK, origin: { kind: 'composer' }, wait: false })
  expect('drop' in held && held.drop).not.toContain('Superset')
  await $.prompt.submit({ text: 'f', origin: { kind: 'composer' }, wait: false })
  await sleep(50)
  expect(calls.some(a => a[0] === 'superset')).toBe(false)
  expect(calls.some(a => a[0] === 'setsid')).toBe(true)
})

test('terminalCommand opens your own terminal, with {dir} filled in', { options: { terminalCommand: 'ghostty --working-directory={dir} -e' } }, async ($, on) => {
  mock.store(on)
  session(on)
  on('model.complete', (_$, e) => reply(isTopic(e) ? 'RELATED' : 'x'))
  const calls = host(on, argv => argv[0] === 'sh' && (argv[2] ?? '').startsWith('nohup'))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  await $.prompt.submit({ text: WARMUP, origin: { kind: 'composer' }, wait: false })
  await $.prompt.submit({ text: NEW_TASK, origin: { kind: 'composer' }, wait: false })
  await $.prompt.submit({ text: 'f', origin: { kind: 'composer' }, wait: false })
  await sleep(50)
  expect(calls).toContainEqual(['sh', '-c', 'nohup "$@" >/dev/null 2>&1 &', 'sh', 'ghostty', '--working-directory=/home/me/.superset/worktrees/shop/orders-speed', '-e', 'claude', NEW_TASK])
})

test('freshMinTokens moves the threshold', { options: { freshMinTokens: 100_000 } }, async ($, on) => {
  let topicCalls = 0
  mock.store(on)
  session(on, 90_000)
  on('model.complete', (_$, e) => { if (isTopic(e)) topicCalls += 1; return reply('UNRELATED') })
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  await $.prompt.submit({ text: WARMUP, origin: { kind: 'composer' }, wait: false })
  await $.prompt.submit({ text: NEW_TASK, origin: { kind: 'composer' }, wait: false })
  expect(topicCalls).toBe(0)
})

test('a new session leaves a note so its first turn can run on Sonnet', async ($, on) => {
  const store = new Map<string, unknown>()
  on('store.get', (_$, e) => ({ value: store.get((e as unknown as { key: string }).key) }) as never)
  on('store.set', (_$, e) => { const { key, value } = e as unknown as { key: string; value: unknown }; store.set(key, value); return { value: undefined } as never })
  session(on)
  on('model.complete', (_$, e) => reply(isTopic(e) ? 'RELATED' : 'x'))
  host(on, argv => argv.join(' ').includes('command -v xdg-terminal-exec') || argv[0] === 'setsid')
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  await $.prompt.submit({ text: WARMUP, origin: { kind: 'composer' }, wait: false })
  await $.prompt.submit({ text: NEW_TASK, origin: { kind: 'composer' }, wait: false })
  await $.prompt.submit({ text: 'f', origin: { kind: 'composer' }, wait: false })
  await sleep(50)
  expect(store.get('handoff')).toBe(NEW_TASK)
  // the new session's first prompt takes the note
  await $.prompt.submit({ text: NEW_TASK, origin: { kind: 'composer' }, wait: false })
  expect(store.get('handoff')).toBe(null)
})

test('slugOf makes a short branch name from the prompt', async () => {
  expect(slugOf('In src/users.js rename getUser to fetchUser everywhere; run npm test.')).toBe('src-users-js-rename-getuser')
  expect(freshNote(85_000, 'unrelated', 'superset')).toContain('"w" for a new Superset workspace')
  expect(freshNote(85_000, 'unrelated', 'git')).toContain('"w" for a new worktree on its own branch')
  expect(freshNote(85_000, 'related', 'git')).not.toContain('"w"')
})

test('outside Superset, an unrelated task can get its own git worktree with "w", opened in a new terminal', async ($, on) => {
  mock.store(on)
  session(on)
  on('model.complete', (_$, e) => reply(isTopic(e) ? 'UNRELATED' : 'x'))
  const calls = host(on, argv => argv[0] === 'git' || argv.join(' ').includes('command -v xdg-terminal-exec') || argv[0] === 'setsid', [],
    { 'rev-parse --show-toplevel': '/home/me/shop', 'symbolic-ref': 'origin/main' })
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  await $.prompt.submit({ text: WARMUP, origin: { kind: 'composer' }, wait: false })
  const held = await $.prompt.submit({ text: NEW_TASK, origin: { kind: 'composer' }, wait: false })
  expect('drop' in held && held.drop).toContain('"w" for a new worktree on its own branch')
  await $.prompt.submit({ text: 'w', origin: { kind: 'composer' }, wait: false })
  await sleep(50)
  const slug = slugOf(NEW_TASK)
  expect(calls).toContainEqual(['git', '-C', '/home/me/shop', 'worktree', 'add', '-b', slug, `/home/me/shop-${slug}`, 'origin/main'])
  expect(calls).toContainEqual(['setsid', '-f', 'xdg-terminal-exec', `--dir=/home/me/shop-${slug}`, 'claude', NEW_TASK])
})

test('on macOS, "f" opens a new Terminal window with the prompt safely quoted', async ($, on) => {
  mock.store(on)
  session(on)
  on('model.complete', (_$, e) => reply(isTopic(e) ? 'RELATED' : 'x'))
  const calls = host(on, argv => argv.join(' ').includes('uname') || argv[0] === 'osascript')
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  const tricky = "In src/users.js rename getUser to fetchUser; it's \"urgent\", run npm test."
  await $.prompt.submit({ text: WARMUP, origin: { kind: 'composer' }, wait: false })
  await $.prompt.submit({ text: tricky, origin: { kind: 'composer' }, wait: false })
  await $.prompt.submit({ text: 'f', origin: { kind: 'composer' }, wait: false })
  await sleep(50)
  const osa = calls.find(a => a[0] === 'osascript')
  expect(osa?.[2]).toBe(`tell application "Terminal" to do script "cd '/home/me/.superset/worktrees/shop/orders-speed' && claude 'In src/users.js rename getUser to fetchUser; it'\\\\''s \\"urgent\\", run npm test.'"`)
})
