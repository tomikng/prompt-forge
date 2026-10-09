#!/usr/bin/env python3
"""Prompt Forge benchmark: the same tasks sent with and without the forge.

For each task, in a fresh copy of bench/fixture:
  baseline  the prompt as typed → Claude
  forge     the prompt → Haiku forge call(s) → the result → Claude
If Claude ends a run by asking a question instead of working, the task's canned answer is sent
back on the same session (like a person replying), in both arms, and the costs add up.

Costs come from Claude Code's own accounting (`claude -p --output-format json`). The forge call
runs through `claude -p --model haiku` with the forge's exact system prompt, with skills, MCP
servers and settings switched off so only the CLI's identity block rides along, as it does on
the plugin's `$.model.complete` call. Nothing is subtracted, so forge figures are an upper bound.

    python3 bench/bench.py forge            # forge calls only (cheap)
    python3 bench/bench.py run --reps 2     # full benchmark → bench/results.json
    python3 bench/bench.py report           # results.json → bench/RESULTS.md
"""
import argparse, json, re, shutil, statistics, subprocess, sys, tempfile, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FIXTURE = ROOT / "fixture"
HAIKU_IN, HAIKU_OUT = 1.0 / 1e6, 5.0 / 1e6  # $/token, matching the CLI's own Haiku cost figures

TASKS = [
    dict(id="V1", kind="vague", prompt="can u make the orders page faster its really slow, dont touch the api",
         answer="I mean ordersPageRows in src/orders.js. Keep src/api.js exactly as it is."),
    dict(id="V2", kind="vague", prompt="the cart total is wrong when ppl buy more than one of something fix it",
         answer="cartTotal in src/cart.js. It should account for quantity."),
    dict(id="V3", kind="vague", prompt="signup lets ppl in with junk emails, fix that",
         answer="validateSignup in src/signup.js should reject emails that are not shaped like name@domain.tld."),
    dict(id="A1", kind="ambiguous", prompt="rename it to something clearer, everywhere it's used",
         answer="I mean the getUser function in src/users.js. Call it findUserById."),
    dict(id="C1", kind="clear",
         prompt="In src/users.js rename getUser to fetchUser and update every call site; run npm test and make sure it passes.",
         answer="Go ahead as described."),
    dict(id="C2", kind="clear",
         prompt="In src/cart.js, make cartTotal multiply each item's price by its quantity, add a test with quantity 3 to test/cart.test.js, and run npm test.",
         answer="Go ahead as described."),
]

# ── checks: did the task get done right? ─────────────────────────────────────

NODE_CHECKS = {
    "V1": """
import { ordersPageRows } from './src/orders.js'
const t = performance.now(); const rows = await ordersPageRows(); const ms = performance.now() - t
if (rows.length !== 3000 || rows[0].id !== 'o2999') throw new Error('rows changed')
if (ms > 400) throw new Error('still slow: ' + Math.round(ms) + 'ms')
""",
    "V2": """
import { cartTotal } from './src/cart.js'
if (cartTotal([{ price: 2, quantity: 3 }, { price: 1.5, quantity: 2 }]) !== 9) throw new Error('quantity ignored')
""",
    "C2": """
import { cartTotal } from './src/cart.js'
if (cartTotal([{ price: 2, quantity: 3 }, { price: 1.5, quantity: 2 }]) !== 9) throw new Error('quantity ignored')
""",
    "V3": """
import { validateSignup } from './src/signup.js'
const ok = e => validateSignup({ email: e, password: 'longenough1' }).ok
for (const bad of ['junk', '', 'no-at-sign.com', 'a@']) if (ok(bad)) throw new Error('accepted ' + JSON.stringify(bad))
if (!ok('ann@gmail.com') || !ok('first.last+tag@mail.company.io')) throw new Error('rejected a valid email')
// example.com is reserved (RFC 2606) and can't receive mail: blocking it is a fair call for
// "junk emails", so it's noted, not failed. (Before 0.4 benchmarks, this counted as a failure.)
if (!ok('ann@example.com')) console.log('note: blocks example.com')
""",
}


