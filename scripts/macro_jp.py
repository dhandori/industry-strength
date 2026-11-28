"""일본 매크로 지표 → docs/data/macro_JP.json (매크로 지수 탭의 일본 칸, 2026-11-16 추가).

한국·미국 지표는 wamo-choochoo-dashboard 의 wamo_macro.py 가 wamo_macro.json 으로 만든다. 일본 지표를 그 파일에 섞으면
첫 화면 '오늘 시장 위험도'(한국·미국 지표 종합)가 바뀌므로, 일본은 여기서 같은 계산법으로 따로 만든다.
모양은 wamo_macro.json 과 같다(asOf·composite·indicators·errors·method). 화면(docs/macro.js)은 일본을 고르면 이 파일을 쓴다.

판정(wamo_macro.judge·composite 를 그대로 옮김): 최근 5년 백분위로 기본 5단계(위험한 쪽 50·75·90·97 경계) +
1개월(21거래일) 변화가 표준점수 2 이상 빠르면 한 단계, 3 이상이면 두 단계 위험하게.

지표(모두 무료 공개 자료):
- 일본 10년 국채 금리·장단기 금리차(10년 − 2년): 재무성 국채 금리 정보(jgbcm_all.csv + 이번 달 jgbcm.csv)
- 미일 10년 금리차: FRED DGS10(느리면 야후 ^TNX) − 재무성 10년
- 엔/달러 환율: 야후 JPY=X
- 닛케이225 고점 대비 낙폭(최근 1년 최고 종가 기준): 야후 ^N225 일봉. 주가를 직접 보는 지표(2026-11-22)
- 닛케이225 실현 변동성(20일, 연율): 야후 ^N225 일봉으로 직접 계산. 닛케이 VI 공식 파일은 '무단 복제·전재 금지'
  문구가 있어 공개 화면에 원자료를 싣지 않는다.

종합(2026-11-22, wamo_macro.py 와 같이 고침): 지표를 한데 평균하지 않고 '주식시장 충격'(변동성·주가 낙폭)과
'금리·환율 스트레스'(나머지) 두 줄로 따로 낸다(markets.JP). 대표 단계(composite.level)는 둘 중 나쁜 쪽.

python scripts/macro_jp.py
"""
from __future__ import annotations

import io
import json
import math
import statistics
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs/data/macro_JP.json"
KST = ZoneInfo("Asia/Seoul")
UA = {"User-Agent": "Mozilla/5.0 (industry-strength macro_jp)"}
YEARS = 5
CHANGE_DAYS = 21
CHART_DAYS = 520
LEVELS = {5: ("🟢", "정상"), 4: ("🔵", "관심"), 3: ("🟡", "주의"), 2: ("🟠", "경계"), 1: ("🔴", "위기")}

INDICATORS = [
    dict(key="jp_10y", group="일본 금리", name="일본 10년 국채 금리", unit="%", risk="high",
         help="일본 정부가 10년 동안 돈을 빌릴 때 내는 이자입니다. 일본은행이 오래 눌러 두던 금리라서, 빠르게 오르면 엔화 캐리 자금이 되돌아가고 주식·채권이 함께 흔들릴 수 있습니다."),
    dict(key="jp_curve", group="일본 금리", name="일본 장단기 금리차 (국채 10년 − 2년)", unit="bp", risk="both",
         help="10년 국채 금리에서 2년 국채 금리를 뺀 값입니다. 너무 좁아지면 경기 둔화 신호이고, 갑자기 크게 벌어지면 장기 금리가 불안하다는 신호입니다."),
    dict(key="usjp_10y", group="일본 금리", name="미일 10년 금리차 (미국 − 일본)", unit="bp", risk="low",
         help="미국 10년 금리에서 일본 10년 금리를 뺀 값입니다. 엔을 빌려 달러 자산을 사는 '엔 캐리'는 이 차이만큼 이익을 보기 때문에, 차이가 빠르게 좁아지면 캐리 자금이 청산되면서 엔화가 급등하고 증시가 흔들립니다. 2024년 8월이 그랬습니다."),
    dict(key="usdjpy", group="일본 환율", name="엔/달러 환율", unit="엔", risk="low",
         help="1달러를 사는 데 드는 엔화 금액이라서, 숫자가 작아질수록 엔화가 강해진 것입니다. 엔화가 갑자기 강해지면 수출 기업 이익이 줄고 엔 캐리 청산까지 겹쳐 일본 증시에 부담이 됩니다."),
    dict(key="jp_vol", group="변동성", name="닛케이225 실현 변동성 (20일)", unit="%", risk="high",
         help="최근 20거래일 동안 닛케이225가 하루하루 얼마나 출렁였는지를 1년 기준으로 바꾼 값입니다. 20% 아래면 평온한 장이고, 30% 위면 불안한 장입니다. 일본판 VIX(닛케이 VI) 대신 실제 움직임으로 쟀습니다."),
    dict(key="jp_dd", group="주가", name="닛케이225 고점 대비 낙폭 (최근 1년 최고가 기준)", unit="%", risk="low",
         help="닛케이225가 최근 1년 동안 가장 높았던 종가에서 지금 몇 % 내려와 있는지 나타냅니다. 0이면 신고가이고, -10%를 넘으면 조정장, -20%를 넘으면 약세장이라고 부릅니다."),
]
STOCK_KEYS = {"jp_vol", "jp_dd"}   # 주식시장 충격. 나머지는 금리·환율 스트레스
DD_WINDOW = 252


