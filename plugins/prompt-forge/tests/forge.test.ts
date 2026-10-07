import { describe, expect, mock, test } from 'claude-code/testing'

import { parseReply, wantsForge } from '../hooks/register'

describe('parseReply', () => {
  test('reads the prompt and the notes', async () => {
    const r = parseReply('PROMPT:\nFix the login bug in auth.ts.\nDone when tests pass.\nADDED:\n- stated the goal\n- added done check\n')
    expect(r).toEqual({ kind: 'rewrite', enhanced: 'Fix the login bug in auth.ts.\nDone when tests pass.', added: ['stated the goal', 'added done check'] })
  })
  test('UNCHANGED means leave it alone', async () => {
    expect(parseReply('UNCHANGED')).toEqual({ kind: 'unchanged' })
    expect(parseReply('UNCLEAR')).toEqual({ kind: 'unclear' })
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
