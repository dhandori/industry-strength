"""시장 흐름판 화면 검사: 탭 9개를 PC·휴대폰 크기로 열어 깨진 곳이 없는지 본다.

저장소에 있는 그날 자료(docs/data)로 돈다. 그래서 종목·숫자를 가정하지 않고, 어느 날 자료로도 지켜져야 하는 것만 본다:
스크립트 오류 없음, 받지 못한 파일 없음, 가로 넘침 없음, 화면에 undefined·NaN 같은 깨진 값 없음, 탭 내용이 비어 있지 않음.
바깥 요청은 통제한다: 매크로 자료(와모 대시보드)는 tests/fixtures/wamo_macro.json, GitHub API·방문 집계는 빈 응답.

  python tests/browser_check.py            전부
  python tests/browser_check.py US-ai      이름에 이 글자가 든 화면만
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SHOTS = ROOT / "test-results"
VIEWS = [("KR", v) for v in ("strength", "highs", "macro")] + \
        [("US", v) for v in ("strength", "highs", "macro", "ai", "pairs", "positioning")]
SIZES = [("pc", 1440, 900), ("phone", 390, 844)]
MAIN = {"strength": "#viewStrength"}
BAD = re.compile(r"undefined|NaN|\bnull\b|Infinity|\[object Object\]")

PROBE = """() => {
  const de = document.documentElement, vw = de.clientWidth, over = [];
  for (const el of document.querySelectorAll('body *')) {
    const b = el.getBoundingClientRect();
    if (!(b.width > 0 && b.right > vw + 2) || over.length >= 5) continue;
    let clipped = false;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const o = getComputedStyle(a).overflowX;
      if (o === 'auto' || o === 'scroll' || o === 'hidden') { clipped = true; break; }
    }
    if (!clipped) over.push(el.tagName + '.' + String(el.className).slice(0, 40) + ' 오른쪽 ' + Math.round(b.right));
  }
  const shown = [...document.querySelectorAll('main')].filter(m => !m.hidden && m.getBoundingClientRect().height > 0);
  const tiny = [...document.querySelectorAll('main *')].filter(e => e.children.length === 0 && e.textContent.trim()
    && !e.closest('svg') && e.getBoundingClientRect().width > 0 && parseFloat(getComputedStyle(e).fontSize) < 11).length;
  return { scrollW: de.scrollWidth, vw, over, tiny, mains: shown.map(m => m.id), text: shown.map(m => m.innerText).join('\\n') };
}"""


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def check(page, base, market, view, label):
    problems, errors, missing = [], [], []
    page.on("pageerror", lambda e: errors.append(str(e)[:200]))
    page.on("console", lambda m: errors.append(m.text[:200]) if m.type == "error" and "Failed to load resource" not in m.text else None)
    page.on("response", lambda r: missing.append(f"{r.status} {r.url[:120]}") if r.status >= 400 else None)
    page.goto(f"{base}/#{market}-{view}", wait_until="load", timeout=60000)
    try:
        page.wait_for_load_state("networkidle", timeout=20000)
    except Exception:
        pass
    page.wait_for_timeout(1200)
    got = page.evaluate(PROBE)
    SHOTS.mkdir(exist_ok=True)
    page.screenshot(path=str(SHOTS / f"{market}-{view}-{label}.png"))
    if errors:
        problems.append("스크립트 오류: " + " | ".join(errors[:3]))
    if missing:
        problems.append("받지 못한 파일: " + " | ".join(missing[:3]))
    if got["scrollW"] > got["vw"] + 2:
        problems.append(f"가로 넘침 {got['scrollW']}>{got['vw']}: " + " | ".join(got["over"]))
    if len(got["mains"]) != 1:
        problems.append(f"보이는 화면이 {len(got['mains'])}개: {got['mains']}")
    if len(got["text"]) < 300:
        problems.append(f"탭 내용이 거의 비어 있음({len(got['text'])}자)")
    bad = [m.group(0) for m in re.finditer(r".{0,20}(?:%s).{0,20}" % BAD.pattern, got["text"])][:3]
    if bad:
        problems.append("깨진 값: " + " | ".join(b.replace("\n", " ") for b in bad))
    if got["tiny"]:
        problems.append(f"11px보다 작은 글씨 {got['tiny']}곳")
    selected = page.evaluate("() => [...document.querySelectorAll('.view-tabs [aria-selected=\"true\"]')].map(b => b.dataset.view)")
    if selected != [view]:
        problems.append(f"선택된 탭이 {selected} (기대 {view})")
    return problems


def main(argv):
    only = argv[0] if argv else ""
    site = ROOT / "docs"
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(Quiet, directory=str(site)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}"
    macro = (ROOT / "tests/fixtures/wamo_macro.json").read_text(encoding="utf-8")
    failed = 0
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for label, width, height in SIZES:
            for market, view in VIEWS:
                name = f"{market}-{view}"
                if only and only not in name:
                    continue
                context = browser.new_context(viewport={"width": width, "height": height}, locale="ko-KR",
                                              timezone_id="Asia/Seoul", is_mobile=label == "phone", has_touch=label == "phone")
                context.route("**/wamo-choochoo-dashboard/wamo_macro.json*",
                              lambda route: route.fulfill(status=200, content_type="application/json", body=macro))
                context.route("https://api.github.com/**", lambda route: route.fulfill(status=200, content_type="application/json", body='{"workflow_runs":[]}'))
                context.route(re.compile(r"goatcounter|gc\.zgo\.at"), lambda route: route.fulfill(status=200, content_type="text/javascript", body=""))
                page = context.new_page()
                problems = check(page, base, market, view, label)
                context.close()
                print(f"{'FAIL' if problems else 'PASS'} {name} {label}" + "".join(f"\n   - {p}" for p in problems), flush=True)
                failed += bool(problems)
        browser.close()
    server.shutdown()
    print(f"화면 검사: 실패 {failed}건")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
