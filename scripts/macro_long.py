"""매크로 지표 장기 자료 → docs/data/macro_long.json (매주 값)

매크로 탭 시장 지표(wamo_macro.json)는 최근 2년치만 온다. 장기로 봐야 하는 미국 지표는 여기서
FRED·Yahoo 공개 자료로 길게 받아 둔다. 화면은 5년·10년·전체를 고를 때만 이 파일을 쓰고,
최근 2년은 wamo_macro.json 값을 그대로 이어 붙인다(단위는 그쪽과 같게 맞춤).

  us_curve  장단기 금리차 10년−2년 (bp)       FRED T10Y2Y × 100        1976~
  vix       VIX                                FRED VIXCLS              1990~
  vix_ratio VIX ÷ VIX3M                        FRED VIXCLS ÷ VXVCLS     2007~
  us_liq    순유동성 (십억$)                   (WALCL − WTREGEN)/1000 − RRPONTSYD   2002~ (매주)
  move      MOVE                               Yahoo ^MOVE              2002~
  us_hy/us_ig  하이일드·투자등급 스프레드 (bp)  FRED BAML… × 100         최근 3년만 공개됨

한국 지표(ECOS·한투)와 공포탐욕지수는 공개 장기 자료가 없어 2년 그대로다. us-econ.yml 이 매일 돌린다.
"""
import csv
import io
import json
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "docs" / "data" / "macro_long.json"
KST = timezone(timedelta(hours=9))
BOT = {"User-Agent": "industry-strength-bot/1.0 (+https://github.com/dhandori/industry-strength)"}
BROWSER = {"User-Agent": "Mozilla/5.0"}


def get(url, headers):
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as r:
                return r.read().decode("utf-8")
        except Exception:  # noqa: BLE001
            if i == 2:
                raise
            time.sleep(5 * (i + 1))


def fred(sid):
    rows = list(csv.reader(io.StringIO(get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}", BOT))))
    out = {}
    for d, v in rows[1:]:
        try:
            out[d] = float(v)
        except ValueError:
            pass
    return out


def yahoo(sym):
    j = json.loads(get(f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?period1=946684800&period2=4102444800&interval=1d", BROWSER))
    r = j["chart"]["result"][0]
    out = {}
    for t, c in zip(r["timestamp"], r["indicators"]["quote"][0]["close"]):
        if c is not None:
            out[datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%d")] = c
    return out


def weekly(m, nd=2):
    """날짜→값 → 주마다(월~금) 마지막 값 [[날짜, 값]]"""
    out, last = [], None
    for d in sorted(m):
        y, w, _ = date.fromisoformat(d).isocalendar()
        if (y, w) == last:
            out[-1] = [d, round(m[d], nd)]
        else:
            out.append([d, round(m[d], nd)])
            last = (y, w)
    return out


def main():
    S, err = {}, []

    def run(key, fn):
        try:
            S[key] = fn()
        except Exception as e:  # noqa: BLE001
            err.append(f"{key}: {e}")

    run("us_curve", lambda: weekly({d: v * 100 for d, v in fred("T10Y2Y").items()}, 0))
    vix = {}
    run("vix", lambda: weekly(vix.setdefault("v", fred("VIXCLS"))))

    def ratio():
        v, v3 = vix.get("v") or fred("VIXCLS"), fred("VXVCLS")
        return weekly({d: v[d] / v3[d] for d in v if d in v3 and v3[d]}, 3)
    run("vix_ratio", ratio)

    def liq():
        wal, tga, rrp = fred("WALCL"), fred("WTREGEN"), fred("RRPONTSYD")
        rd = sorted(rrp)
        out, j = {}, -1
        for d in sorted(wal):
            if d not in tga:
                continue
            while j + 1 < len(rd) and rd[j + 1] <= d:
                j += 1
            out[d] = (wal[d] - tga[d]) / 1000 - (rrp[rd[j]] if j >= 0 else 0)
        return weekly(out, 1)
    run("us_liq", liq)
    run("move", lambda: weekly(yahoo("%5EMOVE"), 1))
    run("us_hy", lambda: weekly({d: v * 100 for d, v in fred("BAMLH0A0HYM2").items()}, 0))
    run("us_ig", lambda: weekly({d: v * 100 for d, v in fred("BAMLC0A0CM").items()}, 0))

    old = json.loads(OUT.read_text()) if OUT.exists() else {}
    for k in old.get("series", {}):   # 이번에 못 받은 지표는 지난 값 유지
        S.setdefault(k, old["series"][k])
    data = {"_note": "매크로 시장 지표 장기 자료(매주). scripts/macro_long.py", "updated_at": datetime.now(KST).strftime("%Y-%m-%d %H:%M KST"),
            "series": S}
    if old.get("series") != S:
        OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    print("매크로 장기:", ", ".join(f"{k} {v[0][0][:4]}~ {len(v)}주" for k, v in S.items()), ("| 실패 " + "; ".join(err)) if err else "")


if __name__ == "__main__":
    main()
