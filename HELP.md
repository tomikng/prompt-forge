# 📖 Prompt Forge guide

Everything Prompt Forge does, in detail. For the quick tour, see the [README](README.md).

- [What a good prompt has](#what-a-good-prompt-has)
- [When a prompt is forged](#when-a-prompt-is-forged)
- [The rewrite rules](#the-rewrite-rules)
- [When it asks you first](#when-it-asks-you-first)
- [Reading the card](#reading-the-card)
- [Controls](#controls)
- [Worked examples](#worked-examples)
- [Cost, speed and privacy](#cost-speed-and-privacy)
- [Using it with other plugins](#using-it-with-other-plugins)
- [Troubleshooting](#troubleshooting)

## What a good prompt has

An AI coding agent works best when it knows four things up front:

1. **The goal.** What you want, in one plain sentence.
2. **The specifics.** The file, function, error message or number you're looking at.
3. **The limits.** What not to touch, what to keep.
4. **The finish line.** How both of you will know it's done: tests pass, a page renders, a number drops.

You usually know all four while typing, but only some of them make it into the prompt. Prompt Forge reorganizes what you wrote so the ones you did say are easy to see, and adds a finish line when your words imply one.

## When a prompt is forged

Every time you press Enter, Prompt Forge checks the prompt in this order:

| Check | Result |
| --- | --- |
| Not typed by you (another plugin, a background task, another agent) | Passed through untouched |
| Starts with `raw:` | Sent untouched, prefix removed |
| Starts with `/` (a slash command) | Passed through untouched |
| Fewer than 5 words ("yes", "go ahead", "try again") | Passed through untouched |
| `/forge off` is set | Passed through untouched |
| Already names a target (file, path, `code`, identifier) **and** a finish line (*run npm test*, *should*, *make sure*…), with no unresolved "it"/"that" | Passed through untouched, no model call |
| Otherwise | Sent to Haiku for a rewrite |

While the rewrite runs, the status line under the prompt shows **✨ Forging your prompt…**.

Haiku then does one of four things:

- **Asks you first.** Your prompt is held and its questions appear above the prompt box. See [When it asks you first](#when-it-asks-you-first).
- **Returns a rewrite.** The rewrite is sent to Claude, and the transcript shows the before/after card.
- **Answers `UNCHANGED`.** Your prompt was already clear, so it goes out as typed with the notice *already sharp, sent as typed*.
- **Fails.** On an API error, an empty reply or no answer within **15 seconds**, your prompt goes out as typed with the notice *Prompt Forge skipped (reason); sent as typed*.

Your prompt is never lost or blocked. Something always gets sent.

## The rewrite rules

This is the complete instruction Haiku receives, word for word from `plugins/prompt-forge/hooks/register.tsx`. After it come the last few messages of the conversation inside `<recent_conversation>` tags (when there are any) and your prompt inside `<prompt>` tags. Nothing else is sent.

```text
You sharpen prompts that a developer is about to send to an AI coding agent (Claude Code).

Rewrite the prompt so the agent can act on it well:
- state the goal plainly first
- keep every concrete detail the user gave (files, names, errors, numbers) word for word
- add constraints, scope and a "done when" check only where they follow from the prompt itself
- never invent file names, APIs, facts or requirements the user did not imply
- keep the user's voice and language; fix typos; stay short (at most about 3x the original)

You may also get the last few messages of the conversation, in <recent_conversation>. Use them
only to resolve what the prompt refers to ("it", "that file", "the bug"): name the thing
explicitly, copying names from the conversation word for word. Never take new requirements
from it. When it does not say what a reference means, keep the reference as the user wrote it:
the agent sees more of the conversation than you do.

Never answer the user or explain anything. Reply in exactly one of these three forms:

1. The prompt is already clear and specific, or it is not a task at all: a question to the
agent about the work so far ("so this MR does nothing?", "why did you do that?"), a reaction
or a short reply. The agent answers those from the conversation; leave them alone:
UNCHANGED

2. The work depends on a specific fact that exists only in the user's head or outside the
code (a value they agreed with someone, a name they already have in mind, a number from a
document), and the agent cannot pick a sensible default for it. Ask 1 to 3 questions, each
under 12 words.
Everything else is the agent's job, so rewrite instead of asking: what "it", "that" or "the
bug" refers to (the agent has the whole conversation, you see only a few messages), design
choices with a sensible default (it picks one and says so), how far to go, where code lives,
the stack, logs or metrics. Keep unresolved references in the user's own words.
ASK:
- <question>

3. Otherwise:
PROMPT:
<the rewritten prompt>
ADDED:
- <3 to 6 word note on one thing you improved>
- <...up to 4 notes>
```

When you've answered its questions, the same rules go out with this added, and your answers inside `<answers>` tags:

```text
The user has already answered your questions (see <answers>). Do not ASK again: rewrite the
prompt with the answers folded in, or answer UNCHANGED.
```

The rules aim for a rewrite that makes your prompt more explicit without adding anything new. The conversation is used only to name what your prompt points at. If that still isn't enough, Haiku asks you instead of guessing.

## When it asks you first

Most unclear prompts don't need you: when Haiku can't tell what "it" or "the bug" means, it leaves those words as you wrote them, because the agent has the whole conversation and the code. When you leave a choice open (*"rename it to something clearer"*), the agent makes it. Prompt Forge only stops to ask when the work depends on something nobody but you can know: *"set the rate limit to what we agreed with the client"*. Instead of guessing, Prompt Forge holds the prompt and lists its questions in the transcript, with a small box above the prompt:

```text
● Prompt dropped by a hook: ✨ Prompt Forge asks: 1. Which plugin should be
  renamed?  2. What should the new name be?  ↳ reply below, or send "raw:" to
  send your prompt as typed
╭───────────────────────────────────────────────────────────────────────╮
│ ✨ Prompt Forge is waiting for your answer [ Send as typed ] [ Cancel ] │
╰───────────────────────────────────────────────────────────────────────╯
```

"Prompt dropped by a hook" is Claude Code's own prefix: the prompt is held, not lost. On a tall terminal the box also repeats the questions and what you typed; on a short one it stays one row.

Questions to the agent (*"so this MR does nothing?"*, *"why did you do that?"*) and prompts with a pasted image or file are never held: they go out as typed.

- **Answer** by typing in the normal prompt box and pressing Enter. Any length counts, even two words. Your original prompt and your answer are forged together into one prompt and sent, and the agent gets to work.
- **Send as typed** sends your original prompt unchanged.
- **Cancel** drops the held prompt. Nothing is sent.
- Sending `raw:` alone sends the held prompt as typed (handy when the box above the prompt is hidden). Starting your next message with `raw:` and some text drops the held prompt and sends that text untouched. Slash commands don't affect it.
- If the second pass still can't produce a rewrite, your original prompt and your answer go out together, as typed.

You're asked at most once per prompt.

## Reading the card

```text
╭────────────────────────────────────────────────────────────────────────╮
│ ✨ Prompt enhanced  + stated the goal first  + kept your API constraint … │   title, green: what improved
│ you typed: can u make the dashboard load faster its really slow on the … │   dim: your original, one line
│ sent: Make the dashboard's orders page load faster; it is currently … (ctrl+o) │   what Claude received, clipped
╰────────────────────────────────────────────────────────────────────────╯
```

The card stays a few rows tall so it doesn't scroll away on a small terminal; a "✨ Prompt enhanced" toast also shows as the prompt goes out.

- **ctrl+o** expands the transcript and shows the plain sent text without the card. Press it again to return.
- The card is drawn from the session's memory of the last 50 rewrites. After a restart or `--resume`, older prompts show as plain sent text.

## Controls

| You want to… | Do this |
| --- | --- |
| Send one prompt exactly as typed | Start it with `raw:`, e.g. `raw: rename getUser to fetchUser` |
| Stop rewriting | `/forge off` (remembered across sessions) |
| Start again | `/forge on` |
| Check the state | `/forge` |
| See the plain sent text | ctrl+o |
| Skip a question | **Send as typed** (sends your prompt unchanged) or **Cancel** (sends nothing) |
| Fix a bad rewrite | Press Esc to interrupt, then resend with `raw:` |

> [!TIP]
> Don't start a prompt with `!` to skip the forge. In Claude Code, a leading `!` runs a shell command.

## Worked examples

**A rough request gets structure.**

| You typed | Sent |
| --- | --- |
| can u make the dashboard load faster its really slow on the orders page, dont touch the api | Make the dashboard's orders page load faster; it is currently slow.<br><br>Constraints: do not change the API.<br>Done when: the orders page renders noticeably faster than now, measured before and after. |

**A clear prompt skips the forge.**

| You typed | Sent |
| --- | --- |
| Fix the flaky retry test in tests/retry.test.ts by mocking the clock; npm test must pass 10 runs in a row. | *(unchanged: the local check sees a file and a finish line, so no Haiku call is made)* |

**An ambiguous prompt gets a question first.**

| You typed | Forge asks | You answer | Sent |
| --- | --- | --- | --- |
| rename it so it's independent from the other one | 1. Which plugin should be renamed? 2. What should the new name be? | prompt-forge, call it prompt-smith | Rename the prompt-forge plugin to prompt-smith everywhere. |

**Short steering passes through.**

| You typed | Sent |
| --- | --- |
| yes push them | yes push them *(under 5 words: no Haiku call)* |

These are illustrations. Haiku's exact wording varies from prompt to prompt.

## Cost, speed and privacy

- **Cost.** One Haiku completion per rewritten prompt, made through your own Claude Code session and billed with the rest of your usage. The rules are about 200 tokens, plus your prompt in and the rewrite out, capped at 1,200 output tokens. Prompts that are skipped cost nothing.
- **Speed.** Usually 1–2 seconds before Claude starts working, with a hard limit of 15 seconds.
- **What is sent.** The rules above, your prompt's text, and the text of the last few conversation messages (at most 6, about 3,000 characters), to Anthropic's API through Claude Code's own client. Files, tool output and attachments are never included.
- **What is stored.** The on/off switch is kept in the plugin's store (`~/.claude/plugins/store/`). Before/after pairs for the cards, and a held prompt waiting for your answer, live only in session memory. Like every prompt, the sent text is part of Claude Code's normal session transcript.

## Using it with other plugins

Prompt Forge rewrites the prompt with Claude Code's `prompt.submit` hook. If another plugin you use also reads or changes prompts, what that plugin sees depends on the order the two run in: it may see your original or the forged version. If that matters for a plugin, use `raw:` for those prompts or `/forge off`.

## Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| Prompts never get a card | Check `/forge` (it may be off), and make sure the prompt has 5+ words and doesn't start with `/` or `raw:`. Run `claude plugin validate` on the plugin folder. |
| "Prompt Forge skipped (api-error)" | The Haiku call failed: a network problem, a rate limit, or Haiku not being available on your plan or provider. Your prompt was sent as typed. |
| "Prompt Forge skipped (empty-reply)" | Haiku returned nothing. Retry, or send with `raw:`. |
| "Prompt Forge asks: …" | It asked the questions shown in that line. Answer them in the prompt box, send `raw:` alone to send your prompt as typed, or use **Send as typed** / **Cancel** in the box above the prompt. |
| "no usable rewrite, sent as typed" | Haiku's reply wasn't a rewrite (for example it wrote prose back). The forge never sends such a reply; your prompt went out as typed. |
| `/forge` is not recognized | The plugin isn't loaded. Check `/plugin` → **Installed**, and that Claude Code is 2.1.289 or newer. |
| A rewrite changed your meaning | Resend with `raw:`, then [report it](https://github.com/tomikng/prompt-forge/issues/new?template=bad-rewrite.yml) with both versions. |

Run `claude --debug` to see a line for every hook that failed.
