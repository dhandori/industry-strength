"""와모 차트북: 트레이딩뷰 워치리스트 종목의 1년 일봉을 야후 파이낸스에서 받아 페이지용 자료로 만든다.

사용법: python scripts/watchlist_fetch.py config/watchlist_tabs.json 출력폴더 [이전자료폴더]
- 종목마다 2년 치를 받아 EMA 20/50/200을 계산하고 최근 1년만 저장한다.
- 아직 장이 끝나지 않은 오늘 봉은 뺀다(종가 기준).
- 받지 못한 종목은 이전자료폴더에 있던 어제 자료를 그대로 쓴다.
- RS 등급(rs, 1~99): 지수·매크로 탭과 지수·금리·환율을 뺀 전체 종목 안에서 매긴 상대강도 순위.
"""
import statistics
import datetime as dt
import json
import os
import sys
import time

import requests

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36"}
EMAS = (20, 50, 200)
# 추세 딱지(정배열·크로스)를 붙이지 않는 항목: 변동성지수, 금리, 달러인덱스, 환율(=X)
NO_TREND = {"^VIX", "2YY=F", "^TNX", "^TYX", "DX-Y.NYB"}
HOSTS = ("query1.finance.yahoo.com", "query2.finance.yahoo.com")


def fetch_raw(sym, session):
    last = None
    for attempt in range(4):
        host = HOSTS[attempt % 2]
        try:
            r = session.get(
                f"https://{host}/v8/finance/chart/{requests.utils.quote(sym)}",
                params={"range": "2y", "interval": "1d"}, headers=UA, timeout=20)
            if r.status_code == 200:
                res = r.json()["chart"]["result"]
                if res:
                    return res[0]
            last = f"HTTP {r.status_code}"
        except Exception as e:  # 네트워크 오류는 잠시 뒤 다시 시도
            last = repr(e)
        time.sleep(2 + 3 * attempt)
    raise RuntimeError(last)


def ema(values, span):
    k = 2 / (span + 1)
    out, prev = [], None
    for v in values:
        prev = v if prev is None else v * k + prev * (1 - k)
        out.append(prev)
    return out


def trend_flags(sym, closes, emas, hi, lo):
    """정배열: 종가 > EMA20 > EMA50 > EMA200 (차트에 그린 선 기준)."""
    if sym in NO_TREND or sym.endswith("=X"):
        return {}
    c = closes[-1]
    al = c > emas[20][-1] > emas[50][-1] > emas[200][-1]
    # 골든·데드크로스(차트에 그린 EMA50과 EMA200 기준)
    #  발생: 최근 5거래일 안에 EMA50이 EMA200을 위로(gc) 또는 아래로(dc) 넘었다.
    #  임박: 아직 안 넘었지만 두 선의 간격이 EMA200의 1.5% 이내이고 5거래일 전보다 좁혀지고 있다(gs·ds).
    x = ""
    if len(closes) > 205:
        d0 = emas[50][-1] - emas[200][-1]
        d5 = emas[50][-6] - emas[200][-6]
        near = abs(d0) <= emas[200][-1] * 0.015
        if d0 > 0 >= d5:
            x = "gc"
        elif d0 < 0 <= d5:
            x = "dc"
        elif d0 < 0 and near and d0 > d5:
            x = "gs"
        elif d0 > 0 and near and d0 < d5:
            x = "ds"
    return {"al": al, "x": x}


def digits(price):
    return 2 if price >= 100 else 3 if price >= 10 else 4


