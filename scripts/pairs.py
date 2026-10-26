"""페어 트레이딩 탭 자료 → docs/data/pairs.json

config/pairs.json 의 각 페어(a ÷ b) 종가 비율로 상대강도 지표를 만든다.
- 비율선과 20·50·200일 평균, 비율의 RSI(14, 와일더), 60일 Z점수, 52주 고저 위치, 5·20·60일 비율 변화
- 신호: 200일선 돌파·이탈(최근 5거래일), RSI 30 이하·70 이상, Z점수 ±2 넘음, 비율 52주 신고·신저
- 캔들이 아니라 종가끼리의 비율만 쓴다(두 종목 고가·저가는 같은 시각이 아니라 비율 캔들은 실제가 아님).
- 장중에 돌면 오늘 칸은 아직 종가가 아니므로 버린다. 한 페어가 실패하면 그 페어만 지난 값을 남긴다.

python scripts/pairs.py            # 수집 + 저장
python scripts/pairs.py --dry-run  # 저장하지 않고 요약만 출력
"""
import json
import math
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
CFG = ROOT / "config" / "pairs.json"
OUT = ROOT / "docs" / "data" / "pairs.json"
KST = timezone(timedelta(hours=9))
KEEP = 260                      # 화면에 보낼 거래일 수(약 1년)
# 장 마감 + 여유. 이 시각 전에 돌면 그날 칸은 아직 종가가 아니다.
CLOSE = {"KR": ("Asia/Seoul", 15, 50), "US": ("America/New_York", 16, 10)}
LATE_CLOSE = {"KR": {"2026-11-19": (16, 50)}}   # 수능날 16:30 마감


def r(x, nd=4):
    if x is None:
        return None
    try:
        f = float(x)
    except (TypeError, ValueError):
        return None
    return round(f, nd) if math.isfinite(f) else None


def fetch(tickers):
    import yfinance as yf
    last = None
    for _ in range(2):
        try:
            raw = yf.download(sorted(tickers), period="2y", interval="1d", auto_adjust=False,
                              progress=False, threads=True)
            close = raw["Close"] if isinstance(raw.columns, pd.MultiIndex) else raw[["Close"]].rename(columns={"Close": next(iter(tickers))})
            close.index = pd.to_datetime(close.index).tz_localize(None).normalize()
            return close
        except Exception as e:  # 네트워크 일시 장애: 한 번 더
            last = e
    raise RuntimeError(f"가격 수집 실패: {last}")


# 야후가 한국 지수 일봉을 하루씩 빠뜨리는 날이 있다(2026-10-26 코스피·코스닥). 빠진 날은 네이버 지수 일봉으로 채운다.
NAVER_INDEX = {"^KS11": "KOSPI", "^KQ11": "KOSDAQ"}


def naver_index(symbol):
    import re
    import urllib.request
    url = f"https://fchart.stock.naver.com/sise.nhn?symbol={symbol}&timeframe=day&count=520&requestType=0"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    text = urllib.request.urlopen(req, timeout=20).read().decode("euc-kr", errors="ignore")
    rows = {}
    for d, close in re.findall(r'data="(\d{8})\|[^|]*\|[^|]*\|[^|]*\|([0-9.]+)\|', text):
        rows[pd.Timestamp(d)] = float(close)
    return pd.Series(rows, dtype=float).sort_index()


def fill_kr_index(close):
    for ticker, symbol in NAVER_INDEX.items():
        if ticker not in close:
            continue
        try:
            nv = naver_index(symbol)
        except Exception as e:  # 네이버도 실패하면 야후 값만 쓴다
            print(f"[pairs] 네이버 {symbol} 보충 실패: {e}")
            continue
        if nv.empty:
            continue
        merged = close[ticker].combine_first(nv.reindex(nv.index.union(close.index)))
        close = close.reindex(close.index.union(nv.index))
        close[ticker] = merged
    return close


def drop_unclosed(s, market, now_utc):
    """장 마감 전 실행이면 오늘 칸(아직 종가 아님)을 뺀다."""
    if s.empty:
        return s
    tz, hh, mm = CLOSE[market]
    local = now_utc.astimezone(ZoneInfo(tz))
    hh, mm = LATE_CLOSE.get(market, {}).get(local.date().isoformat(), (hh, mm))
    if s.index[-1].date() == local.date() and (local.hour, local.minute) < (hh, mm):
        return s.iloc[:-1]
    return s


def rsi(x, n=14):
    d = x.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False, min_periods=n).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False, min_periods=n).mean()
    rs = up / dn.replace(0, np.nan)
    return (100 - 100 / (1 + rs)).where(dn.ne(0), 100.0)


