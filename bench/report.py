"""bench/results.json → bench/RESULTS.md and assets/bench-net.svg."""
import json, statistics
from html import escape
from pathlib import Path

SAVE, COST = "#3987e5", "#e66767"  # dataviz diverging pair, dark steps, validated on #1e1e2e
BG, FG, DIM, LINE, ZERO = "#1e1e2e", "#cdd6f4", "#9399b2", "#313244", "#585b70"
SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
KIND_LABEL = {"vague": "vague", "ambiguous": "ambiguous", "clear": "already clear"}


def tokens_in(c):
    return c["input"] + c["cache_read"] + c["cache_write"]


def summarize(results):
    from bench import TASKS
    rows = []
    for t in TASKS:
        arms = {}
        for arm in ("baseline", "forge"):
            rs = [r for r in results if r["task"] == t["id"] and r["arm"] == arm]
            if not rs:
                continue
            cost = [r["total_cost"] for r in rs]
            arms[arm] = dict(
                n=len(rs), cost=statistics.mean(cost), lo=min(cost), hi=max(cost),
                claude_in=statistics.mean(tokens_in(r["claude"]) for r in rs),
                claude_out=statistics.mean(r["claude"]["output"] for r in rs),
                forge_in=statistics.mean(r["forge"]["input"] for r in rs),
                forge_out=statistics.mean(r["forge"]["output"] for r in rs),
                forge_cost=statistics.mean(r["forge"]["cost"] for r in rs),
                turns=statistics.mean(r["claude"]["turns"] for r in rs),
                calls=statistics.mean(r["claude_calls"] for r in rs),
                clar=sum(r["clarifications"] for r in rs),
                passed=sum(1 for r in rs if not r["problems"]),
                spent=sum(cost),
                problems=sorted({p for r in rs for p in r["problems"]}),
                routes=sorted({r["route"] for r in rs}),
                models=sorted({m for r in rs for m in r["claude"]["models"]}),
            )
        if len(arms) == 2:
            b, f = arms["baseline"], arms["forge"]
            rows.append(dict(task=t, b=b, f=f, delta=f["cost"] - b["cost"], pct=(f["cost"] - b["cost"]) / b["cost"] * 100))
    return rows


