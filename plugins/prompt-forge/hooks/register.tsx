import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Forged, Pending } from '../types'

const forgedA = atom({ plugin: 'prompt-forge', key: 'forged' } as const, [])
const pendingA = atom({ plugin: 'prompt-forge', key: 'pending' } as const, null)

const RAW = /^raw:\s*/i
const MIN_WORDS = 5

const SYSTEM = `You sharpen prompts that a developer is about to send to an AI coding agent (Claude Code).

Rewrite the prompt so the agent can act on it well:
- state the goal plainly first
- keep every concrete detail the user gave (files, names, errors, numbers) word for word
- add constraints, scope and a "done when" check only where they follow from the prompt itself
- never invent file names, APIs, facts or requirements the user did not imply
- keep the user's voice and language; fix typos; stay short (at most about 3x the original)

You may also get the last few messages of the conversation, in <recent_conversation>. Use them
only to resolve what the prompt refers to ("it", "that file", "the bug"): name the thing
explicitly, copying names from the conversation word for word. Never take new requirements
from it.

Never answer the user or explain anything. Reply in exactly one of these three forms:

1. The prompt is already clear and specific:
UNCHANGED

2. You cannot tell what the user wants even with the conversation, and a wrong guess would
send the agent off track. Ask 1 to 3 short questions only the user can answer: what they
mean by an unclear reference, which of several options they want, a name or value only they
know. Never ask where code lives, what the stack is, or for logs or metrics: the agent reads
the code and finds those itself, so rewrite the prompt instead.
ASK:
- <question>

3. Otherwise:
PROMPT:
<the rewritten prompt>
ADDED:
- <3 to 6 word note on one thing you improved>
- <...up to 4 notes>`

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
  unchanged: 'already sharp, sent as typed.',
  malformed: 'no usable rewrite, sent as typed.',
}

/** Whether a prompt is worth forging: typed by the person, not a command, not a short reply. */
export function wantsForge(text: string): boolean {
  const t = text.trim()
  if (t.startsWith('/') || RAW.test(t)) return false
  return t.split(/\s+/).length >= MIN_WORDS
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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'forge',
      description: 'Prompt Forge: /forge on, /forge off, or /forge to see its state',
    })
    return next(e)
  })

  on('command.run', { command: 'forge' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'on' || arg === 'off') await $.store.set('enabled', arg === 'on')
    if (arg === 'off') await update($, pendingA, () => null)
    const onNow = await isOn($)
    return {
      text: `✨ Prompt Forge is ${onNow ? 'ON' : 'OFF'}. ` +
        (onNow ? 'Prompts of 5+ words get sharpened before sending; start one with "raw:" to send it untouched.' : 'Prompts go out exactly as typed.'),
    }
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind !== 'composer') return next(e)
    const typed = e.text.trim()
    if (typed.startsWith('/')) return next(e)
    const held = await read($, pendingA)
    if (RAW.test(typed)) {
      if (held) await update($, pendingA, () => null)
      return next({ ...e, text: typed.replace(RAW, '') })
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
        return next({ ...e, text: out.enhanced })
      } finally {
        $.ui.status(undefined)
      }
    }

    if (!wantsForge(e.text) || !(await isOn($))) return next(e)
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
        return { drop: '✨ Prompt Forge is holding your prompt: answer its question above the prompt, or press "Send as typed".' }
      }
      if (out.kind !== 'rewrite' || norm(out.enhanced) === norm(e.text)) {
        $.ui.toast(`✨ Prompt Forge: ${SKIP_NOTE[out.kind === 'rewrite' ? 'unchanged' : out.kind]}`)
        return next(e)
      }
      const item: Forged = { original: e.text, enhanced: out.enhanced, added: out.added }
      await update($, forgedA, list => [...list, item].slice(-50))
      return next({ ...e, text: out.enhanced })
    } finally {
      $.ui.status(undefined)
    }
  })

  // A held prompt's questions, above the prompt where the answer gets typed.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const held = await read($, pendingA)
    if (!held || e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1}>
        <Text bold color="magenta">✨ Before I send this, I need a bit more context</Text>
        <Text dimColor>you typed: {clip(held.original, 200)}</Text>
        {held.questions.map((q, i) => <Text>{`${i + 1}. ${q}`}</Text>)}
        <Text dimColor>Type your answer below and press Enter. The agent continues with both.</Text>
        <Box flexDirection="row">
          <Button
            key="send-as-typed"
            label="Send as typed"
            onPress={async () => {
              await update($, pendingA, () => null)
              await $.prompt.submit({ text: held.original, asUser: true })
            }}
          />
          <Text> </Text>
          <Button key="cancel" label="Cancel" onPress={() => update($, pendingA, () => null)} />
        </Box>
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
        <Text bold color="magenta">✨ I enhanced your prompt like this</Text>
        <Text dimColor>you typed: {clip(hit.original, 400)}</Text>
        <Text>sent: {hit.enhanced}</Text>
        {hit.added.length > 0 && <Text color="green">{hit.added.map(a => `+ ${a}`).join('   ')}</Text>}
      </Box>
    )
  })
}
