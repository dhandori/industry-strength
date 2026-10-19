"""네이버 업종 페이지 구조 확인용(임시). 결과를 data/naver_probe/ 에 저장."""
import json, re, requests
from pathlib import Path
out = Path(__file__).resolve().parent.parent / "data/naver_probe"; out.mkdir(parents=True, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"}
urls = {
 "list": "https://finance.naver.com/sise/sise_group.naver?type=upjong",
 "detail": "https://finance.naver.com/sise/sise_group_detail.naver?type=upjong&no=278",
 "m_industry": "https://m.stock.naver.com/api/stocks/industry",
 "m_industry2": "https://m.stock.naver.com/front-api/industry/list?page=1&pageSize=100",
 "m_upjong": "https://m.stock.naver.com/api/index/industry",
 "m_domestic": "https://m.stock.naver.com/domestic/industry",
}
rep = {}
for k, u in urls.items():
    try:
        r = requests.get(u, headers=UA, timeout=20)
        t = r.content.decode("utf-8", errors="replace") if "euc" not in (r.headers.get("content-type","").lower()) else r.content.decode("euc-kr", errors="replace")
        (out / f"{k}.txt").write_text(t[:400000], encoding="utf-8")
        rep[k] = {"status": r.status_code, "ctype": r.headers.get("content-type"), "len": len(t)}
    except Exception as e:
        rep[k] = {"error": str(e)[:200]}
(out / "report.json").write_text(json.dumps(rep, ensure_ascii=False, indent=1), encoding="utf-8")
print(rep)
