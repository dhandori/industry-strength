"""시장 흐름판 데이터 갱신 스크립트.

1) config/universe.json 의 세부 산업 대표 ETF 종가를 받는다 (Yahoo → 실패 시 네이버/stooq).
2) data/prices/<시장>_close.csv, _volume.csv 에 누적 저장한다 (새로 받은 값이 기존 값을 덮어씀).
3) 매 거래일 기준 5·20·60일 수익률 순위, 종합 강도, 추세 점검, RS(시장 대비 강도)를 계산해
   docs/data/<시장>.json, docs/data/<시장>_series.json 으로 내보낸다.

순위 이력은 저장된 가격으로 매번 처음부터 다시 계산하므로, 하루를 빠뜨려도 다음 실행에서 자동으로 메워진다.

사용법:
  python scripts/update.py              # 수집 + 계산
  python scripts/update.py --no-fetch   # 저장된 가격으로 계산만
  python scripts/update.py --synthetic  # 네트워크 없이 가짜 가격으로 동작 점검(로컬 테스트용, 결과는 tmp/ 에 저장)
"""
from __future__ import annotations

import argparse
import io
import json
import math
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
KST = timezone(timedelta(hours=9))
HISTORY_DAYS = 260          # 화면에 보내는 이력 길이(거래일)
FETCH_PERIOD = "2y"
WEIGHTS = {5: 0.2, 20: 0.4, 60: 0.4}   # 종합 강도 가중치
TOP_SHARE = 0.25            # 상위권 = 상위 25%
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"}


def log(*a):
    print("[update]", *a, flush=True)


# ---------------------------------------------------------------- 수집
def fetch_yahoo(tickers: list[str]) -> tuple[pd.DataFrame, pd.DataFrame]:
    import yfinance as yf

    closes, vols = {}, {}
    for attempt in range(3):
        todo = [t for t in tickers if t not in closes]
        if not todo:
            break
        try:
            raw = yf.download(todo, period=FETCH_PERIOD, interval="1d", auto_adjust=False,
                              group_by="ticker", threads=True, progress=False)
        except Exception as e:  # noqa: BLE001
            log("yahoo 오류", e)
            time.sleep(5)
            continue
        for t in todo:
            try:
                sub = raw[t] if isinstance(raw.columns, pd.MultiIndex) else raw
                c = sub["Close"].dropna()
                if len(c) > 20:
                    closes[t] = c
                    vols[t] = sub["Volume"].reindex(c.index)
            except Exception:  # noqa: BLE001
                pass
        if len(closes) < len(tickers):
            time.sleep(5)
    c = pd.DataFrame(closes)
    v = pd.DataFrame(vols)
    for df in (c, v):
        if not df.empty:
            df.index = pd.to_datetime(df.index).tz_localize(None).normalize()
    return c, v


def fetch_naver(code: str) -> tuple[pd.Series, pd.Series] | None:
    import requests

    url = f"https://fchart.stock.naver.com/sise.nhn?symbol={code}&timeframe=day&count=520&requestType=0"
    r = requests.get(url, headers=UA, timeout=20)
    r.raise_for_status()
    root = ET.fromstring(r.content.decode("euc-kr", errors="ignore"))
    rows = []
    for item in root.iter("item"):
        p = item.get("data", "").split("|")
        if len(p) >= 6 and p[4] not in ("", "null"):
            rows.append((pd.Timestamp(p[0]), float(p[4]), float(p[5] or 0)))
    if len(rows) < 20:
        return None
    df = pd.DataFrame(rows, columns=["d", "c", "v"]).set_index("d")
    return df["c"], df["v"]


def fetch_stooq(code: str) -> tuple[pd.Series, pd.Series] | None:
    import requests

    r = requests.get(f"https://stooq.com/q/d/l/?s={code}&i=d", headers=UA, timeout=20)
    r.raise_for_status()
    if not r.text.startswith("Date"):
        return None
    df = pd.read_csv(io.StringIO(r.text), parse_dates=["Date"]).set_index("Date")
    df = df[df.index >= pd.Timestamp.today() - pd.Timedelta(days=760)]
    if len(df) < 20:
        return None
    return df["Close"], df.get("Volume", pd.Series(0, index=df.index))


