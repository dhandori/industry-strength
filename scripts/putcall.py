"""CBOE 풋콜레이시오 → docs/data/putcall.json

자료: Cboe Options 거래소 일일 통계(공개, 키 필요 없음)
  - 2006-11 ~ 2019-10: 옛 CSV(equitypc.csv · totalpc.csv)
  - 2019-10 ~ 지금 : 날마다 JSON(cdn.cboe.com/data/us/options/market_statistics/daily/날짜_daily_options)
equity = 개별 주식 옵션의 풋 거래량 ÷ 콜 거래량(흔히 보는 '주식 풋콜'), total = 전체 상품(지수·ETF 포함).
처음 한 번은 2019년부터 날짜를 하나씩 받아 채우고(수 분), 그 뒤엔 최근 3주만 다시 받아 붙인다.
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

OUT = Path(__file__).resolve().parent.parent / "docs" / "data" / "putcall.json"
KST = timezone(timedelta(hours=9))
UA = {"User-Agent": "Mozilla/5.0 (industry-strength-bot)"}
OLD = "https://cdn.cboe.com/resources/options/volume_and_call_put_ratios/{}.csv"
DAY = "https://cdn.cboe.com/data/us/options/market_statistics/daily/{}_daily_options"
JSON_FROM = date(2019, 10, 7)


def get(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):
                return None   # 휴장일·아직 안 나온 날
        except Exception:  # noqa: BLE001
            pass
        time.sleep(2 * (i + 1))
    return None


def old_csv(name):
    """옛 CSV: DATE,CALL,PUT,TOTAL,P/C Ratio (앞에 설명 줄이 붙어 있다)"""
    raw = get(OLD.format(name))
    out = {}
    if not raw:
        return out
    for row in csv.reader(io.StringIO(raw.decode("utf-8", "ignore"))):
        if len(row) < 5:
            continue
        try:
            d = datetime.strptime(row[0].strip(), "%m/%d/%Y").strftime("%Y-%m-%d")
            c, p = float(row[1]), float(row[2])
        except ValueError:
            continue
        if c > 0:
            out[d] = round(p / c, 3)
    return out


def day(d):
    raw = get(DAY.format(d.isoformat()))
    if not raw:
        return None
    try:
        j = json.loads(raw)
        def pc(key):
            v = next(x for x in j[key] if x["name"] == "VOLUME")
            return round(v["put"] / v["call"], 3) if v["call"] else None
        return d.isoformat(), pc("EQUITY OPTIONS"), pc("SUM OF ALL PRODUCTS")
    except Exception:  # noqa: BLE001
        return None


def main():
    old = json.loads(OUT.read_text()) if OUT.exists() else {}
    eq = dict(old.get("equity", []))
    tot = dict(old.get("total", []))
    if not eq:
        eq.update(old_csv("equitypc"))
        tot.update(old_csv("totalpc"))
        start = JSON_FROM
    else:
        start = date.today() - timedelta(days=21)
    days = [start + timedelta(days=i) for i in range((date.today() - start).days + 1)]
    days = [d for d in days if d.weekday() < 5]
    with ThreadPoolExecutor(6) as ex:
        for r in ex.map(day, days):
            if r:
                d, e, t = r
                if e is not None:
                    eq[d] = e
                if t is not None:
                    tot[d] = t
    data = {"_note": "Cboe 풋콜레이시오(풋 거래량 ÷ 콜 거래량). scripts/putcall.py", "updated_at": datetime.now(KST).strftime("%Y-%m-%d %H:%M KST"),
            "equity": sorted([k, v] for k, v in eq.items()), "total": sorted([k, v] for k, v in tot.items())}
    if old.get("equity") != data["equity"] or old.get("total") != data["total"]:
        OUT.write_text(json.dumps(data, separators=(",", ":")) + "\n")
    e = data["equity"]
    print(f"풋콜: 주식 {e[0][0]}~{e[-1][0]} {len(e)}일 · 마지막 {e[-1][1]} / 전체 {data['total'][-1]}")


if __name__ == "__main__":
    main()
