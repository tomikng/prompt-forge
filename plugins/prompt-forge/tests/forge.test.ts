import { describe, expect, mock, test } from 'claude-code/testing'

import { isClearEnough, parseReply, recentContext, wantsForge } from '../hooks/register'

describe('parseReply', () => {
  test('reads the prompt and the notes', async () => {
    const r = parseReply('PROMPT:\nFix the login bug in auth.ts.\nDone when tests pass.\nADDED:\n- stated the goal\n- added done check\n')
    expect(r).toEqual({ kind: 'rewrite', enhanced: 'Fix the login bug in auth.ts.\nDone when tests pass.', added: ['stated the goal', 'added done check'] })
  })
  test('UNCHANGED means leave it alone', async () => {
    expect(parseReply('UNCHANGED')).toEqual({ kind: 'unchanged' })
    expect(parseReply('ASK:\n- Which file?\n2. Rename to what?')).toEqual({ kind: 'ask', questions: ['Which file?', 'Rename to what?'] })
  })
  test('a question back to the user is never a rewrite', async () => {
    expect(parseReply('I need more context to help sharpen this prompt. What is "it"?')).toEqual({ kind: 'malformed' })
    expect(parseReply('Sure! Here is a better prompt:\nPROMPT:\nDo X\nADDED:\n- y')).toEqual({ kind: 'malformed' })
  })
})

describe('wantsForge', () => {
  test('skips commands, raw: and short replies', async () => {
    expect(wantsForge('/help')).toBe(false)
    expect(wantsForge('raw: do the thing exactly like this')).toBe(false)
    expect(wantsForge('yes go ahead')).toBe(false)
    expect(wantsForge('can you make the dashboard load faster please')).toBe(true)
  })
})

test('a forged prompt reaches the session rewritten', async ($, on) => {
  let seen = ''
  mock.store(on, { rewrite: true })
  on('model.complete', () => ({ value: {
    isAnswered: true,
    text: 'PROMPT:\nMake the dashboard load faster. Done when first paint is under 1s.\nADDED:\n- added done check',
    usage: { inputTokens: 1, outputTokens: 1 },
  } }) as never)
  on('prompt.submit', (_$, e) => { seen = e.text; return { text: e.text } })
  await $.prompt.submit({ text: 'can you make the dashboard load faster please', origin: { kind: 'composer' }, wait: false })
  expect(seen).toBe('Make the dashboard load faster. Done when first paint is under 1s.')
})

test('raw: goes out untouched, prefix stripped', async ($, on) => {
  let seen = ''
  mock.store(on, { rewrite: true })
  on('prompt.submit', (_$, e) => { seen = e.text; return { text: e.text } })
  await $.prompt.submit({ text: 'raw: leave this prompt exactly alone', origin: { kind: 'composer' }, wait: false })
  expect(seen).toBe('leave this prompt exactly alone')
})

test('/forge off sends prompts as typed', async ($, on) => {
  let seen = ''
  mock.store(on, { enabled: false })
  on('prompt.submit', (_$, e) => { seen = e.text; return { text: e.text } })
  await $.prompt.submit({ text: 'can you make the dashboard load faster please', origin: { kind: 'composer' }, wait: false })
  expect(seen).toBe('can you make the dashboard load faster please')
})

test('the transcript row shows the before/after card', async ($, on) => {
  mock.store(on, { rewrite: true })
  on('model.complete', () => ({ value: {
    isAnswered: true,
    text: 'PROMPT:\nMake the dashboard load faster. Done when first paint is under 1s.\nADDED:\n- stated the goal\n- added done check',
    usage: { inputTokens: 1, outputTokens: 1 },
  } }) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  await $.prompt.submit({ text: 'can you make the dashboard load faster please', origin: { kind: 'composer' }, wait: false })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'prompt-forge', surface, component: 'UserMessage',
      props: { text: 'Make the dashboard load faster. Done when first paint is under 1s.', origin: { kind: 'composer' }, isExpanded: false },
    } as never)
    expect(await ui.find({ type: 'Text', text: /Prompt enhanced/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /you typed: can you make the dashboard/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\+ stated the goal/ })).toBeDefined()
    await ui.unmount()
  }
})

