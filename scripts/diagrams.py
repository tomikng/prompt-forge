#!/usr/bin/env python3
"""Generates the animated README diagrams (assets/*.svg).

Plain SVG + SMIL, no dependencies: GitHub plays SMIL in <img>, and the files stay a few KB.
Every animation shares one looping clock per diagram: each element is active only inside its
[t0, t1] window, so scenes play in order and the whole diagram loops seamlessly.

    python3 scripts/diagrams.py        # writes assets/pipeline.svg, anatomy.svg, context.svg
"""
from pathlib import Path
from html import escape

OUT = Path(__file__).resolve().parent.parent / "assets"

BG, CARD, LINE, FG, DIM = "#1e1e2e", "#181825", "#45475a", "#cdd6f4", "#7f849c"
PINK, BLUE, GREEN, PEACH, MAUVE, GRAY, YELLOW = "#f5a6e6", "#89b4fa", "#a6e3a1", "#fab387", "#cba6f7", "#9399b2", "#f9e2af"
SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'DejaVu Sans Mono',monospace"
E = 0.0005  # smallest gap between key times


class Clock:
    """One looping timeline of `total` seconds."""

    def __init__(self, total: float):
        self.T = total

    def k(self, t: float) -> float:
        return min(max(t / self.T, 0.0), 1.0)

    def window(self, attr: str, t0: float, t1: float, on="1", off="0", fade=0.25) -> str:
        """Animate `attr` to `on` inside [t0, t1] (with short fades), `off` elsewhere."""
        a, b = self.k(t0), self.k(t0 + fade)
        c, d = self.k(t1 - fade), self.k(t1)
        ks = [0, max(a, E), max(b, a + E), max(c, b + E), max(d, c + 2 * E), 1]
        ks = [round(min(x, 1.0), 4) for x in ks]
        for i in range(1, len(ks)):  # keep times strictly increasing up to the end
            if ks[i] <= ks[i - 1]:
                ks[i] = round(ks[i - 1] + E, 4)
        ks[-1] = 1
        if ks[-2] >= 1:
            ks[-2] = 1 - E
        vals = [off, off, on, on, off, off]
        return (f'<animate attributeName="{attr}" dur="{self.T}s" repeatCount="indefinite" '
                f'values="{";".join(vals)}" keyTimes="{";".join(map(str, ks))}"/>')

    def windows(self, attr: str, spans, on="1", off="0", fade=0.2) -> str:
        """Like window(), for several [t0, t1] spans on one element."""
        pts = [(0.0, off)]
        for t0, t1 in spans:
            pts += [(self.k(t0), off), (self.k(t0 + fade), on), (self.k(t1 - fade), on), (self.k(t1), off)]
        pts.append((1.0, off))
        ks, vals, last = [], [], -1.0
        for t, v in pts:
            t = max(t, last + E) if ks else 0.0
            ks.append(round(min(t, 1.0), 4))
            vals.append(v)
            last = t
        ks[-1] = 1
        return (f'<animate attributeName="{attr}" dur="{self.T}s" repeatCount="indefinite" '
                f'values="{";".join(vals)}" keyTimes="{";".join(map(str, ks))}"/>')

    def move(self, path: str, t0: float, t1: float) -> str:
        a, b = round(self.k(t0), 4), round(self.k(t1), 4)
        return (f'<animateMotion dur="{self.T}s" repeatCount="indefinite" path="{path}" calcMode="linear" '
                f'keyPoints="0;0;1;1" keyTimes="0;{a};{b};1"/>')

    def draw(self, length: float, t0: float, t1: float, hold: float) -> str:
        """Stroke draw-in over [t0, t1], held until `hold`, then hidden."""
        a, b, c = self.k(t0), self.k(t1), self.k(hold)
        d = min(c + E * 4, 1 - E)
        return (f'<animate attributeName="stroke-dashoffset" dur="{self.T}s" repeatCount="indefinite" '
                f'values="{length};{length};0;0;{length};{length}" '
                f'keyTimes="0;{round(a, 4)};{round(b, 4)};{round(c, 4)};{round(d, 4)};1"/>')


def svg(w: int, h: int, title: str, body: str) -> str:
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-label="{escape(title)}">
<title>{escape(title)}</title>
<defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{LINE}"/></marker>
  <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="{w}" height="{h}" rx="16" fill="{BG}"/>
