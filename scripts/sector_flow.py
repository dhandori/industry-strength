"""섹터 워치 차트 카드 자료: 업종 ETF의 당일·5일·20일·60일·200일 흐름 (한국·미국).

- 한국: 당일·5일은 네이버 1분봉(최근 약 7거래일), 일봉은 data/prices/KR_stocks_close.csv (없으면 네이버 일봉).
  업종 목록 = config/baskets.json 의 KR.sectors (섹터 워치 칸과 같다).
- 미국: 당일·5일은 야후 5분봉(정규장만), 일봉은 야후 일봉(수정 전 종가, update.py 와 같은 기준).
  업종 목록 = US.flow (세부 업종 ETF). 섹터 워치 칸(S&P 500 큰 업종 11개)과는 따로 둔다.
- 선 값은 모두 '기간 시작 가격 대비 %'. 마지막 점은 공식 종가로 맞춘다.
- 오른쪽 종목: 그 업종에 묶인 세부 산업 구성 종목 중 시가총액 상위 5개(중복 제외), 일봉 종가 기준.

결과: docs/data/{시장}_sectorflow.json. 같은 기준일 자료가 이미 있으면 그 시장은 바로 건너뛴다(--force 로 다시 계산).
"""
from __future__ import annotations

import argparse
import json
import time
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
UA = {"User-Agent": "Mozilla/5.0 (industry-strength sector flow)"}
KST = ZoneInfo("Asia/Seoul")
PERIODS = {"5d": 5, "20d": 20, "60d": 60, "200d": 200}
MAS = {"20d": [5], "60d": [20], "200d": [50, 200]}   # 기간별로 함께 그리는 이동평균(일)
# 정규장: 시작 시각, 길이(분), 원자료 간격, 당일·5일 저장 간격(원자료 몇 칸마다), '거래 적음' 기준(체결 있는 칸 수)
SESSION = {
    "KR": {"open": (9, 0), "minutes": 390, "freq": "1min", "unit": 1, "step1": 2, "step5": 10, "sparse": 150,
           "labels": ["09:00", "15:30"], "clock": "한국 시각"},
    "US": {"open": (9, 30), "minutes": 390, "freq": "5min", "unit": 5, "step1": 1, "step5": 3, "sparse": 50,
           "labels": ["09:30", "16:00"], "clock": "뉴욕 시각"},
}


def log(*a):
    print("[sector_flow]", *a, flush=True)


# ---------------------------------------------------------------- 수집
def naver(code: str, timeframe: str, count: int) -> list[list[str]]:
    import requests

    url = f"https://fchart.stock.naver.com/sise.nhn?symbol={code}&timeframe={timeframe}&count={count}&requestType=0"
    r = requests.get(url, headers=UA, timeout=20)
    r.raise_for_status()
    root = ET.fromstring(r.content.decode("euc-kr", errors="ignore"))
    return [it.get("data", "").split("|") for it in root.iter("item")]


def naver_minute(code: str) -> pd.Series:
    """정규장(09:00~15:30) 1분 종가. 체결이 없던 분은 빠져 있다."""
    rows = []
    for p in naver(code, "minute", 2400):
        if len(p) >= 5 and p[4] not in ("", "null") and "0900" <= p[0][8:12] <= "1530":
            rows.append((pd.Timestamp(datetime.strptime(p[0][:12], "%Y%m%d%H%M")), float(p[4])))
    return pd.Series(dict(rows)).sort_index() if rows else pd.Series(dtype=float)


def naver_daily(code: str) -> pd.Series:
    # ETF 는 애프터마켓 거래가 없어 네이버 일봉 종가 = 정규장 종가
    rows = [(pd.Timestamp(p[0]), float(p[4])) for p in naver(code, "day", 520) if len(p) >= 5 and p[4] not in ("", "null")]
    return pd.Series(dict(rows)).sort_index()


def yahoo(tickers: list[str], period: str, interval: str) -> dict[str, pd.Series]:
    import yfinance as yf

    out = {}
    for attempt in range(3):
        todo = [t for t in tickers if t not in out]
        if not todo:
            break
        try:
            raw = yf.download(todo, period=period, interval=interval, auto_adjust=False, prepost=False,
                              group_by="ticker", threads=True, progress=False)
        except Exception as e:  # noqa: BLE001
            log("yahoo 오류", e)
            time.sleep(5)
            continue
        for t in todo:
            try:
                sub = raw[t] if isinstance(raw.columns, pd.MultiIndex) else raw
                c = sub["Close"].dropna()
            except Exception:  # noqa: BLE001
                continue
            if len(c) < 5:
                continue
            idx = pd.to_datetime(c.index)
            if idx.tz is not None:
                idx = idx.tz_convert("America/New_York").tz_localize(None)
            c.index = idx if interval != "1d" else idx.normalize()
            out[t] = c
        if len(out) < len(tickers):
            time.sleep(5)
    return out


