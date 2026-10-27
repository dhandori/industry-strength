"""미국 물가·고용(고통지수) → docs/data/us_econ.json

자료: 세인트루이스 연준 FRED의 공개 CSV(fredgraph.csv, API 키 필요 없음).
발표 주기: CPI(매월 중순), 고용보고서·실업률(매월 첫 금요일), PCE(매월 말), 구인건수(JOLTS, 매월 초),
신규·계속 실업수당 청구(매주 목요일), 10년 기대인플레(매일). 모두 미국 동부 08:30(한국 21:30~22:30) 발표.
→ .github/workflows/us-econ.yml 이 매일 밤·아침에 돌린다.

python scripts/us_econ.py            # 수집 + 저장
python scripts/us_econ.py --dry-run  # 저장하지 않고 요약만
"""
import csv
import io
import json
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "docs" / "data" / "us_econ.json"
KST = timezone(timedelta(hours=9))
# FRED는 브라우저인 척하는 User-Agent(Mozilla/…)를 막는다 → 봇 이름 그대로 밝힌다
UA = {"User-Agent": "industry-strength-bot/1.0 (+https://github.com/dhandori/industry-strength)"}
KEEP_FROM = "2014-01-01"   # 화면 그래프는 최근 10년 남짓이면 충분(고통지수만 전체 역사)


def fred(series_id):
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                rows = list(csv.reader(io.StringIO(r.read().decode("utf-8"))))
            break
        except Exception:  # noqa: BLE001
            if i == 2:
                raise
            time.sleep(5 * (i + 1))
    out = []
    for d, v in rows[1:]:
        try:
            out.append((d, float(v)))
        except ValueError:   # 빈 값('.')은 건너뜀
            pass
    return out


def yoy(s):
    """월별 지수 → 전년 같은 달 대비 %."""
    m = dict(s)
    out = []
    for d, v in s:
        y = f"{int(d[:4]) - 1}{d[4:]}"
        if y in m and m[y]:
            out.append((d, round((v / m[y] - 1) * 100, 2)))
    return out


def ann3(s):
    """월별 지수 → 최근 3개월 변화를 연율로(물가가 지금 얼마나 빨리 오르는지)."""
    return [(s[i][0], round(((s[i][1] / s[i - 3][1]) ** 4 - 1) * 100, 2)) for i in range(3, len(s))]


def diff(s, scale=1):
    return [(s[i][0], round((s[i][1] - s[i - 1][1]) * scale, 1)) for i in range(1, len(s))]


def avg(s, n):
    return [(s[i][0], round(sum(v for _, v in s[i - n + 1:i + 1]) / n, 2)) for i in range(n - 1, len(s))]


def pack(key, s, **kw):
    """지표 하나: 최신 값, 직전 값, 1년 전 값, 그래프용 자료."""
    s = [p for p in s if p[1] is not None]
    keep = kw.pop("keep_from", KEEP_FROM)
    last, prev = s[-1], s[-2] if len(s) > 1 else (None, None)
    d = datetime.strptime(last[0], "%Y-%m-%d")
    ago = (d.replace(year=d.year - 1)).strftime("%Y-%m-%d")
    year_ago = next((v for dd, v in reversed(s) if dd <= ago), None)
    return {"key": key, "date": last[0], "value": last[1], "prev": prev[1], "prev_date": prev[0], "year_ago": year_ago,
            "series": [[dd, v] for dd, v in s if dd >= keep], **kw}


