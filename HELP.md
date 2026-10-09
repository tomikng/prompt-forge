# 📖 Prompt Forge guide

Everything Prompt Forge does, in detail. For the quick tour, see the [README](README.md).

- [Where the tokens go](#where-the-tokens-go)
- [What happens when you press Enter](#what-happens-when-you-press-enter)
- [When it offers a fresh start](#when-it-offers-a-fresh-start)
- [When it uses a cheaper model](#when-it-uses-a-cheaper-model)
- [Prompt rewriting (opt-in)](#prompt-rewriting-opt-in)
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

## Where the tokens go

Every prompt you send makes Claude re-read the whole conversation so far: the system prompt, every message, every tool result. In the benchmark's six-prompt session, the cost per prompt climbed from $0.23 to $0.55 as the conversation grew, mostly from re-reading it. Prompt Forge cuts that in two ways:

1. **A fresh start** when a prompt begins an unrelated task: the old conversation stops riding along. See [When it offers a fresh start](#when-it-offers-a-fresh-start).
2. **A cheaper model** for small, clear tasks on a small context. See [When it uses a cheaper model](#when-it-uses-a-cheaper-model).

Together: −41% per session in the benchmark, every step still right. Everything else goes out exactly as you typed it, instantly.

## What happens when you press Enter

| Check | Result |
| --- | --- |
| Not typed by you (another plugin, a background task, another agent) | Passed through untouched |
| Starts with `raw:` or `/`, has fewer than 5 words, carries an image or file, or `/forge off` is set | Sent as typed |
| The session re-reads 30k+ tokens of conversation, and a Haiku check says the prompt starts a new task | Held with a fresh-start offer: `f` or `h` |
| Names a target and a finish line, on at most 10k tokens of conversation | This turn runs on Sonnet |
| `/forge rewrite on` is set | Forged first (see below) |
| Otherwise | Sent as typed, on your model, instantly |

## Prompt rewriting (opt-in)

`/forge rewrite on` adds a small Haiku call to every prompt of 5+ words that rewrites it when that adds information. It's **off by default**: on its own it measured break-even on spend (+3%, inside run-to-run noise) and adds a second or two before each prompt is sent. The rest of this guide, from here to [Reading the card](#reading-the-card), describes it.

## What a good prompt has

An AI coding agent works best when it knows four things up front:

1. **The goal.** What you want, in one plain sentence.
2. **The specifics.** The file, function, error message or number you're looking at.
3. **The limits.** What not to touch, what to keep.
4. **The finish line.** How both of you will know it's done: tests pass, a page renders, a number drops.

You usually know all four while typing, but only some of them make it into the prompt. Claude is good at filling in the rest from the code. Prompt Forge fills in only what it can know for sure: what "it" or "that file" refers to, taken from the conversation, and limits you buried in a rough sentence. It doesn't invent a goal or a finish line for you; a rough prompt Claude already understands goes out as typed.

## When a prompt is forged

With `/forge rewrite on`, every time you press Enter Prompt Forge checks the prompt in this order:

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

- **Asks you first** (rare). The work needs a fact only you know: your prompt is held and its questions appear in the transcript. See [When it asks you first](#when-it-asks-you-first).
- **Returns a rewrite.** The rewrite is sent to Claude, and the transcript shows the before/after card.
- **Answers `UNCHANGED`** (common). A rewrite would add nothing Claude needs, so your prompt goes out as typed with the notice *nothing to add, sent as typed*.
- **Fails.** On an API error, an empty reply or no answer within **15 seconds**, your prompt goes out as typed with the notice *Prompt Forge skipped (reason); sent as typed*.

Your prompt is never lost or blocked. Something always gets sent.

## The rewrite rules

This is the complete instruction Haiku receives, word for word from `plugins/prompt-forge/hooks/register.tsx`. After it come the last few messages of the conversation inside `<recent_conversation>` tags (when there are any) and your prompt inside `<prompt>` tags. Nothing else is sent.

```text
You sharpen prompts that a developer is about to send to an AI coding agent (Claude Code).

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
- <...up to 3 notes>
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

## When it offers a fresh start

In a long session, every prompt makes Claude re-read the whole conversation so far, and that re-reading is most of what a session costs. When your prompt starts something unrelated, carrying that history along buys nothing. So Prompt Forge holds the prompt and offers a fresh start:

```text
● Prompt dropped by a hook: ✨ Prompt Forge: this looks like a new task, and every step here
  re-reads 85k tokens of old conversation.  ↳ reply "f" to /clear and send it fresh, or "h" to send it here
```

- **`f`** (or **Start fresh & send**) runs `/clear` and sends your prompt into the new, empty conversation.
- **`h`** (or **Send here**) sends it in the current conversation, as if nothing happened.
- **Anything else** you type replaces the held prompt and is handled normally.

It only asks when both are true:

1. **The session re-reads 30k+ tokens of conversation.** This counts only the conversation, above the fixed part every request carries: the system prompt, tools and MCP servers (27k tokens on a bare install, often much more with plugins), which `/clear` can't remove.
2. **A Haiku check says the prompt starts a new task**: it names its own target and needs nothing from the conversation. Anything that says "it", "that", "again", or names a file or result from the conversation counts as a follow-up. When unsure, it answers follow-up.

Prompts with an image or file attached are never held. `/forge fresh off` turns the offer off for good (`/forge fresh on` turns it back on); `/forge off` turns all of Prompt Forge off.

## When it uses a cheaper model

A small, clear task doesn't need your session's biggest model. When the local check sees a prompt that names its target **and** a finish line (*"In src/users.js rename getUser to fetchUser…; run npm test"*), and the conversation is still small, that one turn runs on **Claude Sonnet**. A toast says so:

```text
⚡ Prompt Forge: small, clear task on a fresh context, so this turn runs on Sonnet (/forge model off)
```

- **Only on a small context:** at most 10k tokens of conversation, so at the start of a session or right after a fresh start. The prompt cache is per model: switching a long conversation would make Sonnet read all of it uncached, which costs more than staying.
- **Only that turn.** The next prompt goes back to your model. Subagents keep their own model, and a session already on Sonnet or Haiku is left alone.
- **`/forge model off`** turns it off (`/forge model on` turns it back on).

## Reading the card

```text
╭────────────────────────────────────────────────────────────────────────╮
│ ✨ Prompt enhanced  + named “it”: ordersPageRows  + kept your API limit    │   title, green: what improved
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
| Start a new task fresh | Reply `f` to the fresh-start offer, or `h` to stay |
| Never offer a fresh start | `/forge fresh off` |
| Never switch to a cheaper model | `/forge model off` |
| Rewrite prompts before sending | `/forge rewrite on` (off by default) |
| Skip a question | **Send as typed** (sends your prompt unchanged) or **Cancel** (sends nothing) |
| Fix a bad rewrite | Press Esc to interrupt, then resend with `raw:` |

> [!TIP]
> Don't start a prompt with `!` to skip the forge. In Claude Code, a leading `!` runs a shell command.

## Worked examples

**A rough but understandable request goes out as typed.** Claude finds the code itself; a polished rewrite would only add work.

| You typed | Sent |
| --- | --- |
| can u make the dashboard load faster its really slow on the orders page, dont touch the api | *(unchanged: nothing to add)* |

**"It" gets a name from the conversation.** Earlier, Claude said `ordersPageRows` in `src/orders.js` is slow.

| You typed | Sent |
| --- | --- |
| ok make it faster, its really slow, dont touch the api | Make ordersPageRows in src/orders.js faster; it's really slow. Don't touch the API. |

**A clear prompt skips the forge.**

| You typed | Sent |
| --- | --- |
| Fix the flaky retry test in tests/retry.test.ts by mocking the clock; npm test must pass 10 runs in a row. | *(unchanged: the local check sees a file and a finish line, so no Haiku call is made)* |

**A fact only you know gets a question first.**

| You typed | Forge asks | You answer | Sent |
| --- | --- | --- | --- |
| rename it to the name we picked in the design review *(right after talking about the prompt-forge plugin)* | What name was picked in the design review? | prompt-smith | Rename the prompt-forge plugin to prompt-smith everywhere. |

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
