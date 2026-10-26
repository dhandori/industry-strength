"""섹터 워치 차트 카드 자료: 한국 업종 ETF의 당일·5일·20일·60일·200일 흐름.

- 당일·5일: 네이버 분봉(1분, 최근 약 7거래일). 당일은 2분, 5일은 10분 간격으로 줄여 저장한다.
- 20일·60일·200일: data/prices/KR_stocks_close.csv 의 일봉(update.py 가 저장). 없으면 네이버 일봉으로 보충.
- 선 값은 모두 '기간 시작 가격 대비 %'. 기준선(0%) 위는 상승, 아래는 하락.
- 오른쪽 종목: 그 업종에 묶인 세부 산업 구성 종목 중 시가총액 상위 5개(중복 제외).

결과: docs/data/KR_sectorflow.json. 같은 기준일 자료가 이미 있으면 바로 끝난다(--force 로 다시 계산).
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs/data/KR_sectorflow.json"
UA = {"User-Agent": "Mozilla/5.0 (industry-strength sector flow)"}
KST = ZoneInfo("Asia/Seoul")
PERIODS = {"5d": 5, "20d": 20, "60d": 60, "200d": 200}
MAS = {"20d": [5], "60d": [20], "200d": [50, 200]}   # 기간별로 함께 그리는 이동평균(일)
OPEN_HM, CLOSE_HM = "0900", "1530"
SPARSE_MIN = 150      # 당일 390분 중 실제 체결이 있는 분이 이보다 적으면 '자료 부족'


def log(*a):
    print("[sector_flow]", *a, flush=True)


def naver(code: str, timeframe: str, count: int) -> list[list[str]]:
    import requests

    url = f"https://fchart.stock.naver.com/sise.nhn?symbol={code}&timeframe={timeframe}&count={count}&requestType=0"
    r = requests.get(url, headers=UA, timeout=20)
    r.raise_for_status()
    root = ET.fromstring(r.content.decode("euc-kr", errors="ignore"))
    return [it.get("data", "").split("|") for it in root.iter("item")]


def minute_series(code: str) -> pd.Series:
    """정규장(09:00~15:30) 1분 종가. 체결이 없던 분은 빠져 있다."""
    rows = []
    for p in naver(code, "minute", 2400):
        if len(p) >= 5 and p[4] not in ("", "null") and OPEN_HM <= p[0][8:12] <= CLOSE_HM:
            rows.append((pd.Timestamp(datetime.strptime(p[0][:12], "%Y%m%d%H%M")), float(p[4])))
    return pd.Series(dict(rows)).sort_index() if rows else pd.Series(dtype=float)


def daily_naver(code: str) -> pd.Series:
    rows = [(pd.Timestamp(p[0]), float(p[4])) for p in naver(code, "day", 520) if len(p) >= 5 and p[4] not in ("", "null")]
    return pd.Series(dict(rows)).sort_index()


def r2(x):
    return None if x is None or pd.isna(x) else round(float(x), 2)


def pct_line(vals, base, nd=2):
    return [None if v is None or pd.isna(v) else round(float((v / base - 1) * 100), nd) for v in vals]


def day_grid(m: pd.Series, day: pd.Timestamp, step: int) -> tuple[list[float], int]:
    """하루 분봉을 09:00~15:30 1분 격자에 채우고(체결 없는 분은 직전 가격) step 분 간격으로 줄인다."""
    s = m[(m.index >= day) & (m.index < day + pd.Timedelta(days=1))]
    if s.empty:
        return [], 0
    grid = pd.date_range(day + pd.Timedelta(hours=9), day + pd.Timedelta(hours=15, minutes=30), freq="1min")
    filled = s.reindex(grid).ffill().bfill()
    picked = filled.iloc[::step]
    if picked.index[-1] != filled.index[-1]:
        picked = pd.concat([picked, filled.iloc[-1:]])
    return list(picked.values), int(s.index.isin(grid).sum())


def extremes(line):
    v = [(x, k) for k, x in enumerate(line) if x is not None]
    if not v:
        return None, None
    return max(v)[1], min(v)[1]


def build_one(daily: pd.Series, minute: pd.Series, basis: pd.Timestamp) -> dict:
    d = daily.dropna()
    d = d[d.index <= basis]
    out = {}
    if len(d) >= 2 and d.index[-1] == basis:
        base = d.iloc[-2]
        vals, traded = day_grid(minute, basis, 2) if not minute.empty else ([], 0)
        if vals:
            vals[-1] = d.iloc[-1]        # 마지막 점은 공식 종가로 맞춘다
            line = pct_line(vals, base)
            hi, lo = extremes(line)
            out["1d"] = {"ret": r2((d.iloc[-1] / base - 1) * 100), "line": line, "hi": hi, "lo": lo,
                         "labels": ["09:00", "15:30"], "sparse": traded < SPARSE_MIN, "traded": traded}
        else:
            out["1d"] = {"ret": r2((d.iloc[-1] / base - 1) * 100), "line": [], "missing": True}
    # 5일: 분봉 5거래일(10분 간격), 기준 = 5거래일 전 종가
    if len(d) >= 6:
        base = d.iloc[-6]
        days = list(d.index[-5:])
        line, cuts = [], []
        for k, day in enumerate(days):
            vals, _ = day_grid(minute, day, 10) if not minute.empty else ([], 0)
            if not vals:
                line = []
                break
            vals[-1] = d.loc[day]
            cuts.append(len(line))
            line += pct_line(vals, base)
        p = {"ret": r2((d.iloc[-1] / base - 1) * 100), "base_date": d.index[-6].strftime("%Y-%m-%d")}
        if line:
            hi, lo = extremes(line)
            p.update(line=line, hi=hi, lo=lo, cuts=cuts, labels=[md(x) for x in days])
        else:          # 분봉이 모자라면 일봉 6점으로라도 그린다
            line = pct_line(d.iloc[-6:].values, base)
            hi, lo = extremes(line)
            p.update(line=line, hi=hi, lo=lo, labels=[md(d.index[-6]), md(d.index[-1])], coarse=True)
        out["5d"] = p
    for key in ("20d", "60d", "200d"):
        n = PERIODS[key]
        if len(d) < n + 1:
            continue
        base = d.iloc[-(n + 1)]
        win = d.iloc[-(n + 1):]
        nd = 2 if n <= 20 else 1
        line = pct_line(win.values, base, nd)
        hi, lo = extremes(line)
        mas = {}
        for w in MAS[key]:
            ma = d.rolling(w).mean().iloc[-(n + 1):]
            if ma.notna().sum() >= len(ma) * 0.5:
                mas[str(w)] = pct_line(ma.values, base, nd)
        # 날짜는 파일 맨 위 dates(공통 거래일 달력)의 끝 n+1개를 쓴다.
        out[key] = {"ret": r2((d.iloc[-1] / base - 1) * 100), "line": line, "hi": hi, "lo": lo, "ma": mas,
                    "labels": [md(win.index[0]), md(win.index[-1])]}
    return out


def md(ts) -> str:
    return f"{ts.month}/{ts.day}"


def stock_rets(close: pd.DataFrame, ticker: str, basis: pd.Timestamp) -> dict:
    if ticker not in close:
        return {}
    c = close[ticker].dropna()
    c = c[c.index <= basis]
    if c.empty or c.index[-1] != basis:
        return {}
    res = {"1d": r2((c.iloc[-1] / c.iloc[-2] - 1) * 100) if len(c) >= 2 else None}
    for key, n in PERIODS.items():
        res[key] = r2((c.iloc[-1] / c.iloc[-(n + 1)] - 1) * 100) if len(c) > n else None
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    cfg = json.loads((ROOT / "config/baskets.json").read_text(encoding="utf-8"))["markets"]["KR"]
    f = ROOT / "data/prices/KR_stocks_close.csv"
    close = pd.read_csv(f, index_col=0, parse_dates=True) if f.exists() else pd.DataFrame()
    if "__bench__" not in close or close["__bench__"].notna().sum() < 210:
        log("일봉 저장 파일이 없어 끝냄")
        sys.exit(0)
    basis = close["__bench__"].last_valid_index()
    try:
        prev = json.loads(OUT.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        prev = {}
    if not a.force and prev.get("basis") == basis.strftime("%Y-%m-%d") and not prev.get("partial"):
        log("이미 최신", prev["basis"])
        return

    instruments = [("bench", cfg["benchmark"]["name"], cfg["benchmark"]["etf"], cfg["benchmark"]["code"], "__bench__", None),
                   ("bench", cfg["benchmark2"]["name"], cfg["benchmark2"]["etf"], cfg["benchmark2"]["code"], "__bench2__", None)]
    instruments += [("sector", s["name"], s["en"], s["code"], "__sec_" + s["ticker"], s) for s in cfg.get("sectors") or []]
    items = {i["name"]: i for i in cfg["items"]}
    out = {"market": "KR", "basis": basis.strftime("%Y-%m-%d"), "updated_at": datetime.now(KST).strftime("%Y-%m-%d %H:%M KST"),
           "source": "네이버 분봉(당일·5일), 일봉 종가(20일·60일·200일)", "bench": [], "sectors": [],
           "dates": [x.strftime("%Y-%m-%d") for x in close["__bench__"].dropna().index[-201:]]}
    problems = []
    for kind, name, etf, code, col, sec in instruments:
        daily = close[col] if col in close and close[col].notna().sum() > 210 else None
        try:
            if daily is None or daily.last_valid_index() != basis:
                daily = daily_naver(code)
                time.sleep(0.3)
        except Exception as e:  # noqa: BLE001
            problems.append(f"{name} 일봉 실패 {type(e).__name__}")
            continue
        try:
            minute = minute_series(code)
            time.sleep(0.3)
        except Exception as e:  # noqa: BLE001
            problems.append(f"{name} 분봉 실패 {type(e).__name__}")
            minute = pd.Series(dtype=float)
        if not minute.empty and minute.index[-1].normalize() < basis:
            problems.append(f"{name} 분봉이 기준일보다 오래됨")
            minute = pd.Series(dtype=float)
        row = {"name": name, "etf": etf, "code": code, "periods": build_one(daily, minute, basis)}
        if sec:
            seen, members = set(), []
            for it_name in sec["items"]:
                for mb in (items.get(it_name) or {}).get("members", []):
                    if mb["code"] not in seen:
                        seen.add(mb["code"])
                        members.append(mb)
            members.sort(key=lambda x: -(x.get("mcap_eok") or 0))
            row["ticker"] = sec["ticker"]
            row["items"] = sec["items"]
            row["stocks"] = [{"name": mb["name"], "code": mb["code"], "ret": stock_rets(close, mb["ticker"], basis)} for mb in members[:5]]
        out[kind if kind == "bench" else "sectors"].append(row)
    if not out["bench"] or len(out["sectors"]) < len(cfg.get("sectors") or []) * 0.7:
        log("자료가 너무 부족해서 기존 파일 유지", problems)
        sys.exit(0)
    out["partial"] = bool(problems)
    out["warnings"] = problems
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log("저장", out["basis"], "업종", len(out["sectors"]), "경고", problems, f"{OUT.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
