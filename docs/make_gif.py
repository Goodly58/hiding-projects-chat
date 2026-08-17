"""Render anim.html frame by frame and assemble a looping GIF."""
import io
import pathlib
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).parent
PAGE = (HERE / "anim.html").as_uri()
OUT = HERE / "demo.gif"

BASE_MS = 620      # duration of one "hold unit"
SCALE = 1.5        # render scale, downsampled to 1x for a crisp but small GIF


def build(page, el, seq, frames_out):
    for i in range(seq["count"]):
        page.evaluate(f"setFrame('{seq['name']}', {i})")
        page.wait_for_timeout(220)          # let CSS transitions settle
        frames_out.append(Image.open(io.BytesIO(el.screenshot())).convert("RGB"))
    print(f"{seq['name']}: {seq['count']} frames", flush=True)


def main():
    with sync_playwright() as p:
        for kw in (dict(channel="msedge"), dict()):
            try:
                browser = p.chromium.launch(headless=True, **kw)
                break
            except Exception:
                continue
        else:
            sys.exit("no browser")

        page = browser.new_page(viewport={"width": 1000, "height": 620},
                                device_scale_factor=SCALE)
        page.goto(PAGE)
        page.wait_for_timeout(500)

        el = page.locator("#stage")
        seqs = page.evaluate("window.SEQS_META")
        collected = []
        for seq in seqs:
            frames = []
            build(page, el, seq, frames)
            collected.append((seq, frames))

        browser.close()

    for seq, frames in collected:
        w, h = frames[0].size
        target = (int(w / SCALE), int(h / SCALE))
        frames = [f.resize(target, Image.LANCZOS) for f in frames]
        # One shared palette avoids colour flicker between frames. No dithering:
        # the UI is flat colour, and dithering speckles the accent fills.
        pal = frames[-1].quantize(colors=256, method=Image.MEDIANCUT)
        frames = [f.quantize(palette=pal, dither=Image.NONE) for f in frames]

        out = HERE / f"demo-{seq['name']}.gif"
        frames[0].save(
            out, save_all=True, append_images=frames[1:],
            duration=[n * BASE_MS for n in seq["holds"]],
            loop=0, optimize=True, disposal=2,
        )
        print(f"{out.name}  {target[0]}x{target[1]}  "
              f"{len(frames)} frames  {out.stat().st_size/1024:,.0f} KB")


if __name__ == "__main__":
    main()
