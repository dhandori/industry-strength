"""일본 52주 신고가 기록 → docs/data/highs_JP.json (52주 신고가 탭의 일본 칸, 2026-11-16 추가).

한국·미국 칸(docs/data/highs.json)은 global-high-radar 의 '52주 신고가 기록' 예약 작업이 통째로 다시 써서 올린다.
일본을 그 파일에 끼우면 다음 기록 때 지워지므로 이 저장소의 갱신 작업(update.yml)이 따로 만든다. 모양은 highs.json 의
markets.KR 과 같다(index·cap_unit·days·rows·stocks·uni). 화면(docs/highs.js)이 두 파일을 합쳐 읽는다.

기준은 노션 기록·wamo_highs52.py 와 같다.
- 대상: config/jp_universe.json(도쿄 보통주, 리츠·우선주 제외) 중 그날 종가 × 상장주식수 = 시총 1,000억 엔 이상.
- 신고가: 그날 장중 고가 ≥ 그 전 365일 최고가 × 0.9999(이력 5거래일 미만은 판단 안 함, 1년 안 된 종목은 있는 기간).
  신저가는 저가로 같은 방식.
- 가격: 야후 일봉. 야후 일본 자료의 잘못 찍힌 값·분할 미반영은 update.fix_price_glitches 로 종가를 고치고 같은 비율을
  고가·저가에 곱한다. 장이 끝난 최신 거래일에 값이 없는 종목은 TradingView 시세(고가·저가·종가)로 메운다.
- 지수 칸: 닛케이225(^N225) 등락. '전날 미국장'은 그 날짜 전 마지막 S&P500(^GSPC) 등락 방향.

python scripts/highs_jp.py
"""
from __future__ import annotations

import json
import sys
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import aux_sources as aux  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs/data/highs_JP.json"
KST = ZoneInfo("Asia/Seoul")
DAYS = 28            # 화면에 보이는 거래일 수(한국·미국 칸과 같다)
TOUCH = 0.9999
MIN_PRIOR_BARS = 5
CAP = 1000           # 억 엔


def log(*a):
    print("[highs_jp]", *a, flush=True)


def download(tickers: list[str]) -> dict[str, pd.DataFrame]:
    import yfinance as yf

    got = {}
    for attempt in range(3):
        todo = [t for t in tickers if t not in got]
        if not todo:
            break
        try:
            raw = yf.download(todo, period="15mo", interval="1d", auto_adjust=False, group_by="ticker",
                              threads=True, progress=False)
        except Exception as e:  # noqa: BLE001
            log("야후 오류", e)
            time.sleep(5)
            continue
        for t in todo:
            try:
                sub = raw[t] if isinstance(raw.columns, pd.MultiIndex) else raw
                df = sub[["High", "Low", "Close"]].dropna(subset=["Close"])
            except Exception:  # noqa: BLE001
                continue
            if len(df) >= MIN_PRIOR_BARS + 1:
                df.index = pd.to_datetime(df.index).tz_localize(None).normalize()
                got[t] = df
        if len(got) < len(tickers):
            time.sleep(5)
    return got


def frames(got: dict, kind: str) -> pd.DataFrame:
    return pd.DataFrame({t: df[kind] for t, df in got.items()}).sort_index().astype(float)


