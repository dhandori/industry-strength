"""반도체 가격(메모리·CPU) 자료 모으기 → docs/data/chip_prices.json  (AI 시장 탭 아래 '반도체 가격' 카드)

세 곳에서 따로 모으고, 한 곳이 실패해도 나머지는 갱신한다(실패한 곳은 지난 값 유지 + ok=false).
- 메모리 현물가: DRAMeXchange 첫 화면에 공개된 현물가 표(D램 칩, 모듈, 낸드 웨이퍼, GDDR).
  과거 이력은 회원 전용이라 받지 않고, 매일 표를 읽어 이 파일에 하루 한 줄씩 쌓는다.
  표마다 'Last Update' 날짜가 따로 있어서 그 날짜를 기록일로 쓴다(같은 날 다시 읽으면 덮어씀).
- 메모리 계약가 전망: 구글 뉴스(RSS)에서 TrendForce의 '계약가 X~Y% 분기 대비' 발표 제목을 읽는다.
- CPU 가격 인상: CPU는 공개 시세가 없어서, 인텔·AMD·퀄컴 등의 가격 인상 기사 제목에서 회사·서버/PC·인상률을 읽는다.
  같은 숫자를 두 곳 이상(또는 주요 매체 한 곳)이 쓴 것만 채택. 'plan·reportedly·may' 같은 표현은 '예정·보도'로 표시.
  config/chip_events_manual.json 의 사람이 확인한 사건을 기본으로 깔고 자동 판독분을 더한다.

python scripts/chip_prices.py            # 수집 + 저장
python scripts/chip_prices.py --dry-run  # 저장하지 않고 요약만 출력
"""
import html
import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "data" / "chip_prices.json"
MANUAL = ROOT / "config" / "chip_events_manual.json"
KST = timezone(timedelta(hours=9))
UA_BROWSER = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
              "Accept-Language": "en-US,en;q=0.9"}
UA_BOT = {"User-Agent": "Mozilla/5.0 (industry-strength chip_prices; +https://dhandori.github.io/industry-strength/)"}
KEEP_DAYS = 800   # 메모리 이력은 약 2년 남짓 보관


def get(url, headers=UA_BOT, timeout=45):
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=timeout) as r:
        return r.read()


