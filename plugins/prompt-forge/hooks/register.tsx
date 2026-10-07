import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Forged } from '../types'

const forgedA = atom({ plugin: 'prompt-forge', key: 'forged' } as const, [])

const RAW = /^raw:\s*/i
const MIN_WORDS = 5

const SYSTEM = `You sharpen prompts that a developer is about to send to an AI coding agent (Claude Code).

Rewrite the prompt so the agent can act on it well:
- state the goal plainly first
- keep every concrete detail the user gave (files, names, errors, numbers) word for word
- add constraints, scope and a "done when" check only where they follow from the prompt itself
- never invent file names, APIs, facts or requirements the user did not imply
- keep the user's voice and language; fix typos; stay short (at most about 3x the original)

You only see this one prompt, never the conversation before it. Never answer the user, ask
them questions or explain anything: your output is either a rewrite or one of these two words.

If the prompt is already clear and specific, answer exactly: UNCHANGED
If it leans on earlier context you cannot see ("it", "that", "the same", "like before") or is
too vague to rewrite without guessing, answer exactly: UNCLEAR

Otherwise answer exactly in this form and nothing else:
PROMPT:
<the rewritten prompt>
ADDED:
- <3 to 6 word note on one thing you improved>
- <...up to 4 notes>`

export type Reply =
  | { kind: 'rewrite'; enhanced: string; added: string[] }
  | { kind: 'unchanged' | 'unclear' | 'malformed' }

/**
 * Reads the model's reply. Only a reply in the PROMPT:/ADDED: form is a rewrite: anything
 * else (a question back, an explanation) is malformed and must never be sent as the prompt.
 */
export function parseReply(reply: string): Reply {
  const text = reply.trim()
  if (/^UNCHANGED\b/.test(text)) return { kind: 'unchanged' }
  if (/^UNCLEAR\b/.test(text)) return { kind: 'unclear' }
  const m = text.match(/^PROMPT:[ \t]*\n([\s\S]*?)\n\s*ADDED:[ \t]*\n?([\s\S]*)$/)
  const enhanced = (m?.[1] ?? '').trim()
  if (!m || !enhanced) return { kind: 'malformed' }
  const added = (m[2] ?? '').split('\n').map(l => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean).slice(0, 4)
  return { kind: 'rewrite', enhanced, added }
}

const SKIP_NOTE: Record<Exclude<Reply['kind'], 'rewrite'>, string> = {
  unchanged: 'already sharp, sent as typed.',
  unclear: 'it builds on earlier context, so it was sent as typed.',
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
    const onNow = await isOn($)
    return {
      text: `✨ Prompt Forge is ${onNow ? 'ON' : 'OFF'}. ` +
        (onNow ? 'Prompts of 5+ words get sharpened before sending; start one with "raw:" to send it untouched.' : 'Prompts go out exactly as typed.'),
    }
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind !== 'composer') return next(e)
    if (RAW.test(e.text.trim())) return next({ ...e, text: e.text.trim().replace(RAW, '') })
    if (!wantsForge(e.text) || !(await isOn($))) return next(e)

    $.ui.status('✨ Forging your prompt…')
    try {
      const r = await $.model.complete({
        model: 'haiku',
        system: SYSTEM,
        prompt: `<prompt>\n${e.text}\n</prompt>`,
        maxTokens: 1200,
        timeoutMs: 15_000,
      })
      if (!r.isAnswered) {
        $.ui.toast(`✨ Prompt Forge skipped (${r.reason}); sent as typed.`)
        return next(e)
      }
      const out = parseReply(r.text)
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