def main() -> int:
    uni = json.loads((ROOT / "config/jp_universe.json").read_text(encoding="utf-8"))["stocks"]
    info = {u["code"] + ".T": u for u in uni}
    tickers = sorted(info)
    got = download(tickers + ["^N225", "^GSPC"])
    have = [t for t in tickers if t in got]
    log("야후 일봉", len(have), "/", len(tickers))
    if len(have) < len(tickers) * 0.7 or "^N225" not in got:
        log("자료가 너무 적어 기존 파일 유지")
        return 1
    H, L, C = frames({t: got[t] for t in have}, "High"), frames({t: got[t] for t in have}, "Low"), frames({t: got[t] for t in have}, "Close")

    # 야후 오류값: 종가를 고치고, 고친 비율을 같은 날 고가·저가에 곱한다(분할 보정은 그 전 날짜 전체에 같은 비율).
    from update import fix_price_glitches
    fixed, _ = fix_price_glitches("JP", C, pd.DataFrame(index=C.index), {t: t for t in have})
    ratio = (fixed / C).where(C.notna(), 1.0).fillna(1.0)
    H, L, C = H * ratio, L * ratio, fixed

    exp = aux.last_closed_session("JP")
    if exp is not None:
        H, L, C = H[H.index <= exp], L[L.index <= exp], C[C.index <= exp]
        # 최신 거래일 값이 빈 종목은 TradingView 로 메운다
        miss = [t for t in have if exp not in C.index or pd.isna(C.at[exp, t])]
        if miss:
            q = aux.tv_quotes("JP", ["TSE:" + t[:-2] for t in miss], ("close", "high", "low"))
            if q and exp not in C.index:
                for df in (H, L, C):
                    df.loc[exp] = float("nan")
                H, L, C = H.sort_index(), L.sort_index(), C.sort_index()
            n = 0
            for t in miss:
                v = q.get("TSE:" + t[:-2])
                if v and v[1] > 0 and v[2] > 0:
                    C.at[exp, t], H.at[exp, t], L.at[exp, t] = v
                    n += 1
            log("TradingView 로 최신일", exp.date(), "메움", n, "/", len(miss))

    n225 = got["^N225"]["Close"]
    spx = got["^GSPC"]["Close"]
    # 거래일: 대상 종목 절반 넘게 값이 있는 날
    days = [d for d in C.index if C.loc[d].notna().sum() >= len(have) * 0.5][-DAYS:]
    out_days, rows, hit_codes = [], [], set()
    for d in days:
        n_hi = n_lo = 0
        for t in have:
            c = C.at[d, t]
            if pd.isna(c):
                continue
            mcap = info[t]["shares"] * c / 1e8
            if mcap < CAP:
                continue
            hist = C[t].loc[:d].dropna()
            prior_idx = hist.index[(hist.index < d) & (hist.index > d - pd.Timedelta(days=365))]
            if len(prior_idx) < MIN_PRIOR_BARS:
                continue
            ph = H[t].reindex(prior_idx).dropna()
            pl = L[t].reindex(prior_idx).dropna()
            h, low = H.at[d, t], L.at[d, t]
            pc = hist.loc[hist.index < d].iloc[-1]
            if not pd.isna(h) and len(ph) and h >= ph.max() * TOUCH:
                n_hi += 1
                hit_codes.add(t)
                rows.append([d.strftime("%Y-%m-%d"), t, round((c / pc - 1) * 100, 2), int(round(mcap)), round(float(c), 1)])
            if not pd.isna(low) and len(pl) and low <= pl.min() * (2 - TOUCH):
                n_lo += 1
        ix = n225[n225.index <= d]
        idx_chg = round((ix.iloc[-1] / ix.iloc[-2] - 1) * 100, 2) if len(ix) >= 2 and ix.index[-1] == d else None
        us = spx[spx.index < d]
        us_dir = ("상승" if us.iloc[-1] >= us.iloc[-2] else "하락") if len(us) >= 2 else None
        out_days.append({"d": d.strftime("%Y-%m-%d"), "n": n_hi, "lows": n_lo, "idx_chg": idx_chg,
                         "idx_close": round(float(ix.iloc[-1]), 2) if len(ix) and ix.index[-1] == d else None, "us_dir": us_dir})
    last = days[-1]
    uni_cnt = {}
    for t in have:
        c = C.at[last, t]
        if not pd.isna(c) and info[t]["shares"] * c / 1e8 >= CAP:
            uni_cnt[info[t]["ind"]] = uni_cnt.get(info[t]["ind"], 0) + 1
    out = {"updated_at": datetime.now(KST).strftime("%Y-%m-%d %H:%M KST"),
           "markets": {"JP": {"index": "닛케이225", "cap_unit": "억 엔", "days": out_days, "rows": rows,
                              "stocks": {t: [info[t]["name"], info[t]["ind"], info[t]["big"]] for t in sorted(hit_codes)},
                              "uni": uni_cnt}}}
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log("저장", last.date(), "신고가", out_days[-1]["n"], "신저가", out_days[-1]["lows"], "대상", sum(uni_cnt.values()),
        "기록", len(rows), "행", f"{OUT.stat().st_size // 1024}KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
