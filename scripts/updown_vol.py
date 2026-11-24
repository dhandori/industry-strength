"""NYSE·나스닥 상승/하락 거래량과 10:1 신호 (2026-11-24 사용자 요청).

미너비니가 말하는 '10:1 상승 거래량 날'을 매일 기록한다. 오른 종목들의 거래량 합(UVOL)이 내린 종목들의
거래량 합(DVOL)의 10배 이상인 날이 10:1 상승일, 반대가 10:1 하락일이다(종목 수가 아니라 거래량).

판정 기준(docs/updownvol.js 의 설명과 같다. 하나를 바꾸면 둘 다 바꾼다)
- 판정은 NYSE(USI:UVOL·USI:DVOL)로 한다. McClellan·Lowry·Zweig 연구가 모두 NYSE 거래량 기준이다.
  나스닥(USI:UVOLQ·USI:DVOLQ)은 참고로 같이 싣는다.
- 확인: 첫 10:1 상승일 뒤 65거래일(약 3개월) 안에 10:1 상승일이 한 번 더 나오고, 그 사이 10:1 하락일이 없으면
  '확인'이다. 미너비니는 '중간에 10:1 하락일 없이 10:1 상승일이 두 번' 나오면 더 강한 신호라고 했지만 기간은 말하지
  않아서, 같은 생각의 원조인 Zweig 의 'double 9-to-1'(Winning on Wall Street, 3개월 안 두 번, 65거래일)에서 빌렸다.
- 10:1 하락일이 나오면 그때까지의 상승 신호는 지우고 처음부터 다시 센다.

자료: TradingView 차트 웹소켓(로그인 없이 지연 시세). 스캐너(scanner.tradingview.com)는 USI 지수를 주지 않는다.
처음에는 2007년부터 5,000거래일을 받고, 그 뒤에는 최근 300일만 받아 덮어쓴다. 받지 못하면 파일을 그대로 둔다.
"""
from __future__ import annotations

import json
import random
import re
import string
import sys
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "data" / "updown_vol.json"
SYMS = {"NYSE": ("USI:UVOL", "USI:DVOL"), "NASDAQ": ("USI:UVOLQ", "USI:DVOLQ")}
RATIO = 10.0
WINDOW = 65  # 거래일


def _msg(f: str, p: list) -> str:
    s = json.dumps({"m": f, "p": p}, separators=(",", ":"))
    return f"~m~{len(s)}~m~{s}"


def tv_daily(symbol: str, n: int) -> dict[str, float]:
    """TradingView 일봉 종가 {뉴욕 날짜: 값}."""
    import websocket

    ws = websocket.create_connection("wss://data.tradingview.com/socket.io/websocket",
                                     header=["Origin: https://www.tradingview.com"], timeout=25)
    cs = "cs_" + "".join(random.choice(string.ascii_lowercase) for _ in range(12))
    try:
        for f, p in [("set_auth_token", ["unauthorized_user_token"]), ("chart_create_session", [cs, ""]),
                     ("resolve_symbol", [cs, "sym1", '={"symbol":"%s","adjustment":"splits"}' % symbol]),
                     ("create_series", [cs, "s1", "s1", "sym1", "1D", n])]:
            ws.send(_msg(f, p))
        for _ in range(80):
            r = ws.recv()
            for h in re.findall(r"~h~\d+", r):  # 연결 유지 신호에 답한다
                ws.send(f"~m~{len(h)}~m~{h}")
            if "symbol_error" in r or "critical_error" in r or "series_error" in r:
                raise RuntimeError(f"{symbol}: {r[:200]}")
            if '"timescale_update"' in r:
                for part in re.split(r"~m~\d+~m~", r):
                    if "timescale_update" in part:
                        rows = json.loads(part)["p"][1]["s1"]["s"]
                        ny = ZoneInfo("America/New_York")
                        return {datetime.fromtimestamp(x["v"][0], timezone.utc).astimezone(ny).date().isoformat(): float(x["v"][4])
                                for x in rows}
        raise RuntimeError(f"{symbol}: 응답 없음")
    finally:
        ws.close()


