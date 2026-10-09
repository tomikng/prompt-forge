#!/usr/bin/env python3
"""Session benchmark: one long Claude Code session working through all six prompts in order.

Like a real feature branch: every prompt lands on the same session (`--resume`), so Claude's
context grows step by step, and in the forge arm Haiku sees the recent conversation, exactly
as the plugin's recentContext() hands it over (last 6 messages, ~3,000 characters).

Per step it records what the local check decided (the plugin's own hooks/classify.ts, run by
node), what the forge did, the dollars and tokens, and whether the step's check passes on the
working tree right after it.

    python3 bench/session.py run --reps 3    # → bench/session-results.json
"""
import argparse, json, shutil, subprocess, sys, tempfile, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import bench
from bench import HAIKU_IN, HAIKU_OUT, ROOT, TASKS, check, forge_text, haiku, parse, tally

TOPIC = (ROOT / "policies" / "topic.txt").read_text()
CLASSIFY = ROOT.parent / "plugins/prompt-forge/hooks/classify.ts"
BY_ID = {t["id"]: t for t in TASKS}

# A feature branch's worth of work, in the order a person might ask for it. A1 comes right after
# C1, so "it" now has a plausible referent in the conversation: the function just renamed.
STEPS = ["V1", "V2", "C2", "V3", "C1", "A1"]
SESSION_ANSWER = {"A1": "I mean fetchUser in src/users.js, the function we just renamed. Call it findUserById."}
NEEDS_FORGE = {"V1": True, "V2": True, "V3": True, "A1": True, "C1": False, "C2": False}  # ground truth for the check


