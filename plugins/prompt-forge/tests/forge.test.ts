import { describe, expect, mock, test } from 'claude-code/testing'

import { parseReply, recentContext, wantsForge } from '../hooks/register'

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
  mock.store(on)
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
  mock.store(on)
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
  mock.store(on)
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
    expect(await ui.find({ type: 'Text', text: /I enhanced your prompt/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /you typed: can you make the dashboard/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\+ stated the goal/ })).toBeDefined()
    await ui.unmount()
  }
})

test('a chatty model reply is never sent as the prompt', async ($, on) => {
  let seen = ''
  mock.store(on)
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
  mock.store(on)
  on('model.complete', (_$, e) => {
    asked.push(e.prompt)
    return asked.length === 1
      ? reply('ASK:\n- Which plugin should be renamed?\n- What should the new name be?')
      : reply('PROMPT:\nRename the prompt-forge plugin to prompt-smith everywhere.\nADDED:\n- named the plugin')
  })
  on('prompt.submit', (_$, e) => { seen = e.text; return { text: e.text } })

  const first = await $.prompt.submit({ text: 'rename it so it is independent from the other one', origin: { kind: 'composer' }, wait: false })
  expect('drop' in first && first.drop).toBeTruthy()
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
  mock.store(on)
  on('model.complete', () => reply('ASK:\n- Which one?'))
  on('prompt.submit', (_$, e) => { seen = e.text; return { text: e.text } })
  await $.prompt.submit({ text: 'rename it so it is independent from the other one', origin: { kind: 'composer' }, wait: false })
  const ui = await $.ui.mount({ plugin: 'prompt-forge', surface: 'terminal', ...ABOVE } as never)
  await ui.press({ key: 'send-as-typed' })
  expect(seen).toBe('rename it so it is independent from the other one')
  await ui.unmount()
})

test('if the answer pass fails, the original and the answer go out together', async ($, on) => {
  let seen = ''
  let n = 0
  mock.store(on)
  on('model.complete', () => (++n === 1 ? reply('ASK:\n- Which one?') : reply('ASK:\n- Still unsure?')))
  on('prompt.submit', (_$, e) => { seen = e.text; return { text: e.text } })
  await $.prompt.submit({ text: 'rename it so it is independent from the other one', origin: { kind: 'composer' }, wait: false })
  await $.prompt.submit({ text: 'the forge plugin', origin: { kind: 'composer' }, wait: false })
  expect(seen).toBe('rename it so it is independent from the other one\n\nthe forge plugin')
})
