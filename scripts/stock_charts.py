"""종목 상세 창의 차트 자료 (2026-11-11 추가).

update.py 가 모아 둔 바구니 구성 종목 가격(data/prices/<시장>_stocks_close.csv, _volume.csv)과
한국 수급 일별 자료(data/supply/KR_daily.csv)를 종목 상세 창(docs/stock.js)이 바로 그릴 수 있게 한 파일로 묶는다.
네트워크를 쓰지 않으므로 update.py·supply_kr.py 다음에 돌리면 된다.
새 거래일이 없으면 내용이 그대로라 커밋도 생기지 않는다(그래서 갱신 시각 칸을 두지 않는다).

  docs/data/<시장>_stocks.json
    dates            최근 2년(최대 504거래일) 날짜
    bench, bench2    시장 지수 ETF 종가(같은 날짜축) — 종목의 RS선·시장 비교용
    bench_name(2)    지수 이름
    s.<코드>         {c: 종가, v: 거래량, b: 1이면 bench2(코스닥150·나스닥100)와 비교}
    flows (한국만)   {dates, s.<코드>: {f, i, p: 하루 순매수(억 원, 수량×종가 추정), h: 외국인 보유율(%)}}

코드: 한국은 6자리(접미사 .KS·.KQ 없이), 미국은 티커 그대로.
이동평균은 화면에서 계산한다(2년치를 보내므로 1년 구간의 200일선까지 그릴 수 있다).
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DAYS = 504
SECOND = {"KOSDAQ", "NAS"}   # update.py build_baskets 와 같은 기준: 이 시장 종목은 bench2 와 비교


def sig(v, n=3):
    """거래량은 유효숫자 3자리면 충분하다(파일 크기를 줄인다)."""
    if v is None or not math.isfinite(v) or v <= 0:
        return None if v is None or not math.isfinite(v) else 0
    p = n - 1 - int(math.floor(math.log10(v)))
    return int(round(v, p)) if p <= 0 else round(v, p)


def px(v, kr):
    if v is None or not math.isfinite(v):
        return None
    if kr:
        return int(round(v))
    return round(v, 2) if v >= 1 else round(v, 4)


def key_of(col: str, kr: bool) -> str:
    return col.rsplit(".", 1)[0] if kr and col.endswith((".KS", ".KQ")) else col


def build(mkey: str, cfg: dict) -> dict | None:
    kr = mkey == "KR"
    fc = ROOT / f"data/prices/{mkey}_stocks_close.csv"
    fv = ROOT / f"data/prices/{mkey}_stocks_volume.csv"
    if not fc.exists():
        print(f"[stock_charts] {mkey} 가격 파일 없음", flush=True)
        return None
    c = pd.read_csv(fc, index_col=0, parse_dates=True).sort_index()
    v = pd.read_csv(fv, index_col=0, parse_dates=True).sort_index() if fv.exists() else pd.DataFrame()
    if "__bench__" not in c:
        return None
    cal = c["__bench__"].dropna().index[-DAYS:]
    c = c.reindex(cal)
    v = v.reindex(cal) if not v.empty else v
    m = cfg["markets"][mkey]
    mkt_of = {mb["ticker"]: mb.get("market") for it in m["items"] for mb in it["members"]}
    out = {
        "market": mkey,
        "basis_date": cal[-1].strftime("%Y-%m-%d"),
        "dates": [d.strftime("%Y-%m-%d") for d in cal],
        "bench_name": m["benchmark"]["name"],
        "bench": [px(x, kr) if kr else (round(x, 2) if math.isfinite(x) else None) for x in c["__bench__"].tolist()],
        "s": {},
    }
    if "__bench2__" in c and m.get("benchmark2"):
        out["bench_name2"] = m["benchmark2"]["name"]
        out["bench2"] = [px(x, kr) if kr else (round(x, 2) if math.isfinite(x) else None) for x in c["__bench2__"].tolist()]
    for col in c.columns:
        if col.startswith("__"):
            continue
        s = c[col]
        if s.notna().sum() < 5:
            continue
        rec = {"c": [px(x, kr) for x in s.tolist()]}
        if col in v:
            rec["v"] = [sig(x) for x in v[col].tolist()]
        if mkt_of.get(col) in SECOND and "bench2" in out:
            rec["b"] = 1
        out["s"][key_of(col, kr)] = rec
    if kr:
        out["flows"] = flows(set(out["s"]))
    return out


def flows(codes: set[str]) -> dict | None:
    f = ROOT / "data/supply/KR_daily.csv"
    if not f.exists():
        return None
    d = pd.read_csv(f, dtype={"code": str})
    d = d[d["code"].isin(codes)]
    if d.empty:
        return None
    dates = sorted(d["date"].unique())
    pos = {x: k for k, x in enumerate(dates)}
    res = {"dates": dates, "s": {}}
    for code, g in d.groupby("code"):
        n = len(dates)
        rec = {"f": [None] * n, "i": [None] * n, "p": [None] * n, "h": [None] * n}
        for r in g.itertuples(index=False):
            k = pos[r.date]
            cl = r.close if isinstance(r.close, (int, float)) and math.isfinite(r.close) else None
            for who in ("f", "i", "p"):
                q = getattr(r, who)
                if cl is not None and isinstance(q, (int, float)) and math.isfinite(q):
                    rec[who][k] = round(q * cl / 1e8, 1)
            if isinstance(r.hold, (int, float)) and math.isfinite(r.hold):
                rec["h"][k] = round(float(r.hold), 2)
        res["s"][code] = rec
    return res


def main():
    cfg = json.loads((ROOT / "config/baskets.json").read_text(encoding="utf-8"))
    out_dir = ROOT / "docs/data"
    ok = False
    for mkey in ("KR", "US"):
        try:
            res = build(mkey, cfg)
        except Exception as e:  # 한 시장이 실패해도 다른 시장과 기존 파일은 그대로 둔다
            print(f"[stock_charts] {mkey} 실패: {e}", flush=True)
            continue
        if not res:
            continue
        (out_dir / f"{mkey}_stocks.json").write_text(json.dumps(res, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"[stock_charts] {mkey} 종목 {len(res['s'])}개 · {len(res['dates'])}거래일 · 기준일 {res['basis_date']}", flush=True)
        ok = True
    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