test('a chatty model reply is never sent as the prompt', async ($, on) => {
  let seen = ''
  mock.store(on, { rewrite: true })
  on('model.complete', () => ({ value: {
    isAnswered: true,
    text: 'I need more context to help sharpen this prompt. What is "it"?',
    usage: { inputTokens: 1, outputTokens: 1 },
  } }) as never)
  on('prompt.submit', (_$, e) => { seen = e.text; return { text: e.text } })
  await $.prompt.submit({ text: 'rename it so it is independent from the other one', origin: { kind: 'composer' }, wait: false })
  expect(seen).toBe('rename it so it is independent from the other one')
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

const reply = (text: string) => ({ value: { isAnswered: true, text, usage: { inputTokens: 1, outputTokens: 1 } } }) as never
const ABOVE = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100 } }

test('an unclear prompt is held, its questions asked, and the answer sends a forged prompt', async ($, on) => {
  let seen = ''
  const asked: string[] = []
  mock.store(on, { rewrite: true })
  on('model.complete', (_$, e) => {
    asked.push(e.prompt)
    return asked.length === 1
      ? reply('ASK:\n- Which plugin should be renamed?\n- What should the new name be?')
      : reply('PROMPT:\nRename the prompt-forge plugin to prompt-smith everywhere.\nADDED:\n- named the plugin')
  })
  on('prompt.submit', (_$, e) => { seen = e.text; return { text: e.text } })

  const first = await $.prompt.submit({ text: 'rename it so it is independent from the other one', origin: { kind: 'composer' }, wait: false })
  // The notice names the questions too, in case the band above the prompt never shows.
  expect('drop' in first && first.drop).toContain('1. Which plugin should be renamed?  2. What should the new name be?')
  expect(seen).toBe('')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'prompt-forge', surface, ...ABOVE } as never)
    expect(await ui.find({ type: 'Text', text: /1\. Which plugin should be renamed\?/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /2\. What should the new name be\?/ })).toBeDefined()
    await ui.unmount()
  }

  // A short answer still counts: it answers the held prompt.
  await $.prompt.submit({ text: 'prompt-forge, call it prompt-smith', origin: { kind: 'composer' }, wait: false })
  expect(asked[1]).toContain('<prompt>\nrename it so it is independent from the other one')
  expect(asked[1]).toContain('A: prompt-forge, call it prompt-smith')
  expect(seen).toBe('Rename the prompt-forge plugin to prompt-smith everywhere.')
})

test('"Send as typed" on the question band sends the original prompt', async ($, on) => {
  let seen = ''
  mock.store(on, { rewrite: true })
  on('model.complete', () => reply('ASK:\n- Which one?'))
  on('prompt.submit', (_$, e) => { seen = e.text; return { text: e.text } })
  await $.prompt.submit({ text: 'rename it so it is independent from the other one', origin: { kind: 'composer' }, wait: false })
  const ui = await $.ui.mount({ plugin: 'prompt-forge', surface: 'terminal', ...ABOVE } as never)
  await ui.press({ key: 'send-as-typed' })
  expect(seen).toBe('rename it so it is independent from the other one')
  await ui.unmount()
})

test('a bare "raw:" sends the held prompt as typed', async ($, on) => {
  let seen = ''
  mock.store(on, { rewrite: true })
  on('model.complete', () => reply('ASK:\n- Which one?'))
  on('prompt.submit', (_$, e) => { seen = e.text; return { text: e.text } })
  const first = await $.prompt.submit({ text: 'rename it so it is independent from the other one', origin: { kind: 'composer' }, wait: false })
  expect('drop' in first && first.drop).toContain('Which one?')
  await $.prompt.submit({ text: 'raw:', origin: { kind: 'composer' }, wait: false })
  expect(seen).toBe('rename it so it is independent from the other one')
})

test('a prompt with an image goes out as typed, image and all, with no model call', async ($, on) => {
  let calls = 0
  let seen: { text: string; attachments?: readonly unknown[] } | undefined
  mock.store(on, { rewrite: true })
  on('model.complete', () => { calls += 1; return reply('ASK:\n- What is in the image?') })
  on('prompt.submit', (_$, e) => { seen = e; return { text: e.text } })
  const text = 'why does this look broken, fix it like in the screenshot [Image #1]'
  await $.prompt.submit({ text, attachments: [{ type: 'image', mediaType: 'image/png' }], origin: { kind: 'composer' }, wait: false } as never)
  expect(calls).toBe(0)
  expect(seen?.text).toBe(text)
  expect(seen?.attachments?.length).toBe(1)
})

