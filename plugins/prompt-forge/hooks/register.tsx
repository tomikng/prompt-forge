import { atom, read, update } from 'claude-code'
import type { EngineInterface, PromptSubmitInput, PromptSubmitResult, Register } from 'claude-code'

import type { Forged, Fresh, Pending } from '../types'
import { isClearEnough } from './classify'

export { isClearEnough }

const forgedA = atom({ plugin: 'prompt-forge', key: 'forged' } as const, [])
const pendingA = atom({ plugin: 'prompt-forge', key: 'pending' } as const, null)
const freshA = atom({ plugin: 'prompt-forge', key: 'fresh' } as const, null)

/**
 * Below this much conversation a fresh start saves too little to be worth a question. Counted
 * above the session's floor: the system prompt, tools and MCP servers every request carries
 * (27k on a bare install, far more with plugins), which /clear can't remove.
 */
export const FRESH_MIN_TOKENS = 30_000
const FRESH = /^(?:f|fresh|y|yes|clear)$/i
const HERE = /^(?:h|here|n|no)$/i

const TOPIC = `You decide whether a developer's new prompt to an AI coding agent continues the work in the
recent conversation or starts an unrelated task.

CONTINUES: the prompt refers to anything in the conversation ("it", "that", "the same", "the
bug", "again", a file, function or result mentioned there), follows up on the last change, or
could go wrong without the conversation's context.
NEW: a self-contained task that names its own target and needs nothing said in the conversation.

When unsure, answer CONTINUES: starting fresh by mistake loses context the user needs.
Reply with exactly one word: CONTINUES or NEW.`

const RAW = /^raw:\s*/i
const MIN_WORDS = 5

const SYSTEM = `You sharpen prompts that a developer is about to send to an AI coding agent (Claude Code).

Rewrite a prompt only when the rewrite gives the agent information it would not otherwise
act on:
- name what a reference points at ("it", "that file", "the bug") when <recent_conversation>
  says so, copying names from it word for word
- spell out a limit or a check the user stated but buried or garbled ("dont touch the api")
- untangle a long, rambling prompt so its goal comes first

Never add work: no new requirements, approaches, error messages, tests, edge cases or "done
when" checks the user did not state. Never invent file names, APIs or facts. Keep every
concrete detail the user gave word for word, and keep their voice and language. Fixing typos
or polishing wording alone is not a reason to rewrite: the agent reads rough prompts fine.

You may also get the last few messages of the conversation, in <recent_conversation>. Use
them only to resolve references. Never take new requirements from it. When it does not say
what a reference means, keep the reference as the user wrote it: the agent sees more of the
conversation than you do.

Never answer the user or explain anything. Reply in exactly one of these three forms:

1. A rewrite would add no information, or the prompt is not a task at all: a question to the
agent about the work so far ("so this MR does nothing?", "why did you do that?"), a reaction
or a short reply. Leave it alone:
UNCHANGED

2. The work depends on a specific fact that exists only in the user's head or outside the
code (a value they agreed with someone, a name they already have in mind, a number from a
document), and the agent cannot pick a sensible default for it. Ask 1 to 3 questions, each
under 12 words.
Everything else is the agent's job: what "it", "that" or "the bug" refers to, design choices
with a sensible default, how far to go, where code lives, the stack, logs or metrics.
ASK:
- <question>

3. Otherwise:
PROMPT:
<the rewritten prompt, at most about 2x the original>
ADDED:
- <3 to 6 word note on the information you added>
- <...up to 3 notes>`

const NO_ASK = `\n\nThe user has already answered your questions (see <answers>). Do not ASK again: rewrite the
prompt with the answers folded in, or answer UNCHANGED.`

export type Reply =
  | { kind: 'rewrite'; enhanced: string; added: string[] }
  | { kind: 'ask'; questions: string[] }
  | { kind: 'unchanged' | 'malformed' }

const bullets = (block: string) =>
  block.split('\n').map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean)

