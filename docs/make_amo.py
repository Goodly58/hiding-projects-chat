"""Static AMO listing screenshots: mode banner on top, BEFORE / AFTER panels."""
import io
import pathlib
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).parent
PAGE = (HERE / "anim.html").as_uri()

# (output name, banner text, before frame, after frame)
SHOTS = [
    ("amo-hide-project-chats", "Hide project chats", ("hide", 0), ("hide", 9)),
    ("amo-focus-on-one-project", "Focus on one project", ("focus", 0), ("focus", 11)),
]

POSTER = """<!doctype html><html><head><meta charset="utf-8"><style>
  *{{box-sizing:border-box;margin:0;padding:0}}
  body{{background:#0d0c0b;font-family:"Segoe UI",system-ui,sans-serif}}
  #p{{width:1320px;padding:34px 36px 38px;background:#0d0c0b}}
  .mode{{text-align:center;margin-bottom:30px}}
  .mode h1{{font-size:42px;font-weight:800;color:#ece9e4;letter-spacing:-.015em;
           text-transform:uppercase}}
  .mode .u{{width:112px;height:5px;background:#d97757;margin:15px auto 0;border-radius:3px}}
  .mode p{{font-size:15px;color:#8b837a;margin-top:14px}}
  .grid{{display:grid;grid-template-columns:1fr 1fr;gap:26px}}
  .lab{{font-size:27px;font-weight:800;letter-spacing:.15em;text-align:center;
       padding:11px 0 15px;text-transform:uppercase}}
  .b .lab{{color:#6f6862}}
  .a .lab{{color:#d97757}}
  .shot{{border-radius:12px;overflow:hidden;border:1px solid #2b2724;display:block}}
  .a .shot{{border-color:#8a4a34}}
  img{{width:100%;display:block}}
</style></head><body><div id="p">
  <div class="mode"><h1>{banner}</h1><div class="u"></div><p>{sub}</p></div>
  <div class="grid">
    <div class="b"><div class="lab">Before</div><div class="shot"><img src="{before}"></div></div>
    <div class="a"><div class="lab">After</div><div class="shot"><img src="{after}"></div></div>
  </div>
</div></body></html>"""

SUBS = {
    "Hide project chats": "Chats that belong to a Project leave the sidebar — they stay inside the Project",
    "Focus on one project": "Only the chosen project's chats remain, including ones the sidebar never rendered",
}


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
                                device_scale_factor=2)
        page.goto(PAGE)
        page.wait_for_timeout(400)
        # no mouse pointer in a static screenshot
        page.evaluate("document.getElementById('cur').style.display='none';"
                      "document.getElementById('ring').style.display='none'")
        stage = page.locator("#stage")

        for name, banner, (bs, bi), (as_, ai) in SHOTS:
            for tag, (seq, idx) in (("before", (bs, bi)), ("after", (as_, ai))):
                page.evaluate(f"setFrame('{seq}', {idx})")
                page.wait_for_timeout(260)
                (HERE / f"_{name}-{tag}.png").write_bytes(stage.screenshot())

        poster = browser.new_page(viewport={"width": 1400, "height": 1000},
                                  device_scale_factor=1.6)
        for name, banner, *_ in SHOTS:
            html = POSTER.format(
                banner=banner, sub=SUBS[banner],
                before=(HERE / f"_{name}-before.png").as_uri(),
                after=(HERE / f"_{name}-after.png").as_uri(),
            )
            f = HERE / f"_{name}.html"
            f.write_text(html, encoding="utf-8")
            poster.goto(f.as_uri())
            poster.wait_for_timeout(500)
            shot = poster.locator("#p").screenshot()
            out = HERE / f"{name}.png"
            im = Image.open(io.BytesIO(shot)).convert("RGB")
            im.save(out, optimize=True)
            print(f"{out.name}  {im.size[0]}x{im.size[1]}  "
                  f"{out.stat().st_size/1024:,.0f} KB")

        browser.close()


if __name__ == "__main__":
    main()