test('if the answer pass fails, the original and the answer go out together', async ($, on) => {
  let seen = ''
  let n = 0
  mock.store(on, { rewrite: true })
  on('model.complete', () => (++n === 1 ? reply('ASK:\n- Which one?') : reply('ASK:\n- Still unsure?')))
  on('prompt.submit', (_$, e) => { seen = e.text; return { text: e.text } })
  await $.prompt.submit({ text: 'rename it so it is independent from the other one', origin: { kind: 'composer' }, wait: false })
  await $.prompt.submit({ text: 'the forge plugin', origin: { kind: 'composer' }, wait: false })
  expect(seen).toBe('rename it so it is independent from the other one\n\nthe forge plugin')
})

describe('isClearEnough', () => {
  test('specific prompts skip the forge', async () => {
    expect(isClearEnough('In src/users.js rename getUser to fetchUser and update every call site; run npm test and make sure it passes.')).toBe(true)
    expect(isClearEnough("In src/cart.js, make cartTotal multiply each item's price by its quantity, add a test with quantity 3 to test/cart.test.js, and run npm test.")).toBe(true)
    expect(isClearEnough('Fix the flaky retry test in tests/retry.test.ts by mocking the clock; npm test must pass 10 runs in a row.')).toBe(true)
    expect(wantsForge('In src/users.js rename getUser to fetchUser and update every call site; run npm test and make sure it passes.')).toBe(false)
  })
  test('vague, ambiguous and target-less prompts still get forged', async () => {
    expect(isClearEnough('can u make the orders page faster its really slow, dont touch the api')).toBe(false)
    expect(isClearEnough('the cart total is wrong when ppl buy more than one of something fix it')).toBe(false)
    expect(isClearEnough("rename it to something clearer, everywhere it's used")).toBe(false)
    expect(isClearEnough('make the tests pass, they should all be green')).toBe(false)
    expect(isClearEnough('it should work like before in src/app.ts')).toBe(false)
  })
})

test('a clear prompt makes no model call at all', async ($, on) => {
  let calls = 0
  let seen = ''
  mock.store(on, { rewrite: true })
  on('model.complete', () => { calls += 1; return reply('UNCHANGED') })
  on('prompt.submit', (_$, e) => { seen = e.text; return { text: e.text } })
  const text = 'In src/users.js rename getUser to fetchUser and update every call site; run npm test and make sure it passes.'
  await $.prompt.submit({ text, origin: { kind: 'composer' }, wait: false })
  expect(calls).toBe(0)
  expect(seen).toBe(text)
})

// ── the fresh-start offer ───────────────────────────────────────────────────

// The first reading is the floor (the fixed system prompt and tools); later ones add conversation.
const bigSession = (on: Parameters<Parameters<typeof test>[1]>[1], tokens = 90_000, floor = 30_000) => {
  let calls = 0
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: calls++ === 0 ? floor : floor + tokens, window: 200_000 }, rateLimits: [] } }) as never)
  on('session.messages', () => ({ value: [
    { role: 'user', text: 'the orders page is slow' },
    { role: 'assistant', text: 'Fixed ordersPageRows in src/orders.js; tests pass.' },
  ] }) as never)
}
const NEW_TASK = 'In src/signup.js make validateSignup reject emails without an @, and run npm test.'

test('a new task in a long session is held with a fresh-start offer; "h" sends it here', async ($, on) => {
  let seen = ''
  mock.store(on, { rewrite: true })
  bigSession(on)
  on('model.complete', (_$, e) => reply(e.system.startsWith('You decide whether') ? 'NEW' : 'UNCHANGED'))
  on('prompt.submit', (_$, e) => { seen = e.text; return { text: e.text } })
  await $.prompt.submit({ text: 'look at the orders page first please', origin: { kind: 'composer' }, wait: false })
  seen = ''
  const first = await $.prompt.submit({ text: NEW_TASK, origin: { kind: 'composer' }, wait: false })
  expect('drop' in first && first.drop).toContain('re-reads 90k tokens of old conversation')
  expect(seen).toBe('')
  const ui = await $.ui.mount({ plugin: 'prompt-forge', surface: 'terminal', ...ABOVE } as never)
  expect(await ui.find({ type: 'Button', label: /Start fresh & send/ })).toBeDefined()
  await ui.unmount()
  await $.prompt.submit({ text: 'h', origin: { kind: 'composer' }, wait: false })
  expect(seen).toBe(NEW_TASK)
})

