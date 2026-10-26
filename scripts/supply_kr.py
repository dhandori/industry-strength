"""한국 세부 산업 수급(외국인·기관·개인 순매수)을 만든다.

- 출처: 네이버 증권 모바일 '투자자별 매매동향' (종목 하나에 한 번 부르면 최근 거래일들이 온다)
- 금액은 순매수 수량 × 그날 종가로 계산한 추정치(억 원). 실제 체결 금액과 몇 % 다를 수 있다.
- 수급 강도 = (외국인 + 기관) 순매수 금액 ÷ 시가총액(상장주식수 × 최근 종가) × 100
- 산업 수급 강도 = 구성 종목 수급 강도의 단순 평균(바구니 지수와 같은 '같은 비중' 기준)
- 매일 받은 값을 data/supply/KR_daily.csv 에 쌓는다. 첫 실행은 최근 60거래일을 한 번에 채운다.
- 새 거래일 자료가 아직 안 올라왔으면 삼성전자 한 종목만 확인하고 끝낸다(네이버에 부담을 주지 않기 위해).
- 산업 판정(동행 상승·매집 의심 등)은 화면이 최신 종합 강도와 합쳐 계산한다.

결과: docs/data/KR_supply.json
"""
from __future__ import annotations

import csv
import json
import random
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KST = timezone(timedelta(hours=9))
API = "https://m.stock.naver.com/api/stock/{code}/trend"
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      "Referer": "https://m.stock.naver.com/"}
STORE = ROOT / "data/supply/KR_daily.csv"
OUT = ROOT / "docs/data/KR_supply.json"
KEEP_SESSIONS = 130          # 저장해 두는 거래일 수(약 6개월)
CHART_SESSIONS = 120         # 상세 창 누적 그래프 길이
WINDOWS = (1, 5, 20, 60)
PROBE = "005930"
FIELDS = ["date", "code", "close", "f", "i", "p", "hold"]


def log(*a):
    print("[supply]", *a, flush=True)


