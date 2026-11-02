"""메모리 현물가 과거 이력 채우기 (한 번만 돌리는 용도)

DRAMeXchange는 과거 시세를 회원에게만 보여 준다. 대신 인터넷 기록보관소(web.archive.org)가
그 첫 화면을 날마다 저장해 둔 사본이 있어서, 그 사본들의 표를 읽어 docs/data/chip_prices.json 이력에 채운다.
이미 있는 날짜는 건드리지 않는다(실시간 수집값이 우선).

python scripts/chip_backfill.py 2025-01-01
"""
import json
import sys
import time
import urllib.request

sys.path.insert(0, __file__.rsplit("/", 1)[0])
import chip_prices as cp  # noqa: E402

FROM = (sys.argv[1] if len(sys.argv) > 1 else "2025-01-01").replace("-", "")


def get(url, tries=3):
    for i in range(tries):
        try:
            return cp.get(url, cp.UA_BOT, timeout=60)
        except Exception as e:
            if i == tries - 1:
                raise
            time.sleep(5 * (i + 1))


def main():
    cdx = json.loads(get("https://web.archive.org/cdx/search/cdx?url=dramexchange.com/&output=json&filter=statuscode:200"
                         f"&collapse=timestamp:8&from={FROM}").decode())
    stamps = [r[1] for r in cdx[1:]]
    print(f"보관된 날짜 {len(stamps)}개 ({stamps[:1]} ~ {stamps[-1:]})")
    data = json.loads(cp.OUT.read_text("utf-8"))
    mem = data.get("memory") or {}
    hist, items = mem.setdefault("history", {}), mem.setdefault("items", {})
    added, fail = 0, 0
    for i, ts in enumerate(stamps):
        try:
            raw = get(f"https://web.archive.org/web/{ts}id_/https://www.dramexchange.com/").decode("utf-8", "ignore")
            snap = cp.parse_dx(raw)
        except Exception as e:
            fail += 1
            print("  실패", ts, str(e)[:80])
            continue
        for sec, s in snap.items():
            grp, unit = cp.SECTIONS[sec]
            for r in s["rows"]:
                key = f"{grp}/{r['item']}"
                items.setdefault(key, {"group": grp, "item": r["item"], "unit": unit})
                rows = hist.setdefault(key, [])
                if any(x["d"] == s["date"] for x in rows):
                    continue
                rows.append({"d": s["date"], "avg": r["avg"], "hi": r["hi"], "lo": r["lo"], "chg": r["chg"], "src": "archive"})
                added += 1
        if i % 25 == 0:
            print(f"  {i}/{len(stamps)} {ts} 누적 추가 {added}")
        time.sleep(1.2)   # 기록보관소에 부담 주지 않게 천천히
    for k in hist:
        hist[k].sort(key=lambda x: x["d"])
    data["memory"] = mem
    cp.OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), "utf-8")
    print(f"끝: 추가 {added}줄, 실패 {fail}건")
    for k, v in hist.items():
        print(f"   {k}: {len(v)}일 ({v[0]['d']} ~ {v[-1]['d']})")


if __name__ == "__main__":
    main()
