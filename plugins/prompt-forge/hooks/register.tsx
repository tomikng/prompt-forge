import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Fresh, Workspace } from '../types'

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

/** The plugin's settings (`userConfig` in plugin.json, rows in /config), set by register. */
type Launcher = 'auto' | 'superset' | 'tmux' | 'window' | 'clear'
let settings = { newSession: 'auto' as Launcher, terminalCommand: '', freshMinTokens: FRESH_MIN_TOKENS }
const FRESH = /^(?:f|fresh|y|yes|clear)$/i
const HERE = /^(?:h|here|n|no)$/i
const WORKSPACE = /^(?:w|workspace)$/i
const RAW = /^raw:\s*/i
const MIN_WORDS = 5

const TOPIC = `You decide where a developer's new prompt to an AI coding agent should run, given the recent
conversation and the git branch the session works on.

CONTINUES: the prompt refers to anything in the conversation ("it", "that", "the same", "the
bug", "again", a file, function or result mentioned there), follows up on the last change, or
could go wrong without the conversation's context.
RELATED: a self-contained new task that names its own target and needs nothing said in the
conversation, but belongs to the same piece of work: the same feature, ticket or branch.
UNRELATED: a self-contained new task for a different piece of work, one that would belong on
its own branch.

When unsure between CONTINUES and anything else, answer CONTINUES: moving the prompt by
mistake loses context the user needs. When unsure between RELATED and UNRELATED, answer RELATED.
Reply with exactly one word: CONTINUES, RELATED or UNRELATED.`

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

const kTokens = (n: number) => (n < 1000 ? `${n}` : `${Math.round(n / 1000)}k`)

/** Where unrelated work can get its own branch: a Superset workspace, a git worktree, or nowhere. */
export type Branchable = 'superset' | 'git' | null

/** The drop notice of a prompt held as a new task: one line, since the engine draws it as one. */
export function freshNote(tokens: number, topic: 'related' | 'unrelated' = 'related', branchable: Branchable = null): string {
  const head = `✨ Prompt Forge: this looks like a${topic === 'unrelated' ? 'n unrelated' : ' new'} task, and every step here re-reads ${kTokens(tokens)} tokens of old conversation.  ↳ reply`
  const w = topic === 'unrelated' && branchable ? `"w" for ${branchable === 'superset' ? 'a new Superset workspace' : 'a new worktree on its own branch'}, ` : ''
  return `${head} ${w}"f" for a new terminal, or "h" to send it here`
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

type Topic = 'continues' | 'related' | 'unrelated'

/** Where the prompt belongs. Any failure answers "continues": never move a prompt by mistake. */
async function topicOf($: EngineInterface, text: string): Promise<Topic> {
  const convo = await conversation($)
  if (!convo) return 'continues'
  const branch = await currentBranch($)
  const r = await $.model.complete({
    model: 'haiku',
    system: TOPIC,
    prompt: `${branch ? `<branch>${branch}</branch>\n\n` : ''}<recent_conversation>\n${convo}\n</recent_conversation>\n\n<prompt>\n${text}\n</prompt>`,
    maxTokens: 6,
    timeoutMs: 8_000,
  })
  if (!r.isAnswered) return 'continues'
  const w = r.text.trim().toUpperCase()
  return w.startsWith('UNRELATED') ? 'unrelated' : w.startsWith('RELATED') ? 'related' : 'continues'
}

async function currentBranch($: EngineInterface) {
  try {
    const r = await $.process.run(['git', 'branch', '--show-current'], { timeoutMs: 5_000 })
    return r.exitCode === 0 ? r.stdout.trim() : ''
  } catch {
    return ''
  }
}

/** The Superset workspace this session runs in, matched by its worktree; null outside Superset. */
async function supersetWorkspace($: EngineInterface): Promise<Workspace | null> {
  try {
    const cwd = await $.session.cwd()
    if (!cwd) return null
    const r = await $.process.run(['superset', 'ws', 'list', '--local', '--json'], { timeoutMs: 15_000 })
    if (r.exitCode !== 0) return null
    const list = JSON.parse(r.stdout) as { id: string; name: string; projectId: string; worktreePath?: string | null }[]
    const ws = list.find(w => w.worktreePath && (cwd === w.worktreePath || cwd.startsWith(`${w.worktreePath}/`)))
    return ws ? { id: ws.id, name: ws.name, projectId: ws.projectId } : null
  } catch {
    return null
  }
}

/** A short branch and workspace name from the prompt's first words. */
export function slugOf(text: string): string {
  const words = text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w && !STOP.has(w))
  return (words.slice(0, 5).join('-') || 'new-task').slice(0, 48).replace(/-+$/, '')
}
const STOP = new Set(['a', 'an', 'the', 'in', 'on', 'to', 'of', 'and', 'for', 'please', 'can', 'you', 'u', 'pls', 'it', 'run'])