def log(*a):
    print("[macro_jp]", *a, flush=True)


def get(url: str, tries: int = 3, timeout: int = 60, **kw) -> requests.Response:
    for k in range(tries):
        try:
            r = requests.get(url, headers=UA, timeout=timeout, **kw)
            r.raise_for_status()
            return r
        except requests.RequestException:
            if k == tries - 1:
                raise
    raise RuntimeError("unreachable")


# ---------------------------------------------------------------- 자료
ERA = {"S": 1925, "H": 1988, "R": 2018}


def mof_jgb() -> dict[str, dict[date, float]]:
    """재무성 국채 금리(연%). {'2': {날짜: 값}, '10': {...}}. 일본 연호 날짜(R8.11.2)를 바꾼다."""
    out = {"2": {}, "10": {}}
    for url in ("https://www.mof.go.jp/jgbs/reference/interest_rate/data/jgbcm_all.csv",
                "https://www.mof.go.jp/jgbs/reference/interest_rate/jgbcm.csv"):
        text = get(url).content.decode("shift_jis", errors="ignore")
        head = None
        for line in text.splitlines():
            p = [x.strip() for x in line.split(",")]
            if p and p[0] == "基準日":
                head = p
                continue
            if not head or not p or p[0][:1] not in ERA:
                continue
            try:
                y, m, d = p[0][1:].split(".")
                day = date(ERA[p[0][0]] + int(y), int(m), int(d))
            except ValueError:
                continue
            for k in ("2", "10"):
                try:
                    out[k][day] = float(p[head.index(f"{k}年")])
                except (ValueError, IndexError):
                    pass
    if len(out["10"]) < 500:
        raise RuntimeError("재무성 국채 금리 자료가 너무 적음")
    return out


def fred(sid: str, start: date) -> dict[date, float]:
    out = {}
    # FRED 는 GitHub 서버에서도 자주 시간 초과가 난다(2026-11-16 60초×3번 = 3분 낭비). 예비 경로(야후 ^TNX)가 있으니 한 번만 짧게 묻는다.
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}&cosd={start:%Y-%m-%d}"
    for line in get(url, tries=1, timeout=20).text.splitlines()[1:]:
        d, _, v = line.partition(",")
        try:
            out[date.fromisoformat(d)] = float(v)
        except ValueError:
            continue
    if not out:
        raise RuntimeError(f"FRED {sid} 비어 있음")
    return out


