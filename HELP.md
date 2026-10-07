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
from it.

Never answer the user or explain anything. Reply in exactly one of these three forms:

1. The prompt is already clear and specific:
UNCHANGED

2. You cannot tell what the user wants even with the conversation, and a wrong guess would
send the agent off track. Ask 1 to 3 short questions only the user can answer:
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

Some prompts can't be sharpened without guessing, even with the conversation: *"rename it so it's independent from the other one"* right after a session start, for example. Instead of guessing, Prompt Forge holds the prompt and shows its questions above the prompt box:

```text
╭──────────────────────────────────────────────────────────────╮
│ ✨ Before I send this, I need a bit more context               │
│ you typed: rename it so it's independent from the other one   │
│ 1. Which plugin should be renamed?                             │
│ 2. What should the new name be?                                │
│ Type your answer below and press Enter. The agent continues…  │
│ [Send as typed]  [Cancel]                                      │
╰──────────────────────────────────────────────────────────────╯
```

- **Answer** by typing in the normal prompt box and pressing Enter. Any length counts, even two words. Your original prompt and your answer are forged together into one prompt and sent, and the agent gets to work.
- **Send as typed** sends your original prompt unchanged.
- **Cancel** drops the held prompt. Nothing is sent.
- Starting your next message with `raw:` also drops the held prompt and sends that message untouched. Slash commands don't affect it.
- If the second pass still can't produce a rewrite, your original prompt and your answer go out together, as typed.

You're asked at most once per prompt.

## Reading the card

```text
╭─────────────────────────────────────────────────────────────╮
│ ✨ I enhanced your prompt like this                           │   title
│ you typed: can u make the dashboard load faster its really …  │   dim: your original (first 400 chars)
│ sent: Make the dashboard's orders page load faster; …        │   what Claude actually received
│ + stated the goal first   + added a done check               │   green: what improved (up to 4 notes)
╰─────────────────────────────────────────────────────────────╯
```

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

**A clear prompt is left alone.**

| You typed | Sent |
| --- | --- |
| Fix the flaky retry test in tests/retry.test.ts by mocking the clock; npm test must pass 10 runs in a row. | *(unchanged: "already sharp")* |

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
| "Prompt Forge is holding your prompt" | It asked a question. Answer it in the prompt box, or use **Send as typed** / **Cancel** in the box above the prompt. |
| "no usable rewrite, sent as typed" | Haiku's reply wasn't a rewrite (for example it wrote prose back). The forge never sends such a reply; your prompt went out as typed. |
| `/forge` is not recognized | The plugin isn't loaded. Check `/plugin` → **Installed**, and that Claude Code is 2.1.289 or newer. |
| A rewrite changed your meaning | Resend with `raw:`, then [report it](https://github.com/tomikng/prompt-forge/issues/new?template=bad-rewrite.yml) with both versions. |

Run `claude --debug` to see a line for every hook that failed.
