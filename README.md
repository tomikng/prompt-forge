<div align="center">

# ✨ Prompt Forge

**Spend your [Claude Code](https://claude.com/claude-code) tokens where they count.**
Most of what a session costs is Claude re-reading the conversation. Prompt Forge offers a fresh start when a new task would drag a long conversation along, and runs small, clear tasks on Sonnet: **−41% per session** in [its benchmark](#benchmarks), every step still right.

[![Version](https://img.shields.io/badge/version-0.7.0-f5a6e6)](.claude-plugin/marketplace.json)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-%E2%89%A5%202.1.289-d97757)](https://claude.com/claude-code)
[![License: MIT](https://img.shields.io/github/license/tomikng/prompt-forge?color=22c55e)](LICENSE)
[![Benchmark](https://img.shields.io/badge/session%20cost-%E2%88%9241%25-22c55e)](#benchmarks)
[![Stars](https://img.shields.io/github/stars/tomikng/prompt-forge?style=flat&color=fde047)](https://github.com/tomikng/prompt-forge/stargazers)

[Install](#install) · [See it](#see-it) · [How it works](#how-it-works) · [Benchmarks](#benchmarks) · [Commands](#commands) · [📖 Full guide](HELP.md)

</div>

---

## Why

In a long Claude Code session, every prompt makes Claude re-read everything said so far. By the sixth prompt of the benchmark session, each step cost **2.4× the first**, and almost none of that was the new work. Prompt Forge spends your tokens where they count:

- 💸 **Fresh start for new tasks.** When a prompt starts something unrelated in a long session, it offers to `/clear` first and send your prompt into the empty conversation. One keypress (`f`), never on a follow-up.
- ⚡ **Sonnet for small, clear tasks.** A prompt that names its file and its finish line, on a fresh context, runs that one turn on Claude Sonnet at about half the price. Your next prompt goes back to your model.
- ⏱️ **Instant.** Prompts go out as you typed them, with no rewrite delay. The checks run only where they can save something.
- 🎯 **Measured, not guessed.** −41% per six-prompt session, every step still right, against a same-day baseline. The [benchmarks](#benchmarks) and their [caveats](#before-you-count-on-the-41) are in this README.
- 🖼️ **Keeps your images.** A prompt with a pasted image or file goes out exactly as typed.
- ✍️ **Prompt rewriting, if you want it.** `/forge rewrite on` names what "it" refers to, spells out limits you buried, and asks you only for facts nobody else can know. It's off by default because it measured break-even on spend.
- ✋ **Easy to bypass.** Start a prompt with `raw:`, answer `h`, or run `/forge off`.

## See it

**A new task in a long session:** Prompt Forge holds it and offers a fresh start. `f` clears the conversation and sends your prompt; since it's a small, clear task on a fresh context, that turn runs on Sonnet:

<img src="assets/fresh.png" alt="A new task in a long session: Prompt Forge says it would re-read 85k tokens of old conversation and offers Start fresh & send or Send here; after f, /clear runs, the prompt is sent, and a toast says the small, clear task runs on Sonnet" width="100%">

<sub>The screenshots are faithful recreations of the plugin's terminal output (<code>scripts/mockups</code>, rendered by <code>scripts/render-assets.sh</code>); the wording comes straight from <code>hooks/register.tsx</code>.</sub>

## Install

Run these **one at a time** in Claude Code. Each is a separate command.

**1. Add the marketplace**

```text
/plugin marketplace add tomikng/prompt-forge
```

> [!TIP]
> If you open the **Add Marketplace** dialog from the `/plugin` menu instead, paste only `tomikng/prompt-forge` into the box.

**2. Install the plugin**

```text
/plugin install prompt-forge@prompt-forge
```

**3. Just type.** Your next prompt of five or more words gets forged. `/forge` shows whether it's on.

<details>
<summary>Prefer the shell?</summary>

```bash
claude plugin marketplace add tomikng/prompt-forge
claude plugin install prompt-forge@prompt-forge
```
</details>

> [!NOTE]
> Requires Claude Code **2.1.289+** (function-hook plugins, an early-access API).
> The card draws in the terminal and the desktop Code tab.

**Updates.** Auto-update is **off by default** for community marketplaces. To turn it on: `/plugin` → **Marketplaces** → `prompt-forge` → **Enable auto-update**. To update by hand:

```bash
claude plugin marketplace update prompt-forge
claude plugin update prompt-forge@prompt-forge
```

## How it works

```text
you press Enter
   │
   ├─ slash command, "raw:", fewer than 5 words, an attachment, or /forge off? ──▶ sent as typed
   │
   ├─ 30k+ tokens of conversation, and a tiny Haiku check says it's a new task?
   │     └─▶ held: "f" ──▶ /clear, then your prompt     "h" ──▶ sent here
   │
   ├─ names a file and a finish line, on ≤10k tokens of conversation?
   │     └─▶ this turn runs on Sonnet
   │
   └─▶ sent as typed, on your model, instantly
       (with /forge rewrite on: forged first, see below)
```

| What happens | When |
| --- | --- |
| Held, with a fresh-start offer | A new, unrelated task while the session re-reads 30k+ tokens of earlier conversation. Reply `f` to `/clear` and send it fresh, `h` to send it here; or use the buttons |
| Run on Sonnet | A clear prompt (it names a file, path, `code` or identifier **and** a finish line like *run npm test*, *should*, *make sure*) while the conversation is at most 10k tokens |
| Sent as typed | Everything else: slash commands, short replies, prompts with an image or file, `raw:` prompts, and anything while `/forge off` |

Only prompts **you type** are checked. Messages from other plugins, background tasks or other agents pass straight through.

### Prompt rewriting (opt-in)

`/forge rewrite on` adds a small Haiku call to every prompt of 5+ words. It's off by default: on its own it measured break-even on spend (+3%, inside noise), and it adds a second or two before each prompt is sent. Turn it on if you like seeing your prompts tidied and want questions for facts only you know.

<a href="assets/brag.mp4"><img src="assets/brag.gif" alt="Prompt rewriting in 21 seconds (recorded with 0.2, whose rewrites added more structure than today's): a typo-ridden prompt is rewritten; the before/after card; the forge asking a question instead of guessing" width="100%"></a>

<sub>▶ <a href="assets/brag.mp4">Watch with sound</a> (21 s). Recorded with 0.2: today's rewrite only adds information, never a "Done when".</sub>

<img src="assets/pipeline.svg" alt="Animated diagram: with rewriting on, a prompt goes from Enter through the 'worth forging?' check to the Haiku forge, which rewrites it, asks only for a fact only you know, or leaves it unchanged, before Claude works. Short replies skip the forge." width="100%">

| With rewriting on | When |
| --- | --- |
| Rewritten | Prompts you typed with **5 or more words**, when a rewrite adds information (what "it" means, a buried limit, a rambling prompt untangled) |
| Skipped by the local check, no model call | Prompts that already name a target **and** a finish line, with no unresolved "it"/"that" |
| Left alone, with a notice | A rewrite would add nothing, or it's not a task at all (a question to the agent like *"so this MR does nothing?"*) |
| Held, with questions | The work depends on something only you know (a value you agreed on, a name you have in mind). Your next message answers it; `raw:` alone, **Send as typed** or **Cancel** skip it |
| Sent as typed, with a notice | The Haiku call fails or takes longer than 15 s |

**Every rewritten prompt** appears in the transcript as a card: what you typed, what was sent, and what it added.

<img src="assets/card.png" alt="Compact transcript card: 'Prompt enhanced' with green notes on what was added, the typed prompt and the sent prompt" width="100%">

**When only you know the answer, it asks.** Your prompt is held, the questions appear in the transcript, and your answer is folded in before anything is sent:

<img src="assets/ask.png" alt="Prompt Forge's questions in one transcript line, and a one-row box above the prompt with Send as typed / Cancel buttons" width="100%">

#### What a rewrite changes

The forge rewrites only to add information Claude wouldn't otherwise act on: what "it" means, from the conversation, or a limit you buried. Your words stay, and it never adds requirements, tests or finish lines you didn't ask for. A rough prompt that's already understandable goes out as typed:

<img src="assets/anatomy.svg" alt="Animated diagram: 'ok make it faster, its really slow, dont touch the api' becomes a goal naming ordersPageRows from the conversation and your API limit; no done-when line is added" width="100%">

#### Context first, questions last

The forge reads the last few messages of the conversation to work out what "it" or "that" means. What it can't resolve, it leaves in your words for the agent, which has the whole conversation. Only what nobody but you can know becomes a question:

<img src="assets/context.svg" alt="Animated diagram: 'prompt-forge' in the conversation resolves 'it' in the new prompt; the forge asks only for the new name, which only you know, the answer is folded in, and Claude starts working" width="100%">

The exact rewrite rules are in the [📖 guide](HELP.md#the-rewrite-rules).

## Benchmarks

**In short:** Prompt Forge 0.7 **cut spend by 41%** over a six-prompt session ($1.29 vs $2.20), with **every step still right** (18/18). Two features do the saving ([caveats](#before-you-count-on-the-41)): a [fresh start](#starting-fresh-050) for new tasks in long sessions (−25% on its own) and [Sonnet for small, clear tasks](#a-cheaper-model-for-small-tasks-060) on a fresh context (−43% to −49% on those tasks). Prompt rewriting is now opt-in: with it on (0.6) the session came to $1.24 (−44%), inside the noise of 0.7, and it cost a second or two per prompt. The checks cost about **$0.007 per session** in Haiku calls.

That's the result of three rounds of benchmarking, each one changing the rewrite rules (full story [below](#how-we-got-here)):

| Version | What the forge did | Times you step in, per session | Cost vs no forge, per session |
| --- | --- | --- | --- |
| 0.2 | Asked whenever it was unsure | 4 | about even (its questions pulled file names out of you) |
| 0.4.0 | Rarely asked, rewrote freely | 0–1 | **+17%**: rewrites added scope, so Claude did more work |
| 0.4.1 | Rarely asks, rewrites only to add information | 0–1 | +3% (noise) |
| 0.5.0 | 0.4.1, plus a fresh-start offer for new tasks in long sessions | 0, plus ~1 keypress for a fresh start | −25% |
| 0.6.0 | 0.5.0, plus Sonnet for small, clear tasks on a fresh context | 0, plus ~2 keypresses for fresh starts | −44% |
| **0.7.0** | **0.6.0 with prompt rewriting off by default** | **0, plus ~2 keypresses for fresh starts** | **−41%** (same as 0.6 within noise; no rewrite delay) |

<img src="assets/bench-net.svg" alt="Bar chart of net dollars per task with the forge minus without: V1 −$0.010, V2 −$0.003, V3 +$0.003, A1 +$0.104 with correct runs rising from 2/3 to 3/3, C1 −$0.082 and C2 −$0.076 on Sonnet." width="100%">

Six coding tasks on a small Node project, each run 3 times **without** the forge (prompt as typed → Claude) and 3 times **with** it (prompt → Haiku forge → Claude), all on the same day. Every run was checked automatically: tests pass, the behaviour asked for works, and the protected API file is untouched.

| Task | What it says | $ without | $ with | Correct runs | What the forge did |
| --- | --- | --- | --- | --- | --- |
| V1 · vague | *"can u make the orders page faster its really slow, dont touch the api"* | $0.228 | $0.217 | 3/3 → 3/3 | left it alone |
| V2 · vague | *"the cart total is wrong when ppl buy more than one of something fix it"* | $0.191 | $0.188 | 3/3 → 3/3 | left it alone |
| V3 · vague | *"signup lets ppl in with junk emails, fix that"* | $0.217 | $0.220 | 3/3 → 3/3 | left it alone |
| A1 · ambiguous | *"rename it to something clearer, everywhere it's used"*, cold start | $0.376 | $0.479 | **2/3 → 3/3** | left it alone (see below) |
| C1 · clear | names the file, the change and *run npm test* | $0.169 | **$0.087** | 3/3 → 3/3 | ran it on Sonnet |
| C2 · clear | names the file, the change and the test to add | $0.175 | **$0.099** | 3/3 → 3/3 | ran it on Sonnet |

- **Rough prompts are fine as they are.** Claude Opus found the right code and fixed it from V1–V3 as typed. 0.4.1 doesn't rewrite them, so nothing changes and you pay only the Haiku call. 0.4.0 polished them and added requirements nobody asked for (*"…reject disposable-email domains, with a clear error"*), which made Claude do 8–15% more work for the same result.
- **A1 is about who asks, not about the forge.** At a cold start, "it" and the new name can't be known. The forge sent the prompt unchanged, so Claude saw exactly what it sees without the forge. In all 3 runs it stopped to ask you and then got it right; without the forge it asked twice and guessed wrong once. The extra $0.10 is that second round trip, not the forge.
- **Clear tasks run on Sonnet, at about half the price.** C1 and C2 name the file and the finish line, so the free local check sends them to Sonnet on a fresh context: −49% and −43%, every run still right.
- **Run-to-run noise** is about ±$0.01 per task (V1–V3 sent the identical prompt in both arms): treat smaller differences as zero.

### Over a whole session

Real work is a string of prompts on one session. The same six prompts ran **in order on one Claude Code session** (V1 → V2 → C2 → V3 → C1 → A1), 3 sessions with each version and 3 without. Context grows with every step, and in the forge sessions Haiku also gets the recent conversation, as the plugin does. Every fresh start the forge offered was accepted. The chart shows 0.7, the current default.

<img src="assets/bench-session.svg" alt="Line chart of cumulative dollars over six session steps: without the forge ends at $2.20, with the forge 0.7 at $1.29. Chips under each step show what the local check decided." width="100%">

| Per session | Mean | Range (3 sessions) | Steps done right | Fresh starts / Sonnet turns |
| --- | --- | --- | --- | --- |
| Without the forge | $2.20 | $2.13–$2.25 | 18/18 | – |
| With the forge 0.4.1 (rewriting only) | $2.27 | $2.13–$2.35 | 18/18 | – |
| With the forge 0.5.0 (+ fresh starts) | $1.64 | $1.48–$1.76 | 18/18 | 4 / – |
| With the forge 0.6.0 (+ Sonnet for small tasks) | $1.24 | $1.05–$1.57 | 18/18 | 7 / 3 |
| **With the forge 0.7.0 (rewriting off, the default)** | **$1.29** | **$1.11–$1.47** | **18/18** | **6 / 3** |

- **💸 −41% per session with 0.7** (−44% with 0.6, inside the noise). After a fresh start, the users rename (C1) ran on Sonnet for **$0.09** (vs $0.44 without the forge), and the follow-up rename (A1) cost **$0.15** (vs $0.55), because its conversation was small.
- **✂️ Rewriting adds nothing to the saving.** 0.6 and 0.7 differ only in rewriting; their ranges overlap ($1.05–$1.57 vs $1.11–$1.47), and 0.7 made one fewer fresh start. So rewriting is off by default: it saved nothing and delayed every prompt.
- **💵 Rewriting alone is break-even.** 0.4.1: +$0.07 per session (+3%), inside the spread of the sessions themselves.
- **🧮 The forge's own calls are a rounding error:** about **$0.007 per session** in 0.7 (new-task checks only), $0.017 in 0.6 with rewriting. The big cost is Claude re-reading a growing conversation: about $0.23 at step 1, $0.55 by step 6, in both arms.
- **🎯 The local check made the right call 6/6 times, in about 1 µs, with zero tokens.** It spotted C2 and C1, which name a file and a finish line, and sent the other four to the forge.
- **📏 The new-task check varies.** It also offered a fresh start before the cart task (V2) in 2 of 3 sessions with 0.6 and 1 of 3 with 0.7, so part of the extra saving over 0.5 is more fresh starts, at about 2 keypresses per session, not only Sonnet.
- **🔁 In a session, "it" resolves itself.** Right after C1 renamed `getUser` to `fetchUser`, A1 (*"rename it to something clearer"*) was clear from context: the forge named `fetchUser` in its rewrite, and Claude got it right in all 3 sessions.

### Starting fresh (0.5.0)

Rewording a prompt can't save much: in the sessions above, **99% of the money is Claude re-reading the conversation** on every step, $0.23 at step 1 and $0.55 by step 6. The one lever that moves that number is a smaller conversation. So when a prompt starts an unrelated task in a long session, Prompt Forge holds it and offers to start fresh:

```text
● Prompt dropped by a hook: ✨ Prompt Forge: this looks like a new task, and every step here
  re-reads 85k tokens of old conversation.  ↳ reply "f" to /clear and send it fresh, or "h" to send it here
╭─────────────────────────────────────────────────────────────────────────────────────────╮
│ ✨ New task? 85k tokens of old conversation ride along [ Start fresh & send ] [ Send here ] │
╰─────────────────────────────────────────────────────────────────────────────────────────╯
```

- **One tiny Haiku call decides** whether the prompt continues the conversation or starts something new, and it answers "continues" when unsure: anything that says "it", "that", "again" or names something from the conversation stays.
- **Only in long sessions.** It counts only the conversation, not the system prompt and tools every request carries (27k tokens on a bare install, more with plugins), and asks only above 30k tokens of it.
- **`f`** runs `/clear` and sends your prompt into the fresh conversation; **`h`** sends it where you are. `/forge fresh off` turns the offer off.

The same six-prompt session, with the fresh-start offer accepted every time it was made:

| Per session | Mean | Range (3 sessions) | Steps done right | Fresh starts |
| --- | --- | --- | --- | --- |
| Without the forge | $2.20 | $2.13–$2.25 | 18/18 | – |
| With the forge 0.4.1 | $2.27 | $2.13–$2.35 | 18/18 | – |
| **With the forge 0.5, fresh starts accepted** | **$1.64** | **$1.48–$1.76** | **18/18** | 4 in 3 sessions |

- **💸 −25% per session.** After a fresh start, steps 5 and 6 cost **$0.15 and $0.24** instead of $0.44 and $0.55.
- **🎯 No harmful clears.** It started fresh before the signup task (V3) once and before the users rename (C1) in every session, both self-contained. It never started fresh before A1 (*"rename it to something clearer"*), which needs the rename just before it, and A1 stayed right in all 3 sessions.
- **🧮 The check is nearly free:** about $0.006 per session.
- **Caveats:** each fresh start is one keypress from you. The benchmark offered it on every topic change; the plugin also requires 30k+ tokens of conversation, which every one of these steps had. In your own work, a fresh start is only as good as the new task's independence: if it needs something from earlier, answer `h`.

### A cheaper model for small tasks (0.6.0)

A task that names its file and its finish line doesn't need your session's biggest model. When the free local check sees one and the conversation is still small (at most 10k tokens: the start of a session, or right after a fresh start), **that one turn runs on Claude Sonnet**, and a toast says so. The next prompt goes back to your model.

- **Only on a small context.** The prompt cache is per model: switching a long conversation would make Sonnet read all of it uncached, which costs more than staying on Opus.
- **Subagents keep their own model**, and a session already on Sonnet or Haiku is left alone. `/forge model off` turns it off.
- **Benchmarked:** C1 $0.169 → $0.087 and C2 $0.175 → $0.099 as single tasks, every run right; in sessions it ran C1 after each fresh start, 3/3 right, and the Opus follow-up (A1) stayed right too.

### Asking less

Haiku asks **only for what nobody but you can know** (a value you agreed on, a name you have in mind) and leaves everything else, in your own words, for the agent, which has the whole conversation. Questions to the agent (*"so this MR does nothing?"*) go through untouched, and so do prompts with an image or file attached: Haiku can't see those.

**Routing** (Haiku only, 15 prompts × 3 runs, each labelled with whether a question is really needed; [`bench/policy.py`](bench/policy.py)):

| Rules | Needless questions, no context | Needless questions, with conversation | Missed a question it needed | Rewritten, no context / with conversation |
| --- | --- | --- | --- | --- |
| 0.3 (ask when unsure) | 23/33 | 13/33 | 3/24 | 10/45 · 20/45 |
| 0.4.0 (ask less, rewrite freely) | 6/33 | 3/33 | 0/24 | 20/45 · 24/45, at 3–4.5× length |
| **0.4.1 (ask less, add only information)** | **1/33** | **2/33** | **0/24** | **3/45 · 20/45, at 1–1.9× length** |

### Before you count on the −41%

- **Small test, small project.** Three sessions of six prompts on a 12-file project. On a large codebase Sonnet may need more turns for the same task, and a vague prompt may cost more searching, so the saving can shrink.
- **The saving comes from you pressing `f`.** The benchmark accepted every fresh-start offer. If you usually answer `h`, expect something closer to 0.4.1: break-even.
- **The new-task check isn't fully consistent.** It offered a fresh start before the cart task (V2) in 2 of 3 sessions with 0.6, 1 of 3 with 0.7 and none with 0.5. Harmless here, since that task was self-contained, but on your own work answer `h` whenever the new task needs earlier context.
- **Rewriting saves nothing.** The money comes from fresh starts and Sonnet turns, not from better wording: the rewrite rules measured break-even on their own (0.4.1) and added nothing on top (0.6 vs 0.7). That's why 0.7 turns rewriting off by default.
- **Same-day comparisons.** Every dollar figure above is against a no-forge baseline run the same day (2026-10-09). Earlier rounds in `bench/*-0.2.json` ran on different days, with an older forge, so compare them with care.

### How we got here

- **0.2** asked questions on every vague prompt, four interruptions per six-prompt session, even when the conversation had the answer. It broke even on cost, because your answers named the exact file (*"`ordersPageRows` in `src/orders.js`"*) and saved Claude a search.
- **0.4.0** stopped asking for what the agent can find itself: interruptions went to almost zero. But with no answers to fold in, it "improved" prompts anyway, adding scope, and a same-day benchmark showed **+17% per session**.
- **0.4.1** rewrites only when it adds information the agent would not otherwise act on: a reference resolved from the conversation, a buried limit, a rambling prompt untangled. Otherwise it sends the prompt as typed. Cost went back to break-even, with the interruptions still gone.

The V3 check was fixed along the way: it required `ann@example.com` to be accepted, but `example.com` is a reserved domain that can't receive mail, and rejecting it as junk is a fair call. It now requires a real-looking address (`ann@gmail.com`) and only notes the `example.com` decision.

<details>
<summary>Method, caveats and how to reproduce</summary>

- **Models:** Claude Code with Claude Opus 5.5 does the work; Claude Haiku 4.5 runs the forge. Dollar amounts come from Claude Code's own cost accounting (`claude -p --output-format json`), at list prices.
- **Forge cost is an upper bound.** Forge calls ran through `claude -p --model haiku` with the forge's exact system prompt and message shape, with skills, MCP servers and settings switched off. The CLI's identity block (~335 tokens) is still counted, so the real plugin call costs the same or less.
- **Replies:** if Claude ended a run by asking a question instead of working, the task's canned answer was sent on the same session, in both arms, and both calls were counted. The same canned answer was used to answer the forge's questions.
- **Scope:** a small fixture project (`bench/fixture`: 8 source files, 4 test files), 6 tasks, 3 runs each with and without the forge, plus 3 six-step sessions each, all run on 2026-10-09. Earlier rounds are kept: `bench/*-0.2.json`, `bench/*-0.4.0.json`, `bench/*-0.4.1.json`, `bench/*-0.6.0.json`. The single-task table above was run with rewriting on (0.6); with it off, V1–V3 and A1 go out exactly as typed, the same as the no-forge arm.
- **Sessions:** each step's check runs on the working tree right after that step. In the session, A1's target is `fetchUser` (renamed by C1), and the canned answer names it. The local check is the plugin's own `hooks/classify.ts`, run by Node. In a large codebase, a vague prompt can cost more file searching, which these numbers don't capture. Your results will differ.
- **Every number** is in [`bench/RESULTS.md`](bench/RESULTS.md), generated from the raw [`bench/results.json`](bench/results.json).

```bash
python3 bench/bench.py run --reps 3     # the benchmark (~$7 at Opus prices)
python3 bench/bench.py strategies       # forge cost per prompt type (< $0.05)
python3 bench/session.py run --reps 3   # the session benchmark (~$13 at Opus prices)
python3 bench/bench.py report           # RESULTS.md and assets/bench-net.svg
python3 bench/policy.py routing --reps 3                                        # ask-policy routing (Haiku only, cents)
python3 bench/bench.py run --reps 3 --arms forge-ask,forge-minimal --out results-policy.json  # policies end to end
python3 bench/session.py run --reps 3 --arms forge-minimal --out session-final.json
python3 bench/session.py run --reps 3 --arms guard-lean --out session-guard.json   # fresh-start offer, always accepted
python3 bench/session.py run --reps 3 --arms guardroute-lean --out session-guardroute.json   # + Sonnet routing (0.6)
python3 bench/session.py run --reps 3 --arms guardroute-none --out session-norewrite.json    # 0.7: no rewriting
python3 bench/bench.py run --reps 3 --only C1,C2 --arms route-lean --out results-route.json
```
</details>

## Commands

| Command | What it does |
| --- | --- |
| `/forge` | Show what's on: fresh starts, Sonnet routing, rewriting |
| `/forge off` | Send every prompt exactly as typed (remembered across sessions) |
| `/forge on` | Turn Prompt Forge back on |
| `/forge rewrite on` | Also rewrite prompts before sending (off by default; `/forge rewrite off` turns it off again) |
| `raw: <prompt>` | Send this one prompt untouched; the `raw:` prefix is removed (also drops a held prompt) |
| `raw:` alone | While a prompt is held: send it as typed |
| `f` / `h` | While a new task is held: start fresh (`/clear`, then send it) / send it here |
| `/forge fresh off` | Never offer a fresh start (`/forge fresh on` turns it back on) |
| `/forge model off` | Never switch a turn to Sonnet (`/forge model on` turns it back on) |
| **Send as typed** / **Cancel** | With rewriting on, on the question box: send the held prompt unchanged, or drop it |
| **ctrl+o** | With rewriting on: expand the transcript to see the plain sent text without the card |

## Cost and privacy

- **By default, Haiku runs only in long sessions:** one tiny new-task check per prompt once the conversation passes 30k tokens, about **$0.001–0.002** each (≈ $0.006 per benchmark session). Short sessions, short replies and commands cost nothing. With `/forge rewrite on`, add one small Haiku call per prompt (under $0.003). All of it goes through your own Claude Code session and is billed like the rest of your usage.
- **What Haiku sees:** the new-task check (or, with rewriting on, the rewrite rules), your prompt, and the text of the last few messages (at most 6 messages and about 3,000 characters), so it can resolve "it" and "that". No files, tool output or attachments: a prompt with an attachment isn't sent to Haiku at all.
- **Sonnet turns** are billed at Sonnet's price through your own session, like any `/model sonnet` turn.
- **Nothing leaves your machine any other way.** No telemetry, no third-party services.
- The switches are stored in the plugin's own store under `~/.claude/plugins/store/`. Before/after pairs for the cards live in session memory (the last 50) and are never written to disk by the plugin.

## FAQ

**Does it change my prompts?** Not by default: they go out as typed. With `/forge rewrite on`, it's instructed to keep every detail word for word and invent nothing, and the card always shows both versions. If a rewrite misses, resend with `raw:` and [report it](https://github.com/tomikng/prompt-forge/issues/new?template=bad-rewrite.yml).

**How much of my conversation does it see?** Only the text of the last few messages, capped at about 3,000 characters, never files or tool output. It uses them to name what you're pointing at, never to add requirements. When that isn't enough, it asks you instead of guessing.

**Does it slow me down?** Not by default: a prompt goes out instantly, except in a long session, where the new-task check adds about a second. With rewriting on, a rewrite usually adds 1–2 seconds.

**What if a fresh start was the wrong call?** Answer `h` and the prompt is sent where you are, nothing lost. The check leans towards "follow-up" when unsure, and `/forge fresh off` turns the offer off for good.

**Is Sonnet as good as Opus for those tasks?** On the benchmark's clear tasks, yes: every run passed its checks. It's only used when the prompt names its file and its finish line, and only on a small context. `/forge model off` keeps every turn on your model.

**Why does an old rewritten prompt show without the card after a restart?** Cards are drawn from session memory, so resumed sessions show the sent text only.

## Development

```bash
claude --plugin-dir ./plugins/prompt-forge      # run it from source
claude plugin validate ./plugins/prompt-forge   # check the manifest and hooks
claude plugin test ./plugins/prompt-forge       # run the tests
./scripts/render-assets.sh                      # regenerate README screenshots (chromium + ImageMagick)
python3 scripts/diagrams.py                     # regenerate the animated diagrams
python3 bench/bench.py report                   # rebuild benchmark tables and chart
```

```text
plugins/prompt-forge/
├── hooks/register.tsx   # prompt rewrite, questions band, /forge command, transcript card
├── types/index.d.ts     # state contract
└── tests/forge.test.ts
```

Issues and PRs are welcome, especially examples of rewrites that went wrong.

## License

[MIT](LICENSE) © tomikng