# ---------- 1) 메모리 현물가: DRAMeXchange 첫 화면
SECTIONS = {   # 화면 제목 → (우리 분류, 단위 설명)
    "DRAM Spot Price": ("dram", "칩 1개 · 달러"),
    "Module Spot Price": ("module", "모듈 1개 · 달러"),
    "Wafer Spot Price": ("wafer", "낸드 웨이퍼 환산 칩 1개 · 달러"),
    "GDDR Spot Price": ("gddr", "칩 1개 · 달러"),
    "Flash Spot Price": ("flash", "칩 1개 · 달러"),
}
MON3 = {m: i for i, m in enumerate("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(), 1)}


def _upd(s):
    """'Nov.2 2026 11:00 (GMT+8)' → ('2026-11-02', '11:00')"""
    m = re.search(r"([A-Z][a-z]{2})\.?\s*(\d{1,2}),?\s+(\d{4}),?\s+(\d{1,2}:\d{2})", s)
    if not m or m.group(1) not in MON3:
        return None, None
    return f"{m.group(3)}-{MON3[m.group(1)]:02d}-{int(m.group(2)):02d}", m.group(4)


def dram_snapshot():
    return parse_dx(get("https://www.dramexchange.com/", UA_BROWSER).decode("utf-8", "ignore"))


def parse_dx(raw):
    """DRAMeXchange 첫 화면 HTML → {표 제목: {date, time, rows}} (인터넷 기록보관소 옛 화면에도 같이 씀)"""
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", raw, flags=re.S)
    t = re.sub(r"<[^>]+>", "|", t)
    t = html.unescape(re.sub(r"\s+", " ", t))
    t = re.sub(r"(\|\s*)+", "|", t)
    heads = list(re.finditer(r"\|(" + "|".join(map(re.escape, SECTIONS)) + r")\|Last ?Update:?\s*([^|]+)", t))
    out = {}
    for i, h in enumerate(heads):
        name = h.group(1)
        if name in out:
            continue
        day, hm = _upd(h.group(2))
        body = t[h.end(): heads[i + 1].start() if i + 1 < len(heads) else h.end() + 4000]
        # 다음 표 제목이 나오면 끊는다
        cut = re.search(r"\|[A-Za-z /-]+ (?:Spot |Contract )?Price\s*\|", body)
        if cut:
            body = body[:cut.start()]
        rows = []
        # 품목|고가|저가|세션고가|세션저가|세션평균|변화 %
        for m in re.finditer(r"\|([A-Za-z0-9][^|]{2,60}?)\s*\|([\d.,]+)\|([\d.,]+)\|([\d.,]+)\|([\d.,]+)\|([\d.,]+)\|(-?[\d.]+)\s*%", body):
            item = re.sub(r"\s+", " ", m.group(1)).strip()
            f = lambda k: float(m.group(k).replace(",", ""))
            rows.append({"item": item, "hi": f(4), "lo": f(5), "avg": f(6), "chg": float(m.group(7))})
        if rows and day:
            out[name] = {"date": day, "time": hm, "rows": rows}
    if not out.get("DRAM Spot Price"):
        raise RuntimeError("D램 현물가 표를 찾지 못함(화면 구조가 바뀌었을 수 있음)")
    return out


def merge_memory(old, snap):
    """하루 한 줄씩 쌓는다. 키 = 분류/품목."""
    hist = {k: list(v) for k, v in (old.get("history") or {}).items()}
    meta = dict(old.get("items") or {})
    latest = {}
    for sec, s in snap.items():
        grp, unit = SECTIONS[sec]
        latest[grp] = {"date": s["date"], "time": s["time"], "section": sec}
        for r in s["rows"]:
            key = f"{grp}/{r['item']}"
            meta[key] = {"group": grp, "item": r["item"], "unit": unit}
            rows = [x for x in hist.get(key, []) if x["d"] != s["date"]]
            rows.append({"d": s["date"], "avg": r["avg"], "hi": r["hi"], "lo": r["lo"], "chg": r["chg"]})
            rows.sort(key=lambda x: x["d"])
            cutoff = (datetime.now(KST) - timedelta(days=KEEP_DAYS)).strftime("%Y-%m-%d")
            hist[key] = [x for x in rows if x["d"] >= cutoff]
    return {"history": hist, "items": meta, "latest": latest}


# ---------- 공통: 구글 뉴스 검색
TRUST = ("Reuters", "Bloomberg", "CNBC", "Financial Times", "The Wall Street Journal", "WSJ", "The Information", "Nikkei",
         "DigiTimes", "DIGITIMES", "TrendForce", "Tom's Hardware", "Commercial Times", "Yahoo Finance", "Barron's",
         "The Register", "Business Korea", "BusinessKorea", "The Korea Economic Daily", "KED Global", "Korea JoongAng Daily",
         "The Elec", "Investing.com", "MarketWatch", "Fortune", "Business Insider", "Axios")


def gnews(q, days=365):
    url = "https://news.google.com/rss/search?" + urllib.parse.urlencode(
        {"q": f"{q} when:{days}d", "hl": "en-US", "gl": "US", "ceid": "US:en"})
    xml = get(url, timeout=30).decode("utf-8", "ignore")
    for it in re.findall(r"<item>(.*?)</item>", xml, re.S):
        tt = html.unescape(re.search(r"<title>(.*?)</title>", it, re.S).group(1))
        head, _, outlet = tt.rpartition(" - ")
        pd = re.search(r"<pubDate>(.*?)</pubDate>", it)
        link = re.search(r"<link>(.*?)</link>", it)
        try:
            day = datetime.strptime(pd.group(1)[5:16], "%d %b %Y").strftime("%Y-%m-%d") if pd else None
        except ValueError:
            day = None
        yield {"title": (head or tt).strip(), "outlet": outlet.strip(), "date": day, "link": link.group(1) if link else ""}


PCT = re.compile(r"(\d{1,3}(?:\.\d)?)\s*(?:%|percent)?\s*(?:-|–|—|to|~)\s*(\d{1,3}(?:\.\d)?)\s*(?:%|percent)|(?:up to |as much as |by )?(\d{1,3}(?:\.\d)?)\s*(?:%|percent)", re.I)


def _pct(s):
    ms = list(PCT.finditer(s))
    if not ms:
        return None
    # '전망을 55~60%에서 90~95%로 올림' 같은 제목은 뒤쪽 숫자가 새 값
    m = ms[-1] if len(ms) > 1 and re.search(r"\bfrom\b.*\bto\b", s, re.I) else ms[0]
    if m.group(1):
        lo, hi = float(m.group(1)), float(m.group(2))
    else:
        lo = hi = float(m.group(3))
    if not (0 < lo <= hi <= 300):
        return None
    return lo, hi


def _trusted(outlets):
    return len(outlets) >= 2 or any(t.lower() in o.lower() for o in outlets for t in TRUST)


def _group(items, same, window=21):
    items.sort(key=lambda x: x["date"] or "")
    groups = []
    for x in items:
        g = next((g for g in groups if same(g, x) and x["date"] and g["last"]
                  and (datetime.strptime(x["date"], "%Y-%m-%d") - datetime.strptime(g["last"], "%Y-%m-%d")).days <= window), None)
        if g:
            g["last"] = x["date"]
            if x["outlet"] not in g["outlets"]:
                g["outlets"].append(x["outlet"])
        else:
            groups.append({**x, "last": x["date"], "outlets": [x["outlet"]]})
    return groups


# ---------- 2) CPU 가격 인상 기사
CPU_Q = ['Intel CPU price increase', 'Intel raises CPU prices', 'AMD CPU price increase', 'AMD raises prices EPYC Ryzen',
         'server CPU prices rise', 'Xeon price hike', 'Qualcomm raises chip prices', 'CPU price hike percent']
CO_PAT = [("Intel", r"\bintel\b|xeon|core ultra"), ("AMD", r"\bamd\b|epyc|ryzen"), ("Qualcomm", r"qualcomm|snapdragon"),
          ("Arm", r"\barm\b")]
UP = re.compile(r"rais|hike|increas|\bup\b|ris(e|es|ing)|jump|surg|climb|soar|lift", re.I)
DOWN = re.compile(r"\bcut|slash|drop|lower(s|ed|ing)? price|reduc|discount", re.I)
NOT_CPU = re.compile(r"memory|dram|nand|ssd|hdd|hard drive|gpu|graphics card|geforce|radeon|\bram\b|console|playstation|xbox|"
                     r"stock|shares|price target|valuation|wafer|tsmc raises|foundry|subscription|smartphone price|iphone", re.I)
NOT_STOCK = re.compile(r"\bstock|shares|price target|valuation|earnings beat|cagr|outlook|demand|revenue|market share|msrp|retail|scalp", re.I)
OTHER_CO = r"stmicro|\bst\b|texas instruments|microchip|tsmc|nvidia|samsung|sk hynix|micron|apple|mediatek"
PLAN = re.compile(r"plan|prepar|reportedly|report:|may |might|could|expect|consider|mull|weigh|set to|to raise|to hike|"
                  r"will raise|will hike|rumou?r|warn|signal|eye", re.I)


def cpu_news():
    out, seen = [], set()
    for q in CPU_Q:
        for n in gnews(q, 365):
            if n["title"] in seen or not n["date"]:
                continue
            seen.add(n["title"])
            low = n["title"].lower()
            strong = re.search(r"cpu|processor|xeon|epyc|ryzen|core ultra", low)
            if not (strong or re.search(r"chip|snapdragon", low)):
                continue
            # CPU 단어가 분명하면 메모리 이야기가 곁들여져도 받되, 주가 기사는 뺀다
            if (NOT_STOCK.search(low)) or (not strong and NOT_CPU.search(low)):
                continue
            if not UP.search(low) or DOWN.search(low) or not re.search(r"price|hike", low):
                continue
            pc = _pct(n["title"])
            if not pc:
                continue
            # 제목에서 가장 먼저 나온 회사가 주어(여러 회사가 섞인 제목은 첫 회사 기준)
            pos = sorted((m.start(), c) for c, p in CO_PAT for m in [re.search(p, low)] if m)
            if not pos:
                continue
            # 다른(비 CPU) 회사가 먼저 나오면 그 회사 기사
            oth = re.search(OTHER_CO, low)
            if oth and oth.start() < pos[0][0]:
                continue
            cos = [pos[0][1]]
            seg = "server" if re.search(r"server|xeon|epyc|data ?cent", low) else "pc" if re.search(r"\bpc\b|desktop|laptop|consumer|ryzen|core ultra|client|notebook", low) else "all"
            out.append({"date": n["date"], "company": "·".join(cos), "segment": seg, "pct_lo": pc[0], "pct_hi": pc[1],
                        "kind": "plan" if PLAN.search(low) else "reported", "upto": bool(re.search(r"up to|as much as", low)),
                        "title": n["title"], "outlet": n["outlet"], "link": n["link"], "src": "auto"})
    groups = _group(out, lambda g, x: g["company"] == x["company"] and _seg_ok(g["segment"], x["segment"])
                    and abs(g["pct_hi"] - x["pct_hi"]) <= 1 and abs(g["pct_lo"] - x["pct_lo"]) <= 1, window=30)
    keep = [g for g in groups if _trusted(g["outlets"])]
    for g in keep:
        g.pop("last", None)
    return sorted(keep, key=lambda g: g["date"], reverse=True)[:40]


def _seg_ok(a, b):
    return a == b or "all" in (a, b)


def merge_cpu(manual, auto):
    """수동 사건을 기본으로, 같은 회사·구분·인상률(±1%p)·21일 안의 자동 사건은 수동 쪽에 출처 수만 보탠다."""
    ev = [{**m, "outlets": [m["outlet"]], "src": "manual"} for m in manual]
    for a in auto:
        dup = next((m for m in ev if a["company"] in m["company"].split("·") and _seg_ok(m["segment"], a["segment"])
                    and abs(m["pct_hi"] - a["pct_hi"]) <= 1
                    and abs((datetime.strptime(m["date"], "%Y-%m-%d") - datetime.strptime(a["date"], "%Y-%m-%d")).days) <= 21), None)
        if dup:
            for o in a["outlets"]:
                if o not in dup["outlets"]:
                    dup["outlets"].append(o)
        else:
            ev.append(a)
    return sorted(ev, key=lambda e: e["date"], reverse=True)


# ---------- 3) 메모리 계약가 전망 (TrendForce 발표 제목)
MEM_Q = ['TrendForce DRAM contract prices QoQ', 'TrendForce NAND Flash contract prices QoQ', 'TrendForce HBM prices',
         'DRAM contract prices rise quarter TrendForce', 'server DRAM contract prices TrendForce', 'conventional DRAM contract prices forecast',
         'NAND Flash contract prices rise QoQ', 'DRAM contract prices 4Q26', 'DRAM contract prices 1Q27', 'HBM contract prices 2027']
QTR = re.compile(r"\b([1-4])Q(\d{2})\b|\bQ([1-4])\s?(?:20)?(\d{2})\b|(first|second|third|fourth) quarter(?: of)?(?: 20(\d{2}))?", re.I)
ORD = {"first": 1, "second": 2, "third": 3, "fourth": 4}


def mem_news():
    out, seen = [], set()
    for q in MEM_Q:
        for n in gnews(q, 400):
            if n["title"] in seen or not n["date"]:
                continue
            seen.add(n["title"])
            low = n["title"].lower()
            if ("contract" not in low and "hbm" not in low) or re.search(r"revenue|industry|sales|earnings|shipments|capex", low):
                continue
            prod = "HBM" if "hbm" in low else "낸드" if re.search(r"nand|flash|ssd", low) else "D램" if re.search(r"dram|ddr|memory", low) else None
            if not prod:
                continue
            sub = "서버 " if "server" in low else "PC " if re.search(r"\bpc\b", low) else "모바일 " if "mobile" in low else ""
            pc = _pct(n["title"])
            if not pc:
                continue
            sign = -1 if re.search(r"fall|drop|declin|decreas|down|slide|cut", low) and not UP.search(low) else 1
            qm = QTR.search(n["title"])
            qtr = None
            if qm:
                if qm.group(1):
                    qtr = f"20{qm.group(2)}Q{qm.group(1)}"
                elif qm.group(3):
                    qtr = f"20{qm.group(4)}Q{qm.group(3)}"
                else:
                    y = qm.group(6) or n["date"][2:4]
                    qtr = f"20{y}Q{ORD[qm.group(5).lower()]}"
            out.append({"date": n["date"], "product": sub + prod, "qtr": qtr, "pct_lo": sign * pc[0], "pct_hi": sign * pc[1],
                        "title": n["title"], "outlet": n["outlet"], "link": n["link"],
                        "qoq": bool(re.search(r"qoq|quarter", low))})
    groups = _group(out, lambda g, x: g["product"] == x["product"] and g["qtr"] == x["qtr"]
                    and abs(g["pct_hi"] - x["pct_hi"]) <= 2, window=30)
    keep = [g for g in groups if _trusted(g["outlets"]) and g["qoq"]]
    for g in keep:
        g.pop("last", None)
    return sorted(keep, key=lambda g: g["date"], reverse=True)[:30]


def merge_mem(manual, auto):
    ev = [{**m, "outlets": [m["outlet"]], "src": "manual"} for m in manual]
    for a in auto:
        dup = next((m for m in ev if m["product"] == a["product"] and m["qtr"] == a["qtr"] and abs(m["pct_hi"] - a["pct_hi"]) <= 2), None)
        if dup:
            dup["outlets"] += [o for o in a["outlets"] if o not in dup["outlets"]]
        else:
            ev.append({**a, "src": "auto"})
    return sorted(ev, key=lambda e: e["date"], reverse=True)


# ---------- 실행
def main():
    dry = "--dry-run" in sys.argv
    old = json.loads(OUT.read_text("utf-8")) if OUT.exists() else {}
    manual = json.loads(MANUAL.read_text("utf-8")) if MANUAL.exists() else {"cpu": []}
    now = datetime.now(KST)
    res = {"updated_at": now.strftime("%Y-%m-%d %H:%M KST"), "sources": {}}

    try:
        snap = dram_snapshot()
        res["memory"] = merge_memory(old.get("memory") or {}, snap)
        res["sources"]["dram"] = {"ok": True, "n": sum(len(s["rows"]) for s in snap.values())}
    except Exception as e:
        res["memory"] = old.get("memory") or {}
        res["sources"]["dram"] = {"ok": False, "err": str(e)[:200]}

    try:
        res["memory_contract"] = merge_mem(manual.get("memory_contract", []), mem_news())
        res["sources"]["contract"] = {"ok": True, "n": len(res["memory_contract"])}
    except Exception as e:
        res["memory_contract"] = old.get("memory_contract") or []
        res["sources"]["contract"] = {"ok": False, "err": str(e)[:200]}

    try:
        auto = cpu_news()
        res["sources"]["cpu"] = {"ok": True, "n": len(auto)}
    except Exception as e:
        auto = [x for x in (old.get("cpu") or []) if x.get("src") == "auto"]
        res["sources"]["cpu"] = {"ok": False, "err": str(e)[:200]}
    res["cpu"] = merge_cpu(manual.get("cpu", []), auto)

    mem = res["memory"]
    print(f"[메모리] 품목 {len(mem.get('items', {}))}개 · 최신 {json.dumps(mem.get('latest', {}), ensure_ascii=False)}")
    print(f"[계약가 전망] {len(res['memory_contract'])}건")
    for g in res["memory_contract"][:8]:
        print("   ", g["date"], g["product"], g["qtr"], g["pct_lo"], g["pct_hi"], g["outlets"][:2], g["title"][:90])
    print(f"[CPU] {len(res['cpu'])}건 (자동 {sum(1 for x in res['cpu'] if x['src'] == 'auto')})")
    for g in res["cpu"][:14]:
        print("   ", g["date"], g["src"], g["company"], g["segment"], g["pct_lo"], g["pct_hi"], g["kind"], g["outlets"][:2], g["title"][:80])
    print("[상태]", json.dumps(res["sources"], ensure_ascii=False))
    if not dry:
        OUT.write_text(json.dumps(res, ensure_ascii=False, separators=(",", ":")), "utf-8")
        print("저장:", OUT)


if __name__ == "__main__":
    main()