def check(task, cwd: Path, notes=None):
    problems, notes = [], notes if notes is not None else []
    if subprocess.run(["npm", "test"], cwd=cwd, capture_output=True).returncode != 0:
        problems.append("npm test fails")
    if (cwd / "src/api.js").read_text() != (FIXTURE / "src/api.js").read_text():
        problems.append("src/api.js changed")
    src = "\n".join(p.read_text() for p in (cwd / "src").rglob("*.js"))
    tid = task["id"]
    if tid in NODE_CHECKS:
        (cwd / "_check.mjs").write_text(NODE_CHECKS[tid])
        r = subprocess.run(["node", "_check.mjs"], cwd=cwd, capture_output=True, text=True)
        (cwd / "_check.mjs").unlink()
        if r.returncode != 0:
            lines = r.stderr.strip().splitlines()
            # Node ends a crash with its version line: report the thrown error instead.
            problems.append(next((l for l in lines if re.match(r"\s*\w*Error\b", l)), (lines or ["check failed"])[0])[:120])
    want = {"C1": "fetchUser", "A1": "findUserById"}.get(tid)
    if want and (re.search(r"\bgetUser\b", src) or want not in src):
        problems.append(f"not renamed to {want}")
    if tid == "C2" and "quantity: 3" not in (cwd / "test/cart.test.js").read_text().replace("quantity:3", "quantity: 3"):
        problems.append("no quantity-3 test")
    return problems


# ── the forge: same system prompt and message shape as the plugin ───────────

NO_ASK = """

The user has already answered your questions (see <answers>). Do not ASK again: rewrite the
prompt with the answers folded in, or answer UNCHANGED."""


def forge_text(name):
    """The rewrite rules of the forge (removed from the plugin in 0.8; the last shipped ones are
    bench/policies/lean.txt) and the follow-up note it sent with the user's answers."""
    return NO_ASK if name == "NO_ASK" else (ROOT / "policies" / "lean.txt").read_text()


def haiku(system, prompt):
    r = subprocess.run(["claude", "-p", "--model", "haiku", "--system-prompt", system, "--tools", "",
                        "--disable-slash-commands", "--strict-mcp-config", "--setting-sources", "",
                        "--no-session-persistence", "--settings", '{"alwaysThinkingEnabled":false}',
                        "--output-format", "json", "--", prompt],
                       capture_output=True, text=True, stdin=subprocess.DEVNULL, cwd=tempfile.gettempdir())
    d = json.loads(r.stdout)
    u = d["usage"]
    return d["result"], u["input_tokens"] + u["cache_creation_input_tokens"] + u["cache_read_input_tokens"], u["output_tokens"]


_overhead = None


def overhead():
    """The CLI's fixed per-call context (identity block), measured with a near-empty call. Reported only."""
    global _overhead
    if _overhead is None:
        _overhead = statistics.median(haiku("OK.", "x")[1] for _ in range(3)) - 4
    return _overhead


def parse(reply):
    t = reply.strip()
    if t.startswith("UNCHANGED"):
        return "unchanged", None
    m = re.match(r"ASK:[ \t]*\n([\s\S]+)$", t)
    if m:
        qs = [re.sub(r"^\s*(?:[-*•]|\d+[.)])\s*", "", l).strip() for l in m.group(1).splitlines()]
        return "ask", [q for q in qs if q][:3]
    m = re.match(r"PROMPT:[ \t]*\n([\s\S]*?)\n\s*ADDED:", t)
    return ("rewrite", m.group(1).strip()) if m and m.group(1).strip() else ("malformed", None)


def is_clear(prompt):
    """The plugin's own local check (hooks/classify.ts), run by node."""
    js = f"import {{ isClearEnough }} from {json.dumps(str(ROOT.parent / 'plugins/prompt-forge/hooks/classify.ts'))}\nconsole.log(isClearEnough({json.dumps(prompt)}))"
    return subprocess.run(["node", "--input-type=module", "-e", js], capture_output=True, text=True, check=True).stdout.strip() == "true"


def policy_text(arm):
    """The forge's system prompt for an arm: "forge" is the plugin's own, "forge-<p>" bench/policies/<p>.txt."""
    return forge_text("SYSTEM") if arm == "forge" else (ROOT / "policies" / f"{arm[6:]}.txt").read_text()


def forge(task, system=None):
    """Runs the forge like the plugin does. Returns what gets sent, the route and the forge tokens."""
    system = system or forge_text("SYSTEM")
    calls = []
    words = len(task["prompt"].split())
    if words < 5:
        return dict(sent=task["prompt"], route="skip", calls=calls)
    reply, tin, tout = haiku(system, f"<prompt>\n{task['prompt']}\n</prompt>")
    calls.append(dict(input=tin, output=tout))
    kind, val = parse(reply)
    if kind == "rewrite":
        return dict(sent=val, route="rewrite", calls=calls)
    if kind != "ask":
        return dict(sent=task["prompt"], route=kind, calls=calls)
    answers = "\n".join(f"Q: {q}" for q in val) + f"\nA: {task['answer']}"
    reply, tin, tout = haiku(system + forge_text("NO_ASK"),
                             f"<prompt>\n{task['prompt']}\n</prompt>\n\n<answers>\n{answers}\n</answers>")
    calls.append(dict(input=tin, output=tout))
    kind2, val2 = parse(reply)
    sent = val2 if kind2 == "rewrite" else f"{task['prompt']}\n\n{task['answer']}"
    return dict(sent=sent, route="ask+answer", questions=val, calls=calls)