def main():
    dry = "--dry-run" in sys.argv
    raw = {k: fred(k) for k in ["CPIAUCSL", "CPILFESL", "PCEPILFE", "UNRATE", "UNEMPLOY", "ICSA", "CCSA",
                                 "PAYEMS", "SAHMREALTIME", "T10YIE", "JTSJOL", "DGS2", "DGS10", "DGS30"]}
    cpi = yoy(raw["CPIAUCSL"])
    un = dict(raw["UNRATE"])
    misery = [(d, round(v + un[d], 2)) for d, v in cpi if d in un]
    mv = [v for _, v in misery]
    last = misery[-1][1]
    pct_rank = round(sum(1 for v in mv if v <= last) / len(mv) * 100)
    peak = max(misery, key=lambda p: p[1])
    five = [v for d, v in misery if d >= f"{int(misery[-1][0][:4]) - 5}{misery[-1][0][4:]}"]

    # 구인건수 ÷ 실업자 수: 1보다 크면 일자리가 사람보다 많음(노동시장 빡빡)
    unemp = dict(raw["UNEMPLOY"])
    vu = [(d, round(v / unemp[d], 2)) for d, v in raw["JTSJOL"] if d in unemp and unemp[d]]

    claims4 = avg(raw["ICSA"], 4)
    nfp = diff(raw["PAYEMS"])            # 천 명
    nfp3 = avg(nfp, 3)

    # 미국 국채 금리(매일): 2년·10년·30년을 같은 날짜끼리 묶는다
    y2, y10, y30 = (dict(raw[k]) for k in ("DGS2", "DGS10", "DGS30"))
    tr = [[d, y2[d], v, y30[d]] for d, v in raw["DGS10"] if d in y2 and d in y30 and d >= KEEP_FROM]

    def ago(n=None, days=None):
        """n거래일 전(또는 days일 전 이전의 마지막 날) 값."""
        if n is not None:
            return tr[-1 - n] if len(tr) > n else None
        cut = (datetime.strptime(tr[-1][0], "%Y-%m-%d") - timedelta(days=days)).strftime("%Y-%m-%d")
        return next((r for r in reversed(tr) if r[0] <= cut), None)
    treasury = {"date": tr[-1][0], "now": tr[-1][1:], "w1": ago(5), "m1": ago(days=30), "y1": ago(days=365),
                "series": tr}

    data = {
        "updated_at": datetime.now(KST).strftime("%Y-%m-%d %H:%M KST"),
        "source": "FRED (St. Louis Fed)",
        "misery": {**pack("misery", misery, keep_from="1948-01-01"),
                   "cpi": cpi[-1][1], "unrate": un[misery[-1][0]],
                   "pct_rank": pct_rank, "avg": round(sum(mv) / len(mv), 2),
                   "peak": peak, "five_lo": min(five), "five_hi": max(five)},
        "treasury": treasury,
        "indicators": [
            pack("cpi", cpi, extra=ann3(raw["CPIAUCSL"])[-1][1]),
            pack("core_cpi", yoy(raw["CPILFESL"]), extra=ann3(raw["CPILFESL"])[-1][1]),
            pack("core_pce", yoy(raw["PCEPILFE"]), extra=ann3(raw["PCEPILFE"])[-1][1]),
            pack("breakeven", raw["T10YIE"], keep_from="2021-01-01"),
            pack("unrate", raw["UNRATE"]),
            pack("sahm", raw["SAHMREALTIME"]),
            pack("payrolls", nfp, extra=nfp3[-1][1]),
            pack("claims", raw["ICSA"], extra=claims4[-1][1], keep_from="2021-06-01"),
            pack("cont_claims", raw["CCSA"], keep_from="2021-06-01"),
            pack("vu", vu),
        ],
    }
    print(f"국채 {tr[-1][0]}: 2년 {tr[-1][1]} · 10년 {tr[-1][2]} · 30년 {tr[-1][3]} ({len(tr)}일)")
    print(f"고통지수 {misery[-1][0]}: {last} (CPI {cpi[-1][1]} + 실업률 {un[misery[-1][0]]}) · 역사 백분위 {pct_rank}%")
    for i in data["indicators"]:
        print(f"  {i['key']:12} {i['date']} {i['value']} (직전 {i['prev']}, 1년 전 {i['year_ago']}) {len(i['series'])}점")
    if dry:
        return
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"저장: {OUT} ({OUT.stat().st_size // 1024}KB)")


if __name__ == "__main__":
    main()