def build(item, raw, now):
    meta, q = raw["meta"], raw["indicators"]["quote"][0]
    off = meta.get("gmtoffset", 0)
    rows = []
    for i, ts in enumerate(raw.get("timestamp") or []):
        o, h, l, c, v = (q[k][i] for k in ("open", "high", "low", "close", "volume"))
        if c is None:
            continue
        o = c if o is None else o
        h = max(o, c) if h is None else h
        l = min(o, c) if l is None else l
        if item["y"].endswith("=X"):
            # 야후 환율 자료에는 튀는 꼬리가 섞여 있어, 몸통에서 2.5% 넘게 벗어난 꼬리는 잘라 낸다
            h = min(h, max(o, c) * 1.025)
            l = max(l, min(o, c) * 0.975)
        rows.append((ts, o, h, l, c, v or 0))
    if len(rows) < 30:
        raise RuntimeError("자료 부족")
    # 진행 중인 봉 제거: 정규장이 열려 있고 마지막 봉이 그 장에 속하면 뺀다
    reg = (meta.get("currentTradingPeriod") or {}).get("regular") or {}
    if reg and reg.get("start", 0) <= now < reg.get("end", 0) and rows[-1][0] >= reg["start"]:
        rows.pop()
    closes = [r[4] for r in rows]
    emas = {n: ema(closes, n) for n in EMAS}
    last_day = dt.datetime.fromtimestamp(rows[-1][0] + off, dt.timezone.utc).date()
    try:
        cut = last_day.replace(year=last_day.year - 1)
    except ValueError:
        cut = last_day.replace(year=last_day.year - 1, day=28)
    days = [dt.datetime.fromtimestamp(r[0] + off, dt.timezone.utc).date() for r in rows]
    start = next(i for i, d in enumerate(days) if d > cut)
    dg = digits(closes[-1])
    rd = lambda xs: [round(x, dg) for x in xs[start:]]
    win = closes[start:]
    hi, lo = max(win), min(win)
    return {
        "y": item["y"], "n": item["n"], "b": item.get("b", ""), "t": item.get("t", []), "k": item.get("k", ""), "dg": dg,
        "d": [d.strftime("%y%m%d") for d in days[start:]],
        "o": rd([r[1] for r in rows]), "h": rd([r[2] for r in rows]),
        "l": rd([r[3] for r in rows]), "c": rd(closes),
        "v": [int(r[5]) for r in rows[start:]],
        "e": {str(n): rd(emas[n]) for n in EMAS},
        "hi": round(hi, dg), "lo": round(lo, dg),
        "ph": round((win[-1] / hi - 1) * 100, 1), "pl": round((win[-1] / lo - 1) * 100, 1),
        "chg": round((win[-1] / win[-2] - 1) * 100, 2),
        **trend_flags(item["y"], closes, emas, hi, lo),
    }


def search_index(tabs):
    """차트북 검색용 색인: 탭을 열지 않아도 모든 종목을 찾게 한다.
    한 줄 = [야후기호, 이름, 한글 이름, 별칭('|'로 잇기), 딱지(' · '로 잇기), 탭 id, 섹터 이름]."""
    return [[it["y"], it["n"], it.get("kn", ""), "|".join(it.get("al", [])), " · ".join(it.get("t", [])),
             tab["id"], sec["name"]]
            for tab in tabs for sec in tab["sections"] for it in sec["items"]]


def is_stock(tab_id, sym):
    """RS 등급을 매길 대상: 지수·매크로 탭이 아니고, 지수(^)·금리·환율·선물(=)이 아닌 종목."""
    return tab_id != "macro" and not sym.startswith("^") and "=" not in sym and sym not in NO_TREND


def rs_score(closes):
    """IBD 방식 가중 수익률: 3개월 40%, 6·9·12개월 각 20%. 저장된 1년 치 종가로 계산한다."""
    n = len(closes)
    if n < 64:
        return None
    ret = lambda k: closes[-1] / closes[max(0, n - 1 - k)] - 1
    return 0.4 * ret(63) + 0.2 * ret(126) + 0.2 * ret(189) + 0.2 * ret(n - 1)


def add_rs(tabs_out):
    """종목마다 rs(1~99)를 붙인다. 점수가 높을수록 99에 가깝다. 대상이 아닌 항목은 rs 칸을 지운다."""
    scored = []
    for tab_id, sections in tabs_out:
        for s in sections:
            for it in s["items"]:
                it.pop("rs", None)
                sc = rs_score(it["c"]) if is_stock(tab_id, it["y"]) else None
                if sc is not None:
                    scored.append((sc, it))
    scored.sort(key=lambda x: x[0])
    n = len(scored)
    for i, (_, it) in enumerate(scored):
        it["rs"] = 99 if n == 1 else 1 + round(98 * i / (n - 1))
    return n