test('"f" runs /clear, then sends the held prompt into the fresh conversation', async ($, on) => {
  const order: string[] = []
  mock.store(on, { rewrite: true })
  bigSession(on)
  on('model.complete', (_$, e) => reply(e.system.startsWith('You decide whether') ? 'NEW' : 'UNCHANGED'))
  on('command.run', { command: 'clear' }, () => { order.push('clear'); return { text: '' } })
  on('prompt.submit', (_$, e) => { order.push(e.text); return { text: e.text } })
  await $.prompt.submit({ text: 'look at the orders page first please', origin: { kind: 'composer' }, wait: false })
  order.length = 0
  await $.prompt.submit({ text: NEW_TASK, origin: { kind: 'composer' }, wait: false })
  await $.prompt.submit({ text: 'f', origin: { kind: 'composer' }, wait: false })
  await new Promise(r => setTimeout(r, 50))
  expect(order).toEqual(['clear', NEW_TASK])
})

test('a follow-up, or any prompt in a short session, is never held', async ($, on) => {
  let seen = ''
  let topicCalls = 0
  mock.store(on, { rewrite: true })
  bigSession(on)
  on('model.complete', (_$, e) => {
    if (e.system.startsWith('You decide whether')) { topicCalls += 1; return reply('CONTINUES') }
    return reply('UNCHANGED')
  })
  on('prompt.submit', (_$, e) => { seen = e.text; return { text: e.text } })
  await $.prompt.submit({ text: 'look at the orders page first please', origin: { kind: 'composer' }, wait: false })
  await $.prompt.submit({ text: 'now add a test for that change please', origin: { kind: 'composer' }, wait: false })
  expect(seen).toBe('now add a test for that change please')
  expect(topicCalls).toBe(1)
})

test('below the threshold of conversation no topic check is made, however big the fixed part', async ($, on) => {
  let topicCalls = 0
  mock.store(on, { rewrite: true })
  bigSession(on, 12_000, 60_000)
  on('model.complete', (_$, e) => {
    if (e.system.startsWith('You decide whether')) topicCalls += 1
    return reply('UNCHANGED')
  })
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  await $.prompt.submit({ text: 'look at the orders page first please', origin: { kind: 'composer' }, wait: false })
  await $.prompt.submit({ text: NEW_TASK, origin: { kind: 'composer' }, wait: false })
  expect(topicCalls).toBe(0)
})

test('by default prompts go out as typed, instantly, with no rewrite call', async ($, on) => {
  let calls = 0
  let seen = ''
  mock.store(on)
  on('model.complete', () => { calls += 1; return reply('PROMPT:\nSomething else.\nADDED:\n- x') })
  on('prompt.submit', (_$, e) => { seen = e.text; return { text: e.text } })
  await $.prompt.submit({ text: 'can u make the orders page faster its really slow, dont touch the api', origin: { kind: 'composer' }, wait: false })
  expect(calls).toBe(0)
  expect(seen).toBe('can u make the orders page faster its really slow, dont touch the api')
})

test('/forge rewrite on turns the rewrite back on', async ($, on) => {
  let seen = ''
  mock.store(on)
  on('model.complete', () => reply('PROMPT:\nMake the orders page faster. Do not change the API.\nADDED:\n- kept your API limit'))
  on('prompt.submit', (_$, e) => { seen = e.text; return { text: e.text } })
  const out = await $.command.run({ command: 'forge', args: 'rewrite on' })
  expect(out.text).toContain('Prompt rewriting: ON')
  await $.prompt.submit({ text: 'can u make the orders page faster its really slow, dont touch the api', origin: { kind: 'composer' }, wait: false })
  expect(seen).toBe('Make the orders page faster. Do not change the API.')
})
