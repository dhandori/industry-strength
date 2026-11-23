"""와모 차트북 화면 검사: 고정 자료로 휴대폰·PC 크기에서 열어 기능과 깨짐을 본다.

자료는 실제 watchlist-data 가지 대신 이 파일이 만든 가짜 자료를 쓴다(그날 시장 상황으로 결과가 바뀌지 않게).
- 스크립트 오류·가로 넘침·undefined/NaN 같은 깨진 값이 없는지
- 걸러 보기: 조건 둘(교집합)과 국가 둘(합집합)을 함께 걸면 맞는 종목만 남는지
- 정렬: 1개월 수익률 순서가 맞는지, 같은 회사 두 상장(미국·대만)이 미국 하나만 남는지
- 낮은 순 정렬, '모두 지우기' 한 번에 처음 상태로 돌아가는지
- 표 보기에서 줄을 누르면 차트가 펼쳐지는지, 매크로 탭(RS 없음)에서 RS 정렬이 기본 순서로 바뀌는지
- 새로 생긴 신호(2026-11-23, 신호가 반드시 나도록 만든 둘째 자료): 카드 딱지, '▦ 전체' 단추 알림과 판 맨 위 목록,
  줄 제목·이름 누르기, 걸러 보기 묶음, 갱신 실패·오래된 종목 빼기, 숫자 줄(하루 변동·10일 저점·50일선·거래대금),
  거래대금 원화 환산 정렬, 하루 변동폭·10일 저점 정렬, 한글 이름이 다른 같은 영문 이름(소프트뱅크 둘)

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
        {"name": "반도체", "groups": {"파운드리": "칩을 대신 만들어 주는 공장들입니다.", "프로세서": "컴퓨터와 AI 서버의 두뇌를 설계하는 회사들입니다."}, "items": [
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


# ── 새로 생긴 신호·숫자 줄·거래대금 검사용 자료(2026-11-23) ──
# 신호가 반드시 나도록 만든 종목: UPCO(어제 10% 눌렸다가 오늘 거래량을 실어 신고가) → 정배열 진입·템플릿 통과·
# RS선 신고가 돌파·52주 신고가 돌파·포켓 피봇, DNCO(오늘 15% 급락) → 정배열 이탈·템플릿 이탈.
# 6501.T 는 UPCO 와 같은 모양이지만 마지막 거래일이 하루 앞서고(이름 옆에 날짜), STAL(갱신 실패)과
# OLDD(마지막 거래일이 10일 앞섬)는 같은 모양이어도 신호를 내면 안 된다. 나머지는 신호 없이 천천히 내리는 종목이다.
DAY0 = dt.date(2025, 11, 19)
FXR = {"USD": 1.0, "KRW": 1400.0, "JPY": 150.0, "TWD": 32.0, "HKD": 7.8}
UNIT = {"": ("USD", "달러"), "KS": ("KRW", "원"), "T": ("JPY", "엔"), "DE": ("EUR", "유로"), "HK": ("HKD", "홍콩달러")}


def unit(y):
    return UNIT[y.rsplit(".", 1)[1] if "." in y else ""]


def js_round(x):
    return math.floor(x + 0.5)


def money(v):
    """화면의 money() 와 같은 한국식 단위(조·억·만)."""
    def loc(x):
        return f"{int(x):,}" if float(x).is_integer() else f"{x:,.1f}"
    a = abs(v)
    if a >= 9999.5e8:
        t = v / 1e12
        return loc(js_round(t) if abs(t) >= 99.95 else js_round(t * 10) / 10) + "조"
    if a >= 9.995e8:
        return loc(js_round(v / 1e8)) + "억"
    if a >= 9999.5e4:
        return loc(js_round(v / 1e7) / 10) + "억"
    if a >= 9999.5:
        return loc(js_round(v / 1e4)) + "만"
    return loc(js_round(v))


def shape(kind, base, n=250):
    """up: 어제 10% 눌렸다가 오늘 1년 최고 종가를 2% 넘김, down: 오른 뒤 오늘 15% 급락, flat: 하루 0.1%씩 천천히 내림."""
    if kind == "flat":
        return [base * 0.999 ** i for i in range(n)]
    c = [base * 1.003 ** i * (1 + 0.01 * math.sin(i / 7)) for i in range(n)]
    if kind == "up":
        c[-2] = c[-3] * 0.90
        c[-1] = max(c[:-1]) * 1.02
    elif kind == "down":
        c[-1] = c[-2] * 0.85
    return c


def stock(y, n, k, kind, base, vol, last_vol, s, rs=None, stale=False, shift=0):
    """고가·저가 = 종가 × (1 ± s). shift 만큼 날짜를 앞당겨 마지막 거래일이 다른 종목보다 앞서게 한다."""
    c = [round(x, 2) for x in shape(kind, base)]
    e = {"20": ema(c, 20), "50": ema(c, 50), "200": ema(c, 200)}
    v = [vol] * len(c)
    v[-1] = last_vol
    it = {"y": y, "n": n, "b": n + " 사업 설명", "k": k, "dg": 2,
          "d": [(DAY0 + dt.timedelta(days=i - shift)).strftime("%y%m%d") for i in range(len(c))],
          "o": c, "h": [round(x * (1 + s), 2) for x in c], "l": [round(x * (1 - s), 2) for x in c], "c": c, "v": v, "e": e,
          "hi": max(c), "lo": min(c), "chg": round((c[-1] / c[-2] - 1) * 100, 2),
          "al": c[-1] > e["20"][-1] > e["50"][-1] > e["200"][-1], "x": ""}
    it["ph"] = round((c[-1] / it["hi"] - 1) * 100, 1)
    it["pl"] = round((c[-1] / it["lo"] - 1) * 100, 1)
    if rs is not None:
        # RS선: up 은 어제 눌렸다가 오늘 1년 최고, 나머지는 신고가가 아님
        rl = [round(100 + 0.1 * i, 1) for i in range(len(c))]
        if kind == "up":
            rl[-2], rl[-1] = rl[-3] - 2, rl[-3] + 1
        else:
            rl[-1] = rl[-3] - 3
        it.update(rs=rs, rsd=0, rl=rl, rb="S&P500", rsh=rl[-1] >= max(rl))
    if stale:
        it["stale"] = True
    return it


SIG_ITEMS = [  # (종목, 한글 이름)
    (stock("UPCO", "Up Corp", "미국", "up", 100, 5_000_000, 20_000_000, 0.01, rs=85), ""),
    (stock("DNCO", "Down Corp", "미국", "down", 100, 1_000_000, 1_000_000, 0.02, rs=75), ""),
    (stock("6501.T", "Hitachi", "일본", "up", 3000, 1_000_000, 20_000_000, 0.015, rs=80, shift=1), "히타치"),
    (stock("STAL", "Stale Corp", "미국", "up", 100, 100_000, 300_000, 0.01, rs=60, stale=True), ""),
    (stock("OLDD", "Old Corp", "미국", "up", 100, 100_000, 300_000, 0.01, rs=55, shift=10), ""),
    (stock("005930.KS", "Samsung Electronics", "한국", "flat", 100_000, 20_000_000, 20_000_000, 0.025, rs=50), "삼성전자"),
    (stock("7203.T", "Toyota Motor", "일본", "flat", 2500, 200_000_000, 200_000_000, 0.005, rs=40), "도요타"),
    (stock("RHM.DE", "Rheinmetall", "독일", "flat", 1500, 1_000_000, 1_000_000, 0.03), ""),
    (stock("9984.T", "SoftBank", "일본", "flat", 10_000, 1_000_000, 1_000_000, 0.02, rs=30), "소프트뱅크그룹"),
    (stock("9434.T", "SoftBank", "일본", "flat", 200, 10_000_000, 10_000_000, 0.01, rs=20), "소프트뱅크"),
    # 같은 회사 두 상장(영문·한글 이름이 같음): 정렬하면 미국 상장 PRUS 만 남지만, 신호는 홍콩 상장 1234.HK 에만 난다
    (stock("PRUS", "Pair Co", "미국", "flat", 50, 100_000, 100_000, 0.01, rs=10), "페어"),
    (stock("1234.HK", "Pair Co", "홍콩", "up", 40, 1_000_000, 5_000_000, 0.012, rs=72), "페어"),
]
DROPPED = {"1234.HK"}  # 정렬·탭 전체 보기에서 같은 회사로 빠지는 상장


def make_signal_data(folder):
    ai = {"id": "ai", "title": "② AI 반도체·하드웨어", "sections": [{"name": "신호", "items": [it for it, _ in SIG_ITEMS]}]}
    fx = []
    for y, n, r in (("KRW=X", "원/달러", FXR["KRW"]), ("JPY=X", "엔/달러", FXR["JPY"]), ("TWD=X", "대만달러/달러", FXR["TWD"])):
        it = item(y, n, "", 0.0, 1, vol=False)
        flat = [r] * len(it["c"])
        it.update(o=flat, h=flat, l=flat, c=flat, e={k: flat for k in ("20", "50", "200")}, hi=r, lo=r, chg=0.0, ph=0.0, pl=0.0)
        fx.append(it)
    macro = {"id": "macro", "title": "① 지수·매크로", "sections": [
        {"name": "미국 지수", "items": [item("^GSPC", "S&P 500", "", 0.001, 9, vol=False)]}, {"name": "환율", "items": fx}]}
    for d in (macro, ai):
        (folder / f"{d['id']}.json").write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
    kn = {it["y"]: k for it, k in SIG_ITEMS}
    index = [[it["y"], it["n"], kn.get(it["y"], ""), "", "", d["id"], sec["name"]]
             for d in (macro, ai) for sec in d["sections"] for it in sec["items"]]
    meta = {"updated": dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).strftime("%Y-%m-%d %H:%M"),
            "tabs": [{"id": "macro", "title": macro["title"]}, {"id": "ai", "title": ai["title"]}], "index": index}
    (folder / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")


def expect_numbers(it):
    """UPCO 숫자 줄에 나와야 할 글(화면과 같은 계산)."""
    c, n = it["c"], len(it["c"])
    adr = sum(it["h"][i] / it["l"][i] - 1 for i in range(n - 20, n)) / 20 * 100
    sd = (1 - min(it["l"][-10:]) / c[-1]) * 100
    d50 = (sum(c[-50:]) / 50 / c[-1] - 1) * 100
    return [f"하루 변동 {adr:.1f}%", f"10일 저점 {sd:.1f}% 아래", f"50일선 {abs(d50):.1f}% {'아래' if d50 <= 0 else '위'}",
            f"거래대금 {money(c[-1] * it['v'][-1])} {unit(it['y'])[1]}"], sd > 10


def check_signals(b, url, label, w, h):
    problems = []
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
    badges = lambda y: pg.evaluate(f"[...document.querySelectorAll('.card[data-y=\"{y}\"] .bd span')].map(s => s.textContent)")
    # 카드 딱지: 새로 좋아진 신호는 '새로'·'돌파'·포켓 피봇, 나빠진 신호는 '이탈'
    up = badges("UPCO")
    for want in ("52주 신고가 돌파", "포켓 피봇", "템플릿 ✓ · 새로", "정배열 · 새로"):
        if want not in up:
            problems.append(f"{label} 신호: UPCO 딱지에 '{want}' 없음 {up}")
    if not any(t.startswith("RS 85") and t.endswith("신고가 돌파") for t in up):
        problems.append(f"{label} 신호: UPCO RS 딱지에 '신고가 돌파' 없음 {up}")
    if pg.locator(".card[data-y=UPCO] .bd span.nw").count() < 4:
        problems.append(f"{label} 신호: 새 신호 딱지에 주황 테두리(nw)가 없음")
    dn = badges("DNCO")
    for want in ("정배열 이탈", "템플릿 이탈"):
        if want not in dn:
            problems.append(f"{label} 신호: DNCO 딱지에 '{want}' 없음 {dn}")
    for y in ("STAL", "OLDD", "005930.KS", "7203.T"):
        extra = [t for t in badges(y) if any(k in t for k in ("새로", "돌파", "포켓 피봇", "이탈"))]
        if extra:
            problems.append(f"{label} 신호: {y} 에 나오면 안 되는 딱지 {extra}")
    # 숫자 줄: 하루 변동폭·10일 저점·50일선·거래대금(달러), 10% 넘게 먼 저점은 주황
    want, far = expect_numbers(SIG_ITEMS[0][0])
    got = pg.evaluate("[...document.querySelectorAll('.card[data-y=UPCO] .kv span')].map(s => s.textContent)")
    if got != want:
        problems.append(f"{label} 숫자 줄 {got} (기대 {want})")
    if far != ("far" in (pg.get_attribute(".card[data-y=UPCO] .kv span >> nth=1", "class") or "")):
        problems.append(f"{label} 숫자 줄: 10일 저점 주황 표시가 기대({far})와 다름")
    # 화면 밖 카드는 content-visibility 로 그리기를 미뤄 inner_text 가 빈 값이라 DOM 글자로 읽는다
    eur = pg.locator('.card[data-y="RHM.DE"] .kv span', has_text="거래대금").text_content()
    if eur != f"거래대금 {money(SIG_ITEMS[7][0]['c'][-1] * 1_000_000)} 유로":
        problems.append(f"{label} 숫자 줄: 유로 거래대금 글자 '{eur}'")
    pg.click(".card[data-y=UPCO] .kv span >> nth=1")
    if "올투 기준 손절폭은 7~10%" not in pg.inner_text("#tip"):
        problems.append(f"{label} 숫자 줄: 10일 저점 풀이가 안 뜸")
    pg.click("main > h2 >> nth=0")
    if "포켓 피봇" not in pg.inner_text(".card[data-y=UPCO] .lg"):
        problems.append(f"{label} 범례에 포켓 피봇 없음")
    if not pg.evaluate("ppFlags(TAB.sections[0].items.find(x => x.y === 'UPCO')).slice(-1)[0] === true"):
        problems.append(f"{label} 차트 포켓 피봇 자리 계산이 오늘을 못 잡음")
    # '▦ 전체' 단추 알림: 새로 좋아진 종목 수(UPCO·6501.T)
    bub = pg.inner_text("#gbtn i") if pg.locator("#gbtn i").count() else ""
    if bub != "새 3":
        problems.append(f"{label} 전체 단추 알림 '{bub}' (기대 새 3)")
    # 전체 판 맨 위 목록: 줄마다 개수, 하루 앞선 종목은 이름 옆에 날짜
    pg.click("#gbtn")
    if "좋아짐 3 · 나빠짐 1" not in pg.inner_text("#panel .sgs summary"):
        problems.append(f"{label} 새 신호 요약 '{pg.inner_text('#panel .sgs summary')}'")
    rows = pg.evaluate("[...document.querySelectorAll('#panel .sgr')].map(r => [r.querySelector('.sgh').firstChild.textContent, r.querySelector('.sgh b').textContent, [...r.querySelectorAll('.sgl button')].map(b => b.dataset.y)])")
    exp_rows = [[n, "3", ["UPCO", "6501.T", "1234.HK"]] for n in ("정배열 진입", "템플릿 통과", "RS선 신고가 돌파", "52주 신고가 돌파", "포켓 피봇")]
    exp_rows += [["정배열 이탈", "1", ["DNCO"]], ["템플릿 이탈", "1", ["DNCO"]]]
    if rows != exp_rows:
        problems.append(f"{label} 새 신호 목록 {rows} (기대 {exp_rows})")
    old = (DAY0 + dt.timedelta(days=248))
    if pg.inner_text("#panel .sgl button[data-y='6501.T'] >> nth=0") != f"히타치{old.month}/{old.day}":
        problems.append(f"{label} 하루 앞선 종목 이름 옆 날짜 '{pg.inner_text('#panel .sgl button[data-y=\"6501.T\"] >> nth=0')}'")
    # 줄 옆 ⓘ 를 누르면 판이 열린 채로 그 신호의 뜻이 아래 상자에 뜬다(줄 제목은 걸러 보기라서)
    for i, name in enumerate(r[0] for r in exp_rows):
        pg.click(f"#panel .sgr >> nth={i} >> .sgi")
        if not pg.is_visible("#tip") or len(pg.inner_text("#tip")) < 30 or pg.is_hidden("#panel") or pg.locator("#chips .chip").count():
            problems.append(f"{label} 새 신호 ⓘ '{name}': 뜻이 안 뜨거나 판이 닫힘")
    pg.click("#panel .sgs .nn")
    if pg.is_visible("#tip"):
        problems.append(f"{label} 새 신호 ⓘ 풀이 상자가 안 닫힘")
    pg.click("#gbtn")
    # 카드의 새 딱지·숫자 줄·범례(포켓 피봇)는 누르면 뜻이 뜬다
    targets = pg.locator(".card[data-y=UPCO] .bd span, .card[data-y=UPCO] .kv span, .card[data-y=UPCO] .lg .lpp, .card[data-y=DNCO] .bd span.wn")
    for i in range(targets.count()):
        t = targets.nth(i)
        txt = t.inner_text()
        t.scroll_into_view_if_needed()
        t.click()
        if not pg.is_visible("#tip") or len(pg.inner_text("#tip")) < 30:
            problems.append(f"{label} '{txt}' 를 눌러도 뜻이 안 뜸")
        pg.click("main > h2 >> nth=0")
    pg.evaluate("window.scrollTo(0, 0)")
    pg.click("#gbtn")
    # 줄 제목을 누르면 그 신호로 걸러 본다
    pg.locator("#panel .sgh", has_text="정배열 이탈").click()
    pg.wait_for_timeout(300)
    cards = pg.evaluate("[...document.querySelectorAll('.card')].map(c => c.dataset.y)")
    chips = pg.evaluate("[...document.querySelectorAll('#chips .chip')].map(c => c.textContent)")
    if cards != ["DNCO"] or chips != ["정배열 이탈"] or not pg.is_hidden("#panel"):
        problems.append(f"{label} 줄 제목 누르기: 카드 {cards}, 칩 {chips}")
    pg.click("#bar .clr")
    # 이름을 누르면 판이 닫히고 그 종목 카드로 간다
    pg.click("#gbtn")
    pg.locator("#panel .sgr", has_text="템플릿 이탈").locator(".sgl button[data-y=DNCO]").click()
    pg.wait_for_timeout(400)
    if not pg.is_hidden("#panel") or not pg.locator(".card.hit[data-y=DNCO]").count():
        problems.append(f"{label} 이름 누르기: 판이 안 닫히거나 그 종목으로 안 감")
    # 걸러 보기에 가려진 종목(정배열 이탈로 거른 상태의 UPCO)도 이름을 누르면 조건을 풀고 그 카드로 간다
    pg.evaluate("window.scrollTo(0, 0)")
    pg.click("#gbtn")
    pg.locator("#panel .sgh", has_text="정배열 이탈").click()
    pg.wait_for_timeout(300)
    pg.click("#gbtn")
    pg.locator("#panel .sgr", has_text="포켓 피봇").locator(".sgl button[data-y=UPCO]").click()
    pg.wait_for_timeout(400)
    if not pg.locator(".card.hit[data-y=UPCO]").count() or pg.locator("#chips .chip").count():
        problems.append(f"{label} 걸러 보기에 가려진 종목 이름 누르기: 조건이 안 풀리거나 그 종목으로 안 감")
    # 10일 저점이 하루 변동폭보다 가까운 DNCO 는 '평소 흔들림' 풀이
    pg.click(".card[data-y=DNCO] .kv span >> nth=1")
    if "평소 흔들림에도" not in pg.inner_text("#tip"):
        problems.append(f"{label} 숫자 줄: 가까운 저점 풀이가 안 뜸")
    pg.click("main > h2 >> nth=0")
    # 걸러 보기 판의 '오늘 새로 생긴 신호' 묶음: 포켓 피봇 → UPCO·6501.T
    pg.evaluate("window.scrollTo(0, 0)")
    pg.click("#fbtn")
    if "오늘 새로 생긴 신호" not in pg.inner_text("#panel"):
        problems.append(f"{label} 걸러 보기 판에 새 신호 묶음 없음")
    pg.locator("#panel .wrap button", has_text="포켓 피봇").first.click()
    pg.click("#panel .foot .go")
    cards = pg.evaluate("[...document.querySelectorAll('.card')].map(c => c.dataset.y)")
    if cards != ["UPCO", "6501.T", "1234.HK"]:
        problems.append(f"{label} 포켓 피봇 걸러 보기 {cards}")
    pg.click("#bar .clr")
    # 거래대금 정렬: 원화로 바꿔 줄 세우고, 환율이 없는 유로 종목은 맨 뒤(노란 딱지 없음)
    def krw(it):
        r = FXR.get(unit(it["y"])[0])
        return it["c"][-1] * it["v"][-1] / r * FXR["KRW"] if r else None
    its = [it for it, _ in SIG_ITEMS if it["y"] not in DROPPED]
    exp = [it["y"] for it in sorted([x for x in its if krw(x) is not None], key=krw, reverse=True)] + ["RHM.DE"]
    pg.click("#sbtn")
    pg.click("#panel .wrap button:text-is('거래대금')")
    pg.wait_for_function("document.querySelector('#sbtn').textContent.includes('거래대금')")
    pg.click("#panel .foot .go")
    got = pg.evaluate("[...document.querySelectorAll('.card')].map(c => c.dataset.y)")
    if got != exp:
        problems.append(f"{label} 거래대금 정렬 {got} (기대 {exp})")
    top = max((x for x in its if krw(x) is not None), key=krw)
    if pg.inner_text(".card .sk >> nth=0") != f"거래대금 {money(krw(top))} 원":
        problems.append(f"{label} 거래대금 정렬 딱지 '{pg.inner_text('.card .sk >> nth=0')}' (기대 {money(krw(top))} 원)")
    if pg.locator('.card[data-y="RHM.DE"] .sk').count():
        problems.append(f"{label} 환율 없는 유로 종목에 거래대금 정렬 딱지가 붙음")
    # 하루 변동폭은 높은 순, 10일 저점까지는 처음 누르면 가까운 순(낮은 순). 화면과 같은 순서로 계산해 같은 값이 같게 나오게 한다
    for name, key, rev in (("하루 변동폭(ADR)", lambda it: sum(it["h"][i] / it["l"][i] - 1 for i in range(230, 250)) / 20 * 100, True),
                           ("10일 저점까지", lambda it: max(0, (1 - min(it["l"][-10:]) / it["c"][-1]) * 100), False)):
        pg.click("#sbtn")
        pg.click(f"#panel .wrap button:text-is('{name}')")
        pg.click("#panel .foot .go")
        got = pg.evaluate("[...document.querySelectorAll('.card')].map(c => c.dataset.y)")
        want = [it["y"] for it in sorted(its, key=key, reverse=rev)]
        if got != want:
            problems.append(f"{label} {name} 정렬 {got} (기대 {want})")
    # 영문 이름이 같아도 한글 이름이 다른 소프트뱅크 둘은 정렬할 때 둘 다 남는다
    pg.click("#sbtn")
    pg.click("#panel .wrap button:text-is('1개월')")
    pg.click("#panel .foot .go")
    if not {"9984.T", "9434.T"} <= set(pg.evaluate("[...document.querySelectorAll('.card')].map(c => c.dataset.y)")):
        problems.append(f"{label} 소프트뱅크 둘 중 하나가 같은 회사로 빠짐")
    r = pg.evaluate(PROBE)
    if r["sw"] > r["vw"] + 2:
        problems.append(f"{label} 신호 화면 가로 넘침 {r['sw']}px")
    if r["bad"]:
        problems.append(f"{label} 신호 화면 깨진 값 '{r['bad']}'")
    pg.click("#bar .clr")
    pg.screenshot(path=str(SHOTS / f"watchlist-{label}-signals.png"))
    # 매크로 탭: 숫자 줄·새 신호 묶음·알림이 없다
    pg.click("#tabs button[data-id=macro]")
    pg.wait_for_timeout(400)
    pg.click("#fbtn")
    if pg.locator(".card .kv").count() or pg.locator("#gbtn i").count() or "오늘 새로 생긴 신호" in pg.inner_text("#panel"):
        problems.append(f"{label} 매크로 탭에 종목용 새 기능이 보임")
    pg.click("#fbtn")
    problems += [f"{label} 신호: {e}" for e in errors]
    pg.close()
    return problems


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
    with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as tmp2:
        make_data(Path(tmp))
        make_signal_data(Path(tmp2))
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

                # 기간 단추: 처음엔 폭 600px 미만 3개월·900px 미만 6개월·그 밖에 1년, 다른 기간을 누르면 차트를 다시 그린다
                want = "3개월" if w < 600 else "6개월" if w < 900 else "1년"
                other = "1년" if w < 900 else "3개월"
                if pg.inner_text("#per button.on") != want:
                    problems.append(f"{label} 기간 처음 값 {pg.inner_text('#per button.on')} (기대 {want})")
                pg.click(f"#per button:text-is('{other}')")
                if pg.inner_text("#per button.on") != other or not pg.evaluate("document.querySelector('canvas').width > 0"):
                    problems.append(f"{label} {other} 단추가 안 먹음")
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
                # 묶음 정의 보기: 섹터 제목 아래 접혀 있고, 펼치면 묶음마다 정의와 대표 종목, 줄을 누르면 그 묶음으로
                pg.click("main > details.gdef summary")
                gtxt = pg.inner_text("main > details.gdef")
                if "AI 서버의 두뇌" not in gtxt or "대표:" not in gtxt:
                    problems.append(f"{label} 묶음 정의 표가 안 보임")
                pg.click("main > details.gdef .gr >> nth=1")
                pg.wait_for_timeout(300)
                if not pg.locator("main > .sub.hit").count():
                    problems.append(f"{label} 묶음 정의 줄을 눌러도 묶음으로 안 감")
                pg.evaluate("window.scrollTo(0, 0)")
                pg.click("main > details.gdef summary")
                # RS선 보는 법: 탭 맨 위에 접혀 있고, 누르면 펼쳐진다
                if pg.evaluate("document.querySelector('main > details.guide').open"):
                    problems.append(f"{label} RS선 보는 법이 처음부터 펼쳐져 있음")
                pg.click("main > details.guide summary")
                if "S&P500" not in pg.inner_text("main > details.guide"):
                    problems.append(f"{label} RS선 보는 법을 눌러도 안 펼쳐짐")
                pg.click("main > details.guide summary")
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
                # 섹터 제목 줄 오른쪽 동그란 단추: 그 섹터의 묶음만 접고(▴→▾, 진한 보라) 펼친다
                pg.click("main > h2 .sfold >> nth=0")
                if pg.evaluate(vis) != n0 - 5 or "shut" not in (pg.get_attribute("main > h2 .sfold >> nth=0", "class") or ""):
                    problems.append(f"{label} 섹터 접기 단추: 카드 {pg.evaluate(vis)} (기대 {n0 - 5})")
                pg.click("main > h2 .sfold >> nth=0")
                if pg.evaluate(vis) != n0 or "shut" in (pg.get_attribute("main > h2 .sfold >> nth=0", "class") or ""):
                    problems.append(f"{label} 섹터 펼치기 단추가 안 됨")
                # 섹터 줄 '▦ 전체' 옆 '⊟ 묶음 접기': 탭의 모든 묶음을 한 번에 접고 펼친다
                pg.click("#cbtn")
                if pg.evaluate(vis) != n0 - 5 or pg.inner_text("#cbtn") != "⊞ 묶음 펼치기":
                    problems.append(f"{label} 묶음 접기 단추: 카드 {pg.evaluate(vis)} (기대 {n0 - 5}), 글자 '{pg.inner_text('#cbtn')}'")
                pg.click("#cbtn")
                if pg.evaluate(vis) != n0 or pg.inner_text("#cbtn") != "⊟ 묶음 접기":
                    problems.append(f"{label} 묶음 펼치기 단추가 안 됨")
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
                # 인더스트리 액션: 카드에 상황판 업종·순위 딱지, 걸러 보기로 그 종목만
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
                # 추세 정렬: 미너비니 점수 높은 순(노란 딱지 'n/8'), 변동성 수축은 처음 누르면 낮은 순
                pg.click("#sbtn")
                pg.click("#panel .wrap button:text-is('추세 점수(미너비니)')")
                pg.click("#panel .foot .go")
                r = look("추세 점수 정렬")
                tts = pg.evaluate("""() => [...document.querySelectorAll('.card .sk')].map(s => parseInt(s.textContent.replace('추세 ', '')))""")
                if not tts or tts[:4] != sorted(tts[:4], reverse=True):
                    problems.append(f"{label} 추세 점수 정렬 순서 {tts}")
                pg.click("#sbtn")
                pg.click("#panel .wrap button:text-is('변동성 수축')")
                if "낮은 순" not in pg.inner_text("#panel .now"):
                    problems.append(f"{label} 변동성 수축이 낮은 순으로 열리지 않음")
                for name in ("52주 고점 대비", "50일선 이격도", "매집 비율", "정배열 며칠째", "신고가 후 며칠"):
                    pg.click(f"#panel .wrap button:text-is('{name}')")
                    look(name)
                pg.click("#panel .wrap button:text-is('추세 점수(미너비니)')")
                pg.click("#panel .foot .go")
                # 추세 점수 딱지를 누르면 조건별 ✓/✗ 풀이 상자가 뜬다(휴대폰용)
                pg.click(".card .sk >> nth=0")
                if not pg.is_visible("#tip") or "✓" not in pg.inner_text("#tip") and "✗" not in pg.inner_text("#tip"):
                    problems.append(f"{label} 추세 딱지를 눌러도 조건 풀이가 안 뜸")
                pg.click("main > h2 >> nth=0")
                if pg.is_visible("#tip"):
                    problems.append(f"{label} 풀이 상자가 안 닫힘")
                pg.click("#bar .clr")
                # 걸러 보기에 '미너비니 템플릿'(8조건 모두)이 있고, 정의에 8조건이 나온다
                pg.click("#fbtn")
                pg.locator("#panel .wrap button", has_text="미너비니 템플릿").first.click()
                if "150일선" not in pg.inner_text("#panel .defs"):
                    problems.append(f"{label} 미너비니 템플릿 정의가 안 보임")
                look("미너비니 템플릿")
                pg.click("#panel .foot button >> nth=0")
                pg.click("#panel .foot .go")
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
            # 새로 생긴 신호·숫자 줄·거래대금(2026-11-23): 신호가 반드시 나도록 만든 자료로 바꿔 다시 연다
            Handler.data_dir = tmp2
            for label, w, h in (("phone", 390, 844), ("pc", 1440, 900)):
                problems += check_signals(b, url, label, w, h)
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
