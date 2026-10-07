# 📖 Prompt Forge guide

Everything Prompt Forge does, in detail. For the quick tour, see the [README](README.md).

- [What a good prompt has](#what-a-good-prompt-has)
- [When a prompt is forged](#when-a-prompt-is-forged)
- [The rewrite rules](#the-rewrite-rules)
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

Haiku then does one of three things:

- **Returns a rewrite.** The rewrite is sent to Claude, and the transcript shows the before/after card.
- **Answers `UNCHANGED`.** Your prompt was already clear, so it goes out as typed with the notice *already sharp, sent as typed*.
- **Fails.** On an API error, an empty reply or no answer within **15 seconds**, your prompt goes out as typed with the notice *Prompt Forge skipped (reason); sent as typed*.

Your prompt is never lost or blocked. Something always gets sent.

## The rewrite rules

This is the complete instruction Haiku receives, word for word from `plugins/prompt-forge/hooks/register.tsx`. Your prompt follows it inside `<prompt>` tags. Nothing else is sent.

```text
You sharpen prompts that a developer is about to send to an AI coding agent (Claude Code).

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
- <...up to 4 notes>
```

The rules aim for a rewrite that makes your prompt more explicit without adding anything new. Haiku sees only your prompt, not your files or your conversation, so it can't add correct specifics. It's told not to try.

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

**Short steering passes through.**

| You typed | Sent |
| --- | --- |
| yes push them | yes push them *(under 5 words: no Haiku call)* |

These are illustrations. Haiku's exact wording varies from prompt to prompt.

## Cost, speed and privacy

- **Cost.** One Haiku completion per rewritten prompt, made through your own Claude Code session and billed with the rest of your usage. The rules are about 200 tokens, plus your prompt in and the rewrite out, capped at 1,200 output tokens. Prompts that are skipped cost nothing.
- **Speed.** Usually 1–2 seconds before Claude starts working, with a hard limit of 15 seconds.
- **What is sent.** Only the rules above and your prompt's text, to Anthropic's API through Claude Code's own client. Attachments, files, history and project context are never included.
- **What is stored.** The on/off switch is kept in the plugin's store (`~/.claude/plugins/store/`). Before/after pairs for the cards live only in session memory. Like every prompt, the sent text is part of Claude Code's normal session transcript.

## Using it with other plugins

Prompt Forge rewrites the prompt with Claude Code's `prompt.submit` hook. If another plugin you use also reads or changes prompts, what that plugin sees depends on the order the two run in: it may see your original or the forged version. If that matters for a plugin, use `raw:` for those prompts or `/forge off`.

## Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| Prompts never get a card | Check `/forge` (it may be off), and make sure the prompt has 5+ words and doesn't start with `/` or `raw:`. Run `claude plugin validate` on the plugin folder. |
| "Prompt Forge skipped (api-error)" | The Haiku call failed: a network problem, a rate limit, or Haiku not being available on your plan or provider. Your prompt was sent as typed. |
| "Prompt Forge skipped (empty-reply)" | Haiku returned nothing. Retry, or send with `raw:`. |
| `/forge` is not recognized | The plugin isn't loaded. Check `/plugin` → **Installed**, and that Claude Code is 2.1.289 or newer. |
| A rewrite changed your meaning | Resend with `raw:`, then [report it](https://github.com/tomikng/prompt-forge/issues/new?template=bad-rewrite.yml) with both versions. |

Run `claude --debug` to see a line for every hook that failed.
