"""산업 강도판 데이터 갱신 스크립트.

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


def fetch_market(mkey: str, m: dict) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    """시장 하나의 종가·거래량 표(열 = id, 벤치마크는 '__bench__')."""
    entries = [{"id": "__bench__", **m["benchmark"]}] + m["items"]
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
    c, v = drop_intraday(mkey, pd.DataFrame(closes), pd.DataFrame(vols))
    return c, v, source


def drop_intraday(mkey: str, c: pd.DataFrame, v: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """장이 아직 안 끝났으면 오늘 봉(장중 가격)을 버린다."""
    from zoneinfo import ZoneInfo

    if c.empty:
        return c, v
    if mkey == "KR":
        now = datetime.now(ZoneInfo("Asia/Seoul"))
        close_hm = (15, 45)
    else:
        now = datetime.now(ZoneInfo("America/New_York"))
        close_hm = (16, 15)
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
        f = store / f"{mkey}_{kind}.csv"
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
    ids = ["__bench__"] + [i["id"] for i in m["items"]]
    data, vol = {}, {}
    for k, i in enumerate(ids):
        drift = rng.normal(0.0004, 0.0008)
        regime = np.where(np.arange(len(idx)) > 420, rng.normal(0, 0.003), 0)
        r = rng.normal(drift, 0.015, len(idx)) + regime
        p = 10000 * np.exp(np.cumsum(r))
        start = 300 if k % 9 == 4 else 0      # 일부는 상장 이력이 짧게
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
        return "이력 부족"
    if pd.isna(ma150):
        ma150 = ma200
    if close > ma50 > ma150 > ma200 and ma200_up and dist_high >= -0.25:
        return "2단계 상승"
    if close < ma200 and not ma200_up:
        return "4단계 하락"
    if close < ma50 and close > ma200 and ma200_up:
        return "3단계 둔화"
    if close > ma50 and close > ma200:
        return "2단계 진입 시도"
    return "1단계 바닥"


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

    rets = {w: px / px.shift(w) - 1 for w in (1, 5, 20, 60, 120)}
    ranks = {w: rets[w].rank(axis=1, ascending=False, method="min") for w in (5, 20, 60)}
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
    rs = px.div(bench, axis=0)
    rs_ma50 = rs.rolling(50, min_periods=50).mean()
    rs_hi = rs.rolling(252, min_periods=60).max()

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
            "id": i, "name": it["name"], "group": it["group"], "etf": it["etf"], "ticker": it["ticker"],
            "close": r(c, 2), "chg1": r(rets[1].at[last, i] * 100),
            "ret5": r(rets[5].at[last, i] * 100), "ret20": r(rets[20].at[last, i] * 100),
            "ret60": r(rets[60].at[last, i] * 100), "ret120": r(rets[120].at[last, i] * 100),
            "rank5": r(ranks[5].at[last, i], 0), "rank20": r(ranks[20].at[last, i], 0), "rank60": r(ranks[60].at[last, i], 0),
            "score": r(score.at[last, i], 1), "rank": r(cr, 0),
            "rank_chg5": r(chg5, 0), "rank_chg20": r(chg20, 0),
            "top": bool(in_top.at[last, i]), "streak": streak,
            "streak_start": start.strftime("%Y-%m-%d") if start is not None else None,
            "dist_high": r(dist_hi.at[last, i] * 100), "above_low": r((c / lo52.at[last, i] - 1) * 100),
            "checks": checks, "stage": stg,
            "rs_above_ma50": r(rs.at[last, i] > rs_ma50.at[last, i]) if not pd.isna(rs_ma50.at[last, i]) else None,
            "vol_ratio": r(v20 / v60, 2) if v60 and not pd.isna(v60) and v60 > 0 else None,
            "tags": tags, "stale": bool(stale),
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
        g["stage2"] += 1 if it["stage"] == "2단계 상승" else 0
    group_list = sorted(
        ({"group": g["group"], "n": g["n"], "score": r(g["score_sum"] / g["n"], 1) if g["n"] else None,
          "top_half": g["top_half"], "stage2": g["stage2"]} for g in groups.values()),
        key=lambda x: -(x["score"] or 0))

    b_ma50 = bench.rolling(50).mean()
    b_ma200 = bench.rolling(200).mean()
    b_up = b_ma200.iloc[-1] > b_ma200.iloc[-21]
    bc = bench.iloc[-1]
    if bc > b_ma50.iloc[-1] and bc > b_ma200.iloc[-1] and b_up:
        regime = "상승 추세"
    elif bc < b_ma200.iloc[-1] and not b_up:
        regime = "하락 추세"
    else:
        regime = "조정·혼조"

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
        "benchmark": {
            **m["benchmark"], "close": r(bc), "chg1": r((bench.iloc[-1] / bench.iloc[-2] - 1) * 100),
            "ret5": r((bench.iloc[-1] / bench.iloc[-6] - 1) * 100),
            "ret20": r((bench.iloc[-1] / bench.iloc[-21] - 1) * 100),
            "ret60": r((bench.iloc[-1] / bench.iloc[-61] - 1) * 100),
            "above50": bool(bc > b_ma50.iloc[-1]), "above200": bool(bc > b_ma200.iloc[-1]),
            "ma200_up": bool(b_up), "regime": regime,
        },
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

    cfg = json.loads((ROOT / "config/universe.json").read_text(encoding="utf-8"))
    out_dir = ROOT / ("tmp/docs/data" if a.synthetic else "docs/data")
    store = ROOT / ("tmp/prices" if a.synthetic else "data/prices")
    out_dir.mkdir(parents=True, exist_ok=True)
    status = {"updated_at": datetime.now(KST).strftime("%Y-%m-%d %H:%M KST"), "markets": {}}
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
            status["markets"][mkey] = {"ok": False, "reason": "벤치마크 가격 부족"}
            fatal = True
            continue
        summary, series = compute(mkey, m, c, v, source)
        probs = sanity(summary)
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