def classify(prompts):
    """The plugin's local check on each prompt, plus its cost in time (mean of 20,000 calls)."""
    js = f"""
import {{ isClearEnough }} from {json.dumps(str(CLASSIFY))}
const prompts = {json.dumps(prompts)}
const out = prompts.map(p => {{
  const t = performance.now(); for (let i = 0; i < 20000; i++) isClearEnough(p)
  return {{ clear: isClearEnough(p), micros: (performance.now() - t) * 1000 / 20000 }}
}})
console.log(JSON.stringify(out))
"""
    r = subprocess.run(["node", "--input-type=module", "-e", js], capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def recent_context(msgs, budget=3000):
    """Port of the plugin's recentContext(): newest 6 text messages within the budget."""
    out, used = [], 0
    for role, text in reversed(msgs):
        t = text.strip()
        if not t:
            continue
        line = f"{role}: {t if len(t) <= 800 else t[:799] + '…'}"
        if used + len(line) > budget or len(out) >= 6:
            break
        out.insert(0, line)
        used += len(line)
    return "\n\n".join(out)


def forge_in_session(prompt, answer, convo, system):
    calls = []
    ctx = recent_context(convo)
    head = f"<recent_conversation>\n{ctx}\n</recent_conversation>\n\n" if ctx else ""
    reply, tin, tout = haiku(system, f"{head}<prompt>\n{prompt}\n</prompt>")
    calls.append(dict(input=tin, output=tout))
    kind, val = parse(reply)
    if kind == "rewrite":
        return dict(sent=val, route="rewrite", calls=calls)
    if kind != "ask":
        return dict(sent=prompt, route=kind, calls=calls)
    answers = "\n".join(f"Q: {q}" for q in val) + f"\nA: {answer}"
    reply, tin, tout = haiku(system + forge_text("NO_ASK"),
                             f"{head}<prompt>\n{prompt}\n</prompt>\n\n<answers>\n{answers}\n</answers>")
    calls.append(dict(input=tin, output=tout))
    kind2, val2 = parse(reply)
    return dict(sent=val2 if kind2 == "rewrite" else f"{prompt}\n\n{answer}", route="ask+answer", questions=val, calls=calls)


def session_check(tid, cwd):
    problems = check(BY_ID[tid], cwd)
    if tid == "A1":  # in the session the target is fetchUser (renamed by C1), not getUser
        src = "\n".join(p.read_text() for p in (cwd / "src").rglob("*.js"))
        problems = [p for p in problems if not p.startswith("not renamed")]
        if "findUserById" not in src or "fetchUser" in src:
            problems.append("not renamed to findUserById")
    return problems


def run_session(arm, rep, verdicts):
    cwd = Path(tempfile.mkdtemp(prefix=f"pf-session-{arm}-{rep}-"))
    shutil.copytree(bench.FIXTURE, cwd, dirs_exist_ok=True)
    subprocess.run("git init -q && git add -A && git -c user.email=b@b -c user.name=bench commit -qm fixture",
                   shell=True, cwd=cwd, check=True)
    session, convo, steps = None, [], []
    for tid in STEPS:
        task = BY_ID[tid]
        answer = SESSION_ANSWER.get(tid, task["answer"])
        local = verdicts[tid]
        started = time.time()
        fresh = False
        if arm.startswith("guard") and convo:
            # the spend guard: a new, unrelated task starts a fresh session, like /clear
            verdict, tin, tout = haiku(TOPIC, f"<recent_conversation>\n{recent_context(convo)}\n</recent_conversation>\n\n<prompt>\n{task['prompt']}\n</prompt>")
            topic_cost = tin * HAIKU_IN + tout * HAIKU_OUT
            fresh = verdict.strip().upper().startswith("NEW")
            if fresh:
                session, convo = None, []
        else:
            topic_cost = 0.0
        # "<guard arm>-none": no rewriting at all, the prompt goes out as typed
        suffix = arm.split("-", 1)[1] if arm.startswith("guard") else ""
        policy_arm = ("none" if suffix == "none" else "forge-" + suffix) if arm.startswith("guard") else arm
        # model routing ("guardroute-"): a clear prompt on a fresh context runs on Sonnet
        routed = arm.startswith("guardroute") and local["clear"] and not convo
        if policy_arm.startswith("forge") and not local["clear"]:
            f = forge_in_session(task["prompt"], answer, convo, bench.policy_text(policy_arm))
        else:
            f = dict(sent=task["prompt"], route="skip (local check)" if policy_arm.startswith("forge") else "none", calls=[])
        # commit what's there, so "asked back" means this step changed nothing
        subprocess.run("git add -A && git -c user.email=b@b -c user.name=bench commit -qm step --allow-empty",
                       shell=True, cwd=cwd, check=True)
        model = "sonnet" if routed else None
        if routed:
            f["route"] = "sonnet (local check)"
        runs = [bench.claude(f["sent"], cwd, session=session, model=model)]
        session = runs[-1].get("session_id", session)
        convo += [("user", f["sent"]), ("assistant", runs[-1].get("result") or "")]
        replies = 0
        while bench.asked_back(runs[-1], cwd) and replies < 2:
            replies += 1
            runs.append(bench.claude(answer, cwd, session=session, model=model))
            convo += [("user", answer), ("assistant", runs[-1].get("result") or "")]
        t = tally(runs)
        fin, fout = sum(c["input"] for c in f["calls"]), sum(c["output"] for c in f["calls"])
        step = dict(step=len(steps) + 1, task=tid, local_clear=local["clear"], route=f["route"], sent=f["sent"],
                    questions=f.get("questions"), clarifications=replies, claude=t,
                    forge=dict(calls=len(f["calls"]), input=fin, output=fout, cost=fin * HAIKU_IN + fout * HAIKU_OUT),
                    problems=session_check(tid, cwd), seconds=round(time.time() - started))
        step["fresh"], step["topic_cost"], step["model"] = fresh, topic_cost, model or "default"
        step["total_cost"] = t["cost"] + step["forge"]["cost"] + topic_cost
        steps.append(step)
        print(f"{arm:13} rep{rep} step{step['step']} {tid} {'FRESH ' if fresh else ''}route={f['route']:18} ${step['total_cost']:.4f} "
              f"problems={step['problems']}", flush=True)
    shutil.rmtree(cwd, ignore_errors=True)
    return dict(arm=arm, rep=rep, steps=steps, total_cost=sum(s["total_cost"] for s in steps))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["run", "classify"])
    ap.add_argument("--reps", type=int, default=3)
    ap.add_argument("--arms", default="baseline,forge")
    ap.add_argument("--out", default="session-results.json")
    a = ap.parse_args()
    v = classify([BY_ID[t]["prompt"] for t in STEPS])
    verdicts = dict(zip(STEPS, v))
    if a.cmd == "classify":
        for tid in STEPS:
            print(tid, verdicts[tid], "needs forge" if NEEDS_FORGE[tid] else "clear")
        return
    jobs = [(arm, r) for r in range(1, a.reps + 1) for arm in a.arms.split(",")]
    with ThreadPoolExecutor(len(jobs)) as ex:
        sessions = list(ex.map(lambda j: run_session(*j, verdicts), jobs))
    (ROOT / a.out).write_text(json.dumps(
        dict(steps=STEPS, verdicts=verdicts, needs_forge=NEEDS_FORGE, sessions=sessions), indent=1))
    print("wrote", ROOT / a.out)


if __name__ == "__main__":
    sys.exit(main())