/** Leaves a note for the new session: run this prompt's turn on Sonnet if it's small and clear. */
async function handOff($: EngineInterface, text: string) {
  if (isClearEnough(text) && (await $.store.get('route')) !== false) await $.store.set('handoff', text)
}

async function ran($: EngineInterface, argv: string[]) {
  try {
    return (await $.process.run(argv, { timeoutMs: 30_000 })).exitCode === 0
  } catch {
    return false
  }
}

async function out($: EngineInterface, argv: string[]) {
  try {
    const r = await $.process.run(argv, { timeoutMs: 15_000 })
    return r.exitCode === 0 ? r.stdout.trim() : ''
  } catch {
    return ''
  }
}

/** Quotes for a POSIX shell, and for an AppleScript string. */
const sh = (s: string) => `'${s.replaceAll("'", "'\\''")}'`
const applescript = (s: string) => s.replaceAll('\\', '\\\\').replaceAll('"', '\\"')

/**
 * Opens Claude with the prompt in a new terminal at `dir`, wherever this session runs: a tmux
 * window, or a new terminal window on Linux (xdg-terminal-exec), macOS (Terminal) or Windows
 * (Windows Terminal). Says where, or null when none could be opened.
 */
async function openTerminal($: EngineInterface, dir: string, text: string): Promise<string | null> {
  const mode = settings.newSession
  if (mode !== 'window' && (await ran($, ['sh', '-c', 'test -n "$TMUX"'])) && (await ran($, ['tmux', 'new-window', ...(dir ? ['-c', dir] : []), '--', 'claude', text]))) return 'a new tmux window'
  if (mode === 'tmux') return null
  const custom = settings.terminalCommand.trim()
  if (custom) {
    // the user's own terminal command, started in the background so this call returns at once
    const argv = custom.split(/\s+/).map(w => w.replaceAll('{dir}', dir || '.'))
    return (await ran($, ['sh', '-c', 'nohup "$@" >/dev/null 2>&1 &', 'sh', ...argv, 'claude', text])) ? 'a new terminal window' : null
  }
  if ((await ran($, ['sh', '-c', 'command -v xdg-terminal-exec'])) && (await ran($, ['setsid', '-f', 'xdg-terminal-exec', ...(dir ? [`--dir=${dir}`] : []), 'claude', text]))) return 'a new terminal window'
  if (await ran($, ['sh', '-c', 'test "$(uname)" = Darwin'])) {
    const script = applescript(`cd ${sh(dir || '.')} && claude ${sh(text)}`)
    if (await ran($, ['osascript', '-e', `tell application "Terminal" to do script "${script}"`, '-e', 'tell application "Terminal" to activate'])) return 'a new Terminal window'
  }
  if ((await ran($, ['where', 'wt.exe'])) && (await ran($, ['wt.exe', '-d', dir || '.', 'claude', text]))) return 'a new Windows Terminal tab'
  return null
}

/** A new git worktree next to the repository, on a new branch from the default one; its folder, or null. */
async function newWorktree($: EngineInterface, repo: string, slug: string): Promise<string | null> {
  const dir = `${repo}-${slug}`
  const base = (await out($, ['git', '-C', repo, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])) || 'HEAD'
  return (await ran($, ['git', '-C', repo, 'worktree', 'add', '-b', slug, dir, base])) ? dir : null
}

/**
 * Opens a new session for the held prompt and says where, or null when none could be opened.
 * "workspace" gives unrelated work its own branch: a new Superset workspace inside Superset, a
 * new git worktree elsewhere. Otherwise a new terminal: in the Superset workspace, a tmux
 * window, or a terminal window.
 */
async function openSession($: EngineInterface, held: Fresh, where: 'terminal' | 'workspace'): Promise<string | null> {
  const { text, ws, repo } = held
  await handOff($, text)
  const slug = slugOf(text)
  if (where === 'workspace' && ws) {
    if (await ran($, ['superset', 'ws', 'create', '--local', '--project', ws.projectId, '--name', slug, '--branch', slug, '--agent', 'claude', '--prompt', text])) return `a new Superset workspace (${slug})`
  } else if (where === 'workspace' && repo) {
    const dir = await newWorktree($, repo, slug)
    if (dir) {
      const opened = await openTerminal($, dir, text)
      if (opened) return `${opened}, on a new worktree (branch ${slug})`
      await ran($, ['git', '-C', repo, 'worktree', 'remove', dir])
      await ran($, ['git', '-C', repo, 'branch', '-D', slug])
    }
  }
  if (ws && (await ran($, ['superset', 'agents', 'create', '--local', '--workspace', ws.id, '--agent', 'claude', '--prompt', text]))) return `a new terminal in ${ws.name}`
  const opened = await openTerminal($, await $.session.cwd().catch(() => ''), text)
  if (opened) return opened
  await $.store.set('handoff', null)
  return null
}

