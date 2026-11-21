"""와모 차트북 화면 검사: 고정 자료로 휴대폰·PC 크기에서 열어 기능과 깨짐을 본다.

자료는 실제 watchlist-data 가지 대신 이 파일이 만든 가짜 자료를 쓴다(그날 시장 상황으로 결과가 바뀌지 않게).
- 스크립트 오류·가로 넘침·undefined/NaN 같은 깨진 값이 없는지
- 걸러 보기: 조건 둘(교집합)과 국가 둘(합집합)을 함께 걸면 맞는 종목만 남는지
- 정렬: 1개월 수익률 순서가 맞는지, 같은 회사 두 상장(미국·대만)이 미국 하나만 남는지
- 낮은 순 정렬, '모두 지우기' 한 번에 처음 상태로 돌아가는지
- 표 보기에서 줄을 누르면 차트가 펼쳐지는지, 매크로 탭(RS 없음)에서 RS 정렬이 기본 순서로 바뀌는지

  python tests/watchlist_check.py
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import datetime as dt
import json
import math
import sys
import tempfile
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SHOTS = ROOT / "test-results"


def series(seed, drift, n=250):
    """하루 drift 만큼 오르내리는 매끄러운 가짜 일봉."""
    c, out = 100.0, []
    for i in range(n):
        c *= 1 + drift + 0.01 * math.sin(i / 7 + seed)
        out.append(round(c, 2))
    return out


def ema(xs, span):
    k, prev, out = 2 / (span + 1), None, []
    for v in xs:
        prev = v if prev is None else v * k + prev * (1 - k)
        out.append(round(prev, 2))
    return out


def item(y, n, k, drift, seed, rs=None, al=False, vol=True, t=None, ia=None):
    c = series(seed, drift)
    day0 = dt.date(2025, 11, 19)
    it = {"y": y, "n": n, "b": n + " 사업 설명", "k": k, "dg": 2,
          "d": [(day0 + dt.timedelta(days=i)).strftime("%y%m%d") for i in range(len(c))],
          "o": c, "h": [x * 1.01 for x in c], "l": [x * 0.99 for x in c], "c": c,
          "v": [1000 + i for i in range(len(c))] if vol else [0] * len(c),
          "e": {"20": ema(c, 20), "50": ema(c, 50), "200": ema(c, 200)},
          "hi": max(c), "lo": min(c), "chg": round((c[-1] / c[-2] - 1) * 100, 2), "al": al, "x": ""}
    it["ph"] = round((c[-1] / it["hi"] - 1) * 100, 1)
    it["pl"] = round((c[-1] / it["lo"] - 1) * 100, 1)
    if rs is not None:
        it["rs"] = rs
        it["rsd"] = 12 if y == "NVDA" else 0
        it["rsh"] = y == "NVDA"
        # 화면의 RS선 칸: 첫 값 100에서 출발해 오르내리는 선
        it["rl"] = [round(100 * (1 + drift * 0.5) ** i * (1 + 0.02 * math.sin(i / 9 + seed)), 1) for i in range(len(c))]
        it["rb"] = "S&P500" if k == "미국" else "코스피"
    if t:
        it["t"] = t
    if ia:
        it["ia"] = ia
    return it


def make_data(folder):
    ai = {"id": "ai", "title": "② AI 반도체·하드웨어", "sections": [
        {"name": "반도체", "items": [
            item("TSM", "Taiwan Semiconductor", "대만", 0.004, 1, rs=95, al=True, t=["파운드리", "CoWoS"]),
            item("NVDA", "NVIDIA", "미국", 0.003, 2, rs=90, al=True, t=["프로세서", "GPU"], ia={"m": "US", "g": "AI 가속기", "k": 3, "of": 70, "d": 2}),
            item("INTC", "Intel", "미국", -0.002, 3, rs=20, t=["프로세서"], ia={"m": "US", "g": "AI 가속기", "k": 3, "of": 70, "d": 2}),
            item("000660.KS", "SK하이닉스", "한국", 0.005, 4, rs=97, al=True, t=["프로세서"]),
            item("2330.TW", "Taiwan Semiconductor", "대만", 0.004, 5, rs=94, al=True)]},
        {"name": "메모리", "items": [
            item("MU", "Micron", "미국", 0.001, 6, rs=60),
            item("005930.KS", "삼성전자", "한국", 0.002, 7, rs=70, al=True),
            item("6758.T", "Sony", "일본", 0.001, 8, rs=50, al=True)]}]}
    macro = {"id": "macro", "title": "① 지수·매크로", "sections": [
        {"name": "미국 지수", "items": [item("^GSPC", "S&P 500", "", 0.001, 9, vol=False),
                                     item("^IXIC", "나스닥", "", 0.002, 10, vol=False)]}]}
    for d in (macro, ai):
        (folder / f"{d['id']}.json").write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
    kn = {"NVDA": ("엔비디아", ""), "000660.KS": ("SK하이닉스", "하닉|하이닉스"), "TSM": ("TSMC", "대만반도체"),
          "005930.KS": ("삼성전자", "삼전")}
    index = [[it["y"], it["n"], *kn.get(it["y"], ("", "")), " · ".join(it.get("t", [])), d["id"], sec["name"]]
             for d in (macro, ai) for sec in d["sections"] for it in sec["items"]]
    meta = {"updated": dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).strftime("%Y-%m-%d %H:%M"),
            "tabs": [{"id": "macro", "title": macro["title"]}, {"id": "ai", "title": ai["title"]}], "index": index}
    (folder / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")


class Handler(SimpleHTTPRequestHandler):
    """docs 를 내보내되 /watchlist/data/ 는 가짜 자료 폴더에서 준다."""
    data_dir = None

    def translate_path(self, path):
        p = path.split("?")[0]
        if p.startswith("/watchlist/data/"):
            return str(Path(self.data_dir) / p.rsplit("/", 1)[1])
        return super().translate_path(path)

    def log_message(self, *args):
        pass


PROBE = """() => ({
  sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth,
  bad: (document.body.innerText.match(/undefined|NaN|\\bnull\\b|Infinity|\\[object Object\\]/) || [''])[0],
  cards: document.querySelectorAll('.card').length, rows: document.querySelectorAll('.tr.it').length,
  names: [...document.querySelectorAll('.card .nm, .tr.it .n b')].map(e => [...e.childNodes].find(n => n.nodeType === 3).textContent.trim())
})"""


def main():
    SHOTS.mkdir(exist_ok=True)
    problems = []
    with tempfile.TemporaryDirectory() as tmp:
        make_data(Path(tmp))
        Handler.data_dir = tmp
        srv = ThreadingHTTPServer(("127.0.0.1", 0), partial(Handler, directory=str(ROOT / "docs")))
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        url = f"http://127.0.0.1:{srv.server_address[1]}/watchlist/"
        with sync_playwright() as p:
            b = p.chromium.launch()
            for label, w, h in (("phone", 390, 844), ("pc", 1440, 900)):
                pg = b.new_page(viewport={"width": w, "height": h})
                errors = []
                pg.on("pageerror", lambda e: errors.append(str(e)[:200]))
                pg.on("console", lambda m: errors.append(m.text[:200]) if m.type == "error" else None)
                pg.goto(url)
                pg.evaluate("localStorage.clear()")
                pg.reload()
                pg.wait_for_selector("#tabs button")
                pg.click("#tabs button[data-id=ai]")
                pg.wait_for_selector(".card")

                def look(step, expect=None):
                    r = pg.evaluate(PROBE)
                    if r["sw"] > r["vw"] + 2:
                        problems.append(f"{label} {step}: 가로 넘침 {r['sw']}px")
                    if r["bad"]:
                        problems.append(f"{label} {step}: 깨진 값 '{r['bad']}'")
                    if expect is not None and r["names"] != expect:
                        problems.append(f"{label} {step}: 종목 {r['names']} (기대 {expect})")
                    return r

                # 기간 단추: 처음엔 휴대폰 6개월·PC 1년, 3개월을 누르면 차트를 다시 그린다
                want = "6개월" if w < 900 else "1년"
                if pg.inner_text("#per button.on") != want:
                    problems.append(f"{label} 기간 처음 값 {pg.inner_text('#per button.on')} (기대 {want})")
                pg.click("#per button:text-is('3개월')")
                if pg.inner_text("#per button.on") != "3개월" or not pg.evaluate("document.querySelector('canvas').width > 0"):
                    problems.append(f"{label} 3개월 단추가 안 먹음")
                pg.click(f"#per button:text-is('{want}')")
                # 로그 단추: 처음엔 켜져 있고, 누르면 꺼진다(차트는 계속 그려져야 한다)
                if "on" not in (pg.get_attribute("#logb", "class") or ""):
                    problems.append(f"{label} 로그 단추가 처음에 꺼져 있음")
                pg.click("#logb")
                if "on" in (pg.get_attribute("#logb", "class") or "") or not pg.evaluate("document.querySelector('canvas').width > 0"):
                    problems.append(f"{label} 로그 단추를 눌러도 안 바뀜")
                pg.click("#logb")
                look("기본", ["Taiwan Semiconductor", "NVIDIA", "Intel", "SK하이닉스", "Taiwan Semiconductor",
                             "Micron", "삼성전자", "Sony"])
                # 하부섹터 딱지는 설명 앞에, 기본 순서에서는 묶음 소제목이 섹터 안에 붙는다
                if pg.inner_text(".card .biz .tg >> nth=0") != "파운드리 · CoWoS":
                    problems.append(f"{label} 딱지 글자 '{pg.inner_text('.card .biz .tg >> nth=0')}'")
                subs = pg.evaluate("[...document.querySelectorAll('main > .sub')].map(e => e.firstChild.textContent)")
                if subs != ["파운드리", "프로세서"]:
                    problems.append(f"{label} 묶음 소제목 {subs} (기대 ['파운드리', '프로세서'])")
                # 묶음 요약 줄: 정배열 수가 보이고, 누르면 그 묶음 카드가 숨고 다시 누르면 나온다
                # (프로세서 묶음 = NVDA·INTC·SK하이닉스 + 딱지 없는 2330.TW 가 앞 묶음에 붙어 4장)
                vis = "[...document.querySelectorAll('.card')].filter(c => c.offsetParent).length"
                n0 = pg.evaluate(vis)
                if "정배열" not in pg.inner_text("main > .sub >> nth=1"):
                    problems.append(f"{label} 묶음 요약 줄에 정배열 수 없음")
                pg.click("main > .sub >> nth=1")
                if pg.evaluate(vis) != n0 - 4:
                    problems.append(f"{label} 묶음 접기: 카드 {n0}→{pg.evaluate(vis)} (기대 {n0 - 4})")
                pg.click("main > .sub >> nth=1")
                if pg.evaluate(vis) != n0:
                    problems.append(f"{label} 묶음 펼치기가 안 됨")
                # 섹터 제목의 '모두 접기' 단추
                pg.click("main > h2 .fold >> nth=0")
                if pg.evaluate(vis) != n0 - 5 or pg.inner_text("main > h2 .fold >> nth=0") != "모두 펼치기":
                    problems.append(f"{label} 묶음 모두 접기: 카드 {pg.evaluate(vis)} (기대 {n0 - 5})")
                pg.click("main > h2 .fold >> nth=0")
                # 전체 판: 하부섹터 순위가 나오고, 누르면 그 묶음으로 간다
                pg.click("#gbtn")
                gl = pg.locator("#panel .gl button")
                if not gl.count() or "프로세서" not in gl.first.inner_text():
                    problems.append(f"{label} 하부섹터 순위 없음")
                else:
                    gl.first.click()
                    pg.wait_for_timeout(300)
                    if not pg.locator("main > .sub.hit").count():
                        problems.append(f"{label} 하부섹터 순위를 눌러도 묶음으로 안 감")
                pg.evaluate("window.scrollTo(0, 0)")
                pg.wait_for_timeout(300)
                # RS: 등급·20일 변화·RS선 신고가를 딱지 하나로, 차트 아래 RS선 칸(캔버스가 그만큼 높다)
                nv = pg.locator(".card", has_text="NVIDIA").first.inner_text()
                if "RS 90 ▲12 · 신고가" not in nv:
                    problems.append(f"{label} RS 딱지 '{[x for x in nv.split(chr(10)) if 'RS' in x]}'")
                if "rl" not in (pg.locator(".card[data-y=NVDA] canvas").get_attribute("class") or ""):
                    problems.append(f"{label} RS선 칸 캔버스 없음")
                # 딱지에 마우스를 올리면 풀이가 나온다(title)
                tips = pg.evaluate("""() => { const c = [...document.querySelectorAll('.card')].find(e => e.textContent.includes('NVIDIA'));
                  return [...c.querySelectorAll('.bd span')].map(s => [s.textContent, s.title]); }""")
                if not tips or any(not t for _, t in tips):
                    problems.append(f"{label} 풀이 없는 딱지 {[x for x, t in tips if not t]}")
                elif not any("AI 가속기" in t and "70개 업종 중 3위" in t for _, t in tips):
                    problems.append(f"{label} 액션 딱지 풀이에 업종·순위 없음")
                # 인더스트리 액션: 카드에 흐름판 업종·순위 딱지, 걸러 보기로 그 종목만
                if "AI 가속기 3위/70 · 새로" not in pg.inner_text("main .bd .ia >> nth=0"):
                    problems.append(f"{label} 액션 딱지 표시 없음")
                pg.click("#fbtn")
                pg.locator("#panel .wrap button", has_text="인더스트리 액션").first.click()
                pg.click("#panel .foot .go")
                look("인더스트리 액션", ["NVIDIA", "Intel"])
                pg.click("#bar .clr")
                # 켠 조건의 정의가 걸러 보기 판에 나온다
                if pg.evaluate("document.querySelector('#tabs button').dataset.id") != "all":
                    problems.append(f"{label} 전체 탭이 맨 앞이 아님")
                pg.click("#fbtn")
                pg.locator("#panel .wrap button", has_text="정배열").first.click()
                if "EMA20" not in pg.inner_text("#panel .defs"):
                    problems.append(f"{label} 정배열 정의가 안 보임")
                pg.click("#panel .foot button >> nth=0")
                pg.click("#panel .foot .go")
                # 끝까지 내리면 '맨 위로' 단추가 나오고, 마지막 탭(ai)의 끝에는 '처음 탭으로' 단추가 있다
                pg.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                pg.wait_for_timeout(300)
                if not pg.is_visible("#totop"):
                    problems.append(f"{label} 끝까지 내려도 맨 위로 단추가 안 보임")
                if not pg.inner_text("#next").startswith("처음 탭으로: 매크로"):
                    problems.append(f"{label} 마지막 탭 끝 단추 글자 '{pg.inner_text('#next')}'")
                pg.click("#totop")
                pg.wait_for_timeout(600)
                if pg.evaluate("window.scrollY") > 2 or pg.is_visible("#totop"):
                    problems.append(f"{label} 맨 위로 단추를 눌러도 맨 위로 안 감")
                # 걸러 보기: 정배열 AND RS 80 이상 AND (한국 OR 미국)
                pg.click("#fbtn")
                for t in ("정배열", "RS 80 이상", "한국", "미국"):
                    pg.locator("#panel .wrap button", has_text=t).first.click()
                pg.click("#panel .foot .go")
                look("걸러 보기", ["NVIDIA", "SK하이닉스"])
                if pg.inner_text("#secs button[data-s='0'] small") != "2":
                    problems.append(f"{label} 걸러 보기: 섹터 버튼 숫자가 화면 종목 수와 다름")
                # 모두 지우기: 정렬까지 걸었다가 한 번에 처음으로
                pg.click("#sbtn")
                pg.click("#panel .wrap button:text-is('RS 등급')")
                pg.click("#panel .foot .go")
                pg.click("#bar .clr")
                look("모두 지우기", ["Taiwan Semiconductor", "NVIDIA", "Intel", "SK하이닉스", "Taiwan Semiconductor",
                                  "Micron", "삼성전자", "Sony"])
                if pg.locator("#bar .clr").count() or pg.locator("#chips .chip").count():
                    problems.append(f"{label} 모두 지우기 뒤에도 칩이 남음")
                # 정렬: 1개월 수익률. 같은 회사(TSM·2330.TW)는 미국 상장 하나만
                pg.click("#sbtn")
                pg.click("#panel .wrap button:text-is('1개월')")
                pg.click("#panel .foot .go")
                r = look("1개월 정렬")
                if r["names"].count("Taiwan Semiconductor") != 1:
                    problems.append(f"{label} 1개월 정렬: 같은 회사가 {r['names'].count('Taiwan Semiconductor')}번 나옴")
                ranks = pg.evaluate("""() => [...document.querySelectorAll('.card .sk')].map(s => parseFloat(s.textContent.replace(/[^0-9.+-]/g, '')))""")
                first_sec = ranks[:4]
                if first_sec != sorted(first_sec, reverse=True):
                    problems.append(f"{label} 1개월 정렬 순서 틀림 {first_sec}")
                # 표 보기와 차트 펼치기
                pg.click("#vbtn")
                r = look("표 보기")
                if not pg.locator(".tr.it .s svg").count():
                    problems.append(f"{label} 표 보기: RS 작은 선 없음")
                if r["rows"] != 7:
                    problems.append(f"{label} 표 보기: 줄 {r['rows']}개 (기대 7)")
                # 이미 1개월 순이므로 칸 제목을 한 번 더 누르면 낮은 순으로 뒤집힌다
                pg.click(".tr.th button:text-is('1개월') >> nth=0")
                vals = pg.evaluate("""() => [...document.querySelectorAll('.tbl')[0].querySelectorAll('.tr.it')].map(r => parseFloat(r.children[2].textContent))""")
                if vals != sorted(vals):
                    problems.append(f"{label} 낮은 순 정렬 틀림 {vals}")
                if "↑" not in pg.inner_text("#sbtn"):
                    problems.append(f"{label} 정렬 단추에 낮은 순 표시 없음")
                pg.click(".tr.it >> nth=0")
                if not pg.evaluate("(() => { const c = document.querySelector('.tbl .card canvas'); return c && c.width > 0; })()"):
                    problems.append(f"{label} 표 보기: 줄을 눌러도 차트가 안 그려짐")
                pg.screenshot(path=str(SHOTS / f"watchlist-{label}-table.png"))
                # 매크로 탭: RS 정렬은 기본 순서로, 칩도 없어야 한다
                pg.click("#vbtn")
                pg.evaluate("window.scrollTo(0, 0)")
                pg.click("#sbtn")
                pg.click("#panel .wrap button:text-is('RS 등급')")
                pg.click("#panel .foot .go")
                pg.click("#tabs button[data-id=macro]")
                pg.wait_for_timeout(500)
                look("매크로 RS", ["S&P 500", "나스닥"])
                if "RS" in pg.inner_text("#sbtn"):
                    problems.append(f"{label} 매크로: 정렬 단추에 RS가 남음")
                pg.screenshot(path=str(SHOTS / f"watchlist-{label}.png"))
                # 종목 검색: 한글·별칭·티커·초성으로 찾고, 누르면 그 탭의 카드로 간다(매크로 탭에서 ai 탭 종목)
                for q, want in (("엔비디아", "NVDA"), ("하닉", "000660.KS"), ("000660", "000660.KS"),
                                ("nvidia", "NVDA"), ("ㅅㅅㅈㅈ", "005930.KS"), ("cowos", "TSM")):
                    pg.click("#qbtn")
                    pg.fill("#sq", q)
                    first = pg.inner_text("#sres button >> nth=0") if pg.locator("#sres button").count() else ""
                    if want not in first:
                        problems.append(f"{label} 검색 '{q}': 첫 결과 '{first[:40]}' (기대 {want})")
                    pg.click("#sx")
                # 하부섹터 이름으로 찾으면 묶음이 맨 위에 나온다
                pg.click("#qbtn"); pg.fill("#sq", "프로세")
                if "묶음 · 프로세서" not in pg.inner_text("#sres button >> nth=0"):
                    problems.append(f"{label} 묶음 검색 결과 없음")
                pg.click("#sx")
                pg.click("#qbtn"); pg.fill("#sq", "엔비디아"); pg.press("#sq", "Enter")
                pg.wait_for_selector("#tabs button[data-id=ai].on")
                pg.wait_for_selector(".hit[data-y=NVDA]")
                top = pg.evaluate("document.querySelector('.hit[data-y=NVDA]').getBoundingClientRect().top")
                if not (0 <= top < h * 0.5):
                    problems.append(f"{label} 검색으로 간 카드가 화면 위쪽에 없음(top {top})")
                pg.wait_for_timeout(800)  # 이동 직후 0.6초는 메뉴를 펼치지 않는다
                pg.evaluate("window.scrollTo(0, 0)")
                pg.wait_for_timeout(400)
                pg.click("#tabs button[data-id=macro]")
                pg.wait_for_timeout(400)
                # 전체 탭: 매크로를 뺀 모든 탭 종목을 '탭 › 섹터' 이름으로 한 화면에
                pg.click("#tabs button[data-id=all]")
                pg.wait_for_selector("main > h2")
                heads = pg.evaluate("[...document.querySelectorAll('main > h2')].map(h => h.firstChild.textContent)")
                if heads != ["AI반도체 › 반도체", "AI반도체 › 메모리"]:
                    problems.append(f"{label} 전체 탭 섹터 {heads}")
                pg.click("#sbtn")
                pg.click("#panel .wrap button:text-is('1개월')")
                if "21거래일" not in pg.inner_text("#panel .now"):
                    problems.append(f"{label} 1개월 정렬 정의가 안 보임")
                pg.click("#panel .foot button >> nth=0")
                pg.click("#panel .foot .go")
                pg.evaluate("window.scrollTo(0, 0)")
                pg.wait_for_timeout(300)
                pg.click("#tabs button[data-id=macro]")
                pg.wait_for_timeout(400)
                # 매크로 탭 끝의 '다음 탭' 단추를 누르면 다음 탭(ai)이 맨 위부터 열린다
                if not pg.inner_text("#next").startswith("다음 탭: AI반도체"):
                    problems.append(f"{label} 매크로 탭 끝 단추 글자 '{pg.inner_text('#next')}'")
                pg.click("#next")
                pg.wait_for_selector("#tabs button[data-id=ai].on")
                pg.wait_for_timeout(300)
                if pg.evaluate("window.scrollY") > 2:
                    problems.append(f"{label} 다음 탭이 맨 위부터 열리지 않음")
                problems += [f"{label}: {e}" for e in errors]
                pg.close()
            b.close()
        srv.shutdown()
    if problems:
        print("문제", len(problems))
        for x in problems:
            print(" -", x)
        sys.exit(1)
    print("차트북 화면 검사 통과")


if __name__ == "__main__":
    main()
