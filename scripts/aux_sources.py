"""보조 가격 자료원 (2026-11-16 사용자 요청: 데일리 마켓 레이더가 받는 자료원을 참고하고 TradingView를 보조로 쓴다).

- 네이버 해외주식 일봉(api.stock.naver.com/chart/foreign/item/<코드>/day): 레이더(wamo-choochoo-dashboard
  wamo_price_sources.fetch_naver_us)가 미국 예비 자료원으로 쓰는 경로. 여기서는 일본 종목(8035.T)의
  야후 실패 시 예비 자료원과, 야후가 잘못 찍은 날의 실제 값을 찾는 데 쓴다.
- TradingView 스캐너(scanner.tradingview.com/<korea|america|japan>/scan): 과거 일봉은 없고 '지금 시세' 한 장만 준다.
  장이 끝난 뒤의 시세 = 그날 종가이므로, 최신 거래일 한 줄을 검사(야후 값과 1.5% 넘게 다르면 바꾼다)하고
  야후에 없는 최신 거래일 값을 메운다. 공식 API가 아니라 막히거나 바뀔 수 있어 실패해도 조용히 넘어간다.
  2026-11-16 확인: 한국 336·미국 302종목 모두 저장된 최신 종가와 0.1% 안에서 같았다.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
UA = {"User-Agent": "Mozilla/5.0 (industry-strength-bot)"}
SCAN = {"KR": "korea", "US": "america", "JP": "japan"}
CAL = {"KR": ("XKRX", "Asia/Seoul"), "US": ("XNYS", "America/New_York"), "JP": ("XTKS", "Asia/Tokyo")}


def close_hm(mkey: str, now: datetime) -> tuple[int, int]:
    """장이 끝났다고 보는 현지 시각(종가 확정 여유 포함). update.drop_intraday 와 같은 값."""
    if mkey == "KR":   # 수능날은 16:30 마감(scripts/wait_close.py LATE와 같이 바꾼다)
        return (16, 45) if now.date().isoformat() in ("2026-11-19",) else (15, 45)
    if mkey == "JP":
        return (15, 45)
    return (16, 10)


def last_closed_session(mkey: str, now: datetime | None = None) -> pd.Timestamp | None:
    """장이 끝난 가장 최근 거래일(현지 날짜). 달력을 못 읽으면 None."""
    try:
        import exchange_calendars as xc
        code, tz = CAL[mkey]
        now = (now or datetime.now(ZoneInfo(tz))).astimezone(ZoneInfo(tz))
        today = pd.Timestamp(now.date())
        ses = xc.get_calendar(code).sessions_in_range(today - pd.Timedelta(days=14), today)
        ses = [pd.Timestamp(d).tz_localize(None).normalize() for d in ses]
        if ses and ses[-1] == today and (now.hour, now.minute) < close_hm(mkey, now):
            ses = ses[:-1]
        return ses[-1] if ses else None
    except Exception:  # noqa: BLE001
        return None


def naver_foreign(code: str, days: int = 800) -> tuple[pd.Series, pd.Series] | None:
    """네이버 해외주식 일봉 종가·거래량. code 는 '8035.T' 처럼 로이터 코드."""
    import requests

    end = datetime.now() + timedelta(days=1)
    start = end - timedelta(days=days)
    url = (f"https://api.stock.naver.com/chart/foreign/item/{code}/day"
           f"?startDateTime={start:%Y%m%d}0000&endDateTime={end:%Y%m%d}0000")
    r = requests.get(url, headers=UA, timeout=20)
    r.raise_for_status()
    rows = r.json()
    if not isinstance(rows, list) or len(rows) < 20:
        return None
    idx = pd.to_datetime([x["localDate"] for x in rows], format="%Y%m%d")
    c = pd.Series([float(x["closePrice"]) for x in rows], index=idx)
    v = pd.Series([float(x.get("accumulatedTradingVolume") or 0) for x in rows], index=idx)
    ok = c > 0
    return c[ok], v[ok]


def yahoo_splits(ticker: str) -> list[tuple[pd.Timestamp, float]] | None:
    """야후 공식 분할 기록 [(날짜, 그 전 가격에 곱할 비율)]. 3:1 분할이면 1/3. 받지 못하면 None."""
    import requests

    try:
        r = requests.get(f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range=5y&interval=1d&events=split",
                         headers=UA, timeout=20)
        r.raise_for_status()
        ev = ((r.json()["chart"]["result"][0].get("events") or {}).get("splits") or {}).values()
        return [(pd.Timestamp(datetime.utcfromtimestamp(x["date"]).date()), float(x["denominator"]) / float(x["numerator"]))
                for x in ev if x.get("numerator") and x.get("denominator")]
    except Exception:  # noqa: BLE001
        return None


def tv_symbol(mkey: str, ticker: str, code: str, tv_ex: dict) -> str | None:
    if mkey == "KR":
        return "KRX:" + code
    if mkey == "JP":
        return "TSE:" + code
    t = ticker.replace("-", ".")
    return f"{tv_ex[t]}:{t}" if t in tv_ex else None


def tv_quotes(mkey: str, symbols: list[str], columns: tuple = ("close", "volume")) -> dict[str, tuple]:
    """TradingView 스캐너 지금 시세 {심볼: (columns 순서 값들)}. 첫 칸(종가)이 없는 종목은 뺀다. 실패하면 빈 사전."""
    import requests

    out = {}
    for k in range(0, len(symbols), 400):
        part = symbols[k:k + 400]
        try:
            r = requests.post(f"https://scanner.tradingview.com/{SCAN[mkey]}/scan", headers=UA, timeout=30,
                              json={"symbols": {"tickers": part}, "columns": list(columns)})
            r.raise_for_status()
            for x in r.json().get("data") or []:
                d = list(x.get("d") or [])
                if d and isinstance(d[0], (int, float)) and d[0] > 0:
                    out[x["s"]] = tuple(float(v) if isinstance(v, (int, float)) else 0.0 for v in d[:len(columns)])
        except Exception:  # noqa: BLE001
            continue
    return out


def load_tv_ex() -> dict:
    try:
        return json.loads((ROOT / "docs/data/tv_ex.json").read_text(encoding="utf-8")).get("map") or {}
    except (OSError, ValueError):
        return {}