# ---------------------------------------------------------------- 계산
def r2(x):
    return None if x is None or pd.isna(x) else round(float(x), 2)


def pct_line(vals, base, nd=2):
    return [None if v is None or pd.isna(v) else round(float((v / base - 1) * 100), nd) for v in vals]


def md(ts) -> str:
    return f"{ts.month}/{ts.day}"


def day_grid(m: pd.Series, day: pd.Timestamp, ses: dict, step: int) -> tuple[list[float], int]:
    """하루 분봉을 정규장 격자에 채우고(체결 없는 칸은 직전 가격) step 칸 간격으로 줄인다. 마지막 칸(마감)은 꼭 넣는다."""
    s = m[(m.index >= day) & (m.index < day + pd.Timedelta(days=1))]
    if s.empty:
        return [], 0
    start = day + pd.Timedelta(hours=ses["open"][0], minutes=ses["open"][1])
    grid = pd.date_range(start, start + pd.Timedelta(minutes=ses["minutes"]), freq=ses["freq"])
    filled = s.reindex(grid).ffill().bfill()
    picked = filled.iloc[::step]
    if picked.index[-1] != filled.index[-1]:
        picked = pd.concat([picked, filled.iloc[-1:]])
    return list(picked.values), int(s.index.isin(grid).sum())


def extremes(line):
    v = [(x, k) for k, x in enumerate(line) if x is not None]
    return (max(v)[1], min(v)[1]) if v else (None, None)


def build_one(daily: pd.Series, minute: pd.Series, basis: pd.Timestamp, ses: dict) -> dict:
    d = daily.dropna()
    d = d[d.index <= basis]
    out = {}
    if len(d) >= 2 and d.index[-1] == basis:
        base = d.iloc[-2]
        vals, traded = day_grid(minute, basis, ses, ses["step1"]) if not minute.empty else ([], 0)
        ret = r2((d.iloc[-1] / base - 1) * 100)
        if vals:
            vals[-1] = d.iloc[-1]
            line = pct_line(vals, base)
            hi, lo = extremes(line)
            out["1d"] = {"ret": ret, "line": line, "hi": hi, "lo": lo, "labels": ses["labels"],
                         "sparse": traded < ses["sparse"], "traded": traded}
        else:
            out["1d"] = {"ret": ret, "line": [], "missing": True}
    if len(d) >= 6:   # 5일: 분봉 5거래일, 기준 = 5거래일 전 종가
        base = d.iloc[-6]
        days = list(d.index[-5:])
        line, cuts = [], []
        for day in days:
            vals, _ = day_grid(minute, day, ses, ses["step5"]) if not minute.empty else ([], 0)
            if not vals:
                line = []
                break
            vals[-1] = d.loc[day]
            cuts.append(len(line))
            line += pct_line(vals, base)
        p = {"ret": r2((d.iloc[-1] / base - 1) * 100)}
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


def stock_rets(close: pd.DataFrame, ticker: str, basis: pd.Timestamp) -> dict:
    if ticker not in close:
        return {}
    c = close[ticker].dropna()
    c = c[c.index <= basis]
    if len(c) < 2 or c.index[-1] != basis:
        return {}
    res = {"1d": r2((c.iloc[-1] / c.iloc[-2] - 1) * 100)}
    for key, n in PERIODS.items():
        res[key] = r2((c.iloc[-1] / c.iloc[-(n + 1)] - 1) * 100) if len(c) > n else None
    return res


def top_members(cfg: dict, item_names: list[str], cap_key: str) -> list[dict]:
    items = {i["name"]: i for i in cfg["items"]}
    seen, members = set(), []
    for name in item_names:
        for mb in (items.get(name) or {}).get("members", []):
            if mb["code"] not in seen:
                seen.add(mb["code"])
                members.append(mb)
    return sorted(members, key=lambda x: -(x.get(cap_key) or 0))[:5]


