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

If the prompt is already clear and specific, answer exactly: UNCHANGED

Otherwise answer exactly in this form and nothing else:
PROMPT:
<the rewritten prompt>
ADDED:
- <3 to 6 word note on one thing you improved>
- <...up to 4 notes>`

/** Reads the model's reply; null when it said UNCHANGED or the reply is malformed. */
export function parseReply(reply: string): { enhanced: string; added: string[] } | null {
  const text = reply.trim()
  if (/^UNCHANGED\b/.test(text)) return null
  const m = text.match(/PROMPT:\s*\n([\s\S]*?)\n\s*ADDED:\s*\n?([\s\S]*)$/)
  const enhanced = (m ? m[1] ?? '' : text.replace(/^PROMPT:\s*/, '')).trim()
  if (!enhanced) return null
  const added = m
    ? (m[2] ?? '').split('\n').map(l => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean).slice(0, 4)
    : []
  return { enhanced, added }
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
      if (!out || norm(out.enhanced) === norm(e.text)) {
        $.ui.toast('✨ Prompt Forge: already sharp, sent as typed.')
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