def classify(up: float, dn: float) -> str | None:
    if dn > 0 and up >= RATIO * dn:
        return "U"
    if up > 0 and dn >= RATIO * up:
        return "D"
    return None


def signal_state(rows: list[list]) -> dict:
    """rows = [[날짜, 상승, 하락], ...] (날짜 오름차순). 오늘 기준 상태와 지난 사건·확인 목록."""
    events, confirms = [], []
    chain: list[int] = []  # 지금 이어지는 10:1 상승일(행 번호)
    for i, (d, u, w) in enumerate(rows):
        k = classify(u, w)
        if not k:
            continue
        r = u / w if k == "U" else w / u
        events.append({"d": d, "k": k, "r": round(r, 1)})
        if k == "D":
            chain = []
            continue
        if chain and i - chain[-1] <= WINDOW:
            chain.append(i)
            if len(chain) == 2:
                confirms.append({"first": rows[chain[0]][0], "second": d, "gap": i - chain[0]})
        else:
            chain = [i]
    last = len(rows) - 1
    st = {"state": "none"}
    lastD = next((e for e in reversed(events) if e["k"] == "D"), None)
    if chain and last - chain[-1] <= WINDOW:
        st = {"state": "confirmed" if len(chain) >= 2 else "first", "first": rows[chain[0]][0], "last": rows[chain[-1]][0],
              "count": len(chain), "daysSince": last - chain[-1], "daysLeft": WINDOW - (last - chain[-1])}
    elif lastD and last - next(i for i, r in enumerate(rows) if r[0] == lastD["d"]) <= WINDOW:
        st = {"state": "down", "last": lastD["d"], "ratio": lastD["r"],
              "daysSince": last - next(i for i, r in enumerate(rows) if r[0] == lastD["d"])}
    return {**st, "events": events, "confirms": confirms}


def last_closed() -> str | None:
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from aux_sources import last_closed_session
        d = last_closed_session("US")
        return d.date().isoformat() if d is not None else None
    except Exception:  # noqa: BLE001
        return None


def main() -> int:
    old = json.loads(OUT.read_text()) if OUT.exists() else {}
    cut = last_closed()  # 장중에 돌면 아직 안 끝난 오늘 막대는 버린다
    out = {"updatedAt": datetime.now(ZoneInfo("Asia/Seoul")).strftime("%Y-%m-%d %H:%M KST"), "asOf": None,
           "rule": {"ratio": RATIO, "window": WINDOW, "judge": "NYSE"}, "markets": {}}
    ok = False
    for mk, (su, sd) in SYMS.items():
        prev = {r[0]: r for r in (old.get("markets", {}).get(mk, {}).get("rows") or [])}
        n = 300 if len(prev) > 1000 else 5000
        try:
            U, D = tv_daily(su, n), tv_daily(sd, n)
        except Exception as e:  # noqa: BLE001
            print(f"{mk} 받기 실패: {e}")
            U = D = {}
        for d in sorted(set(U) & set(D)):
            if cut and d > cut:
                continue
            prev[d] = [d, round(U[d] / 1e6, 1), round(D[d] / 1e6, 1)]  # 백만 주
            ok = True
        rows = [prev[d] for d in sorted(prev)]
        if not rows:
            continue
        s = signal_state(rows)
        out["markets"][mk] = {"asOf": rows[-1][0], **s, "rows": rows}
    if not ok and old:
        print("새 자료를 받지 못해 파일을 그대로 둡니다")
        return 0
    if "NYSE" not in out["markets"]:
        print("NYSE 자료가 없습니다")
        return 1
    out["asOf"] = out["markets"]["NYSE"]["asOf"]
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    ny = out["markets"]["NYSE"]
    r = ny["rows"][-1]
    print(f"NYSE {r[0]} 상승 {r[1]:,.0f}M · 하락 {r[2]:,.0f}M · 상태 {ny['state']} · 10:1 상승 {sum(e['k'] == 'U' for e in ny['events'])}회"
          f" · 하락 {sum(e['k'] == 'D' for e in ny['events'])}회 · 확인 {len(ny['confirms'])}회")
    return 0


if __name__ == "__main__":
    sys.exit(main())