def compute(p, close, now_utc):
    a, b = close[p["a"]].dropna(), close[p["b"]].dropna()
    a, b = drop_unclosed(a, p["market"], now_utc), drop_unclosed(b, p["market"], now_utc)
    df = pd.concat([a.rename("a"), b.rename("b")], axis=1, join="inner").dropna()
    df = df[(df["a"] > 0) & (df["b"] > 0)]
    if len(df) < 210:
        raise RuntimeError(f"공통 거래일 부족({len(df)}일)")
    ratio = df["a"] / df["b"]
    ma = {w: ratio.rolling(w, min_periods=w).mean() for w in (20, 50, 60, 200)}
    sd60 = ratio.rolling(60, min_periods=60).std()
    z = (ratio - ma[60]) / sd60
    rs14 = rsi(ratio)
    hi = ratio.rolling(252, min_periods=120).max()
    lo = ratio.rolling(252, min_periods=120).min()
    c, last = ratio.iloc[-1], ratio.index[-1]
    chg = lambda w: r((ratio.iloc[-1] / ratio.iloc[-1 - w] - 1) * 100, 2) if len(ratio) > w else None
    leg = lambda s, w: r((s.iloc[-1] / s.iloc[-1 - w] - 1) * 100, 2) if len(s) > w else None

    above = (ratio > ma[200]).where(ma[200].notna())
    recent = above.iloc[-6:]
    flags = []
    if recent.iloc[-1] == 1 and (recent.iloc[:-1] == 0).any():
        flags.append(["200일선 돌파", "up"])
    if recent.iloc[-1] == 0 and (recent.iloc[:-1] == 1).any():
        flags.append(["200일선 이탈", "down"])
    if not pd.isna(hi.iloc[-1]) and c >= hi.iloc[-1] * 0.999:
        flags.append(["비율 52주 신고", "up"])
    if not pd.isna(lo.iloc[-1]) and c <= lo.iloc[-1] * 1.001:
        flags.append(["비율 52주 신저", "down"])
    rv, zv = rs14.iloc[-1], z.iloc[-1]
    if rv <= 30:
        flags.append(["RSI 과매도", "down"])
    elif rv >= 70:
        flags.append(["RSI 과매수", "up"])
    if zv <= -2:
        flags.append(["Z점수 -2 아래", "down"])
    elif zv >= 2:
        flags.append(["Z점수 +2 위", "up"])

    m50, m200 = ma[50].iloc[-1], ma[200].iloc[-1]
    if c > m50 > m200:
        trend = [f"{p['a_name']} 우위 추세", "up"]
    elif c < m50 < m200:
        trend = [f"{p['b_name']} 우위 추세", "down"]
    else:
        trend = ["방향 엇갈림", "flat"]

    tail = slice(-KEEP, None)
    return {
        "id": p["id"], "a": p["a"], "b": p["b"], "a_name": p["a_name"], "b_name": p["b_name"],
        "market": p["market"], "desc": p.get("desc", ""), "up": p.get("up", ""), "down": p.get("down", ""),
        "basis_date": last.strftime("%Y-%m-%d"),
        "ratio": r(c, 6), "rsi": r(rv, 1), "z": r(zv, 2),
        "pos52": r((c - lo.iloc[-1]) / (hi.iloc[-1] - lo.iloc[-1]) * 100, 1) if hi.iloc[-1] > lo.iloc[-1] else None,
        "dist_hi": r((c / hi.iloc[-1] - 1) * 100, 2),
        "chg5": chg(5), "chg20": chg(20), "chg60": chg(60),
        "a_ret20": leg(df["a"], 20), "b_ret20": leg(df["b"], 20),
        "above200": None if pd.isna(m200) else bool(c > m200),
        "trend": trend, "flags": flags, "ok": True,
        "series": {
            "dates": [d.strftime("%Y-%m-%d") for d in ratio.index[tail]],
            "ratio": [r(v, 6) for v in ratio.iloc[tail]],
            "ma20": [r(v, 6) for v in ma[20].iloc[tail]],
            "ma50": [r(v, 6) for v in ma[50].iloc[tail]],
            "ma200": [r(v, 6) for v in ma[200].iloc[tail]],
            "rsi": [r(v, 1) for v in rs14.iloc[tail]],
            "hi52": r(hi.iloc[-1], 6), "lo52": r(lo.iloc[-1], 6),
        },
    }


def main():
    dry = "--dry-run" in sys.argv
    cfg = json.loads(CFG.read_text(encoding="utf-8"))
    try:
        prev = {p["id"]: p for g in json.loads(OUT.read_text(encoding="utf-8")).get("groups", []) for p in g.get("pairs", [])}
    except (OSError, ValueError):
        prev = {}
    tickers = {t for g in cfg["groups"] for p in g["pairs"] for t in (p["a"], p["b"])}
    now = datetime.now(timezone.utc)
    errors = []
    try:
        close = fill_kr_index(fetch(tickers))
    except RuntimeError as e:
        close, errors = None, [str(e)]
    groups = []
    for g in cfg["groups"]:
        out = []
        for p in g["pairs"]:
            try:
                if close is None or p["a"] not in close or p["b"] not in close:
                    raise RuntimeError("가격 없음")
                out.append(compute(p, close, now))
            except Exception as e:
                errors.append(f"{p['a']}/{p['b']}: {e}")
                old = prev.get(p["id"])
                out.append(dict(old, ok=False, desc=p.get("desc", ""), up=p.get("up", ""), down=p.get("down", "")) if old else {"id": p["id"], "a": p["a"], "b": p["b"], "a_name": p["a_name"],
                                                         "b_name": p["b_name"], "market": p["market"], "desc": p.get("desc", ""), "up": p.get("up", ""), "down": p.get("down", ""), "ok": False})
        groups.append({"id": g["id"], "name": g["name"], "pairs": out})
    result = {"updated_at": datetime.now(KST).strftime("%Y-%m-%d %H:%M KST"), "groups": groups, "errors": errors}
    for g in groups:
        for p in g["pairs"]:
            print(f"[pairs] {p['a']}/{p['b']} {p.get('basis_date', '—')} RSI {p.get('rsi')} Z {p.get('z')} {[f[0] for f in p.get('flags', [])]}")
    if errors:
        print("[pairs] 오류:", errors)
    if not dry:
        OUT.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    ok = sum(p.get("ok") for g in groups for p in g["pairs"])
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
