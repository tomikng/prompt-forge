#!/usr/bin/env python3
"""Ask-policy benchmark: how often each forge policy stops you with a question.

Two policies, kept as text in bench/policies/:
  ask      0.3.2: asks whenever Haiku can't resolve a reference from the last few messages
  minimal  asks only for a value only you can decide (a new name, a number, an option);
           leaves "it"/"that" in your words for the agent, which has the whole conversation

`routing` sends a set of prompts, each labelled with whether a question is really needed,
through Haiku under each policy, with and without recent conversation (Haiku only, cents):
  needless ask   asked though the agent could work it out (a touch you didn't need)
  missed ask     didn't ask though only you know the answer
  invented       the rewrite names a file or identifier that is in neither the prompt nor
                 the conversation (a guess the agent may follow)

    python3 bench/policy.py routing --reps 3   # → bench/policy-routing.json
"""
import argparse, json, re, statistics, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from bench import HAIKU_IN, HAIKU_OUT, ROOT, haiku, parse

POLICIES = {p.stem: p.read_text() for p in sorted((ROOT / "policies").glob("*.txt"))}

# need: "no" the agent can act on it (maybe after reading code or the conversation),
#       "yes" only the user knows a value the work depends on.
PROMPTS = [
    ("V1", "no", "can u make the orders page faster its really slow, dont touch the api"),
    ("V2", "no", "the cart total is wrong when ppl buy more than one of something fix it"),
    ("V3", "no", "signup lets ppl in with junk emails, fix that"),
    ("A1", "no", "rename it to something clearer, everywhere it's used"),
    ("R1", "no", "fix the bug we talked about and add a test for it"),
    ("R2", "no", "do the same thing for the profile page"),
    ("R3", "no", "that test is flaky again, can you look at why"),
    ("R4", "no", "clean up the legacy folder, a lot of it is unused i think"),
    ("R5", "no", "make it work like the other one, but keep the old behaviour behind a flag"),
    ("Q1", "no", "So this MR solves nothing since everything was done?"),
    ("Q2", "no", "why did you open that then, what does it actually change"),
    ("U1", "yes", "set the api rate limit to whatever we agreed with the client"),
    ("U2", "yes", "change the session timeout to the new value from the security review"),
    ("U3", "yes", "bump the free tier limit to the number marketing gave us"),
    ("U4", "yes", "use the exact hex color from our brand guide for the primary buttons"),
]

CONVO = "\n\n".join([
    "user: users keep getting duplicate rows on the orders page after a refresh",
    "assistant: The duplicates come from ordersPageRows in src/orders.js: it appends to a module-level "
    "cache on every call instead of rebuilding it. I can fix that and add a regression test in "
    "test/orders.test.js.",
    "user: ok. also test/cart.test.js failed twice in CI today",
    "assistant: That one depends on Date.now() for a discount window, so it is timing-sensitive.",
    "user: and getUser in src/users.js is a terrible name, it actually looks users up by id",
    "assistant: Agreed, it reads as if it returned the current user. I'll wait for what you want next.",
])

PROMPT_TEXT = {pid: text for pid, _, text in PROMPTS}

ID = re.compile(r"[\w.-]+/[\w./-]+|\b[\w-]+\.(?:js|ts|json|md)\b|\b[a-z]+[A-Z]\w*\b")


def invented(rewrite, prompt, ctx):
    known = f"{prompt}\n{ctx}"
    return sorted({m.rstrip(".") for m in ID.findall(rewrite or "") if m.rstrip(".") not in known})


def one(policy, pid, need, prompt, ctx_name, rep):
    ctx = CONVO if ctx_name == "conversation" else ""
    head = f"<recent_conversation>\n{ctx}\n</recent_conversation>\n\n" if ctx else ""
    reply, tin, tout = haiku(POLICIES[policy], f"{head}<prompt>\n{prompt}\n</prompt>")
    kind, val = parse(reply)
    r = dict(policy=policy, prompt=pid, need=need, context=ctx_name, rep=rep, route=kind,
             questions=val if kind == "ask" else None, rewrite=val if kind == "rewrite" else None,
             invented=invented(val, prompt, ctx) if kind == "rewrite" else [],
             cost=tin * HAIKU_IN + tout * HAIKU_OUT)
    print(f"{policy:8} {ctx_name:12} {pid} rep{rep} {kind:9} {r['invented'] or ''}", flush=True)
    return r


def summary(rows):
    out = []
    for policy in POLICIES:
        for ctx in ("none", "conversation"):
            rs = [r for r in rows if r["policy"] == policy and r["context"] == ctx]
            no = [r for r in rs if r["need"] == "no"]
            yes = [r for r in rs if r["need"] == "yes"]
            rw = [r for r in rs if r["route"] == "rewrite"]
            out.append(dict(policy=policy, context=ctx,
                            needless_ask=sum(r["route"] == "ask" for r in no), of_no=len(no),
                            missed_ask=sum(r["route"] != "ask" for r in yes), of_yes=len(yes),
                            invented=sum(bool(r["invented"]) for r in rw), rewrites=len(rw),
                            growth=statistics.mean(len(r["rewrite"]) / len(PROMPT_TEXT[r["prompt"]]) for r in rw) if rw else 0,
                            cost=statistics.mean(r["cost"] for r in rs)))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["routing", "summary"])
    ap.add_argument("--reps", type=int, default=3)
    ap.add_argument("--jobs", type=int, default=8)
    a = ap.parse_args()
    path = ROOT / "policy-routing.json"
    if a.cmd == "routing":
        jobs = [(p, pid, need, text, ctx, rep) for p in POLICIES for (pid, need, text) in PROMPTS
                for ctx in ("none", "conversation") for rep in range(1, a.reps + 1)]
        with ThreadPoolExecutor(a.jobs) as ex:
            rows = list(ex.map(lambda j: one(*j), jobs))
        path.write_text(json.dumps(dict(rows=rows, summary=summary(rows)), indent=1))
    for s in json.loads(path.read_text())["summary"]:
        print(f"{s['policy']:8} {s['context']:12} needless asks {s['needless_ask']}/{s['of_no']}  "
              f"missed asks {s['missed_ask']}/{s['of_yes']}  invented names {s['invented']}/{s['rewrites']}  "
              f"rewrites {s['rewrites']}/{s['of_no'] + s['of_yes']} at {s.get('growth', 0):.1f}x length  "
              f"${s['cost']:.4f}/prompt")


if __name__ == "__main__":
    sys.exit(main())
