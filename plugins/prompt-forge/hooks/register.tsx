import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { isClearEnough } from './classify'

export { isClearEnough }

// Prompt Forge spends your tokens where they count. Prompts go out as typed; two things change
// what a turn costs: a fresh start for a new task in a long session, and Sonnet for a small,
// clear task on a small context.

const freshA = atom({ plugin: 'prompt-forge', key: 'fresh' } as const, null)

/**
 * Below this much conversation a fresh start saves too little to be worth a question. Counted
 * above the session's floor: the system prompt, tools and MCP servers every request carries
 * (27k on a bare install, far more with plugins), which /clear can't remove.
 */
export const FRESH_MIN_TOKENS = 30_000
const FRESH = /^(?:f|fresh|y|yes|clear)$/i
const HERE = /^(?:h|here|n|no)$/i
const RAW = /^raw:\s*/i
const MIN_WORDS = 5

const TOPIC = `You decide whether a developer's new prompt to an AI coding agent continues the work in the
recent conversation or starts an unrelated task.

CONTINUES: the prompt refers to anything in the conversation ("it", "that", "the same", "the
bug", "again", a file, function or result mentioned there), follows up on the last change, or
could go wrong without the conversation's context.
NEW: a self-contained task that names its own target and needs nothing said in the conversation.

When unsure, answer CONTINUES: starting fresh by mistake loses context the user needs.
Reply with exactly one word: CONTINUES or NEW.`

/** The last few text messages of the conversation, newest last, within a character budget. */
export function recentContext(msgs: readonly { role: string; text: string }[], budget = 3000): string {
  const out: string[] = []
  let used = 0
  for (const m of [...msgs].reverse()) {
    const t = m.text.trim()
    if (!t) continue
    const line = `${m.role}: ${t.length > 800 ? `${t.slice(0, 799)}…` : t}`
    if (used + line.length > budget || out.length >= 6) break
    out.unshift(line)
    used += line.length
  }
  return out.join('\n\n')
}

const kTokens = (n: number) => `${Math.round(n / 1000)}k`