# ── the main run: Claude Code on a fresh copy of the fixture ────────────────

ALLOWED = ["Read", "Edit", "Write", "Grep", "Glob", "Bash(npm test*)", "Bash(npm run*)", "Bash(node *)",
           "Bash(ls*)", "Bash(cat *)", "Bash(grep *)", "Bash(git diff*)", "Bash(git status*)"]


def claude(prompt, cwd, session=None, model=None):
    cmd = ["claude", "-p", "--output-format", "json", "--permission-mode", "acceptEdits",
           "--max-budget-usd", "2", "--allowedTools", *ALLOWED]
    if model:
        cmd += ["--model", model]
    if session:
        cmd += ["--resume", session]
    r = subprocess.run(cmd + ["--", prompt], cwd=cwd, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=900)
    return json.loads(r.stdout)


def asked_back(d, cwd):
    """Claude stopped to ask instead of working: nothing changed and the reply asks something."""
    changed = subprocess.run(["git", "status", "--porcelain"], cwd=cwd, capture_output=True, text=True).stdout.strip()
    tail = (d.get("result") or "")[-400:].lower()
    return not changed and ("?" in tail or re.search(r"\b(confirm|which (one|name)|let me know|your call|go ahead)\b", tail) is not None)


def tally(runs):
    t = dict(input=0, cache_read=0, cache_write=0, output=0, cost=0.0, turns=0, models=set())
    for d in runs:
        t["cost"] += d.get("total_cost_usd", 0)
        t["turns"] += d.get("num_turns", 0)
        for model, mu in (d.get("modelUsage") or {}).items():
            t["models"].add(model)
            t["input"] += mu.get("inputTokens", 0)
            t["cache_read"] += mu.get("cacheReadInputTokens", 0)
            t["cache_write"] += mu.get("cacheCreationInputTokens", 0)
            t["output"] += mu.get("outputTokens", 0)
    t["models"] = sorted(t["models"])
    return t


def run_one(task, arm, rep):
    cwd = Path(tempfile.mkdtemp(prefix=f"pf-{task['id']}-{arm}-{rep}-"))
    shutil.copytree(FIXTURE, cwd, dirs_exist_ok=True)
    subprocess.run("git init -q && git add -A && git -c user.email=b@b -c user.name=bench commit -qm fixture",
                   shell=True, cwd=cwd, check=True)
    started = time.time()
    # "route-<policy>": the forge plus model routing, a clear prompt on a fresh context goes to Sonnet
    routed = arm.startswith("route") and is_clear(task["prompt"])
    suffix = arm.split("-", 1)[1] if arm.startswith("route") else ""
    policy = ("none" if suffix == "none" else "forge-" + suffix) if arm.startswith("route") else arm
    if routed:
        f = dict(sent=task["prompt"], route="sonnet (local check)", calls=[])
    else:
        f = forge(task, policy_text(policy)) if policy.startswith("forge") else dict(sent=task["prompt"], route="none", calls=[])
    model = "sonnet" if routed else None
    runs = [claude(f["sent"], cwd, model=model)]
    replies = 0
    while asked_back(runs[-1], cwd) and replies < 2:
        replies += 1
        runs.append(claude(task["answer"], cwd, session=runs[-1]["session_id"], model=model))
    t = tally(runs)
    forge_in = sum(c["input"] for c in f["calls"])
    forge_out = sum(c["output"] for c in f["calls"])
    res = dict(task=task["id"], kind=task["kind"], arm=arm, rep=rep, route=f["route"], sent=f["sent"],
               questions=f.get("questions"), claude_calls=len(runs), clarifications=replies,
               claude=t, forge=dict(calls=len(f["calls"]), input=forge_in, output=forge_out,
                                    cost=forge_in * HAIKU_IN + forge_out * HAIKU_OUT),
               problems=check(task, cwd, notes := []), notes=notes, seconds=round(time.time() - started))
    res["total_cost"] = res["claude"]["cost"] + res["forge"]["cost"]
    shutil.rmtree(cwd, ignore_errors=True)
    print(f"{task['id']} {arm:13} rep{rep} route={f['route']:10} ${res['total_cost']:.4f} "
          f"calls={len(runs)} problems={res['problems']}", flush=True)
    return res