/**
 * Reads the model's reply. Only a reply in the PROMPT:/ADDED: form is a rewrite: anything
 * else (a question back in prose, an explanation) is malformed and must never be sent as the prompt.
 */
export function parseReply(reply: string): Reply {
  const text = reply.trim()
  if (/^UNCHANGED\b/.test(text)) return { kind: 'unchanged' }
  const ask = text.match(/^ASK:[ \t]*\n([\s\S]+)$/)
  if (ask) {
    const questions = bullets(ask[1] ?? '').slice(0, 3)
    return questions.length ? { kind: 'ask', questions } : { kind: 'malformed' }
  }
  const m = text.match(/^PROMPT:[ \t]*\n([\s\S]*?)\n\s*ADDED:[ \t]*\n?([\s\S]*)$/)
  const enhanced = (m?.[1] ?? '').trim()
  if (!m || !enhanced) return { kind: 'malformed' }
  return { kind: 'rewrite', enhanced, added: bullets(m[2] ?? '').slice(0, 4) }
}

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

const SKIP_NOTE: Record<'unchanged' | 'malformed', string> = {
  unchanged: 'nothing to add, sent as typed.',
  malformed: 'no usable rewrite, sent as typed.',
}

/** Whether a prompt is worth forging: typed by the person, not a command, not a short reply. */
export function wantsForge(text: string): boolean {
  const t = text.trim()
  if (t.startsWith('/') || RAW.test(t)) return false
  return t.split(/\s+/).length >= MIN_WORDS && !isClearEnough(t)
}

/**
 * The drop notice of a held prompt. It carries the questions itself: the band above the
 * prompt may never show (a survey holds it, or another plugin's band answers first).
 */
export function holdNote(questions: readonly string[]): string {
  // One line: the engine draws a drop's text as a single paragraph, newlines included.
  const qs = questions.length === 1 ? questions[0] : questions.map((q, i) => `${i + 1}. ${q}`).join('  ')
  return `✨ Prompt Forge asks: ${qs}  ↳ reply below, or send "raw:" to send your prompt as typed`
}

/** A toast that outlasts the card scrolling away on a short terminal. */
const enhancedNote = (added: readonly string[]) =>
  `✨ Prompt enhanced${added.length ? `: ${added.slice(0, 2).join(', ')}` : ''} (ctrl+o on it shows the full text)`

const kTokens = (n: number) => `${Math.round(n / 1000)}k`