/** The drop notice of a prompt held as a new task: one line, since the engine draws it as one. */
export function freshNote(tokens: number): string {
  return `✨ Prompt Forge: this looks like a new task, and every step here re-reads ${kTokens(tokens)} tokens of old conversation.  ↳ reply "f" to /clear and send it fresh, or "h" to send it here`
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const norm = (s: string) => s.trim().replace(/\s+/g, ' ')

async function isOn($: EngineInterface) {
  return (await $.store.get('enabled')) !== false
}

/** The last few messages, for telling a follow-up from a new task; empty when unreadable. */
async function conversation($: EngineInterface) {
  try {
    return recentContext(await $.session.messages())
  } catch {
    return ''
  }
}

let floor = Infinity

/**
 * Tokens of conversation the session re-reads each step: the context less its floor, the
 * smallest context seen (taken as the fixed part). 0 when the engine can't say.
 */
async function conversationTokens($: EngineInterface) {
  try {
    const tokens = (await $.session.usage()).context.tokens
    if (!tokens) return 0
    floor = Math.min(floor, tokens)
    return tokens - floor
  } catch {
    return 0
  }
}

/**
 * Model routing: a clear, small task on a small context runs on Sonnet for that turn. Only on a
 * small context: the prompt cache is per model, so switching a long conversation would make
 * Sonnet read it all uncached and cost more than staying.
 */
export const ROUTE_MAX_TOKENS = 10_000
const ROUTE_MODEL = 'claude-sonnet-5-5'
let cheapNext: string | null = null
const cheapTurns = new Set<string>()

/** Marks the prompt about to be sent for Sonnet when it's clear and the context is small. */
async function markCheap($: EngineInterface, text: string, tokens?: number) {
  cheapNext = null
  if (!isClearEnough(text) || (await $.store.get('route')) === false) return
  if ((tokens ?? (await conversationTokens($))) > ROUTE_MAX_TOKENS) return
  cheapNext = text
}

/** Whether the prompt starts an unrelated task. Any failure answers no: never clear by mistake. */
async function isNewTopic($: EngineInterface, text: string) {
  const convo = await conversation($)
  if (!convo) return false
  const r = await $.model.complete({
    model: 'haiku',
    system: TOPIC,
    prompt: `<recent_conversation>\n${convo}\n</recent_conversation>\n\n<prompt>\n${text}\n</prompt>`,
    maxTokens: 5,
    timeoutMs: 8_000,
  })
  return r.isAnswered && /^\s*NEW\b/i.test(r.text)
}

/** /clear, then send the held prompt into the fresh conversation. */
async function startFresh($: EngineInterface, text: string) {
  await update($, freshA, () => null)
  try {
    await $.command.run({ command: 'clear' })
    await markCheap($, text, 0)
    await $.prompt.submit({ text, asUser: true })
  } catch (err) {
    $.ui.toast(`✨ Prompt Forge couldn't start fresh (${String(err)}); your prompt: ${clip(text, 200)}`)
  }
}

/** Sends a held prompt where the user is, on the model routing would pick. */
async function sendHere($: EngineInterface, text: string) {
  await update($, freshA, () => null)
  await markCheap($, text)
  await $.prompt.submit({ text, asUser: true })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'forge',
      description: 'Prompt Forge: /forge on|off, /forge fresh on|off, /forge model on|off, or /forge to see its state',
      argumentHint: '[on|off|fresh on|off|model on|off]',
    })
    return next(e)
  })

  on('command.run', { command: 'forge' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'on' || arg === 'off') await $.store.set('enabled', arg === 'on')
    if (arg === 'off') await update($, freshA, () => null)
    if (arg === 'fresh on' || arg === 'fresh off') await $.store.set('fresh', arg === 'fresh on')
    if (arg === 'model on' || arg === 'model off') await $.store.set('route', arg === 'model on')
    const flag = async (key: string) => ((await $.store.get(key)) !== false ? 'ON' : 'OFF')
    return {
      text: (await isOn($))
        ? `✨ Prompt Forge is ON. Fresh start for new tasks in long sessions: ${await flag('fresh')} (/forge fresh on|off). ` +
          `Sonnet for small, clear tasks on a fresh context: ${await flag('route')} (/forge model on|off). ` +
          'Start a prompt with "raw:" to skip both.'
        : '✨ Prompt Forge is OFF. Prompts go out exactly as typed, on your model (/forge on).',
    }
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind !== 'composer') return next(e)
    const typed = e.text.trim()
    if (typed.startsWith('/')) return next(e)
    if (RAW.test(typed)) {
      await update($, freshA, () => null)
      return next({ ...e, text: typed.replace(RAW, '') })
    }
    // A prompt held as a new task: "f" starts fresh, "h" sends it here, anything else replaces it.
    const held = await read($, freshA)
    if (held) {
      await update($, freshA, () => null)
      if (FRESH.test(typed)) {
        void startFresh($, held.text)
        return { drop: '✨ Prompt Forge: starting fresh, your prompt follows the /clear.' }
      }
      if (HERE.test(typed)) {
        await markCheap($, held.text)
        return next({ ...e, text: held.text })
      }
    }
    if (!(await isOn($))) return next(e)

    // A new, unrelated task in a long session: offer a fresh start, which skips re-reading the
    // old conversation on every step. Short sessions are never asked; it's not worth a question.
    // An image or file would be lost by holding the prompt, so those always go out as typed.
    if (!e.attachments?.length && typed.split(/\s+/).length >= MIN_WORDS && (await $.store.get('fresh')) !== false) {
      const tokens = await conversationTokens($)
      if (tokens >= FRESH_MIN_TOKENS && (await isNewTopic($, typed))) {
        await update($, freshA, () => ({ text: e.text, tokens }))
        return { drop: freshNote(tokens) }
      }
    }
    await markCheap($, e.text)
    return next(e)
  })

  // Model routing: the marked prompt's turn runs on Sonnet, every request of it but subagents'.
  on('turn.start', async ($, e, next) => {
    if (cheapNext !== null && norm(e.text) === norm(cheapNext)) {
      cheapTurns.add(e.turnId)
      $.ui.toast('⚡ Prompt Forge: small, clear task on a fresh context, so this turn runs on Sonnet (/forge model off)')
    }
    cheapNext = null
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId || !cheapTurns.has(e.turnId) || /sonnet|haiku/i.test(e.model)) return yield* next(e)
    return yield* next({ ...e, model: ROUTE_MODEL })
  })

  on('turn.complete', async ($, e, next) => {
    cheapTurns.delete(e.turnId)
    return next(e)
  })

  // A prompt held as a new task: the fresh-start offer, above the prompt.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const fresh = await read($, freshA)
    if (!fresh || e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" gap={1} borderStyle="round" borderColor="magenta" paddingX={1}>
        <Text bold color="magenta">✨ New task? {kTokens(fresh.tokens)} tokens of old conversation ride along</Text>
        <Button key="fresh" label="Start fresh & send" variant="primary" onPress={() => startFresh($, fresh.text)} />
        <Button key="here" label="Send here" onPress={() => sendHere($, fresh.text)} />
      </Box>
    )
  })
}
