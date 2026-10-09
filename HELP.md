# 📖 Prompt Forge guide

Everything Prompt Forge does, in detail. For the quick tour, see the [README](README.md).

- [Where the tokens go](#where-the-tokens-go)
- [What happens when you press Enter](#what-happens-when-you-press-enter)
- [When it offers a fresh session](#when-it-offers-a-fresh-session)
- [When it uses a cheaper model](#when-it-uses-a-cheaper-model)
- [Controls](#controls)
- [Cost, speed and privacy](#cost-speed-and-privacy)
- [Using it with other plugins](#using-it-with-other-plugins)
- [Troubleshooting](#troubleshooting)

## Where the tokens go

Every prompt you send makes Claude re-read the whole conversation so far: the system prompt, every message, every tool result. In the benchmark's six-prompt session, the cost per prompt climbed from $0.23 to $0.55 as the conversation grew, mostly from re-reading it. Prompt Forge cuts that in two ways:

1. **A fresh session** when a prompt begins a new task: it runs in a new terminal or workspace, and the old conversation stops riding along. See [When it offers a fresh session](#when-it-offers-a-fresh-session).
2. **A cheaper model** for small, clear tasks on a small context. See [When it uses a cheaper model](#when-it-uses-a-cheaper-model).

Together: −41% per session in the benchmark, every step still right. Your prompts themselves are never changed: everything goes out exactly as you typed it.

## What happens when you press Enter

| Check | Result |
| --- | --- |
| Not typed by you (another plugin, a background task, another agent) | Passed through untouched |
| Starts with `/` (a slash command) | Passed through untouched |
| Starts with `raw:` | Sent with no checks, prefix removed |
| `/forge off` is set | Sent as typed, on your model |
| The session re-reads 30k+ tokens of conversation, the prompt has 5+ words and no attachment, and a Haiku check says it starts a new task | Held with a fresh-session offer: `f`, `w` (Superset, unrelated work) or `h` |
| Names a target and a finish line, on at most 10k tokens of conversation | Sent as typed; this turn runs on Sonnet |
| Otherwise | Sent as typed, on your model, instantly |

## When it offers a fresh session

In a long session, every prompt makes Claude re-read the whole conversation so far, and that re-reading is most of what a session costs. When your prompt starts something new, carrying that history along buys nothing. So Prompt Forge holds the prompt and offers to run it in a fresh session, leaving this one exactly as it is:

```text
● Prompt dropped by a hook: ✨ Prompt Forge: this looks like an unrelated task, and every step here re-reads
  85k tokens of old conversation.  ↳ reply "w" for a new Superset workspace, "f" for a new terminal in this one,
  or "h" to send it here
```

- **`f`** (or **New terminal**) starts your prompt in a new session. See below for where it opens.
- **`w`** (or **New workspace**), only in a Superset workspace and for unrelated work: a new Superset workspace with its own branch, named after your prompt, with Claude started on it.
- **`h`** (or **Send here**) sends it in the current conversation, as if nothing happened.
- **Anything else** you type replaces the held prompt and is handled normally.

### Where the new session opens

Prompt Forge tries these in order and uses the first that works:

1. **Superset.** If this session's folder is inside a Superset workspace's worktree: `superset agents create --local --workspace <id> --agent claude --prompt "<your prompt>"`, a new Claude terminal in the same workspace. With `w`: `superset ws create --local --project <id> --name <slug> --branch <slug> --agent claude --prompt "<your prompt>"`.
2. **tmux.** If this session runs inside tmux: a new window running `claude "<your prompt>"` in the same folder.
3. **A desktop terminal.** If `xdg-terminal-exec` is installed (Linux desktops): your default terminal, in the same folder, running `claude "<your prompt>"`.
4. **`/clear` here**, then your prompt, if none of those work. `/forge fresh clear` makes `/clear` the first choice; `/forge fresh new` switches back.

A toast says where your task went. The new session starts from an empty conversation, so a small, clear task there runs its first turn on Sonnet (see the next section).

### When it asks

Only when all of these are true:

1. **The session re-reads 30k+ tokens of conversation.** This counts only the conversation, above the fixed part every request carries: the system prompt, tools and MCP servers (27k tokens on a bare install, often much more with plugins), which a new session doesn't shed either.
2. **The prompt has 5+ words and no image or file attached.** Holding a prompt with an attachment could lose it, so those always go out as typed.
3. **A Haiku check says it's a new task.** It reads your prompt, the last few messages and the current git branch, and answers one of:
   - **follow-up:** anything that says "it", "that", "again", or names a file or result from the conversation. Sent here, no question.
   - **related:** a self-contained task on the same feature, ticket or branch. Offered `f` (a new terminal in the same workspace).
   - **unrelated:** a different piece of work. In Superset, offered `w` (a new workspace) as well.

   When unsure it answers follow-up, and between related and unrelated, related.

`/forge fresh off` turns the offer off for good (`/forge fresh on` turns it back on); `/forge off` turns all of Prompt Forge off.

## When it uses a cheaper model

A small, clear task doesn't need your session's biggest model. When the local check sees a prompt that names its target **and** a finish line (*"In src/users.js rename getUser to fetchUser…; run npm test"*), and the conversation is still small, that one turn runs on **Claude Sonnet**. A toast says so:

```text
⚡ Prompt Forge: small, clear task on a fresh context, so this turn runs on Sonnet (/forge model off)
```

- **Only on a small context:** at most 10k tokens of conversation, so at the start of a session, including the one Prompt Forge opens for a new task. The prompt cache is per model: switching a long conversation would make Sonnet read all of it uncached, which costs more than staying.
- **Only that turn.** The next prompt goes back to your model. Subagents keep their own model, and a session already on Sonnet or Haiku is left alone.
- **`/forge model off`** turns it off (`/forge model on` turns it back on).

## Controls

| You want to… | Do this |
| --- | --- |
| Start a new task in a new session | Reply `f` to the offer (or press **New terminal**) |
| Give unrelated work its own Superset workspace | Reply `w` (or press **New workspace**) |
| Use `/clear` instead of a new session | `/forge fresh clear` (`/forge fresh new` switches back) |
| Keep the conversation | Reply `h` (or press **Send here**) |
| Never offer a fresh session | `/forge fresh off` (`/forge fresh on` turns it back on) |
| Never switch to a cheaper model | `/forge model off` (`/forge model on` turns it back on) |
| Skip every check for one prompt | Start it with `raw:` |
| Turn Prompt Forge off | `/forge off` (`/forge on` turns it back on) |
| See what's on | `/forge` |

The switches are remembered across sessions.

> [!TIP]
> Don't start a prompt with `!` to skip the checks. In Claude Code, a leading `!` runs a shell command.

## Cost, speed and privacy

- **Haiku runs only in long sessions:** one tiny new-task check per prompt once the conversation passes 30k tokens, about $0.001–0.002 each and about a second of waiting. Short sessions, short replies and commands cost nothing and wait for nothing.
- **Sonnet turns** are billed at Sonnet's price through your own session, like any `/model sonnet` turn.
- **What Haiku sees:** the new-task check, your prompt, and the text of the last few messages (at most 6 messages and about 3,000 characters). No files, tool output or attachments.
- **Nothing leaves your machine any other way.** No telemetry, no third-party services.

## Using it with other plugins

Prompt Forge holds prompts with Claude Code's `prompt.submit` hook and picks the model with `turn.step`. Another plugin that also changes the model per request may override the Sonnet choice, or the other way round, depending on the order they run in. If that matters, run `/forge model off`.

The fresh-session offer is drawn in the band above the prompt. If another plugin draws its own band there first, you may not see the buttons: the one-line notice in the transcript always says what to type (`f` or `h`).

## Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| "this looks like a new task" on a follow-up | The check misjudged it. Answer `h`; nothing is lost. If it keeps happening, `/forge fresh off` and [open an issue](https://github.com/tomikng/prompt-forge/issues) with the two prompts. |
| Never offered a fresh session | Check `/forge`. The session needs 30k+ tokens of conversation above its fixed part, and the prompt 5+ words with no attachment. |
| "couldn't start fresh (…)" | No new session could be opened and `/clear` or the re-send failed too. The toast shows your prompt: paste it back in. |
| `f` ran `/clear` instead of opening a terminal | None of Superset, tmux or `xdg-terminal-exec` was available from this session (or `/forge fresh clear` is set). Check `/forge`. |
| The new Superset workspace has an odd name | Its name and branch come from the first words of your prompt. Rename it in Superset. |
| A turn ran on Sonnet that shouldn't have | Only prompts naming a file and a finish line on a small context are routed. `/forge model off` keeps every turn on your model. |
| `/forge` is not recognized | The plugin isn't loaded. Check `/plugin` → **Installed**, and that Claude Code is 2.1.289 or newer. |

Run `claude --debug` to see a line for every hook that failed.