CONTEXT = "\n\n".join([  # ~3,000 characters, the most the plugin sends (6 messages)
    "user: the orders page takes forever to load in production, customers are complaining",
    "assistant: I looked at src/orders.js. ordersPageRows clones the full product list for every order, "
    "searches it with Array.find for each line, and sorts the whole result inside the loop. With 3,000 "
    "orders that is millions of operations. " * 3,
    "user: ok and the api is used by the mobile app so we cant change that",
    "assistant: Understood: src/api.js stays as it is. The fix belongs entirely in src/orders.js: build a "
    "Map of products by id once, drop the deep clone, and sort once after the loop. " * 4,
    "user: also the admin dashboard is fine, leave it",
    "assistant: Noted, src/admin/dashboard.js will not be touched. Want me to go ahead with the orders page?",
])


def strategies(reps=3):
    """Forge cost per route: what each strategy itself costs, before Claude runs."""
    cases = [
        ("short reply", "under 5 words: no forge call", "yes push them", None),
        ("clear prompt", "C2: file, change and check all named", TASKS[5]["prompt"], None),
        ("vague prompt", "V2: no file, no expected result", TASKS[1]["prompt"], None),
        ("ambiguous prompt", "A1: \"it\" with nothing to resolve it", TASKS[3]["prompt"], None),
        ("follow-up + context", "short follow-up, 6 messages (~3k chars) of conversation", "ok do it, the fast way", CONTEXT),
    ]
    out = []
    for key, desc, prompt, ctx in cases:
        runs = []
        for _ in range(reps):
            if len(prompt.split()) < 5 and ctx is None:
                runs.append(dict(route="skip", input=0, output=0, calls=0))
                continue
            t = dict(id="S", prompt=prompt, answer="I mean the getUser function in src/users.js. Call it findUserById.")
            if ctx:
                reply, tin, tout = haiku(forge_text("SYSTEM"), f"<recent_conversation>\n{ctx}\n</recent_conversation>\n\n<prompt>\n{prompt}\n</prompt>")
                runs.append(dict(route=parse(reply)[0], input=tin, output=tout, calls=1))
            else:
                f = forge(t)
                runs.append(dict(route=f["route"], input=sum(c["input"] for c in f["calls"]),
                                 output=sum(c["output"] for c in f["calls"]), calls=len(f["calls"])))
        mi, mo = statistics.mean(r["input"] for r in runs), statistics.mean(r["output"] for r in runs)
        out.append(dict(strategy=key, desc=desc, prompt=prompt, routes=sorted({r["route"] for r in runs}),
                        calls=statistics.mean(r["calls"] for r in runs), input=mi, output=mo,
                        cost=mi * HAIKU_IN + mo * HAIKU_OUT, runs=runs))
        print(key, out[-1]["routes"], round(mi), round(mo), f"${out[-1]['cost']:.5f}", flush=True)
    (ROOT / "strategies.json").write_text(json.dumps(out, indent=1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["forge", "run", "report", "strategies"])
    ap.add_argument("--reps", type=int, default=2)
    ap.add_argument("--only", default="")
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--arms", default="baseline,forge", help="e.g. forge-ask,forge-minimal (bench/policies)")
    ap.add_argument("--out", default="results.json")
    a = ap.parse_args()
    tasks = [t for t in TASKS if not a.only or t["id"] in a.only.split(",")]
    if a.cmd == "forge":
        for t in tasks:
            f = forge(t)
            print(json.dumps(dict(task=t["id"], **f), indent=1))
        print("harness overhead per call:", overhead())
        return
    if a.cmd == "run":
        overhead()
        jobs = [(t, arm, r) for r in range(1, a.reps + 1) for t in tasks for arm in a.arms.split(",")]
        with ThreadPoolExecutor(a.jobs) as ex:
            results = list(ex.map(lambda j: run_one(*j), jobs))
        out = ROOT / a.out
        ids = {t["id"] for t in tasks}
        old = json.loads(out.read_text())["results"] if out.exists() and a.only else []
        arms = set(a.arms.split(","))
        results = [r for r in old if r["task"] not in ids or r["arm"] not in arms] + results
        out.write_text(json.dumps(dict(overhead=overhead(), results=results), indent=1))
        print("wrote", out)
        return
    if a.cmd == "strategies":
        return strategies()
    from report import report
    report(ROOT)


if __name__ == "__main__":
    sys.exit(main())