def yahoo(symbol: str, tz: str) -> dict[date, float]:
    data = get(f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=10y&interval=1d").json()
    res = (data.get("chart") or {}).get("result") or []
    if not res:
        raise RuntimeError(f"Yahoo {symbol} 없음")
    ts, cl = res[0].get("timestamp") or [], res[0]["indicators"]["quote"][0].get("close") or []
    return {datetime.fromtimestamp(t, timezone.utc).astimezone(ZoneInfo(tz)).date(): float(c) for t, c in zip(ts, cl) if c is not None}


def combine(a, b, fn):
    return {d: fn(a[d], b[d]) for d in sorted(set(a) & set(b))}


def realized_vol(px: dict[date, float], n: int = 20) -> dict[date, float]:
    ds = sorted(px)
    rets = [(ds[i], math.log(px[ds[i]] / px[ds[i - 1]])) for i in range(1, len(ds)) if px[ds[i - 1]] > 0]
    out = {}
    for i in range(n - 1, len(rets)):
        w = [r for _, r in rets[i - n + 1:i + 1]]
        out[rets[i][0]] = round(statistics.pstdev(w) * math.sqrt(245) * 100, 2)
    return out


def drawdown(px: dict[date, float], window: int = DD_WINDOW) -> dict[date, float]:
    """최근 window거래일 최고 종가 대비 낙폭(%). 0 = 신고가."""
    ds, out = sorted(px), {}
    for i in range(window - 1, len(ds)):
        out[ds[i]] = round((px[ds[i]] / max(px[d] for d in ds[i - window + 1:i + 1]) - 1) * 100, 2)
    return out


# ---------------------------------------------------------------- 판정 (wamo_macro.py 와 같다)
def percentile(values, x):
    below = sum(1 for v in values if v < x)
    equal = sum(1 for v in values if v == x)
    return 100.0 * (below + 0.5 * equal) / len(values)


def judge(series, risk):
    pts = sorted(series.items())
    cutoff = pts[-1][0] - timedelta(days=365 * YEARS)
    pts = [(d, v) for d, v in pts if d >= cutoff]
    vals = [v for _, v in pts]
    last_d, last = pts[-1]
    pct = percentile(vals, last)
    risk_pct = {"high": pct, "low": 100 - pct, "both": abs(pct - 50) * 2}[risk]
    level = 5 if risk_pct < 50 else 4 if risk_pct < 75 else 3 if risk_pct < 90 else 2 if risk_pct < 97 else 1
    change = z = None
    if len(vals) > CHANGE_DAYS * 3:
        change = last - vals[-1 - CHANGE_DAYS]
        diffs = [vals[i] - vals[i - CHANGE_DAYS] for i in range(CHANGE_DAYS, len(vals))]
        sd = statistics.pstdev(diffs)
        if sd > 0:
            raw = (change - statistics.fmean(diffs)) / sd
            z = {"high": raw, "low": -raw}.get(risk)
            if risk == "both":
                z = raw if pct >= 50 else -raw
    bump = 2 if (z or 0) >= 3 else 1 if (z or 0) >= 2 else 0
    final = max(1, level - bump)
    return dict(value=last, date=last_d.isoformat(), pct=round(pct, 1), riskPct=round(risk_pct, 1),
                change1m=change, speedZ=None if z is None else round(z, 2),
                baseLevel=level, speedBump=bump, level=final, sample=len(vals))


def composite(levels):
    if not levels:
        return None
    risk = statistics.fmean(6 - lv for lv in levels)
    reds = sum(1 for lv in levels if lv == 1)
    oranges = sum(1 for lv in levels if lv == 2)
    risk += 0.5 * (reds >= 3) + 0.5 * (reds + oranges >= len(levels) / 2)
    return max(1, min(5, 6 - math.floor(risk + 0.5)))   # 반 칸은 늘 위험한 쪽으로(round 는 2.5 를 2 로 내린다)


def verdict(rows):
    levels = [r["level"] for r in rows if r.get("level")]
    lv = composite(levels)
    return {"level": lv, "emoji": LEVELS[lv][0] if lv else "⚪", "label": LEVELS[lv][1] if lv else "확인 불가",
            "counts": {str(k): sum(1 for x in levels if x == k) for k in range(1, 6)}, "available": len(levels), "total": len(rows)}


def axes(rows):
    """두 줄 판정. level 은 둘 중 나쁜 쪽."""
    out = {"stock": verdict([r for r in rows if r["key"] in STOCK_KEYS]),
           "credit": verdict([r for r in rows if r["key"] not in STOCK_KEYS])}
    got = [v["level"] for v in out.values() if v["level"]]
    lv = min(got) if got else None
    out.update(level=lv, emoji=LEVELS[lv][0] if lv else "⚪", label=LEVELS[lv][1] if lv else "확인 불가")
    return out


def fmt(ind, v, change=False):
    if v is None:
        return "" if change else "-"
    u = ind["unit"]
    if u == "bp":
        return f"{v:+,.0f}bp" if change else f"{v:,.0f}bp"
    if ind["key"] == "jp_10y":
        return f"{v * 100:+.0f}bp" if change else f"{v:.3f}"   # 단위(%)는 화면 카드가 붙인다
    if u == "엔":
        return f"{v:+.1f}" if change else f"{v:.1f}"
    return f"{v:+.1f}" if change else f"{v:.1f}"


def main() -> int:
    today = datetime.now(KST).date()
    start = today - timedelta(days=365 * YEARS + 60)
    series, errors = {}, {}

    def attempt(label, fn):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001  하나가 실패해도 나머지는 계속
            errors[label] = str(e)[:160]
            log("⚠️", label, e)
            return None

    jgb = attempt("재무성 국채 금리", mof_jgb)
    us10 = attempt("FRED DGS10", lambda: fred("DGS10", start))
    if not us10:   # FRED 가 느리면(2026-11-16 시간 초과) 야후 ^TNX(미국 10년 금리, 연%)로 대신한다
        us10 = attempt("야후 ^TNX", lambda: yahoo("^TNX", "America/New_York"))
        if us10:
            errors["FRED DGS10"] = "받지 못해 야후 ^TNX 로 대신 받음"
    if jgb:
        series["jp_10y"] = jgb["10"]
        series["jp_curve"] = combine(jgb["10"], jgb["2"], lambda a, b: round((a - b) * 100, 1))
        if us10:
            series["usjp_10y"] = combine(us10, jgb["10"], lambda a, b: round((a - b) * 100, 1))
    fx = attempt("야후 JPY=X", lambda: yahoo("JPY=X", "Asia/Tokyo"))
    if fx:
        series["usdjpy"] = fx
    n225 = attempt("야후 ^N225", lambda: yahoo("^N225", "Asia/Tokyo"))
    if n225:
        series["jp_vol"] = realized_vol(n225)
        series["jp_dd"] = drawdown(n225)

    try:
        prev = {r["key"]: r for r in json.loads(OUT.read_text(encoding="utf-8")).get("indicators", [])}
    except (OSError, ValueError):
        prev = {}
    rows = []
    for ind in INDICATORS:
        s = {d: v for d, v in (series.get(ind["key"]) or {}).items() if d >= start}
        if len(s) < 200:
            if ind["key"] in prev and prev[ind["key"]].get("level"):   # 오늘 못 받으면 지난 값을 '지연'으로 둔다
                rows.append({**prev[ind["key"]], "stale": True})
            else:
                rows.append({**ind, "level": None, "emoji": "⚪", "label": "자료 없음"})
            continue
        j = judge(s, ind["risk"])
        pts = sorted(s.items())[-CHART_DAYS:]
        emoji, label = LEVELS[j["level"]]
        rows.append({**ind, **j, "series": [[d.isoformat(), round(v, 3)] for d, v in pts], "emoji": emoji, "label": label,
                     "valueText": fmt(ind, j["value"]), "changeText": fmt(ind, j["change1m"], True)})
    for r in rows:
        r["axis"] = "stock" if r["key"] in STOCK_KEYS else "credit"
    levels = [r["level"] for r in rows if r.get("level")]
    ax = axes(rows)
    lv = ax["level"]
    if lv is None:
        log("지표를 하나도 만들지 못해 기존 파일 유지", errors)
        return 1
    counts = {str(k): sum(1 for x in levels if x == k) for k in range(1, 6)}
    out = {"asOf": datetime.now(KST).strftime("%Y-%m-%dT%H:%M+09:00"),
           "composite": {"level": lv, "emoji": LEVELS[lv][0], "label": LEVELS[lv][1], "counts": counts,
                         "available": len(levels), "total": len(INDICATORS)},
           "markets": {"JP": ax}, "indicators": rows, "errors": errors,
           "method": "5년 백분위(위험한 쪽) 5단계 + 1개월 변화 표준점수 2↑ 한 단계·3↑ 두 단계 보정(wamo_macro.py 와 같음). 장단기 금리차는 양쪽 끝. 종합은 주식시장 충격과 금리·환율 스트레스를 따로 내고 대표 단계는 나쁜 쪽."}
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log("저장", out["asOf"], "종합", LEVELS[lv], " · ".join(f"{r['key']} {r.get('valueText')} {r.get('label')}" for r in rows), "오류", errors or "없음")
    return 0


if __name__ == "__main__":
    sys.exit(main())