def num(v):
    s = str(v if v is not None else "").replace(",", "").replace("+", "").replace("%", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def fetch(code: str, size: int) -> list[dict]:
    """최신일이 먼저 오는 하루 단위 줄. 실패하면 두 번까지 다시 시도한다."""
    import requests

    for attempt in range(3):
        try:
            r = requests.get(API.format(code=code), params={"pageSize": size}, headers=UA, timeout=15)
            if r.status_code == 200:
                out = []
                for it in r.json() if isinstance(r.json(), list) else []:
                    ds = str(it.get("bizdate") or "")
                    close = num(it.get("closePrice"))
                    if not re.fullmatch(r"\d{8}", ds) or not close:
                        continue
                    out.append({"date": f"{ds[:4]}-{ds[4:6]}-{ds[6:]}", "code": code, "close": close,
                                "f": num(it.get("foreignerPureBuyQuant")), "i": num(it.get("organPureBuyQuant")),
                                "p": num(it.get("individualPureBuyQuant")), "hold": num(it.get("foreignerHoldRatio"))})
                return out
            if r.status_code in (403, 429):
                time.sleep(5 + attempt * 5)
        except Exception:  # noqa: BLE001
            pass
        time.sleep(1 + attempt)
    return []


def load_store() -> dict[tuple[str, str], dict]:
    rows = {}
    if STORE.exists():
        with STORE.open(encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                rows[(r["date"], r["code"])] = {k: (r[k] if k in ("date", "code") else num(r[k])) for k in FIELDS}
    return rows


def save_store(rows: dict):
    dates = sorted({d for d, _ in rows})[-KEEP_SESSIONS:]
    keep = set(dates)
    STORE.parent.mkdir(parents=True, exist_ok=True)
    with STORE.open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(FIELDS)
        for key in sorted(k for k in rows if k[0] in keep):
            r = rows[key]
            w.writerow([r["date"], r["code"]] + ["" if r[k] is None else (f"{r[k]:g}") for k in FIELDS[2:]])


def members() -> tuple[list[dict], dict[str, dict]]:
    cfg = json.loads((ROOT / "config/baskets.json").read_text(encoding="utf-8"))["markets"]["KR"]
    stocks = {}
    for it in cfg["items"]:
        for m in it["members"]:
            stocks.setdefault(m["code"], m)
    return cfg["items"], stocks


def collect(stocks: dict, rows: dict) -> tuple[int, str]:
    """새 자료가 있을 때만 전 종목을 받는다. (받은 종목 수, 메시지)"""
    now = datetime.now(KST)
    today = now.strftime("%Y-%m-%d")
    in_session = now.weekday() < 5 and (8, 30) <= (now.hour, now.minute) < (16, 0)
    have = sorted({d for d, _ in rows})
    probe = fetch(PROBE, 5)
    if not probe:
        return 0, "네이버 수급 자료를 받지 못함(확인용 종목 실패)"
    newest = max(r["date"] for r in probe if not (in_session and r["date"] == today))
    complete = have and newest <= have[-1] and sum(1 for d, _ in rows if d == have[-1]) >= len(stocks) * 0.9
    if complete and "--force" not in sys.argv:
        return 0, f"새 거래일 수급 없음(최신 {newest})"
    # 이력이 충분하면 최근 10거래일만, 처음이면 60거래일을 받는다.
    size = 60 if len(have) < 20 or "--full" in sys.argv else 10

    def one(code):
        time.sleep(random.uniform(0.15, 0.45))   # 동시에 2개씩, 사이사이 쉬면서
        return code, fetch(code, size)

    got = 0
    with ThreadPoolExecutor(max_workers=2) as ex:
        for code, data in ex.map(one, list(stocks)):
            if data:
                got += 1
            for r in data:
                if in_session and r["date"] == today:
                    continue   # 장중 잠정치는 저장하지 않는다
                rows[(r["date"], code)] = r
    return got, f"{got}/{len(stocks)}종목 받음(최근 {size}거래일)"


def build(items: list[dict], stocks: dict, rows: dict, msg: str, got: int) -> dict:
    dates = sorted({d for d, _ in rows})
    by_code: dict[str, dict[str, dict]] = {}
    for (d, c), r in rows.items():
        by_code.setdefault(c, {})[d] = r

    def amt(r, k):
        v = r.get(k)
        return None if v is None or r.get("close") is None else v * r["close"] / 1e8   # 억 원

    S = {}
    for code, m in stocks.items():
        hist = by_code.get(code) or {}
        ds = [d for d in dates if d in hist]
        if not ds:
            continue
        last = hist[ds[-1]]
        mcap = (m.get("shares") or 0) * last["close"] / 1e8 if m.get("shares") else m.get("mcap_eok")
        s = {"asof": ds[-1], "mcap": round(mcap) if mcap else None, "hold": last.get("hold")}
        # 대량 블록거래 날: 외국인+기관+개인 합이 0에서 크게 벗어남(= 기타법인과 큰 덩어리를 주고받음).
        # 시장에서 사 모은 돈이 아니라 지분 이동이라 수급 강도 계산에서는 그날을 뺀다(합계 숫자에는 남기고 표시).
        blk = set()
        for d in ds:
            r = hist[d]
            if None in (r.get("f"), r.get("i"), r.get("p")) or not mcap:
                continue
            other = abs(r["f"] + r["i"] + r["p"]) * r["close"] / 1e8
            if other >= 50 and other >= mcap * 0.003:
                blk.add(d)
        s["blk"] = [d for d in ds[-20:] if d in blk]
        for n in WINDOWS:
            chunk = [hist[d] for d in ds[-n:]] if len(ds) >= n else None
            for k in ("f", "i", "p"):
                vals = [amt(r, k) for r in chunk] if chunk else None
                ok = vals and sum(v is not None for v in vals) >= max(1, int(n * 0.8))
                s[f"{k}{n}"] = round(sum(v for v in vals if v is not None), 1) if ok else None
            if n in (5, 20) and mcap and s[f"f{n}"] is not None and s[f"i{n}"] is not None:
                adj = sum((amt(r, "f") or 0) + (amt(r, "i") or 0) for d, r in zip(ds[-n:], chunk) if d not in blk)
                # 한 종목이 산업 평균을 혼자 끌고 가지 않게 ±3%에서 자른다
                s[f"pct{n}"] = round(max(-3.0, min(3.0, adj / mcap * 100)), 3)
        # 연속 매수(+)·매도(-) 일수. 0이면 끊긴다.
        for k, key in (("f", "fs"), ("i", "is")):
            run = 0
            for d in reversed(ds):
                v = hist[d].get(k)
                if not v:
                    break
                sgn = 1 if v > 0 else -1
                if run == 0 or (run > 0) == (sgn > 0):
                    run += sgn
                else:
                    break
            s[key] = run
        S[code] = s

    chart_dates = dates[-CHART_SESSIONS:]
    I = {}
    for it in items:
        codes = [m["code"] for m in it["members"] if m["code"] in S]
        if not codes:
            continue
        ss = [S[c] for c in codes]
        x = {"n": len(codes)}
        for n in WINDOWS:
            for k in ("f", "i", "p"):
                vals = [s[f"{k}{n}"] for s in ss if s.get(f"{k}{n}") is not None]
                x[f"{k}{n}"] = round(sum(vals), 1) if len(vals) >= max(1, len(ss) * 0.6) else None
        for n in (5, 20):
            vals = [s[f"pct{n}"] for s in ss if s.get(f"pct{n}") is not None]
            x[f"pct{n}"] = round(sum(vals) / len(vals), 3) if len(vals) >= max(2, len(ss) * 0.6) else None
            fi = [s for s in ss if s.get(f"f{n}") is not None and s.get(f"i{n}") is not None]
            x[f"buy{n}"] = round(sum(1 for s in fi if s[f"f{n}"] + s[f"i{n}"] > 0) / len(fi) * 100) if fi else None
        # 산업 전체 (외국인+기관) 하루 합계의 연속 매수·매도 일수
        daily = {k: [] for k in ("f", "i", "p")}
        for d in chart_dates:
            for k in daily:
                vals = [amt(by_code[c][d], k) for c in codes if d in by_code.get(c, {})]
                vals = [v for v in vals if v is not None]
                daily[k].append(round(sum(vals), 1) if vals else None)
        run = 0
        for fv, iv in zip(reversed(daily["f"]), reversed(daily["i"])):
            if fv is None or iv is None or fv + iv == 0:
                break
            sgn = 1 if fv + iv > 0 else -1
            if run == 0 or (run > 0) == (sgn > 0):
                run += sgn
            else:
                break
        x["run"] = run
        x["daily"] = daily
        I[it["id"]] = x
    # 산업끼리 비교한 백분위(0~100, 높을수록 많이 삼)
    for n in (5, 20):
        ranked = sorted((v[f"pct{n}"], k) for k, v in I.items() if v.get(f"pct{n}") is not None)
        for pos, (_, k) in enumerate(ranked):
            I[k][f"rk{n}"] = round(pos / max(1, len(ranked) - 1) * 100)
    tot = {}
    for n in WINDOWS:
        for k in ("f", "i", "p"):
            vals = [s[f"{k}{n}"] for s in S.values() if s.get(f"{k}{n}") is not None]
            tot[f"{k}{n}"] = round(sum(vals), 1) if vals else None
    now = datetime.now(KST)
    return {"source": "네이버 증권 투자자별 매매동향(순매수 수량 × 종가 추정)",
            "updated_at": now.strftime("%Y-%m-%d %H:%M KST"),
            "basis_date": dates[-1] if dates else None, "sessions": len(dates),
            "n_stocks": len(S), "n_target": len(stocks), "last_fetch": msg, "last_fetch_count": got,
            "dates": chart_dates, "total": tot, "industries": I, "stocks": S}


def main():
    items, stocks = members()
    rows = load_store()
    try:
        got, msg = collect(stocks, rows)
    except Exception as e:  # noqa: BLE001
        got, msg = 0, f"수집 실패: {str(e)[:150]}"
    log(msg)
    if got:
        save_store(rows)
    if not rows:
        log("저장된 수급 자료가 없어 결과를 만들지 않음")
        return
    if got or not OUT.exists() or "--build" in sys.argv:
        out = build(items, stocks, rows, msg, got)
        OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        log("완료", out["basis_date"], "종목", out["n_stocks"], "산업", len(out["industries"]), "거래일", out["sessions"])


if __name__ == "__main__":
    main()