def run_market(mkey: str, cfg: dict, force: bool) -> None:
    ses = SESSION[mkey]
    out_path = ROOT / f"docs/data/{mkey}_sectorflow.json"
    f = ROOT / f"data/prices/{mkey}_stocks_close.csv"
    close = pd.read_csv(f, index_col=0, parse_dates=True) if f.exists() else pd.DataFrame()
    if "__bench__" not in close or close["__bench__"].notna().sum() < 210:
        log(mkey, "일봉 저장 파일이 없어 건너뜀")
        return
    basis = close["__bench__"].last_valid_index()
    try:
        prev = json.loads(out_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        prev = {}
    if not force and prev.get("basis") == basis.strftime("%Y-%m-%d") and not prev.get("partial"):
        log(mkey, "이미 최신", prev["basis"])
        return

    b1, b2 = cfg["benchmark"], cfg.get("benchmark2")
    inst = [("bench", b1["name"], b1["etf"], b1["code"] if mkey == "KR" else b1["ticker"], None)]
    if b2:
        inst.append(("bench", b2["name"], b2["etf"], b2["code"] if mkey == "KR" else b2["ticker"], None))
    groups = cfg.get("sectors") if mkey == "KR" else cfg.get("flow")
    inst += [("sector", s["name"], s["en"], s["code"], s) for s in groups or []]
    if not groups:
        log(mkey, "업종 목록 없음")
        return

    problems = []
    if mkey == "US":
        codes = [x[3] for x in inst]
        daily_all = yahoo(codes, "2y", "1d")
        minute_all = yahoo(codes, "8d", "5m")   # 장중에 돌아도 지난 5거래일이 다 들어오게 넉넉히
    out = {"market": mkey, "basis": basis.strftime("%Y-%m-%d"), "updated_at": datetime.now(KST).strftime("%Y-%m-%d %H:%M KST"),
           "source": "네이버 분봉(당일·5일), 일봉 종가(20일·60일·200일)" if mkey == "KR" else "야후 5분봉(당일·5일, 정규장), 일봉 종가(20일·60일·200일)",
           "session": {"open": ses["labels"][0], "minutes": ses["minutes"], "step1": ses["unit"] * ses["step1"],
                       "step5": ses["unit"] * ses["step5"], "clock": ses["clock"]},
           "dates": [x.strftime("%Y-%m-%d") for x in close["__bench__"].dropna().index[-201:]],
           "bench": [], "sectors": []}
    for kind, name, etf, code, grp in inst:
        if mkey == "KR":
            col = "__bench__" if kind == "bench" and name == b1["name"] else "__bench2__" if kind == "bench" else "__sec_" + grp["ticker"]
            daily = close[col] if col in close and close[col].notna().sum() > 210 else None
            try:
                if daily is None or daily.last_valid_index() != basis:
                    daily = naver_daily(code)
                    time.sleep(0.3)
            except Exception as e:  # noqa: BLE001
                problems.append(f"{name} 일봉 실패 {type(e).__name__}")
                continue
            try:
                minute = naver_minute(code)
                time.sleep(0.3)
            except Exception as e:  # noqa: BLE001
                problems.append(f"{name} 분봉 실패 {type(e).__name__}")
                minute = pd.Series(dtype=float)
        else:
            daily = daily_all.get(code)
            minute = minute_all.get(code, pd.Series(dtype=float))
            if daily is None:
                problems.append(f"{name} 일봉 실패")
                continue
        if daily.dropna().index[-1] < basis:
            problems.append(f"{name} 일봉이 기준일보다 오래됨")
        if not minute.empty and minute.index[-1].normalize() < basis:
            problems.append(f"{name} 분봉이 기준일보다 오래됨")
            minute = pd.Series(dtype=float)
        row = {"name": name, "etf": etf, "code": code, "periods": build_one(daily, minute, basis, ses)}
        if grp:
            row["ticker"] = grp["ticker"]
            row["items"] = grp["items"]
            row["stocks"] = [{"name": mb["name"], "code": mb["code"], "ret": stock_rets(close, mb["ticker"], basis)}
                             for mb in top_members(cfg, grp["items"], "mcap_eok" if mkey == "KR" else "mcap_usd_b")]
        out["bench" if kind == "bench" else "sectors"].append(row)
    if not out["bench"] or len(out["sectors"]) < len(groups) * 0.7:
        log(mkey, "자료가 너무 부족해서 기존 파일 유지", problems)
        return
    out["partial"] = bool(problems)
    out["warnings"] = problems
    out_path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log(mkey, "저장", out["basis"], "업종", len(out["sectors"]), "경고", problems, f"{out_path.stat().st_size // 1024}KB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--markets", default="KR,US")
    a = ap.parse_args()
    cfg = json.loads((ROOT / "config/baskets.json").read_text(encoding="utf-8"))["markets"]
    for mkey in a.markets.split(","):
        try:
            run_market(mkey, cfg[mkey], a.force)
        except Exception as e:  # noqa: BLE001  한 시장이 실패해도 다른 시장은 진행
            log(mkey, "실패", type(e).__name__, e)


if __name__ == "__main__":
    main()