<rect x="0.5" y="0.5" width="{w - 1}" height="{h - 1}" rx="16" fill="none" stroke="#313244"/>
{body}
</svg>
'''


def text(x, y, s, size=14, fill=FG, weight=400, anchor="start", font=SANS, extra=""):
    return (f'<text x="{x}" y="{y}" font-family="{font}" font-size="{size}" fill="{fill}" '
            f'font-weight="{weight}" text-anchor="{anchor}" {extra}>{escape(s)}</text>')


def node(clk: Clock, x, y, w, h, title, sub, color, spans):
    cx = x + w / 2
    out = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{CARD}" stroke="{LINE}" stroke-width="1.5"/>']
    out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{color}" fill-opacity="0.12" '
               f'stroke="{color}" stroke-width="2.5" opacity="0" filter="url(#glow)">{clk.windows("opacity", spans)}</rect>')
    out.append(text(cx, y + h / 2 - 3, title, 15, FG, 700, "middle"))
    out.append(text(cx, y + h / 2 + 16, sub, 11.5, DIM, 400, "middle"))
    return "\n".join(out)


def pill(clk: Clock, path, t0, t1, label, color, mono=True, width=None):
    w = width or (len(label) * 7.4 + 26)
    return (f'<g opacity="0">{clk.window("opacity", t0, t1, fade=0.15)}{clk.move(path, t0, t1)}'
            f'<rect x="{-w / 2}" y="-13" width="{w}" height="26" rx="13" fill="{color}"/>'
            f'<text x="0" y="4.5" font-family="{MONO if mono else SANS}" font-size="12.5" fill="#11111b" '
            f'font-weight="700" text-anchor="middle" textLength="{w - 22}" lengthAdjust="spacingAndGlyphs">{escape(label)}</text></g>')


def edge(d, dashed=False):
    dash = ' stroke-dasharray="5 5"' if dashed else ""
    return f'<path d="{d}" fill="none" stroke="{LINE}" stroke-width="2"{dash} marker-end="url(#arrow)"/>'


def fading(clk: Clock, t0, t1, inner, fade=0.3):
    return f'<g opacity="0">{clk.window("opacity", t0, t1, fade=fade)}{inner}</g>'


# ─────────────────────────────────────────────────────────────────────────────
# 1. Pipeline: three prompts take three routes through the forge.
# ─────────────────────────────────────────────────────────────────────────────

def pipeline() -> str:
    clk = Clock(21)
    W, H = 1100, 560
    b = [text(36, 46, "How a prompt moves through Prompt Forge", 20, FG, 700),
         text(36, 70, "Three prompts, three routes. The loop replays them in order.", 13, DIM)]

    P = {  # paths the packets follow
        "in": "M100,290 L300,290", "gf": "M300,290 L525,290", "ctx": "M525,175 L525,255",
        "fr": "M525,290 C645,290 645,178 775,178", "fa": "M525,290 L775,290",
        "rc": "M775,178 C905,178 905,290 1000,290", "ar": "M775,318 C775,352 525,362 525,325",
        "by": "M300,325 L300,488 L1000,488 L1000,325",
    }
    b += [edge("M170,290 L213,290"), edge("M385,290 L438,290"), edge("M525,175 L525,253"),
          edge("M610,290 C645,290 645,178 678,178"), edge("M610,290 L678,290"),
          edge("M610,290 C645,290 645,402 678,402"),
          edge("M870,178 C900,178 900,290 928,290"), edge("M870,402 C900,402 900,290 928,290"),
          edge("M775,318 C775,352 525,362 525,327", dashed=True),
          edge("M300,325 L300,488 L1000,488 L1000,327", dashed=True)]
    b.append(text(650, 360, "your answer", 11.5, PEACH, 600, "middle"))
    b.append(text(650, 478, "skipped: short reply, /command, raw:, or /forge off → sent exactly as typed", 12, GRAY, 400, "middle"))

    # node highlight spans per scenario (see timeline below)
    b.append(node(clk, 30, 255, 140, 70, "⏎ You press Enter", "in the prompt box", BLUE, [(0.2, 1.3), (7.0, 8.0), (15.6, 16.6)]))
    b.append(node(clk, 215, 255, 170, 70, "Worth forging?", "5+ words · not / · not raw:", YELLOW, [(1.2, 2.1), (7.9, 8.8), (16.5, 17.5)]))
    b.append(node(clk, 440, 255, 170, 70, "✨ Haiku forge", "one small model call", PINK, [(2.4, 3.9), (9.1, 10.3), (13.3, 14.2)]))
    b.append(node(clk, 440, 115, 170, 60, "Recent conversation", "last ≤ 6 messages", GRAY, [(2.0, 3.0), (8.6, 9.6)]))
    b.append(node(clk, 680, 150, 190, 56, "PROMPT → rewrite", "before/after card", GREEN, [(4.4, 5.3), (14.6, 15.2)]))
    b.append(node(clk, 680, 262, 190, 56, "ASK → questions", "prompt held, you answer", PEACH, [(10.8, 13.0)]))
    b.append(node(clk, 680, 374, 190, 56, "UNCHANGED", "already sharp → as typed", GRAY, []))
    b.append(node(clk, 930, 255, 140, 70, "Claude works", "the agent continues", MAUVE, [(5.8, 7.0), (15.2, 16.2), (19.2, 20.6)]))

    # ① rough prompt → rewrite
    b.append(pill(clk, P["in"], 0.3, 1.3, "can u make the dashboard…", BLUE))
    b.append(pill(clk, P["gf"], 1.6, 2.6, "can u make the dashboard…", BLUE))
    b.append(pill(clk, P["ctx"], 2.0, 2.8, "context", GRAY, mono=False, width=80))
    b.append(pill(clk, P["fr"], 3.7, 4.6, "✨ goal · limits · done when", GREEN, mono=False))
    b.append(pill(clk, P["rc"], 5.1, 5.9, "✨ rewritten", GREEN, mono=False))
    # ② unclear prompt → ask → answer → rewrite
    b.append(pill(clk, P["in"], 7.0, 8.0, "rename it so it's…", BLUE))
    b.append(pill(clk, P["gf"], 8.2, 9.2, "rename it so it's…", BLUE))
    b.append(pill(clk, P["ctx"], 8.6, 9.4, "context", GRAY, mono=False, width=80))
    b.append(pill(clk, P["fa"], 10.1, 10.9, "? needs a name", PEACH, mono=False))
    b.append(fading(clk, 11.0, 12.8,
                    f'<rect x="684" y="212" width="182" height="32" rx="8" fill="{PEACH}"/>'
                    + text(775, 233, "What should the new name be?", 12, "#11111b", 700, "middle")))
    b.append(pill(clk, P["ar"], 12.4, 13.4, "prompt-smith", PEACH))
    b.append(pill(clk, P["fr"], 13.9, 14.7, "✨ rename to prompt-smith", GREEN, mono=False))
    b.append(pill(clk, P["rc"], 14.6, 15.3, "✨ rewritten", GREEN, mono=False))
    # ③ short reply → bypass
    b.append(pill(clk, P["in"], 15.8, 16.7, "yes push them", BLUE))
    b.append(pill(clk, P["by"], 17.2, 19.3, "yes push them", GRAY))

    caps = [(0.0, 7.0, "1", "A rough prompt is rewritten: goal first, your limits kept, a finish line added.", GREEN),
            (7.0, 15.6, "2", "An unclear prompt is held. The forge asks, you answer, Claude continues with both.", PEACH),
            (15.6, 21.0, "3", "Short replies, /commands and raw: prompts skip the forge entirely.", GRAY)]
    for t0, t1, num, cap, col in caps:
        b.append(fading(clk, t0, t1, f'<circle cx="45" cy="529" r="10" fill="{col}"/>' + text(45, 533.5, num, 12, "#11111b", 700, "middle")
                        + text(64, 534, cap, 14, FG), fade=0.35))
    for i, (t0, t1, num, _, col) in enumerate(caps):  # scene dots, top right
        cx = 990 + i * 30
        b.append(f'<circle cx="{cx}" cy="44" r="9" fill="none" stroke="{LINE}" stroke-width="1.5"/>')
        b.append(f'<circle cx="{cx}" cy="44" r="10" fill="{col}" fill-opacity="0.25" stroke="{col}" stroke-width="3" opacity="0">{clk.window("opacity", t0, t1, fade=0.3)}</circle>')
        b.append(text(cx, 48.5, str(i + 1), 11, FG, 700, "middle"))
    return svg(W, H, "Animated diagram: how a prompt moves through Prompt Forge", "\n".join(b))


# ─────────────────────────────────────────────────────────────────────────────
# 2. Anatomy: pieces of a rough prompt become the parts of the rewrite.
# ─────────────────────────────────────────────────────────────────────────────

def anatomy() -> str:
    clk = Clock(14)
    W, H = 1100, 470
    b = [text(36, 46, "Anatomy of a rewrite", 20, FG, 700),
         text(36, 70, "Every detail you typed is kept word for word; only a missing finish line is added.", 13, DIM)]

    b.append(text(36, 116, "YOU TYPED", 11.5, BLUE, 700, extra='letter-spacing="1.5"'))
    # the typed prompt as chips, so each phrase can light up in its target's colour
    chips = [("can u make the dashboard load faster", PINK, (1.0, 12.6)),
             ("its really slow on the orders page,", PINK, (1.0, 12.6)),
             ("dont touch the api", PEACH, (3.6, 12.6))]
    x, spans = 36, []
    for label, col, (t0, t1) in chips:
        w = len(label) * 8.2 + 24
        b.append(f'<rect x="{x}" y="130" width="{w}" height="34" rx="8" fill="{CARD}" stroke="{LINE}"/>')
        b.append(f'<rect x="{x}" y="130" width="{w}" height="34" rx="8" fill="{col}" fill-opacity="0.18" stroke="{col}" '
                 f'stroke-width="2" opacity="0">{clk.window("opacity", t0, t1)}</rect>')
        b.append(text(x + 12, 152, label, 13.5, FG, 400, font=MONO,
                      extra=f'textLength="{w - 24}" lengthAdjust="spacingAndGlyphs"'))
        spans.append((x, w))
        x += w + 10

    b.append(fading(clk, 1.0, 12.6, f'<path d="M550,172 L550,214" stroke="{PINK}" stroke-width="2" marker-end="url(#arrow)"/>'
                    + text(564, 199, "✨ Haiku forge", 13, PINK, 700)))
    b.append(text(36, 240, "SENT TO CLAUDE", 11.5, GREEN, 700, extra='letter-spacing="1.5"'))
    rows = [  # (label, text, colour, appears, source chip index or None); the chip lights in the row's colour
        ("Goal", "Make the dashboard's orders page load faster; it is currently slow.", PINK, 1.6, 0),
        ("Constraints", "Do not change the API.", PEACH, 4.2, 2),
        ("Done when", "The orders page renders noticeably faster, measured before and after.", GREEN, 6.8, None),
    ]
    for i, (label, body, col, t0, src) in enumerate(rows):
        y = 262 + i * 52
        inner = (f'<rect x="36" y="{y}" width="1028" height="40" rx="8" fill="{CARD}" stroke="{col}" stroke-width="1.5"/>'
                 + f'<rect x="36" y="{y}" width="6" height="40" rx="3" fill="{col}"/>'
                 + text(56, y + 25, label, 13, col, 700)
                 + text(170, y + 25, body, 13.5, FG, 400, font=MONO))
        if src is None:
            inner += (f'<rect x="958" y="{y + 9}" width="94" height="22" rx="11" fill="{GREEN}"/>'
                      + text(1005, y + 24, "+ added", 12, "#11111b", 700, "middle"))
        b.append(fading(clk, t0, 12.6, inner, fade=0.4))
    notes = ["+ stated the goal first", "+ kept your API limit", "+ added a done check", "+ fixed typos"]
    nx = 36
    for i, n in enumerate(notes):
        w = len(n) * 7.6 + 26
        t0 = 8.6 + i * 0.5
        b.append(fading(clk, t0, 12.6,
                        f'<rect x="{nx}" y="424" width="{w}" height="28" rx="14" fill="none" stroke="{GREEN}" stroke-width="1.5"/>'
                        + text(nx + w / 2, 443, n, 12.5, GREEN, 600, "middle"), fade=0.3))
        nx += w + 10
    b.append(fading(clk, 8.4, 12.6, text(1064, 443, "shown on the card", 12, DIM, 400, "end"), fade=0.3))
    return svg(W, H, "Animated diagram: anatomy of a Prompt Forge rewrite", "\n".join(b))


# ─────────────────────────────────────────────────────────────────────────────
# 3. Context: the conversation names "it"; the forge asks only for what's missing.
# ─────────────────────────────────────────────────────────────────────────────

def context() -> str:
    clk = Clock(16)
    W, H = 1100, 500
    b = [text(36, 46, "Context first, questions second", 20, FG, 700),
         text(36, 70, "Recent messages resolve what “it” means. Only what nobody said yet becomes a question.", 13, DIM)]

    # left: recent conversation
    b.append(text(36, 112, "RECENT CONVERSATION", 11.5, GRAY, 700, extra='letter-spacing="1.5"'))
    b.append(f'<rect x="36" y="124" width="430" height="60" rx="10" fill="{CARD}" stroke="{LINE}"/>')
    b.append(text(52, 148, "claude", 11.5, MAUVE, 700))
    line, cw = "Published the prompt-forge plugin on GitHub.", 13 * 0.6
    b.append(text(52, 170, line, 13, FG, font=MONO, extra=f'textLength="{len(line) * cw:.1f}" lengthAdjust="spacingAndGlyphs"'))
    hx, hw = 52 + line.index("prompt-forge") * cw - 3, len("prompt-forge") * cw + 6
    b.append(f'<rect x="36" y="196" width="430" height="44" rx="10" fill="{CARD}" stroke="{LINE}"/>')
    b.append(text(52, 223, "you  ·  great, it works", 13, DIM, font=MONO))
    # highlight "prompt-forge" in the conversation
    b.append(f'<rect x="{hx:.1f}" y="155" width="{hw:.1f}" height="22" rx="5" fill="none" stroke="{PINK}" stroke-width="2" opacity="0">'
             f'{clk.window("opacity", 1.4, 13.8)}</rect>')

    # right: the new prompt
    b.append(text(540, 112, "YOUR NEW PROMPT", 11.5, BLUE, 700, extra='letter-spacing="1.5"'))
    b.append(f'<rect x="540" y="124" width="524" height="60" rx="10" fill="{CARD}" stroke="{BLUE}" stroke-width="1.5"/>')
    prompt, pw = "rename it so it's independent", 15 * 0.6
    b.append(text(558, 160, prompt, 15, FG, font=MONO, extra=f'textLength="{len(prompt) * pw:.1f}" lengthAdjust="spacingAndGlyphs"'))
    ix = 558 + prompt.index("it") * pw - 3
    b.append(f'<rect x="{ix:.1f}" y="143" width="{2 * pw + 6:.1f}" height="24" rx="5" fill="none" stroke="{PINK}" stroke-width="2" opacity="0">'
             f'{clk.window("opacity", 0.6, 13.8)}</rect>')
    icx = ix + pw + 3
    b.append(fading(clk, 0.6, 13.8, text(icx, 202, "it = ?", 12, PINK, 700, "middle"), fade=0.3))
    mid = hx + hw / 2
    link = f"M{mid:.1f},154 C{mid:.1f},100 {icx:.1f},96 {icx:.1f},141"
    b.append(f'<path d="{link}" fill="none" stroke="{PINK}" stroke-width="2" stroke-dasharray="700" stroke-dashoffset="700">'
             f'{clk.draw(700, 1.6, 2.6, 13.8)}</path>')
    b.append(fading(clk, 2.8, 13.8, text(1064, 202, "resolved from context: it = the prompt-forge plugin", 12, PINK, 700, "end")))

    # forge verdict: ask for the one missing piece
    b.append(fading(clk, 4.0, 13.8,
                    f'<rect x="36" y="262" width="1028" height="58" rx="10" fill="{CARD}" stroke="{PEACH}" stroke-width="1.5"/>'
                    + text(56, 287, "✨ Before I send this, I need a bit more context", 13.5, PEACH, 700)
                    + text(56, 308, "1. What should the new name be?", 13.5, FG, font=MONO)
                    + text(1048, 298, "the new name was never mentioned", 12, DIM, 400, "end")))
    b.append(fading(clk, 6.2, 13.8,
                    f'<rect x="36" y="334" width="1028" height="40" rx="10" fill="{CARD}" stroke="{BLUE}" stroke-width="1.5"/>'
                    + text(56, 359, "you  ›", 13, BLUE, 700) + text(110, 359, "prompt-smith", 13.5, FG, font=MONO)))
    b.append(fading(clk, 8.4, 13.8,
                    f'<rect x="36" y="392" width="1028" height="64" rx="10" fill="{CARD}" stroke="{GREEN}" stroke-width="1.5"/>'
                    + text(56, 416, "SENT TO CLAUDE", 11.5, GREEN, 700, extra='letter-spacing="1.5"')
                    + text(56, 440, "Rename the prompt-forge plugin to prompt-smith everywhere, so it no longer depends on the other plugin.", 13, FG, font=MONO,
                           extra='textLength="990" lengthAdjust="spacingAndGlyphs"')))
    b.append(fading(clk, 10.0, 13.8, text(1064, 482, "→ Claude starts working", 13, MAUVE, 700, "end")))
    return svg(W, H, "Animated diagram: context resolves 'it', the forge asks for the rest", "\n".join(b))


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for name, make in (("pipeline", pipeline), ("anatomy", anatomy), ("context", context)):
        (OUT / f"{name}.svg").write_text(make())
        print(f"assets/{name}.svg", len((OUT / f'{name}.svg').read_text()) // 1024, "KB")