def chart(rows, path: Path):
    W, top, rowh = 1100, 132, 54
    H = top + rowh * len(rows) + 64
    lx, rx = 400, 1000  # plot area
    zero = (lx + rx) / 2
    span = max(0.01, max(abs(r["delta"]) for r in rows) * 1.2)
    sx = lambda p: zero + p / span * (rx - lx) / 2
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
         f'aria-label="Net cost change from using Prompt Forge, per benchmark task">',
         f'<title>Net cost change from using Prompt Forge, per task</title>',
         f'<rect width="{W}" height="{H}" rx="16" fill="{BG}"/>',
         f'<rect x=".5" y=".5" width="{W - 1}" height="{H - 1}" rx="16" fill="none" stroke="{LINE}"/>',
         f'<text x="36" y="46" font-family="{SANS}" font-size="20" font-weight="700" fill="{FG}">Dollars saved or added by the forge, per task</text>',
         f'<text x="36" y="70" font-family="{SANS}" font-size="13" fill="{DIM}">Total $ with the forge (Haiku + Claude) minus $ with Claude alone, mean of {rows[0]["b"]["n"]} runs each. Left of zero: the forge saved money.</text>']
    # legend
    for i, (col, lab) in enumerate(((SAVE, "forge saved"), (COST, "forge cost more"))):
        x = 36 + i * 150
        o.append(f'<rect x="{x}" y="86" width="12" height="12" rx="3" fill="{col}"/>'
                 f'<text x="{x + 18}" y="97" font-family="{SANS}" font-size="12.5" fill="{FG}">{lab}</text>')
    # gridlines at nice percentages
    step = next(st for st in (0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0) if span / st <= 5)
    n = int(span // step)
    for k in range(-n, n + 1):
        p = k * step
        x = sx(p)
        lab = "$0" if k == 0 else f'{"−" if p < 0 else "+"}${abs(p):.3f}'.rstrip("0").rstrip(".")
        o.append(f'<line x1="{x:.1f}" y1="{top - 8}" x2="{x:.1f}" y2="{top + rowh * len(rows)}" stroke="{ZERO if k == 0 else LINE}" stroke-width="{1.5 if k == 0 else 1}"/>')
        o.append(f'<text x="{x:.1f}" y="{top + rowh * len(rows) + 20}" font-family="{SANS}" font-size="11.5" fill="{DIM}" text-anchor="middle">{lab}</text>')
    # run-to-run noise: C1 sent the very same prompt in both arms, so its gap is pure variance
    c1 = next((r for r in rows if r["task"]["id"] == "C1" and r["f"]["routes"] == ["unchanged"]), None)
    if c1:
        nz = abs(c1["delta"])
        o.append(f'<rect x="{sx(-nz):.1f}" y="{top - 8}" width="{sx(nz) - sx(-nz):.1f}" height="{rowh * len(rows) + 8}" fill="{FG}" opacity="0.07"/>')
        o.append(f'<text x="{zero:.1f}" y="{top - 14}" font-family="{SANS}" font-size="11.5" fill="{DIM}" text-anchor="middle">noise ±${nz:.3f}</text>')
    for i, r in enumerate(rows):
        y = top + i * rowh
        cy = y + rowh / 2
        t = r["task"]
        prompt = t["prompt"] if len(t["prompt"]) <= 40 else t["prompt"][:39] + "…"
        o.append(f'<text x="36" y="{cy - 4}" font-family="{SANS}" font-size="13.5" font-weight="700" fill="{FG}">{t["id"]} · {KIND_LABEL[t["kind"]]}</text>')
        o.append(f'<text x="36" y="{cy + 14}" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="11.5" fill="{DIM}">{escape(prompt)}</text>')
        x0, x1 = sorted((zero, sx(r["delta"])))
        col = SAVE if r["pct"] < 0 else COST
        w = max(x1 - x0, 2)
        # 4px rounded data end, square at the baseline
        if r["pct"] < 0:
            d = f"M{zero},{cy - 9} L{x0 + 4},{cy - 9} Q{x0},{cy - 9} {x0},{cy - 5} L{x0},{cy + 5} Q{x0},{cy + 9} {x0 + 4},{cy + 9} L{zero},{cy + 9} Z" if w > 4 else ""
        else:
            d = f"M{zero},{cy - 9} L{x1 - 4},{cy - 9} Q{x1},{cy - 9} {x1},{cy - 5} L{x1},{cy + 5} Q{x1},{cy + 9} {x1 - 4},{cy + 9} L{zero},{cy + 9} Z" if w > 4 else ""
        o.append(f'<path d="{d}" fill="{col}"/>' if d else f'<rect x="{x0}" y="{cy - 9}" width="{w}" height="18" fill="{col}"/>')
        sign = "−" if r["delta"] < 0 else "+"
        label = f'{sign}${abs(r["delta"]):.3f} per task  ({sign}{abs(r["pct"]):.0f}%)'
        inside = w > 200
        if inside:
            lxp, anchor, ink = (x0 + 10, "start", "#11111b") if r["pct"] < 0 else (x1 - 10, "end", "#11111b")
        else:
            lxp, anchor, ink = (x0 - 8, "end", FG) if r["pct"] < 0 else (x1 + 8, "start", FG)
        o.append(f'<text x="{lxp:.1f}" y="{cy + 4.5}" font-family="{SANS}" font-size="12.5" font-weight="700" fill="{ink}" '
                 f'text-anchor="{anchor}">{label}</text>')
        q = f'right {r["b"]["passed"]}/{r["b"]["n"]} → {r["f"]["passed"]}/{r["f"]["n"]}'
        o.append(f'<text x="{W - 36}" y="{cy + 4.5}" font-family="{SANS}" font-size="12" fill="{DIM}" text-anchor="end">{q}</text>')
    o.append(f'<text x="36" y="{H - 18}" font-family="{SANS}" font-size="12" fill="{DIM}">"right a → b": runs that passed the task\'s automatic check, without → with the forge. Source: bench/results.json</text>')
    o.append("</svg>")
    path.write_text("\n".join(o))


def per(a):
    return f"${a['spent'] / a['passed']:.3f}" if a["passed"] else "no correct run"


def report(root: Path):
    data = json.loads((root / "results.json").read_text())
    rows = summarize(data["results"])
    chart(rows, root.parent / "assets" / "bench-net.svg")
    md = ["# Benchmark results", "",
          f"Generated by `bench/report.py` from `bench/results.json` ({len(data['results'])} runs). "
          f"Claude model: {', '.join(sorted({m for r in rows for m in r['b']['models'] + r['f']['models']}))}. "
          "Forge model: claude-haiku-4-5.", "",
          "## Per task (mean per run)", "",
          "| Task | Kind | $ without | $ with | Net $ | Net % | $ per correct result (without → with) | Right without → with | Route | Claude in / out tokens (without → with) | Forge in / out tokens |",
          "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
    for r in rows:
        b, f = r["b"], r["f"]
        md.append(f"| {r['task']['id']} | {KIND_LABEL[r['task']['kind']]} | ${b['cost']:.4f} | ${f['cost']:.4f} | "
                  f"{'−' if r['delta'] < 0 else '+'}${abs(r['delta']):.4f} | {r['pct']:+.1f}% | {per(b)} → {per(f)} | {b['passed']}/{b['n']} → {f['passed']}/{f['n']} | "
                  f"{', '.join(f['routes'])} | {b['claude_in']:,.0f} / {b['claude_out']:,.0f} → {f['claude_in']:,.0f} / {f['claude_out']:,.0f} | "
                  f"{f['forge_in']:,.0f} / {f['forge_out']:,.0f} |")
    sp = root / "strategies.json"
    if sp.exists():
        md += ["", "## Forge cost by prompt type (forge calls only, mean of 3)", "",
               "| Prompt type | Example | Routes seen | Haiku calls | Input tokens | Output tokens | Cost |",
               "| --- | --- | --- | --- | --- | --- | --- |"]
        for x in json.loads(sp.read_text()):
            md.append(f"| {x['strategy']} | {x['desc']} | {', '.join(x['routes'])} | {x['calls']:.1f} | {x['input']:,.0f} | "
                      f"{x['output']:,.0f} | ${x['cost']:.5f} |")
    md += ["", "## Every run", "", "| Task | Arm | Rep | Route | Claude calls | Turns | Cost | Problems |", "| --- | --- | --- | --- | --- | --- | --- | --- |"]
    for x in sorted(data["results"], key=lambda x: (x["task"], x["arm"], x["rep"])):
        md.append(f"| {x['task']} | {x['arm']} | {x['rep']} | {x['route']} | {x['claude_calls']} | {x['claude']['turns']} | "
                  f"${x['total_cost']:.4f} | {'; '.join(x['problems']) or '—'} |")
    md += ["", "## What the forge sent", ""]
    seen = set()
    for x in data["results"]:
        if x["arm"] == "forge" and x["task"] not in seen:
            seen.add(x["task"])
            md += [f"**{x['task']}** ({x['route']})", "", "```text", x["sent"], "```", ""]
            if x.get("questions"):
                md += ["Questions it asked:", ""] + [f"- {q}" for q in x["questions"]] + [""]
    (root / "RESULTS.md").write_text("\n".join(md) + "\n")
    print("\n".join(md[:14 + len(rows)]))