# ── 인더스트리 액션: 같은 하부섹터(첫 딱지) 종목이 함께 강한지 본다(옛 와모 '섹터액션' 규칙) ──
# 상장 시장별 비교 지수(매크로 탭에 있는 것)
BENCH = {"KS": "^KS11", "KQ": "^KQ11", "T": "^N225", "TW": "^TWII", "TWO": "^TWII", "HK": "^HSI",
         "SS": "000001.SS", "SZ": "000001.SS"}
IA_WINDOWS = (7, 30)  # 거래일


def bench_of(sym):
    return BENCH.get(sym.rsplit(".", 1)[1], "^GSPC") if "." in sym else "^GSPC"


def ret_pct(closes, w):
    return (closes[-1] / closes[-1 - w] - 1) * 100 if len(closes) > w and closes[-1 - w] else None


def ia_window(members, bench, w):
    """한 기간의 다섯 항목. 묶음이 3종목 이상이고, 수익률·시장 대비 중간값이 모두 플러스이며 4개 이상 채우면 액션."""
    ema = "20" if w == 7 else "50"
    rows = []
    for it in members:
        r, b = ret_pct(it["c"], w), ret_pct(bench.get(bench_of(it["y"])) or [], w)
        if r is None or b is None:
            continue
        rows.append((r, r - b, it["c"][-1] > it["e"][ema][-1]))
    if len(rows) < 3:
        return None
    pct = lambda xs: sum(xs) / len(xs) * 100
    med_r, med_x = statistics.median(x[0] for x in rows), statistics.median(x[1] for x in rows)
    crit = [med_r > 0, med_x > 0, pct([x[0] > 0 for x in rows]) >= 60,
            pct([x[1] > 0 for x in rows]) >= 60, pct([x[2] for x in rows]) >= 60]
    n = sum(crit)
    return {"w": w, "n": n, "r": round(med_r, 1), "x": round(med_x, 1), "ok": bool(crit[0] and crit[1] and n >= 4)}


def add_ia(tabs_out):
    """하부섹터 묶음마다 7·30거래일 액션을 보고, 액션인 묶음의 종목에 ia = {w: [기간], n: 최대 충족 수} 를 붙인다."""
    bench = {it["y"]: it["c"] for tab_id, sections in tabs_out for s in sections for it in s["items"]
             if it["y"] in BENCH.values() or it["y"] == "^GSPC"}
    found = 0
    for tab_id, sections in tabs_out:
        for s in sections:
            groups = {}
            for it in s["items"]:
                it.pop("ia", None)
                if is_stock(tab_id, it["y"]) and it.get("t"):
                    groups.setdefault(it["t"][0], []).append(it)
            for members in groups.values():
                res = [r for r in (ia_window(members, bench, w) for w in IA_WINDOWS) if r]
                hit = [r for r in res if r["ok"]]
                if not hit:
                    continue
                found += 1
                for it in members:
                    it["ia"] = {"w": [r["w"] for r in hit], "n": max(r["n"] for r in hit)}
    return found


KST = dt.timezone(dt.timedelta(hours=9))


def slot_start(now):
    """갱신 회차의 시작 시각. 아침 회차(06:10 KST, 미국장 마감 뒤)와 저녁 회차(17:40 KST, 아시아장 마감 뒤)."""
    morning = now.replace(hour=6, minute=10, second=0, microsecond=0)
    evening = now.replace(hour=17, minute=40, second=0, microsecond=0)
    if now >= evening:
        return evening
    if now >= morning:
        return morning
    return evening - dt.timedelta(days=1)