/** The drop notice of a prompt held as a new task. One line, like holdNote. */
export function freshNote(tokens: number): string {
  return `✨ Prompt Forge: this looks like a new task, and every step here re-reads ${kTokens(tokens)} tokens of old conversation.  ↳ reply "f" to /clear and send it fresh, or "h" to send it here`
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const norm = (s: string) => s.trim().replace(/\s+/g, ' ')

async function isOn($: EngineInterface) {
  return (await $.store.get('enabled')) !== false
}

/** The conversation so far, for resolving "it" and "that"; empty when it can't be read. */
async function conversation($: EngineInterface) {
  try {
    return recentContext(await $.session.messages())
  } catch {
    return ''
  }
}

let floor = Infinity

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

type Forging = Reply | { kind: 'failed'; reason: string }

async function forge($: EngineInterface, text: string, answers?: string): Promise<Forging> {
  const convo = await conversation($)
  const r = await $.model.complete({
    model: 'haiku',
    system: answers === undefined ? SYSTEM : SYSTEM + NO_ASK,
    prompt: [
      convo && `<recent_conversation>\n${convo}\n</recent_conversation>`,
      `<prompt>\n${text}\n</prompt>`,
      answers !== undefined && `<answers>\n${answers}\n</answers>`,
    ].filter(Boolean).join('\n\n'),
    maxTokens: 1200,
    timeoutMs: 15_000,
  })
  if (!r.isAnswered) return { kind: 'failed', reason: r.reason }
  const out = parseReply(r.text)
  return out.kind === 'ask' && answers !== undefined ? { kind: 'malformed' } : out
}

/** Forges a composer prompt (or skips it) and sends the result on. */
async function forgeAndSend($: EngineInterface, e: PromptSubmitInput, next: (e: PromptSubmitInput) => Promise<PromptSubmitResult>): Promise<PromptSubmitResult> {
  await markCheap($, e.text)
  // Rewriting is opt-in: it measured break-even on spend and costs a second or two per prompt.
  if (!(await $.store.get('rewrite')) || !wantsForge(e.text)) return next(e)
  // Haiku can't see an image or file, and holding the prompt would lose it: the answer is a
  // new submission without it. The agent sees it, so send the prompt as typed.
  if (e.attachments?.length) {
    $.ui.toast(`✨ Prompt Forge: your prompt has an ${e.attachments[0]?.type ?? 'attachment'}, sent as typed.`)
    return next(e)
  }
  $.ui.status('✨ Forging your prompt…')
  try {
    const out = await forge($, e.text)
    if (out.kind === 'failed') {
      $.ui.toast(`✨ Prompt Forge skipped (${out.reason}); sent as typed.`)
      return next(e)
    }
    if (out.kind === 'ask') {
      const pending: Pending = { original: e.text, questions: out.questions }
      await update($, pendingA, () => pending)
      return { drop: holdNote(out.questions) }
    }
    if (out.kind !== 'rewrite' || norm(out.enhanced) === norm(e.text)) {
      $.ui.toast(`✨ Prompt Forge: ${SKIP_NOTE[out.kind === 'rewrite' ? 'unchanged' : out.kind]}`)
      return next(e)
    }
    const item: Forged = { original: e.text, enhanced: out.enhanced, added: out.added }
    await update($, forgedA, list => [...list, item].slice(-50))
    $.ui.toast(enhancedNote(out.added))
    return next({ ...e, text: out.enhanced })
  } finally {
    $.ui.status(undefined)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'forge',
      description: 'Prompt Forge: /forge on|off, /forge fresh|model|rewrite on|off, or /forge to see its state',
      argumentHint: '[on|off|fresh on|off|model on|off|rewrite on|off]',
    })
    return next(e)
  })

  on('command.run', { command: 'forge' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'on' || arg === 'off') await $.store.set('enabled', arg === 'on')
    if (arg === 'off') {
      await update($, pendingA, () => null)
      await update($, freshA, () => null)
    }
    if (arg === 'fresh on' || arg === 'fresh off') await $.store.set('fresh', arg === 'fresh on')
    const onNow = await isOn($)
    if (arg === 'model on' || arg === 'model off') await $.store.set('route', arg === 'model on')
    if (arg === 'rewrite on' || arg === 'rewrite off') await $.store.set('rewrite', arg === 'rewrite on')
    if (arg === 'rewrite off') await update($, pendingA, () => null)
    const freshNow = (await $.store.get('fresh')) !== false
    const routeNow = (await $.store.get('route')) !== false
    const rewriteNow = (await $.store.get('rewrite')) === true
    const flag = (b: boolean) => (b ? 'ON' : 'OFF')
    return {
      text: onNow
        ? `✨ Prompt Forge is ON. Fresh start for new tasks in long sessions: ${flag(freshNow)} (/forge fresh on|off). ` +
          `Sonnet for small, clear tasks on a fresh context: ${flag(routeNow)} (/forge model on|off). ` +
          `Prompt rewriting: ${flag(rewriteNow)} (/forge rewrite on|off). Start a prompt with "raw:" to skip all of it.`
        : '✨ Prompt Forge is OFF. Prompts go out exactly as typed (/forge on).',
    }
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind !== 'composer') return next(e)
    const typed = e.text.trim()
    if (typed.startsWith('/')) return next(e)
    // A prompt held as a new task: "f" starts fresh, "h" sends it here, anything else replaces it.
    const freshHeld = await read($, freshA)
    if (freshHeld) {
      await update($, freshA, () => null)
      if (FRESH.test(typed)) {
        void startFresh($, freshHeld.text)
        return { drop: '✨ Prompt Forge: starting fresh, your prompt follows the /clear.' }
      }
      if (HERE.test(typed)) return forgeAndSend($, { ...e, text: freshHeld.text }, next)
    }

    const held = await read($, pendingA)
    if (RAW.test(typed)) {
      const rest = typed.replace(RAW, '')
      if (held) await update($, pendingA, () => null)
      // A bare "raw:" while a prompt is held sends that prompt as typed.
      return next({ ...e, text: held && !rest ? held.original : rest })
    }

    // A held prompt: this message answers its questions, at any length.
    if (held) {
      await update($, pendingA, () => null)
      const answers = held.questions.map(q => `Q: ${q}`).join('\n') + `\nA: ${typed}`
      const plain = `${held.original}\n\n${typed}`
      $.ui.status('✨ Forging your prompt with your answer…')
      try {
        const out = await forge($, held.original, answers)
        if (out.kind !== 'rewrite') return next({ ...e, text: plain })
        await update($, forgedA, list => [...list, { original: `${held.original}\n↳ ${typed}`, enhanced: out.enhanced, added: out.added }].slice(-50))
        $.ui.toast(enhancedNote(out.added))
        return next({ ...e, text: out.enhanced })
      } finally {
        $.ui.status(undefined)
      }
    }

    if (!(await isOn($)) || typed.split(/\s+/).length < MIN_WORDS) return next(e)
    // A new, unrelated task in a long session: offer a fresh start, which skips re-reading the
    // old context on every step. Short sessions are never asked; it's not worth a question.
    if (!e.attachments?.length && (await $.store.get('fresh')) !== false) {
      const tokens = await conversationTokens($)
      if (tokens >= FRESH_MIN_TOKENS && (await isNewTopic($, typed))) {
        await update($, freshA, () => ({ text: e.text, tokens }))
        return { drop: freshNote(tokens) }
      }
    }
    return forgeAndSend($, e, next)
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
        <Button
          key="here"
          label="Send here"
          onPress={async () => {
            await update($, freshA, () => null)
            await $.prompt.submit({ text: fresh.text, asUser: true })
          }}
        />
      </Box>
    )
  })

  // A held prompt's questions, above the prompt where the answer gets typed.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const held = await read($, pendingA)
    if (!held || e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    // On a short terminal the band is one row: the transcript line above carries the questions.
    const roomy = e.props.maxRows >= 14
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1}>
        <Box flexDirection="row" gap={1}>
          <Text bold color="magenta">✨ Prompt Forge is waiting for your answer</Text>
          <Button
            key="send-as-typed"
            label="Send as typed"
            onPress={async () => {
              await update($, pendingA, () => null)
              await $.prompt.submit({ text: held.original, asUser: true })
            }}
          />
          <Button key="cancel" label="Cancel" onPress={() => update($, pendingA, () => null)} />
        </Box>
        {roomy && <Text dimColor wrap="truncate-end">you typed: {clip(held.original, 200)}</Text>}
        {roomy && held.questions.map((q, i) => <Text>{`${i + 1}. ${q}`}</Text>)}
      </Box>
    )
  })

  // The transcript row of a forged prompt: what you typed, and what was sent.
  on('ui.render', { component: 'UserMessage', props: { origin: { kind: 'composer' } } }, async ($, e, next) => {
    if (e.props.isExpanded) return next(e)
    const list = await read($, forgedA)
    const hit = list.find(f => norm(f.enhanced) === norm(e.props.text))
    if (!hit) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1}>
        <Text wrap="truncate-end">
          <Text bold color="magenta">✨ Prompt enhanced</Text>
          {hit.added.length > 0 && <Text color="green">{`  ${hit.added.map(a => `+ ${a}`).join('  ')}`}</Text>}
        </Text>
        <Text dimColor wrap="truncate-end">you typed: {hit.original.replace(/\s+/g, ' ')}</Text>
        <Text>sent: {clip(hit.enhanced.replace(/\s+/g, ' '), 150)} <Text dimColor>(ctrl+o)</Text></Text>
      </Box>
    )
  })
}
