"""미국 종목 → TradingView 거래소 접두어 표 → docs/data/tv_ex.json

거래소 없이 TradingView에 'HAL'만 넘기면 인도 HAL, 'TD'는 캐나다 TSX처럼 엉뚱한 종목이 열린다.
화면(산업 강도·52주 신고가·종목 상세)이 쓰는 미국 티커마다 NYSE/NASDAQ/AMEX 중 실제로 열리는 곳을
TradingView 종목 페이지(/symbols/거래소-티커/, 없으면 404)로 확인해 적어 둔다.
한 번 찾은 종목은 다시 묻지 않는다(새 종목만 확인). us-econ.yml 이 같이 돌린다.

python scripts/tv_symbols.py
"""
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "data" / "tv_ex.json"
UA = {"User-Agent": "industry-strength-bot/1.0 (+https://github.com/dhandori/industry-strength)"}
HINT = {"NYS": "NYSE", "NAS": "NASDAQ", "AMS": "AMEX"}
TRY = ["NYSE", "NASDAQ", "AMEX", "BATS"]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


OPENER = urllib.request.build_opener(NoRedirect)


def exists(ex, t):
    url = f"https://www.tradingview.com/symbols/{ex}-{t}/"
    for i in range(3):
        try:
            with OPENER.open(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return r.status == 200
        except urllib.error.HTTPError as e:
            if e.code in (301, 302, 404):
                return False
        except Exception:  # noqa: BLE001
            pass
        time.sleep(3 * (i + 1))
    return None   # 확인 실패(네트워크) → 이번엔 건너뜀


def tickers():
    """화면에 링크가 붙는 미국 티커 + 바구니 설정의 거래소 힌트"""
    hint = {}
    try:
        for it in json.loads((ROOT / "config/baskets.json").read_text())["markets"]["US"]["items"]:
            for m in it["members"]:
                hint[m["code"]] = HINT.get(m.get("market"))
    except Exception:  # noqa: BLE001
        pass
    out = set(hint)
    try:
        def walk(o):
            if isinstance(o, dict):
                if isinstance(o.get("ticker"), str) and o.get("name"):
                    out.add(o["ticker"])
                for v in o.values():
                    walk(v)
            elif isinstance(o, list):
                for v in o:
                    walk(v)
        walk(json.loads((ROOT / "docs/data/US.json").read_text()))
    except Exception:  # noqa: BLE001
        pass
    try:
        out |= set(json.loads((ROOT / "docs/data/highs.json").read_text())["markets"]["US"]["stocks"])
    except Exception:  # noqa: BLE001
        pass
    return sorted(t for t in out if t and t.replace(".", "").replace("-", "").isalnum()), hint


def main():
    old = {}
    if OUT.exists():
        old = json.loads(OUT.read_text()).get("map", {})
    ts, hint = tickers()
    res = {t: old[t] for t in ts if t in old}
    todo = [t for t in ts if t not in res]
    miss = []
    for t in todo:
        order = [hint.get(t)] + TRY if hint.get(t) else TRY
        for ex in dict.fromkeys(order):
            ok = exists(ex, t)
            if ok:
                res[t] = ex
                break
            time.sleep(0.3)
        else:
            miss.append(t)
    # none: TradingView에 미국 상장으로 없는 종목(예: ACA는 파리 크레디아그리콜만 나옴) → 화면은 Finviz로 보낸다. 매번 다시 확인.
    data = {"_note": "미국 티커 → TradingView 거래소. scripts/tv_symbols.py", "map": dict(sorted(res.items())), "none": sorted(miss)}
    if not OUT.exists() or json.loads(OUT.read_text()) != data:
        OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"TradingView 거래소: {len(res)}종목 (새로 확인 {len(todo)}, 못 찾음 {len(miss)}: {' '.join(miss[:20])})")


if __name__ == "__main__":
    main()