/**
 * Starts the held prompt fresh: in a new session (keeping this one as it is), or, where none can be
 * opened or the user prefers it, with /clear here.
 */
async function startFresh($: EngineInterface, held: Fresh, where: 'terminal' | 'workspace' = 'terminal') {
  await update($, freshA, () => null)
  if (settings.newSession !== 'clear') {
    const opened = await openSession($, held, where).catch(() => null)
    if (opened) {
      $.ui.toast(`✨ Prompt Forge: your new task is running in ${opened}; this session stays as it was.`)
      return
    }
  }
  const { text } = held
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

export const register: Register = (on, options) => {
  const mode = String(options.newSession ?? 'auto')
  settings = {
    newSession: (['auto', 'superset', 'tmux', 'window', 'clear'].includes(mode) ? mode : 'auto') as Launcher,
    terminalCommand: String(options.terminalCommand ?? ''),
    freshMinTokens: Number(options.freshMinTokens) > 0 ? Number(options.freshMinTokens) : FRESH_MIN_TOKENS,
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'forge',
      description: 'Prompt Forge: /forge on|off, /forge fresh on|off, /forge model on|off, or /forge to see its state; more in /config',
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
        ? `✨ Prompt Forge is ON. Fresh start for new tasks in long sessions: ${await flag('fresh')} (/forge fresh on|off), ` +
          `opening ${({ auto: 'a tmux window or a new terminal window', superset: 'Superset terminals and workspaces', tmux: 'a tmux window', window: 'a new terminal window', clear: '/clear here' } as const)[settings.newSession]} (/config → prompt-forge). ` +
          `Sonnet for small, clear tasks on a fresh context: ${await flag('route')} (/forge model on|off). ` +
          'Start a prompt with "raw:" to skip both.'
        : '✨ Prompt Forge is OFF. Prompts go out exactly as typed, on your model (/forge on).',
    }
  })

  on('prompt.submit', async ($, e, next) => {
    // A session opened for a new task: run its first turn on Sonnet if the task is small and clear.
    const handoff = await $.store.get('handoff')
    if (typeof handoff === 'string' && norm(handoff) === norm(e.text)) {
      await $.store.set('handoff', null)
      await markCheap($, e.text, 0)
      return next(e)
    }
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
      if (WORKSPACE.test(typed) && (held.ws || held.repo)) {
        void startFresh($, held, 'workspace')
        return { drop: `✨ Prompt Forge: opening a new ${held.ws ? 'Superset workspace' : 'worktree'} for your task.` }
      }
      if (FRESH.test(typed)) {
        void startFresh($, held)
        return { drop: '✨ Prompt Forge: starting your task fresh.' }
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
      if (tokens >= settings.freshMinTokens) {
        const topic = await topicOf($, typed)
        if (topic !== 'continues') {
          const ws = settings.newSession === 'superset' ? await supersetWorkspace($) : null
          const repo = (await out($, ['git', 'rev-parse', '--show-toplevel'])) || null
          await update($, freshA, () => ({ text: e.text, tokens, topic, ws, repo }))
          return { drop: freshNote(tokens, topic, ws ? 'superset' : repo ? 'git' : null) }
        }
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
    const branch = fresh.topic === 'unrelated' ? (fresh.ws ? 'New workspace (w)' : fresh.repo ? 'New worktree (w)' : null) : null
    return (
      <Box flexDirection="row" gap={1} borderStyle="round" borderColor="magenta" paddingX={1}>
        <Text bold color="magenta">✨ {fresh.topic === 'unrelated' ? 'Unrelated task?' : 'New task?'} {kTokens(fresh.tokens)} tokens of old conversation ride along</Text>
        {branch && <Button key="workspace" label={branch} variant="primary" onPress={() => startFresh($, fresh, 'workspace')} />}
        <Button key="fresh" label="New terminal (f)" variant={branch ? 'secondary' : 'primary'} onPress={() => startFresh($, fresh)} />
        <Button key="here" label="Send here (h)" onPress={() => sendHere($, fresh.text)} />
      </Box>
    )
  })
}
