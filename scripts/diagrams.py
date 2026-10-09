#!/usr/bin/env python3
"""Generates the animated README diagrams (assets/*.svg).

Plain SVG + SMIL, no dependencies: GitHub plays SMIL in <img>, and the files stay a few KB.
Every animation shares one looping clock per diagram: each element is active only inside its
[t0, t1] window, so scenes play in order and the whole diagram loops seamlessly.

    python3 scripts/diagrams.py        # writes assets/spend.svg
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
# Spend: how a prompt moves through Prompt Forge.
# ─────────────────────────────────────────────────────────────────────────────

def spend() -> str:
    clk = Clock(20)
    W, H = 1100, 560
    b = [text(36, 46, "How Prompt Forge spends your tokens", 20, FG, 700),
         text(36, 70, "Three prompts, three routes. The loop replays them in order.", 13, DIM)]
    P = {
        "in": "M100,290 L300,290", "nt-sc": "M300,290 L525,290", "nt-fr": "M300,290 C380,290 420,178 525,178",
        "fr-sc": "M525,178 L525,290", "sc-son": "M525,290 C645,290 645,178 775,178", "sc-mod": "M525,290 L775,290",
        "son-cl": "M775,178 C905,178 905,290 1000,290", "mod-cl": "M775,290 L1000,290",
        "by": "M100,325 L100,488 L1000,488 L1000,325",
    }
    b += [edge("M170,290 L213,290"), edge("M385,290 L438,290"), edge("M385,290 C410,290 420,178 438,178"),
          edge("M525,206 L525,253"),
          edge("M610,290 C645,290 645,178 678,178"), edge("M610,290 L678,290"),
          edge("M870,178 C900,178 900,290 928,290"), edge("M870,290 L928,290"),
          edge("M100,325 L100,488 L1000,488 L1000,327", dashed=True)]
    b.append(text(395, 230, "f", 13, PINK, 700, "middle"))
    b.append(text(412, 282, "h", 13, DIM, 700, "middle"))
    b.append(text(550, 478, "short reply, /command, raw:, an image or file, /forge off → sent exactly as typed, no checks", 12, GRAY, 400, "middle"))

    b.append(node(clk, 30, 255, 140, 70, "⏎ You press Enter", "sent as typed", BLUE, [(0.2, 1.2), (6.4, 7.4), (14.4, 15.4)]))
    b.append(node(clk, 215, 255, 170, 70, "New task?", "Haiku, long sessions only", PINK, [(1.3, 2.4), (7.6, 9.4)]))
    b.append(node(clk, 440, 150, 170, 56, "🧹 Fresh start", "/clear, then your prompt", PINK, [(9.6, 10.8)]))
    b.append(node(clk, 440, 255, 170, 70, "Small & clear?", "local check, small context", YELLOW, [(2.6, 3.5), (10.9, 11.8)]))
    b.append(node(clk, 680, 150, 190, 56, "⚡ Sonnet", "this turn, ~½ the price", GREEN, [(11.9, 12.8)]))
    b.append(node(clk, 680, 262, 190, 56, "Your model", "as typed, instantly", GRAY, [(3.7, 4.6)]))
    b.append(node(clk, 930, 255, 140, 70, "Claude works", "on what it needs", MAUVE, [(4.8, 6.0), (13.0, 14.2), (17.6, 19.6)]))

    # ① a follow-up stays put
    b.append(pill(clk, P["in"], 0.3, 1.2, "now add a test for it", BLUE))
    b.append(fading(clk, 1.5, 2.4, f'<rect x="222" y="212" width="156" height="30" rx="8" fill="{GRAY}"/>'
                    + text(300, 232, "follow-up: stay", 12, "#11111b", 700, "middle")))
    b.append(pill(clk, P["nt-sc"], 2.3, 3.0, "now add a test for it", BLUE))
    b.append(pill(clk, P["sc-mod"], 3.3, 4.1, "now add a test for it", BLUE))
    b.append(pill(clk, P["mod-cl"], 4.3, 5.0, "as typed", BLUE, mono=False, width=90))
    # ② a new, small task in a long session
    b.append(pill(clk, P["in"], 6.5, 7.4, "In src/users.js rename…", BLUE))
    b.append(fading(clk, 7.8, 9.4, f'<rect x="196" y="204" width="208" height="40" rx="8" fill="{PINK}"/>'
                    + text(300, 221, "new task · 85k tokens of", 11.5, "#11111b", 700, "middle")
                    + text(300, 236, "old conversation ride along", 11.5, "#11111b", 700, "middle")))
    b.append(pill(clk, P["nt-fr"], 9.2, 10.0, "f", PINK, width=40))
    b.append(pill(clk, P["fr-sc"], 10.3, 11.0, "fresh context", PINK, mono=False, width=110))
    b.append(pill(clk, P["sc-son"], 11.3, 12.1, "names file + finish line", YELLOW, mono=False))
    b.append(pill(clk, P["son-cl"], 12.3, 13.1, "⚡ Sonnet turn", GREEN, mono=False))
    b.append(fading(clk, 13.0, 14.2, text(1000, 360, "$0.09 instead of $0.44", 13, GREEN, 700, "middle")))
    # ③ short reply → straight through
    b.append(pill(clk, P["in"], 14.5, 15.4, "yes push them", BLUE))
    b.append(pill(clk, P["by"], 15.8, 17.8, "yes push them", GRAY))

    caps = [(0.0, 6.4, "1", "A follow-up stays in the conversation, on your model, sent instantly as you typed it.", GRAY),
            (6.4, 14.4, "2", "A new task in a long session: f clears the old conversation; small and clear, so Sonnet runs it.", PINK),
            (14.4, 20.0, "3", "Short replies, /commands, raw: and attachments pass straight through: no checks, no cost.", BLUE)]
    for t0, t1, num, cap, col in caps:
        b.append(fading(clk, t0, t1, f'<circle cx="45" cy="529" r="10" fill="{col}"/>' + text(45, 533.5, num, 12, "#11111b", 700, "middle")
                        + text(64, 534, cap, 14, FG), fade=0.35))
    for i, (t0, t1, num, _, col) in enumerate(caps):
        cx = 990 + i * 30
        b.append(f'<circle cx="{cx}" cy="44" r="9" fill="none" stroke="{LINE}" stroke-width="1.5"/>')
        b.append(f'<circle cx="{cx}" cy="44" r="10" fill="{col}" fill-opacity="0.25" stroke="{col}" stroke-width="3" opacity="0">{clk.window("opacity", t0, t1, fade=0.3)}</circle>')
        b.append(text(cx, 48.5, str(i + 1), 11, FG, 700, "middle"))
    return svg(W, H, "Animated diagram: how Prompt Forge spends your tokens", "\n".join(b))


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for name, make in (("spend", spend),):
        (OUT / f"{name}.svg").write_text(make())
        print(f"assets/{name}.svg", len((OUT / f'{name}.svg').read_text()) // 1024, "KB")