def is_fresh(meta, now):
    """이번 회차에 이미 갱신했고 실패가 3개 이하이면 다시 받을 필요가 없다."""
    done = dt.datetime.strptime(meta["updated"], "%Y-%m-%d %H:%M").replace(tzinfo=KST)
    return done >= slot_start(now) and len(meta.get("failed") or []) <= 3


def tab_summary(sections):
    its = [it for s in sections for it in s["items"]]
    return {"al": sum(1 for x in its if x.get("al")),
            "g": sum(1 for x in its if x.get("x") in ("gc", "gs")),
            "d": sum(1 for x in its if x.get("x") in ("dc", "ds")),
            "up": sum(1 for x in its if x.get("chg", 0) >= 5),
            "dn": sum(1 for x in its if x.get("chg", 0) <= -5)}


def main():
    tabs_path, out_dir = sys.argv[1], sys.argv[2]
    prev_dir = sys.argv[3] if len(sys.argv) > 3 else None
    kst_now = dt.datetime.now(KST)
    # 이번 회차(아침 06:10, 저녁 17:40 KST 이후)에 이미 갱신했다면 다시 받지 않는다. FORCE=1 이면 무조건 받는다.
    if prev_dir and os.environ.get("FORCE") != "1":
        try:
            m = json.load(open(os.path.join(prev_dir, "meta.json"), encoding="utf-8"))
            if is_fresh(m, kst_now):
                print("이미 최신:", m["updated"])
                return
        except (OSError, ValueError, KeyError):
            pass
    os.makedirs(out_dir, exist_ok=True)
    tabs = json.load(open(tabs_path, encoding="utf-8"))
    session = requests.Session()
    now = int(time.time())
    failed, summary, total, tabs_out = [], [], 0, []
    for tab in tabs:
        prev = {}
        if prev_dir:
            p = os.path.join(prev_dir, f"{tab['id']}.json")
            if os.path.exists(p):
                for s in json.load(open(p, encoding="utf-8"))["sections"]:
                    prev.update({it["y"]: it for it in s["items"]})
        sections = []
        for sec in tab["sections"]:
            items = []
            for item in sec["items"]:
                total += 1
                try:
                    items.append(build(item, fetch_raw(item["y"], session), now))
                except Exception as e:
                    failed.append({"y": item["y"], "n": item["n"], "why": str(e)[:80]})
                    if item["y"] in prev:
                        old = prev[item["y"]]
                        old["stale"] = True
                        old.update({k: item.get(k, d) for k, d in (("n", ""), ("b", ""), ("t", []), ("k", ""))})
                        items.append(old)
                    print("실패", item["y"], e, file=sys.stderr)
                time.sleep(0.25)
            sections.append({"name": sec["name"], "items": items})
        tabs_out.append((tab["id"], sections))
    # RS 등급은 모든 탭을 다 받은 뒤 전체 종목 안에서 한 번에 매긴다
    print("RS 등급 대상", add_rs(tabs_out))
    print("인더스트리 액션 묶음", add_ia(tabs_out))
    for tab, (_, sections) in zip(tabs, tabs_out):
        with open(os.path.join(out_dir, f"{tab['id']}.json"), "w", encoding="utf-8") as f:
            json.dump({"id": tab["id"], "title": tab["title"], "sections": sections}, f,
                      ensure_ascii=False, separators=(",", ":"))
        summary.append({"id": tab["id"], "title": tab["title"],
                        "count": sum(len(s["items"]) for s in sections), **tab_summary(sections)})
    kst = dt.datetime.now(KST)
    with open(os.path.join(out_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump({"updated": kst.strftime("%Y-%m-%d %H:%M"), "tabs": summary,
                   "total": total, "failed": failed, "index": search_index(tabs)}, f, ensure_ascii=False, indent=1)
    print(f"완료: {total}개 중 실패 {len(failed)}개")
    # 절반 넘게 실패하면 갱신 실패로 처리해 어제 페이지를 지키게 한다
    if total and len(failed) > total / 2:
        sys.exit(1)


if __name__ == "__main__":
    main()