def market_entries(mkey: str, m: dict) -> list[dict]:
    """수집 대상: 벤치마크 + 모든 바구니 구성 종목(중복 제거). 열 이름은 티커, 벤치마크는 '__bench__'."""
    out = [{"id": "__bench__", "ticker": m["benchmark"]["ticker"], "code": m["benchmark"]["code"]}]
    seen = {m["benchmark"]["ticker"]}
    if m.get("benchmark2"):
        out.append({"id": "__bench2__", "ticker": m["benchmark2"]["ticker"], "code": m["benchmark2"]["code"]})
        seen.add(m["benchmark2"]["ticker"])
    for sec in m.get("sectors") or []:     # 섹터 워치(큰 업종 ETF)
        if sec["ticker"] not in seen:
            seen.add(sec["ticker"])
            out.append({"id": "__sec_" + sec["ticker"], "ticker": sec["ticker"], "code": sec["code"]})
    for it in m["items"]:
        for mb in it["members"]:
            if mb["ticker"] in seen:
                continue
            seen.add(mb["ticker"])
            code = mb["code"] if mkey == "KR" else f"{mb['ticker'].lower().replace('.', '-')}.us"
            out.append({"id": mb["ticker"], "ticker": mb["ticker"], "code": code})
    return out


def fetch_market(mkey: str, m: dict) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    """시장 하나의 종가·거래량 표(열 = 티커, 벤치마크는 '__bench__')."""
    entries = market_entries(mkey, m)
    by_ticker = {e["ticker"]: e for e in entries}
    source = {}
    try:
        yc, yv = fetch_yahoo(list(by_ticker))
    except Exception as e:  # noqa: BLE001
        log("yahoo 전체 실패", e)
        yc, yv = pd.DataFrame(), pd.DataFrame()
    closes, vols = {}, {}
    for t, e in by_ticker.items():
        if t in yc.columns and yc[t].notna().sum() > 20:
            closes[e["id"]], vols[e["id"]] = yc[t], yv.get(t)
            source[e["id"]] = "yahoo"
            continue
        try:
            got = fetch_naver(e["code"]) if mkey == "KR" else fetch_stooq(e["code"])
        except Exception as ex:  # noqa: BLE001
            log("대체 수집 실패", t, ex)
            got = None
        if got:
            closes[e["id"]], vols[e["id"]] = got
            source[e["id"]] = "naver" if mkey == "KR" else "stooq"
        else:
            source[e["id"]] = "failed"
    log(mkey, "수집 결과", {k: sum(1 for s in source.values() if s == k) for k in set(source.values())})
    failed = [k for k, v in source.items() if v == "failed"]
    if failed:
        log(mkey, "수집 실패 종목", failed)
    c, v = drop_intraday(mkey, pd.DataFrame(closes), pd.DataFrame(vols))
    return c, v, source


