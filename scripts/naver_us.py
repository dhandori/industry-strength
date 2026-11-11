"""미국 종목 → 네이버 증권 해외주식 주소 표 → docs/data/naver_us.json (2026-11-11 추가)

네이버 해외주식 주소는 거래소마다 꼬리가 달라 규칙으로 만들 수 없다(나스닥 AAPL.O, NYSE JPM, 그런데 NYSE BFAM.K, BRK.B는 BRKb).
그래서 네이버 종목 자동완성(ac.stock.naver.com)이 돌려주는 실제 주소를 티커마다 적어 둔다.
대상 티커는 tv_symbols.py 와 같다(산업 강도·52주 신고가·종목 상세가 쓰는 미국 티커).
한 번 찾은 종목은 다시 묻지 않는다(새 종목만 확인). us-econ.yml 이 같이 돌린다.

python scripts/naver_us.py
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from tv_symbols import tickers  # noqa: E402

OUT = ROOT / "docs" / "data" / "naver_us.json"
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"}


def look(t):
    """'/worldstock/stock/AAPL.O/total' 처럼 네이버 모바일 주소의 경로. 못 찾으면 '', 네트워크 실패면 None."""
    want = t.upper().replace(".", " ").replace("-", " ")
    url = "https://ac.stock.naver.com/ac?" + urllib.parse.urlencode({"q": want.split(" ")[0] if " " in want else want, "target": "stock"})
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=10) as r:
                items = json.loads(r.read().decode("utf-8")).get("items", [])
            for x in items:
                if x.get("nationCode") == "USA" and str(x.get("code", "")).upper() == want and x.get("url"):
                    return x["url"]
            return ""
        except Exception:  # noqa: BLE001
            time.sleep(2 * (i + 1))
    return None


def main():
    old = json.loads(OUT.read_text()).get("map", {}) if OUT.exists() else {}
    ts, _ = tickers()
    res = {t: old[t] for t in ts if t in old}
    todo = [t for t in ts if t not in res]
    miss = []
    with ThreadPoolExecutor(8) as ex:   # 종목이 700개 가까이라 한 번에 8개씩 묻는다
        for t, u in zip(todo, ex.map(look, todo)):
            if u:
                res[t] = u
            elif u == "":
                miss.append(t)
    data = {"_note": "미국 티커 → 네이버 증권 모바일 주소(m.stock.naver.com 뒤). scripts/naver_us.py", "map": dict(sorted(res.items())), "none": sorted(miss)}
    if not OUT.exists() or json.loads(OUT.read_text()) != data:
        OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"네이버 해외주식 주소: {len(res)}종목 (새로 확인 {len(todo)}, 못 찾음 {len(miss)}: {' '.join(miss[:20])})")


if __name__ == "__main__":
    main()
