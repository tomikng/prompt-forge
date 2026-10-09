<div align="center">

<a href="assets/brag.mp4"><img src="assets/brag.gif" alt="Prompt Forge in 21 seconds: a typo-ridden prompt is rewritten into Goal, Constraints and Done when; the before/after card; the forge asking a question instead of guessing; $0.85 → $0.21 per correct result" width="760"></a>

<sub>▶ <a href="assets/brag.mp4">Watch with sound</a> (21 s)</sub>

# ✨ Prompt Forge

**Sharper prompts for [Claude Code](https://claude.com/claude-code), without retyping them.**
Type the way you think. Prompt Forge rewrites it into a clear, actionable prompt before Claude sees it, and shows you exactly what it changed.

[![Version](https://img.shields.io/badge/version-0.4.0-f5a6e6)](.claude-plugin/marketplace.json)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-%E2%89%A5%202.1.289-d97757)](https://claude.com/claude-code)
[![License: MIT](https://img.shields.io/github/license/tomikng/prompt-forge?color=22c55e)](LICENSE)
[![Rewrites with](https://img.shields.io/badge/rewrites%20with-Haiku-38bdf8)](#cost-and-privacy)
[![Stars](https://img.shields.io/github/stars/tomikng/prompt-forge?style=flat&color=fde047)](https://github.com/tomikng/prompt-forge/stargazers)

[Install](#install) · [See it](#see-it) · [How it works](#how-it-works) · [Benchmarks](#benchmarks) · [Commands](#commands) · [📖 Full guide](HELP.md)

</div>

---

## Why

Claude does its best work when a prompt states the goal, the limits and what "done" looks like. Most of us type something closer to *"can u make the dashboard faster its slow, dont touch the api"*. Prompt Forge closes that gap automatically:

- 🎯 **Goal first.** The rewrite leads with what you actually want.
- 🧱 **Your details, word for word.** File names, errors, numbers and constraints you typed are kept exactly.
- ✅ **A finish line.** A "done when" check is added when your prompt implies one.
- 🚫 **No inventions.** It never adds files, APIs or requirements you didn't mention.
- 🧭 **Knows what "it" means.** The last few messages of the conversation are used to name what you're referring to.
- 🤫 **Asks only when it must.** It asks you only for what nobody else can know (a value you agreed on, a name you have in mind). Everything the agent can work out itself, it leaves to the agent.
- 🖼️ **Keeps your images.** A prompt with a pasted image or file goes out exactly as typed, attachment and all.
- 👀 **Nothing hidden.** Every rewrite shows up as a before/after card in the transcript.
- ✋ **Easy to bypass.** Start a prompt with `raw:` or run `/forge off`.

## See it

<img src="assets/flow.gif" alt="A rough prompt is typed, Prompt Forge rewrites it, and a card shows what was sent" width="100%">

**Every rewritten prompt** appears in the transcript as a card: what you typed, what was sent, and what improved.

<img src="assets/card.png" alt="Compact transcript card: 'Prompt enhanced' with green notes on what improved, the typed prompt and the sent prompt" width="100%">

**When only you know the answer, it asks.** Your prompt is held, the questions appear in the transcript, and your answer is folded in before anything is sent:

<img src="assets/ask.png" alt="Prompt Forge's questions in one transcript line, and a one-row box above the prompt with Send as typed / Cancel buttons" width="100%">

**Already clear prompts are left alone**, `raw:` sends a prompt untouched, and `/forge` turns it on and off:

<img src="assets/controls.png" alt="A raw: prompt sent as typed, an 'already sharp' notice, and /forge off and /forge on" width="100%">

<sub>The screenshots are faithful recreations of the plugin's terminal output (<code>scripts/mockups</code>, rendered by <code>scripts/render-assets.sh</code>). The card's layout and wording come straight from <code>hooks/register.tsx</code>.</sub>

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

<img src="assets/pipeline.svg" alt="Animated diagram: a prompt goes from Enter through the 'worth forging?' check to the Haiku forge, which rewrites it, asks a question first, or leaves it unchanged, before Claude works. Short replies skip the forge." width="100%">

<details>
<summary>The same flow as text</summary>

```text
you press Enter
   │
   ├─ slash command, "raw:", fewer than 5 words, or /forge off? ──▶ sent as typed
   ├─ already names a file/identifier AND a finish line? ──▶ sent as typed (local check, no tokens)
   │
   ▼
✨ Forging your prompt…            (status line, usually 1–2 s)
   │  one Haiku call: the rewrite rules, your prompt, the last few messages
   ▼
already clear? ──▶ "already sharp, sent as typed"
   │
still ambiguous? ──▶ prompt held, questions shown above the prompt
   │                    │  you type an answer (any length) and press Enter
   │                    ▼
   │                 prompt + answer forged together ──┐
   ▼                                                    ▼
rewritten prompt is sent to Claude ──▶ before/after card, and the agent gets to work
```

</details>

| What happens | When |
| --- | --- |
| Rewritten | Prompts you typed with **5 or more words** |
| Skipped by the local check, no model call | Prompts that already name a target (a file, path, `code` or identifier) **and** a finish line (*run npm test*, *should*, *make sure*…), with no unresolved "it"/"that" |
| Sent as typed | Slash commands, short replies ("yes go ahead"), prompts with an image or file attached, prompts starting with `raw:`, and anything while `/forge off` |
| Left alone, with a notice | Haiku judges the prompt already clear, or not a task at all (a question to the agent like *"so this MR does nothing?"*) |
| Held, with questions | The work depends on something only you know (a value you agreed on, a name you have in mind). Your next message answers it; `raw:` alone, **Send as typed** or **Cancel** skip it |
| Sent as typed, with a notice | The Haiku call fails or takes longer than 15 s |

Only prompts **you type** are forged. Messages from other plugins, background tasks or other agents pass straight through.

### What a rewrite changes

Every detail you typed stays word for word. The forge reorders it so the goal comes first, labels your limits, and adds a finish line only when your words imply one:

<img src="assets/anatomy.svg" alt="Animated diagram: the typed prompt's phrases light up and become Goal, Constraints and an added Done-when line, followed by the notes shown on the card" width="100%">

### Context first, questions last

The forge reads the last few messages of the conversation to work out what "it" or "that" means. What it can't resolve, it leaves in your words for the agent, which has the whole conversation. Only what nobody but you can know becomes a question:

<img src="assets/context.svg" alt="Animated diagram: 'prompt-forge' in the conversation resolves 'it' in the new prompt; the forge asks only for the missing new name, the answer is folded in, and Claude starts working" width="100%">

The exact rewrite rules are in the [📖 guide](HELP.md#the-rewrite-rules).

## Benchmarks

**In short:** the forge costs **under $0.003 per prompt**, about 1% of a typical Claude Code task. It paid for itself many times over on an ambiguous prompt, where it prevented a wrong result. On prompts that were already clear it's a small net cost, and on vague-but-guessable prompts it broke even. Over a whole six-prompt session it broke even ($2.12 vs $2.19), and the free local check routed every prompt correctly. **Since 0.4.0 it almost never stops to ask:** zero questions over 18 session steps, with every step still right.

<img src="assets/bench-net.svg" alt="Bar chart of net dollars per task with the forge minus without: V1 −$0.013, V2 +$0.010, V3 −$0.003, A1 −$0.073 with correct runs rising from 1/3 to 3/3, C1 −$0.008, C2 +$0.002. A shaded band marks ±$0.008 of run-to-run noise." width="100%">

Six coding tasks on a small Node project, each run 3 times **without** the forge (prompt as typed → Claude) and 3 times **with** it (prompt → Haiku forge → Claude). Every run was checked automatically: tests pass, the behaviour asked for works, and the protected API file is untouched.

| Task | $ without | $ with | Net $ per task | $ per correct result | Correct runs |
| --- | --- | --- | --- | --- | --- |
| A1 · ambiguous | $0.2824 | $0.2099 | **−$0.0725** | $0.847 → $0.210 | 1/3 → 3/3 |
| V1 · vague | $0.2372 | $0.2239 | **−$0.0133** | $0.237 → $0.224 | 3/3 → 3/3 |
| V3 · vague | $0.2133 | $0.2107 | **−$0.0026** | $0.213 → $0.211 | 3/3 → 3/3 |
| V2 · vague | $0.1822 | $0.1922 | **+$0.0100** | $0.182 → $0.192 | 3/3 → 3/3 |
| C1 · already clear | $0.1800 | $0.1718 | **−$0.0082** | $0.180 → $0.172 | 3/3 → 3/3 |
| C2 · already clear | $0.1727 | $0.1751 | **+$0.0023** | $0.173 → $0.175 | 3/3 → 3/3 |

Totals include every Haiku forge call and every Claude call, including follow-up replies when Claude stopped to ask a question.

### ✅ Where the forge saves money: ambiguous prompts

**A1: *"rename it to something clearer, everywhere it's used"*** at the start of a session.

- **Without the forge**, Claude has to guess or stop. In 1 run it asked what "it" meant, and the follow-up re-read the whole context: **$0.47** for one correct result. In the other 2 runs it didn't ask: it chose what to rename and a new name itself. The result wasn't the rename you meant (`getUser` → `findUserById`), and each run still billed **$0.19** for work you'd have to undo and redo.
- **With the forge**, Haiku asked *"What is 'it'?"* and *"What should the new name be?"* for **$0.002**, before Claude ran at all. Your answer was folded into one clear prompt, and Claude got it right on the first try in all 3 runs, at **$0.21** each.
- **Net:** −$0.073 per task (−26%), and **$0.21 instead of $0.85 per correct result**.

The pattern: the forge saves money when a prompt can send Claude down the wrong path. A wrong result costs a full run plus the redo; a question from the forge costs a fraction of a cent.

### ➖ Where the forge breaks even: vague but guessable prompts

**V1–V3** (*"can u make the orders page faster…"*, *"the cart total is wrong…"*, *"signup lets ppl in with junk emails…"*): Claude Opus found the right file and fixed it in every run, with or without the forge. The differences (−$0.013, −$0.003, +$0.010) are all within about one noise band of zero.

> [!NOTE]
> **How big is the noise?** C1 sent the *identical* prompt in both arms, since the forge left it unchanged, yet its average still differed by $0.008. Treat anything within about ±$0.01 as noise, not an effect.

The 0.2 forge also cost you a round of questions on these prompts: it asked where the code lives even though Claude finds that itself. The benchmark caught it, and since 0.4.0 these prompts are rewritten without a question (see [Asking less](#asking-less-040)).

### ❌ Where the forge costs more: prompts that are already clear

**C1 and C2** named the file, the change and the check. The forge has nothing to add, so its Haiku call (~$0.001) is pure overhead. On C2 it made a cosmetic rewrite in 2 of 3 runs (+$0.002, +1%). The forge left C1 unchanged, so its −$0.008 is noise (see above), not a saving. **Since 0.3.0 this overhead is gone:** a local pattern check spots prompts like C1 and C2 (they name a file or identifier *and* a finish line such as *run npm test*) and sends them straight to Claude with no Haiku call, so they cost exactly what they would without the forge. The check runs on your machine and uses no tokens.

### What each kind of prompt costs at the forge itself

| Prompt | Haiku calls | Tokens in / out | Forge cost |
| --- | --- | --- | --- |
| short reply (under 5 words: no forge call) | 0 | 0 / 0 | $0.0000 |
| clear prompt (C2: file, change and check all named) | 1 | 774 / 56 | $0.0011 |
| vague prompt (V2: no file, no expected result) | 2 | 1,628 / 136 | $0.0023 |
| ambiguous prompt (A1: "it" with nothing to resolve it) | 2 | 1,614 / 123 | $0.0022 |
| follow-up + context (short follow-up, 6 messages (~3k chars) of conversation) | 1 | 1,190 / 156 | $0.0020 |

Including conversation context adds about 400 input tokens (~$0.0004) and lets the forge rewrite a short follow-up like *"ok do it, the fast way"* directly, without asking.

### Over a whole session

Real work is a string of prompts on one session, not single prompts. So the same six prompts ran **in order on one Claude Code session** (V1 → V2 → C2 → V3 → C1 → A1), 3 sessions with the forge and 3 without. Context grows with every step, and in the forge sessions Haiku also gets the recent conversation, as the plugin does.

<img src="assets/bench-session.svg" alt="Line chart of cumulative dollars over six session steps: without the forge ends at $2.19, with the forge at $2.12; the two lines nearly overlap. Chips under each step show the local check skipping C2 and C1." width="100%">

| Per session | Mean | Range (3 sessions) | Steps done right |
| --- | --- | --- | --- |
| Without the forge | **$2.19** | $2.07–$2.40 | 18/18 |
| With the forge | **$2.12** | $2.11–$2.13 | 18/18 |

- **💵 It breaks even over a session.** The forge sessions averaged $0.07 less (−3%), but that's inside the spread of the sessions without it ($2.07–$2.40), so treat it as break-even. The forge sessions were also more consistent ($0.02 spread vs $0.33), but three sessions can't prove that.
- **🧮 The forge is a rounding error.** All its Haiku calls came to **$0.013 per session**, about 0.6% of the total. The big cost is Claude re-reading a growing conversation: its cost per step climbed from $0.23 to $0.53 as the session went on, in both arms.
- **🎯 The local check made the right call 6/6 times, in about 1 µs, with zero tokens.** It skipped C2 and C1, which name a file and a finish line, and sent the four vague and ambiguous prompts to the forge. That's two Haiku calls saved per session.
- **📈 The forge's input grows with the session, up to a cap.** Its input went from 1,647 tokens at step 1 to about 3,000 by step 4. It levels off there because the plugin sends at most 6 messages and ~3,000 characters of conversation.
- **🔁 The ambiguous prompt stops being ambiguous mid-session.** Right after C1 renamed `getUser` to `fetchUser`, *"rename it to something clearer"* was clear enough from context: Claude got it right in all 3 sessions without the forge. The forge's big win on A1 above comes from cold starts, not long sessions.
- **⚠️ The 0.2 forge asked too much.** It asked questions on **all four** prompts it handled, in every session: four interruptions per six prompts. On A1 it even had the answer (*"Do you mean `fetchUser` from the last task?"*) and asked anyway. **0.4.0 fixes this:** see [Asking less](#asking-less-040).

### Asking less (0.4.0)

Until 0.3, the forge stopped to ask whenever Haiku couldn't resolve "it" or "that" from the few messages it sees. But the agent behind it has the whole conversation and the code. In 0.4.0 Haiku asks **only for what nobody but you can know** (a value you agreed on, a name you have in mind) and leaves everything else, in your own words, for the agent. Questions to the agent (*"so this MR does nothing?"*) go through untouched, and so do prompts with an image or file attached: Haiku can't see those.

**Routing** (Haiku only, 15 prompts × 3 runs, each labelled with whether a question is really needed; [`bench/policy.py`](bench/policy.py)):

| Policy | Needless questions, no context | Needless questions, with conversation | Missed a question it needed |
| --- | --- | --- | --- |
| 0.3 (ask when unsure) | 23/33 | 15/33 | 3/24 |
| **0.4 (ask only for your facts)** | **3/33** | **2/33** | **0/24** |

**End to end**, the same six tasks and six-step sessions as above. *Times you step in* counts the forge's questions plus every time the agent stopped to ask:

| | Times you step in | Correct | Mean $ |
| --- | --- | --- | --- |
| Single tasks, 0.3 | 3 (A1 ×3) | 18/18 | $0.208 |
| **Single tasks, 0.4** | 3 (A1 ×3) | **18/18** | $0.242 |
| Sessions, 0.3 | **6** (2 per session) | 18/18 | $2.53 per session |
| **Sessions, 0.4** | **0** | **18/18** | $2.59 per session |

- **🤫 In a real session it got out of the way.** Zero questions over 18 steps, every step right. The 0.3 forge asked twice per session for things the conversation already answered.
- **🎯 It still stops for what only you know.** A1 at a cold start (*"rename it to something clearer"*, where you secretly want `findUserById`) still needs you, in both versions. 0.4 leaves "it" to the agent, which asked you itself in 2 of 3 runs, at the cost of a second Claude pass ($0.38 vs $0.21 per task). Every other task cost about the same.
- **💵 Same money otherwise.** $2.53 vs $2.59 per session is within run-to-run noise, and the forge's own Haiku calls stayed around $0.013 per session. Both ran on the same day; the no-forge sessions above ran two days earlier and aren't directly comparable in dollars.
- **🧪 One check was fixed along the way.** V3's check required `ann@example.com` to be accepted, but `example.com` is a reserved domain that can't receive mail, and rejecting it as junk is a fair call. The check now requires a real-looking address instead (`ann@gmail.com`) and only notes the `example.com` decision. Under the old check, forged V3 runs failed 5 of 6 times; under the new one, all 9 V3 runs across the three arms passed.

Raw data: [`bench/results-final.json`](bench/results-final.json), [`bench/session-final.json`](bench/session-final.json), [`bench/results-policy.json`](bench/results-policy.json), [`bench/session-policy.json`](bench/session-policy.json), [`bench/policy-routing.json`](bench/policy-routing.json).

<details>
<summary>Method, caveats and how to reproduce</summary>

- **Models:** Claude Code with Claude Opus 5.5 does the work; Claude Haiku 4.5 runs the forge. Dollar amounts come from Claude Code's own cost accounting (`claude -p --output-format json`), at list prices.
- **Forge cost is an upper bound.** Forge calls ran through `claude -p --model haiku` with the forge's exact system prompt and message shape, with skills, MCP servers and settings switched off. The CLI's identity block (~335 tokens) is still counted, so the real plugin call costs the same or less.
- **Replies:** if Claude ended a run by asking a question instead of working, the task's canned answer was sent on the same session, in both arms, and both calls were counted. The same canned answer was used to answer the forge's questions.
- **Scope:** a small fixture project (`bench/fixture`: 8 source files, 4 test files), 6 tasks, 3 runs each (36 Claude runs, $7.35 in total), plus 6 six-step sessions (36 more Claude steps, $12.94).
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
```
</details>

## Commands

| Command | What it does |
| --- | --- |
| `/forge` | Show whether Prompt Forge is on |
| `/forge off` | Send every prompt exactly as typed (remembered across sessions) |
| `/forge on` | Turn rewriting back on |
| `raw: <prompt>` | Send this one prompt untouched; the `raw:` prefix is removed (also drops a held prompt) |
| `raw:` alone | While a prompt is held: send it as typed |
| **Send as typed** / **Cancel** | On the question box: send the held prompt unchanged, or drop it |
| **ctrl+o** | Expand the transcript to see the plain sent text without the card |

## Cost and privacy

- **One small Haiku call per forged prompt** (two in the rare case it asks you something), made through your own Claude Code session and billed like the rest of your usage: **under $0.003 per prompt** in the [benchmarks](#benchmarks). Short replies and commands cost nothing.
- **What Haiku sees:** the rewrite rules, your prompt, and the text of the last few messages (at most 6 messages and about 3,000 characters), so it can resolve "it" and "that". No files, tool output or attachments: a prompt with an attachment isn't sent to Haiku at all.
- **Nothing leaves your machine any other way.** No telemetry, no third-party services.
- The on/off switch is stored in the plugin's own store under `~/.claude/plugins/store/`. Before/after pairs for the cards live in session memory (the last 50) and are never written to disk by the plugin.

## FAQ

**Can it change what I meant?** It's instructed to keep every detail word for word and invent nothing, and the card always shows both versions. If a rewrite misses, resend with `raw:` and [report it](https://github.com/tomikng/prompt-forge/issues/new?template=bad-rewrite.yml).

**How much of my conversation does it see?** Only the text of the last few messages, capped at about 3,000 characters, never files or tool output. It uses them to name what you're pointing at, never to add requirements. When that isn't enough, it asks you instead of guessing.

**Does it slow me down?** A rewrite usually adds 1–2 seconds before Claude starts. `/forge off` removes that entirely.

**Why does an old prompt show without the card after a restart?** Cards are drawn from session memory, so resumed sessions show the sent text only.

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