def drop_intraday(mkey: str, c: pd.DataFrame, v: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """장이 아직 안 끝났으면 오늘 봉(장중 가격)을 버린다."""
    from zoneinfo import ZoneInfo

    if c.empty:
        return c, v
    if mkey == "KR":
        now = datetime.now(ZoneInfo("Asia/Seoul"))
        # 수능날은 16:30 마감(scripts/wait_close.py LATE와 같이 바꾼다)
        close_hm = (16, 45) if now.date().isoformat() in ("2026-11-19",) else (15, 45)
    else:
        now = datetime.now(ZoneInfo("America/New_York"))
        close_hm = (16, 10)
    today = pd.Timestamp(now.date())
    c.index = pd.to_datetime(c.index).normalize()
    v.index = pd.to_datetime(v.index).normalize()
    if (now.hour, now.minute) < close_hm and today in c.index:
        log(mkey, "장중이라 오늘 봉 제외", today.date())
        c, v = c.drop(index=today), v.drop(index=today, errors="ignore")
    return c, v


def merge_store(mkey: str, new_c: pd.DataFrame, new_v: pd.DataFrame, store: Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    store.mkdir(parents=True, exist_ok=True)
    out = []
    for kind, new in (("close", new_c), ("volume", new_v)):
        f = store / f"{mkey}_stocks_{kind}.csv"
        old = pd.read_csv(f, index_col=0, parse_dates=True) if f.exists() else pd.DataFrame()
        if new is not None and not new.empty:
            new = new.copy()
            new.index = pd.to_datetime(new.index).normalize()
            new = new[~new.index.duplicated(keep="last")]
            if not old.empty and kind == "close" and "__bench__" in new and new["__bench__"].notna().any():
                cut = new["__bench__"].last_valid_index()
                old = old[old.index <= cut]          # 예전에 저장된 장중 봉 등 새 기준일 이후 값 제거
            elif not old.empty and kind == "volume" and new_c is not None and "__bench__" in new_c and new_c["__bench__"].notna().any():
                old = old[old.index <= pd.to_datetime(new_c["__bench__"].last_valid_index()).normalize()]
            merged = new.combine_first(old) if not old.empty else new
        else:
            merged = old
        merged = merged.sort_index()
        merged = merged[merged.index >= merged.index.max() - pd.Timedelta(days=800)] if not merged.empty else merged
        merged.to_csv(f, float_format="%.4f")
        out.append(merged)
    return out[0], out[1]


def synthetic(m: dict, seed: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    rng = np.random.default_rng(seed)
    idx = pd.bdate_range(end=pd.Timestamp.today().normalize(), periods=500)
    ids = [e["id"] for e in market_entries("KR" if m["label"] == "한국" else "US", m)]
    data, vol = {}, {}
    for k, i in enumerate(ids):
        drift = rng.normal(0.0004, 0.0008)
        regime = np.where(np.arange(len(idx)) > 420, rng.normal(0, 0.003), 0)
        r = rng.normal(drift, 0.015, len(idx)) + regime
        p = 10000 * np.exp(np.cumsum(r))
        start = 300 if k % 23 == 4 else 0     # 일부는 상장 이력이 짧게
        s = pd.Series(p, index=idx)
        s.iloc[:start] = np.nan
        data[i] = s
        vol[i] = pd.Series(rng.integers(1e4, 1e6, len(idx)), index=idx).where(s.notna())
    return pd.DataFrame(data), pd.DataFrame(vol)


# ---------------------------------------------------------------- 계산
def r(x, nd=2):
    if x is None:
        return None
    try:
        if isinstance(x, (bool, np.bool_)):
            return bool(x)
        f = float(x)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return round(f, nd)


def stage_of(close, ma50, ma150, ma200, ma200_up, dist_high) -> str:
    if any(pd.isna(v) for v in (close, ma50, ma200)):
        return "데이터 부족"
    if pd.isna(ma150):
        ma150 = ma200
    if close > ma50 > ma150 > ma200 and ma200_up and dist_high >= -0.25:
        return "상승 추세"
    if close < ma200 and not ma200_up:
        return "하락 추세"
    if close < ma50 and close > ma200 and ma200_up:
        return "상승 둔화"
    if close > ma50 and close > ma200:
        return "상승 전환 시도"
    return "바닥 다지기"


def build_baskets(m: dict, close: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """구성 종목 동일가중 바구니 지수(시작 100)와 종목별 지표를 만든다.

    매일 그날 가격이 있는 구성 종목들의 하루 수익률을 단순 평균해 지수에 곱한다(매일 같은 비중으로 재조정).
    상장 전·거래정지로 가격이 없는 종목은 그날 평균에서 빠진다. 2종목 이상 가격이 있는 날부터 지수를 만든다.
    """
    bench = close["__bench__"].dropna()
    cal = bench.index
    bcols = [c for c in ("__bench__", "__bench2__") if c in close.columns]
    px = close.reindex(cal).drop(columns=bcols).ffill(limit=3)
    bench2 = close["__bench2__"].reindex(cal).ffill(limit=3) if "__bench2__" in close.columns else None
    second_mkts = {"KOSDAQ", "NAS"}
    rets = px.pct_change(fill_method=None)
    idx = {}
    for it in m["items"]:
        cols = [mb["ticker"] for mb in it["members"] if mb["ticker"] in px.columns]
        if not cols:
            continue
        rr = rets[cols]
        cnt = rr.notna().sum(axis=1)
        avg = rr.mean(axis=1).where(cnt >= 2)
        start = avg.first_valid_index()
        if start is None:
            continue
        lvl = (1 + avg.loc[start:].fillna(0)).cumprod() * 100
        lvl.iloc[0] = 100.0
        idx[it["id"]] = lvl.reindex(cal)
    basket = pd.DataFrame(idx)
    basket["__bench__"] = bench
    if bench2 is not None:
        basket["__bench2__"] = bench2

    # 종목별 지표
    ma50 = px.rolling(50, min_periods=50).mean()
    ma150 = px.rolling(150, min_periods=150).mean()
    ma200 = px.rolling(200, min_periods=200).mean()
    up200 = ma200 > ma200.shift(20)
    hi = px.rolling(252, min_periods=60).max()
    dist = px / hi - 1
    mkt_of = {mb["ticker"]: mb.get("market") for it in m["items"] for mb in it["members"]}
    bdf = pd.DataFrame({t: (bench2 if bench2 is not None and mkt_of.get(t) in second_mkts else bench) for t in px.columns})
    rs = px / bdf
    rs_ma = rs.rolling(50, min_periods=50).mean()
    k = {w: px / px.shift(w) - 1 for w in (1, 5, 20, 60, 200)}
    # 종목 RS 지수(1~99): 산업과 같은 오닐식 가중 수익률을 시장 안 전체 종목끼리 백분위로.
    rsw = {63: 0.4, 126: 0.2, 189: 0.2, 252: 0.2}
    sr = {w: px / px.shift(w) - 1 for w in rsw}
    s_num = sum(sr[w].fillna(0) * wt for w, wt in rsw.items())
    s_den = sum(sr[w].notna() * wt for w, wt in rsw.items())
    s_perf = (s_num / s_den.replace(0, np.nan)).where(sr[63].notna())
    s_rating = np.ceil(s_perf.rank(axis=1, pct=True) * 99).clip(1, 99)
    last = cal[-1]
    members = {}
    for it in m["items"]:
        rows = []
        for mb in it["members"]:
            t = mb["ticker"]
            if t not in px.columns:
                rows.append({"name": mb["name"], "code": mb["code"], "ticker": t, "missing": True})
                continue
            c = px.at[last, t]
            lv = px[t].last_valid_index()
            rows.append({
                "name": mb["name"], "code": mb["code"], "ticker": t,
                "close": r(c, 2), "chg1": r(k[1].at[last, t] * 100), "ret5": r(k[5].at[last, t] * 100),
                "ret20": r(k[20].at[last, t] * 100), "ret60": r(k[60].at[last, t] * 100),
                "ret200": r(k[200].at[last, t] * 100),
                "rs_rating": r(s_rating.at[last, t], 0),
                "dist_high": r(dist.at[last, t] * 100),
                "above50": None if pd.isna(ma50.at[last, t]) else bool(c > ma50.at[last, t]),
                "rs_up": None if pd.isna(rs_ma.at[last, t]) else bool(rs.at[last, t] > rs_ma.at[last, t]),
                "stage": stage_of(c, ma50.at[last, t], ma150.at[last, t], ma200.at[last, t], bool(up200.at[last, t]), dist.at[last, t]),
                "stale": lv is None or lv < last,
                "path": mb.get("path"),
            })
        valid = [x for x in rows if not x.get("missing")]
        rows.sort(key=lambda x: (x.get("ret20") is None, -(x.get("ret20") or 0)))
        a50 = [x["above50"] for x in valid if x.get("above50") is not None]
        members[it["id"]] = {
            "members": rows,
            "breadth50": r(sum(a50) / len(a50) * 100, 0) if a50 else None,
            "near_high": sum(1 for x in valid if x.get("dist_high") is not None and x["dist_high"] >= -5),
            "uptrend": sum(1 for x in valid if x.get("stage") == "상승 추세"),
            "n": len(valid),
            "leader": rows[0]["name"] if rows else None,
        }
    return basket, members


def compute(mkey: str, m: dict, close: pd.DataFrame, volume: pd.DataFrame, source: dict | None) -> tuple[dict, dict]:
    items = m["items"]
    ids = [i["id"] for i in items]
    close = close.copy()
    bench_raw = close["__bench__"].dropna()
    # 벤치마크 거래일을 기준 달력으로 쓰고, 산업 ETF의 짧은 공백(3일 이하)만 채운다
    cal = bench_raw.index
    px = close.reindex(cal)[ids].ffill(limit=3)
    vol = volume.reindex(cal)[[c for c in ids if c in volume.columns]]
    bench = bench_raw
    last = cal[-1]
    bench2 = close["__bench2__"].reindex(cal).ffill(limit=3) if "__bench2__" in close.columns else None
    second_mkts = {"KOSDAQ", "NAS"}
    bench_of = {}
    for it in items:
        mk = [mb.get("market") for mb in it.get("members", [])]
        use2 = bench2 is not None and sum(x in second_mkts for x in mk) > len(mk) / 2
        bench_of[it["id"]] = "2" if use2 else "1"
    bdf = pd.DataFrame({i: (bench2 if bench_of[i] == "2" else bench) for i in ids})

    rets = {w: px / px.shift(w) - 1 for w in (1, 5, 20, 60, 120, 200)}
    ranks = {w: rets[w].rank(axis=1, ascending=False, method="min") for w in (5, 20, 60, 200)}
    pcts = {w: rets[w].rank(axis=1, pct=True) * 100 for w in WEIGHTS}
    num = sum(pcts[w].fillna(0) * wt for w, wt in WEIGHTS.items())
    den = sum(pcts[w].notna() * wt for w, wt in WEIGHTS.items())
    score = (num / den.replace(0, np.nan)).where(rets[20].notna())
    comp_rank = score.rank(axis=1, ascending=False, method="min")
    n_avail = score.notna().sum(axis=1)
    top_cut = (n_avail * TOP_SHARE).round().clip(lower=3)
    in_top = comp_rank.le(top_cut, axis=0)

    ma = {w: px.rolling(w, min_periods=w).mean() for w in (20, 50, 150, 200)}
    ma200_up = ma[200] > ma[200].shift(20)
    hi52 = px.rolling(252, min_periods=60).max()
    lo52 = px.rolling(252, min_periods=60).min()
    dist_hi = px / hi52 - 1
    rs = px / bdf
    rs_ma50 = rs.rolling(50, min_periods=50).mean()
    rs_hi = rs.rolling(252, min_periods=60).max()
    bret20 = bdf / bdf.shift(20) - 1
    rs_ex20 = (1 + rets[20]) / (1 + bret20) - 1   # 20일 동안 시장 대비 초과수익
    # RS 지수(1~99): 오닐(IBD)식. 최근 3개월 40%, 6·9·12개월 각 20% 가중 수익률을 시장 안 산업끼리 백분위로.
    # 1년 이력이 없으면 있는 기간끼리 가중치를 다시 나눈다.
    RSW = {63: 0.4, 126: 0.2, 189: 0.2, 252: 0.2}
    rsr = {w: px / px.shift(w) - 1 for w in RSW}
    rs_num = sum(rsr[w].fillna(0) * wt for w, wt in RSW.items())
    rs_den = sum(rsr[w].notna() * wt for w, wt in RSW.items())
    rs_perf = (rs_num / rs_den.replace(0, np.nan)).where(rsr[63].notna())
    rs_rating = np.ceil(rs_perf.rank(axis=1, pct=True) * 99).clip(1, 99)

    above50 = (px > ma[50]).where(ma[50].notna())
    stage2 = (px > ma[50]) & (ma[50] > ma[150].fillna(ma[200])) & (ma[150].fillna(ma[200]) > ma[200]) & ma200_up & (dist_hi >= -0.25)
    stage2 = stage2.where(ma[200].notna())

    hist_idx = cal[-HISTORY_DAYS:]
    n_last = int(n_avail.loc[last])
    jump_cut = max(5, round(n_last * 0.15))

    out_items = []
    for it in items:
        i = it["id"]
        s_last = px[i].last_valid_index()
        stale = s_last is None or s_last < last or (source is not None and source.get(i) == "failed")
        c = px.at[last, i]
        cr = comp_rank.at[last, i]

        def back(df, k):
            pos = len(cal) - 1 - k
            return df[i].iloc[pos] if pos >= 0 else np.nan

        # 상위권 연속 일수와 시작일
        streak, start = 0, None
        col = in_top[i].values
        for k in range(len(col) - 1, -1, -1):
            if col[k]:
                streak += 1
                start = cal[k]
            else:
                break

        checks = None
        if not pd.isna(ma[200].at[last, i]):
            m150 = ma[150].at[last, i]
            checks = [
                bool(c > ma[50].at[last, i]),
                bool(ma[50].at[last, i] > m150),
                bool(m150 > ma[200].at[last, i]),
                bool(ma200_up.at[last, i]),
                bool(dist_hi.at[last, i] >= -0.15),
            ]
        stg = stage_of(c, ma[50].at[last, i], ma[150].at[last, i], ma[200].at[last, i],
                       bool(ma200_up.at[last, i]), dist_hi.at[last, i])

        tags = []
        chg5 = back(comp_rank, 5) - cr if not pd.isna(cr) else np.nan
        chg20 = back(comp_rank, 20) - cr if not pd.isna(cr) else np.nan
        if not pd.isna(chg5) and chg5 >= jump_cut:
            tags.append("순위 급상승")
        if bool(in_top.at[last, i]) and not bool(back(in_top, 5)):
            tags.append("신규 상위권")
        if not bool(in_top.at[last, i]) and bool(back(in_top, 5)):
            tags.append("상위권 이탈")
        if not pd.isna(dist_hi.at[last, i]) and dist_hi.at[last, i] >= -0.01:
            tags.append("52주 신고가")
        if not pd.isna(rs_hi.at[last, i]) and rs.at[last, i] >= rs_hi.at[last, i] * 0.999:
            tags.append("RS 신고가")
        a50 = above50[i]
        if a50.iloc[-1] == 1 and (a50.iloc[-6:-1] == 0).any():
            tags.append("50일선 돌파")
        if a50.iloc[-1] == 0 and (a50.iloc[-6:-1] == 1).any():
            tags.append("50일선 이탈")

        v20 = vol[i].iloc[-20:].mean() if i in vol else np.nan
        v60 = vol[i].iloc[-60:].mean() if i in vol else np.nan

        out_items.append({
            "id": i, "name": it["name"], "group": it["group"],
            "etf": it.get("etf") or f"{len(it.get('members', []))}개 종목 동일가중", "ticker": it.get("ticker", ""),
            "close": r(c, 2), "chg1": r(rets[1].at[last, i] * 100),
            "ret5": r(rets[5].at[last, i] * 100), "ret20": r(rets[20].at[last, i] * 100),
            "ret60": r(rets[60].at[last, i] * 100), "ret120": r(rets[120].at[last, i] * 100),
            "ret200": r(rets[200].at[last, i] * 100),
            "rank5": r(ranks[5].at[last, i], 0), "rank20": r(ranks[20].at[last, i], 0), "rank60": r(ranks[60].at[last, i], 0),
            "rank200": r(ranks[200].at[last, i], 0),
            "score": r(score.at[last, i], 1), "rank": r(cr, 0),
            "rank_chg5": r(chg5, 0), "rank_chg20": r(chg20, 0),
            "top": bool(in_top.at[last, i]), "streak": streak,
            "streak_start": start.strftime("%Y-%m-%d") if start is not None else None,
            "dist_high": r(dist_hi.at[last, i] * 100), "above_low": r((c / lo52.at[last, i] - 1) * 100),
            "checks": checks, "stage": stg,
            "rs_above_ma50": r(rs.at[last, i] > rs_ma50.at[last, i]) if not pd.isna(rs_ma50.at[last, i]) else None,
            "rs_hi_dist": r((rs.at[last, i] / rs_hi.at[last, i] - 1) * 100) if not pd.isna(rs_hi.at[last, i]) else None,
            "rs_ex20": r(rs_ex20.at[last, i] * 100) if not pd.isna(rs_ex20.at[last, i]) else None,
            "rs_rating": r(rs_rating.at[last, i], 0),
            "rs_rating_chg20": r(rs_rating.at[last, i] - rs_rating[i].iloc[-21], 0) if len(cal) > 21 and not pd.isna(rs_rating[i].iloc[-21]) else None,
            "vol_ratio": r(v20 / v60, 2) if v60 and not pd.isna(v60) and v60 > 0 else None,
            "tags": tags, "stale": bool(stale),
            "bench": (m.get("benchmark2") if bench_of[i] == "2" else m["benchmark"])["name"],
            "last_date": s_last.strftime("%Y-%m-%d") if s_last is not None else None,
            "source": (source or {}).get(i, "stored"),
        })

    # 그룹 확산: 그룹별 평균 강도와 상위 절반 비율
    groups = {}
    for it in out_items:
        g = groups.setdefault(it["group"], {"group": it["group"], "n": 0, "score_sum": 0.0, "top_half": 0, "stage2": 0})
        if it["score"] is None:
            continue
        g["n"] += 1
        g["score_sum"] += it["score"]
        g["top_half"] += 1 if it["rank"] <= n_last / 2 else 0
        g["stage2"] += 1 if it["stage"] == "상승 추세" else 0
    group_list = sorted(
        ({"group": g["group"], "n": g["n"], "score": r(g["score_sum"] / g["n"], 1) if g["n"] else None,
          "top_half": g["top_half"], "stage2": g["stage2"]} for g in groups.values()),
        key=lambda x: -(x["score"] or 0))

    def index_info(b: pd.Series, meta: dict) -> dict:
        b = b.dropna()
        m50, m200 = b.rolling(50).mean(), b.rolling(200).mean()
        up = bool(m200.iloc[-1] > m200.iloc[-21])
        c = b.iloc[-1]
        if c > m50.iloc[-1] and c > m200.iloc[-1] and up:
            reg = "상승 추세"
        elif c < m200.iloc[-1] and not up:
            reg = "하락 추세"
        else:
            reg = "조정·혼조"
        return {**meta, "close": r(c), "chg1": r((b.iloc[-1] / b.iloc[-2] - 1) * 100),
                "ret5": r((b.iloc[-1] / b.iloc[-6] - 1) * 100), "ret20": r((b.iloc[-1] / b.iloc[-21] - 1) * 100),
                "ret60": r((b.iloc[-1] / b.iloc[-61] - 1) * 100),
                "above50": bool(c > m50.iloc[-1]), "above200": bool(c > m200.iloc[-1]), "ma200_up": up, "regime": reg}

    b_ma50 = bench.rolling(50).mean()
    b_ma200 = bench.rolling(200).mean()

    breadth50 = above50.mean(axis=1) * 100
    breadth_s2 = stage2.mean(axis=1) * 100

    def ser(s, nd=2):
        return [r(v, nd) for v in s.reindex(hist_idx).values]

    summary = {
        "market": mkey, "label": m["label"], "currency": m["currency"],
        "updated_at": datetime.now(KST).strftime("%Y-%m-%d %H:%M KST"),
        "basis_date": last.strftime("%Y-%m-%d"),
        "n": n_last, "top_cut": int(top_cut.loc[last]),
        "weights": {str(k): v for k, v in WEIGHTS.items()},
        "benchmark": index_info(bench, m["benchmark"]),
        "benchmark2": index_info(bench2, m["benchmark2"]) if bench2 is not None and bench2.notna().sum() > 210 else None,
        "breadth": {"dates": [d.strftime("%Y-%m-%d") for d in hist_idx],
                    "above50": ser(breadth50, 1), "stage2": ser(breadth_s2, 1)},
        "groups": group_list,
        "items": sorted(out_items, key=lambda x: (x["rank"] is None, x["rank"] or 0)),
        "history": {
            "dates": [d.strftime("%Y-%m-%d") for d in hist_idx],
            "rank": {i: ser(comp_rank[i], 0) for i in ids},
            "score": {i: ser(score[i], 1) for i in ids},
        },
    }
    nd = 4 if mkey == "US" else 2
    series = {"dates": [d.strftime("%Y-%m-%d") for d in hist_idx],
              "bench": {"close": ser(bench, nd), "ma50": ser(b_ma50, nd), "ma200": ser(b_ma200, nd)},
              "items": {}}
    for i in ids:
        rs_norm = rs[i] / rs[i].reindex(hist_idx).dropna().iloc[0] * 100 if rs[i].reindex(hist_idx).notna().any() else rs[i]
        rsm = rs_ma50[i] / rs[i].reindex(hist_idx).dropna().iloc[0] * 100 if rs[i].reindex(hist_idx).notna().any() else rs_ma50[i]
        series["items"][i] = {
            "close": ser(px[i], nd), "ma20": ser(ma[20][i], nd), "ma50": ser(ma[50][i], nd),
            "ma200": ser(ma[200][i], nd), "rs": ser(rs_norm, 2), "rs_ma50": ser(rsm, 2),
            "vol": ser(vol[i], 0) if i in vol else [],
        }
    return summary, series


def sector_watch(m: dict, close: pd.DataFrame, basis: str) -> list[dict]:
    """큰 업종 11개(섹터 ETF)의 당일·5일·20일 등락. 기준일 가격이 없으면 stale 로 표시."""
    out = []
    for sec in m.get("sectors") or []:
        col = "__sec_" + sec["ticker"]
        if col not in close:
            continue
        c = close[col].dropna()
        c = c[c.index <= pd.Timestamp(basis)]
        if len(c) < 21:
            continue
        last = c.iloc[-1]
        out.append({"ticker": sec["ticker"], "name": sec["name"], "en": sec["en"], "items": sec["items"],
                    "close": r(last), "chg1": r((last / c.iloc[-2] - 1) * 100),
                    "ret5": r((last / c.iloc[-6] - 1) * 100), "ret20": r((last / c.iloc[-21] - 1) * 100),
                    "spark": [r(x) for x in c.iloc[-20:].values],
                    "date": c.index[-1].strftime("%Y-%m-%d"), "stale": c.index[-1].strftime("%Y-%m-%d") != basis})
    out.sort(key=lambda x: (x["chg1"] is None, -(x["chg1"] or 0)))
    return out


def sanity(summary: dict) -> list[str]:
    """명백한 데이터 오류를 막는 점검. 문제가 있으면 메시지를 돌려준다."""
    probs = []
    for it in summary["items"]:
        if it["chg1"] is not None and abs(it["chg1"]) > 30:
            probs.append(f"{it['name']} 하루 변동 {it['chg1']}% (이상치 의심)")
        if it["stale"]:
            probs.append(f"{it['name']} 최신 가격 없음(마지막 {it['last_date']})")
    if summary["n"] < len(summary["items"]) * 0.7:
        probs.append(f"계산 가능한 산업 {summary['n']}개로 부족")
    return probs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-fetch", action="store_true")
    ap.add_argument("--synthetic", action="store_true")
    ap.add_argument("--markets", default="KR,US")
    a = ap.parse_args()

    cfg = json.loads((ROOT / "config/baskets.json").read_text(encoding="utf-8"))
    out_dir = ROOT / ("tmp/docs/data" if a.synthetic else "docs/data")
    store = ROOT / ("tmp/prices" if a.synthetic else "data/prices")
    out_dir.mkdir(parents=True, exist_ok=True)
    import os
    # 이전 상태를 읽어 두었다가, 한 시장이 실패해도 다른 시장의 최신 기준일은 지우지 않는다.
    try:
        prev_status = json.loads((out_dir / "status.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        prev_status = {}
    status = {"updated_at": datetime.now(KST).strftime("%Y-%m-%d %H:%M KST"), "run_url": os.environ.get("RUN_URL"),
              "trigger": os.environ.get("RUN_TRIGGER") or "local", "markets": {}}
    fatal = False
    for k, mkey in enumerate(a.markets.split(",")):
        m = cfg["markets"][mkey]
        source = None
        if a.synthetic:
            c, v = synthetic(m, 7 + k)
            c, v = merge_store(mkey, c, v, store)
        elif a.no_fetch:
            c, v = merge_store(mkey, None, None, store)
        else:
            nc, nv, source = fetch_market(mkey, m)
            c, v = merge_store(mkey, nc, nv, store)
        if c.empty or "__bench__" not in c or c["__bench__"].notna().sum() < 210:
            log(mkey, "벤치마크 가격 부족 → 이 시장은 기존 화면 유지")
            keep = (prev_status.get("markets") or {}).get(mkey) or {}
            status["markets"][mkey] = {"ok": False, "reason": "벤치마크 가격 부족", "basis_date": keep.get("basis_date"), "n": keep.get("n")}
            fatal = True
            continue
        basket, mem = build_baskets(m, c)
        summary, series = compute(mkey, m, basket, pd.DataFrame(index=basket.index), None)
        for it in summary["items"]:
            extra = mem.get(it["id"], {})
            it.update({k: extra.get(k) for k in ("members", "breadth50", "near_high", "uptrend", "n", "leader")})
            it["vol_ratio"] = None
            if (it.get("breadth50") or 0) >= 70 and (it.get("n") or 0) >= 3:
                it["tags"].append("종목 확산")
        failed = sorted({mb["name"] for it in summary["items"] for mb in (it.get("members") or []) if mb.get("missing") or mb.get("stale")})
        summary["n_stocks"] = sum(it.get("n") or 0 for it in summary["items"])
        summary["sectors"] = sector_watch(m, c, summary["basis_date"])
        probs = sanity(summary)
        if failed:
            probs.append(f"최신 가격이 없는 종목 {len(failed)}개: " + ", ".join(failed[:12]) + (" 외" if len(failed) > 12 else ""))
        summary["warnings"] = probs
        (out_dir / f"{mkey}.json").write_text(json.dumps(summary, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        (out_dir / f"{mkey}_series.json").write_text(json.dumps(series, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        status["markets"][mkey] = {"ok": True, "basis_date": summary["basis_date"], "n": summary["n"], "warnings": probs}
        log(mkey, "기준일", summary["basis_date"], "산업", summary["n"], "경고", probs)
    (out_dir / "status.json").write_text(json.dumps(status, ensure_ascii=False, indent=1), encoding="utf-8")
    if fatal and not any(s.get("ok") for s in status["markets"].values()):
        sys.exit(1)


if __name__ == "__main__":
    main()
