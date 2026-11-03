"""미국 전체 옵션 거래소 풋콜레이시오 → docs/data/putcall_occ.json

자료: OCC(미국 옵션 청산소) 일별 거래량 조회(공개, 키 필요 없음). 미국 옵션 거래소 20곳 거래량이 종목·풋/콜·거래소별로 나온다.
Cboe가 발표하는 풋콜은 Cboe 거래소 한 곳 값이라, Barchart $CPCS 처럼 시장 전체 흐름과 다를 때가 있다(2026-10 말 0.66 대 0.8대).
  stock = 개별 주식 옵션만(ETF·지수 제외 — 나스닥 종목 목록의 ETF 표시로 가름)
  all   = 모든 옵션(주식·ETF·지수)
OCC는 최근 2년만 조회되고 하루 늦게(다음 날 미국 아침) 나온다. 처음엔 2년치를 채우고(약 15분), 그 뒤엔 최근 2주만 다시 본다.
us-econ.yml 이 매일 돌린다.
"""
import csv
import io
import json
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "docs" / "data" / "putcall_occ.json"
KST = timezone(timedelta(hours=9))
UA = {"User-Agent": "Mozilla/5.0 (industry-strength-bot)"}
OCC = ("https://marketdata.theocc.com/volume-query?reportDate={}&format=csv&volumeQueryType=O&symbolType=ALL"
       "&reportType=D&accountType=ALL&productKind=ALL&porc=BOTH")
SYMS = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqtraded.txt"


def get(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as r:
                return r.read().decode("utf-8", "ignore")
        except Exception:  # noqa: BLE001
            time.sleep(3 * (i + 1))
    return None


def etf_map():
    """미국 상장 종목 → ETF 여부(Y/N). 목록에 없는 기초자산(SPX·VIX 같은 지수 등)은 주식에서 뺀다"""
    txt = get(SYMS) or ""
    return {r["Symbol"]: r["ETF"] for r in csv.DictReader(io.StringIO(txt), delimiter="|") if r.get("Symbol")}


def one(d, etf):
    txt = get(OCC.format(d.strftime("%Y%m%d")))
    if not txt or not txt.startswith("quantity"):
        return None   # 휴장일·아직 안 나온 날·2년 넘은 날
    sp = sc = ap = ac = 0
    for r in csv.DictReader(io.StringIO(txt)):
        try:
            q = int(r["quantity"])
        except ValueError:
            continue
        put = r["porc"] == "P"
        if put:
            ap += q
        else:
            ac += q
        if etf.get(r["underlying"]) == "N":
            if put:
                sp += q
            else:
                sc += q
    if not sc or not ac:
        return None
    return d.isoformat(), round(sp / sc, 3), round(ap / ac, 3)


def main():
    old = json.loads(OUT.read_text()) if OUT.exists() else {}
    stock, allp = dict(old.get("stock", [])), dict(old.get("all", []))
    etf = etf_map()
    if len(etf) < 5000:
        print("종목 목록을 못 받아 건너뜀")
        return
    today = date.today()
    start = today - timedelta(days=14) if stock else today - timedelta(days=730)
    days = [start + timedelta(days=i) for i in range((today - start).days + 1)]
    days = [d for d in days if d.weekday() < 5 and (not stock or d.isoformat() not in stock or d >= today - timedelta(days=5))]
    with ThreadPoolExecutor(4) as ex:
        for r in ex.map(lambda d: one(d, etf), days):
            if r:
                d, s, a = r
                stock[d], allp[d] = s, a
    data = {"_note": "미국 전체 옵션 거래소(OCC) 풋콜레이시오. stock=개별 주식, all=전체. scripts/putcall_occ.py",
            "updated_at": datetime.now(KST).strftime("%Y-%m-%d %H:%M KST"),
            "stock": sorted([k, v] for k, v in stock.items()), "all": sorted([k, v] for k, v in allp.items())}
    if old.get("stock") != data["stock"] or old.get("all") != data["all"]:
        OUT.write_text(json.dumps(data, separators=(",", ":")) + "\n")
    s = data["stock"]
    print(f"OCC 풋콜: {s[0][0]}~{s[-1][0]} {len(s)}일 · 주식 {s[-1][1]} · 전체 {data['all'][-1][1]}" if s else "OCC 풋콜: 자료 없음")


if __name__ == "__main__":
    main()
