"""AI 시장 탭 자료 모으기 → docs/data/ai_market.json

세 곳에서 따로 모으고, 한 곳이 실패해도 나머지는 갱신한다(실패한 곳은 지난 값 유지 + ok=false).
- 매출(런레이트): Epoch AI 'Data on AI companies' (CC BY 4.0). 파일은 매일 다시 만들어지지만
  새 매출 보도는 뉴스가 날 때만 추가된다(대개 2~4주에 한 번).
- 토큰 점유율: OpenRouter 순위 화면이 쓰는 자료. 주 단위(월요일 00:00 UTC = 09:00 KST 마감).
  오픈웨이트 여부는 OpenRouter 모델 목록의 hugging_face_id(가중치 공개 저장소)가 있는지로 판정.
- 토큰 vs 지출: Vercel AI Gateway 순위 화면에 박힌 하루 단위 상위 10개 모델 비중.
- 뉴스: 구글 뉴스 검색(RSS)에서 'run rate·annualized revenue·분기 매출' 기사 제목의 금액을 읽는다.
  같은 숫자를 두 곳 이상(또는 주요 매체 한 곳)이 쓴 것만 채택. 목표·전망 표현은 따로 표시.
- 상장 서류(S-1·S-1/A·424B): SEC EDGAR에서 매일 확인. 새 서류면 본문에서 분기 매출표, '런레이트 $__ (날짜 기준)',
  'N분기 매출 $__' 문구를 읽는다. SEC는 요청마다 연락처를 요구해서 환경변수 SEC_CONTACT(깃허브 비밀값)로 넣는다.
  없거나 실패하면 config/ai_revenue_manual.json 값을 쓴다.

python scripts/ai_market.py            # 수집 + 저장
python scripts/ai_market.py --dry-run  # 저장하지 않고 요약만 출력
"""
import csv
import html
import io
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "data" / "ai_market.json"
MANUAL = ROOT / "config" / "ai_revenue_manual.json"
UA = {"User-Agent": "Mozilla/5.0 (industry-strength ai_market; +https://dhandori.github.io/industry-strength/)"}
KST = timezone(timedelta(hours=9))
MAIN = ("OpenAI", "Anthropic")
RUN_TYPES = ("Annualized run rate", "Annual recurring revenue (ARR)")


def get(url, timeout=60):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def getj(url):
    return json.loads(get(url).decode("utf-8"))


# ---------- 매출: Epoch AI
def epoch():
    z = zipfile.ZipFile(io.BytesIO(get("https://epoch.ai/data/ai_companies.zip")))
    name = next(n for n in z.namelist() if n.endswith("ai_companies_revenue_reports.csv"))
    rows = list(csv.DictReader(io.StringIO(z.read(name).decode("utf-8-sig"))))
    out, others = {c: [] for c in MAIN}, {}
    for r in rows:
        usd = r.get("Annualized revenue (USD)")
        if not usd or not r.get("Date"):
            continue
        rec = {"id": r["Id"], "date": r["Date"], "usd": float(usd), "type": r.get("Annualized revenue type") or "",
               "scope": r.get("Scope") or "", "confidence": r.get("Confidence") or "",
               "report_date": r.get("Report date") or "", "source": r.get("Source 1") or "",
               "note": re.sub(r"\s+", " ", r.get("Notes") or "")[:240]}
        c = r["Company"]
        if c in out:
            # 보간값(Period interpolation)은 보도가 아니라 Epoch의 추정이라 뺀다
            if rec["type"] in RUN_TYPES and rec["date"] >= "2023-01-01":
                out[c].append(rec)
        elif rec["type"] in RUN_TYPES or not rec["type"]:
            if c not in others or rec["date"] > others[c]["date"]:
                others[c] = {"company": c, **rec}
    for c in out:
        out[c].sort(key=lambda x: (x["date"], x["report_date"]))
    return {"companies": out, "others": sorted(others.values(), key=lambda x: -x["usd"])}


# ---------- 뉴스: 구글 뉴스 검색에서 매출 숫자 자동 판독
NEWS_Q = ['{c} "run rate"', '{c} "annualized revenue"', '{c} ARR revenue billion', '{c} quarterly revenue billion',
          '{c} quarter revenue', '{c} Q1 OR Q2 OR Q3 OR Q4 revenue']
TRUST = ("Reuters", "Bloomberg", "CNBC", "Financial Times", "FT", "The Wall Street Journal", "WSJ", "The Information",
         "TechCrunch", "Axios", "The New York Times", "Yahoo Finance", "Fortune", "The Verge", "Business Insider")
SKIP = re.compile(r"valu(e|ation|ed|es)|less than|more than previously|below|above|behind|gap|lead|ahead of|loss|lost|burn|spend|"
                  r"compute|deal|contract|raise|funding|round|invest|stock|buy|profit|winner|lower than|higher than|trails|short of|"
                  r"\bby (?:us)?\$|\bcut\b|slash|drop|fall|decline|estimate|margin|income|ad business|\bads?\b|advertis|segment|division|unit\b|codex|claude code|chatgpt plus|in focus|haul", re.I)
OTHER_CO = ("microsoft", "amazon", "google", "alphabet", "nvidia", "oracle", "spacex", "xai", "meta", "apple", "softbank")
PROJ = re.compile(r"\b(to top|to hit|to reach|to exceed|expect|project|forecast|target|goal|aim|could|will|may|pitch|"
                  r"set to|on track|on pace|by (year-end|end of)|20(2[7-9]|3\d))", re.I)
AMT = re.compile(r"(?:US)?\$\s?(\d+(?:\.\d+)?)\s?(billion|bn|b)\b", re.I)
# 분기 실적 기사는 손실·마진·경쟁사 비교가 같은 제목에 자주 붙는다(2026-11-11: 'OpenAI Q2 Revenue Grew 18% QoQ to $6.7B as
# Operating Margin Sank, Trailing Anthropic' 이 SKIP 에 걸려 빠졌다). 분기 매출은 가치평가·투자·전망만 거르고, 매출 단어 뒤 금액을 읽는다.
SKIP_Q = re.compile(r"valu(e|ation|ed|es)|raise|funding|round|invest|stock|\bbuy|deal|contract|compute|estimate|forecast|projection|guidance|\bcut\b|slash|"
                    r"segment|division|unit\b|codex|claude code|chatgpt plus|ad business|\bads?\b|advertis", re.I)
REV = re.compile(r"revenue|sales|\btop[- ]line", re.I)
NOT_REV = re.compile(r"(loss|losses|lost|burn|deficit|commitment|valu\w*|funding|raise|spend\w*|cost|capex)\W+(?:\w+\W+){0,3}$", re.I)

NOT_REV_AFTER = re.compile(r"^\W*(?:\w+\W+){0,3}?(loss\w*|burn\w*|deficit\w*|commitment\w*|obligation\w*|valuation\w*|funding|round|investment\w*)\b", re.I)


def pick_amt(head):
    """분기 매출 제목에서 매출 금액 하나: '매출' 단어에 가장 가까운 금액. 바로 앞(단어 4개 안)에 손실·약정·가치평가 같은 말이
    붙은 금액은 뺀다. 2026-11-11: 'Second-Quarter Loss Widens to $12.3 Billion'(손실), 'purchase commitments of $895.4 billion'(약정)을
    매출로 읽던 문제."""
    rv = REV.search(head)
    best = None
    for m in AMT.finditer(head):
        if NOT_REV.search(head[:m.start()]) or NOT_REV_AFTER.search(head[m.end():]):
            continue
        dist = abs(m.start() - rv.start()) if rv else m.start()
        if best is None or dist < best[0]:
            best = (dist, m)
    return best[1] if best else None


QN = {"1": "first", "2": "second", "3": "third", "4": "fourth"}
HEADS = []   # 이번 수집에서 본 모든 제목(분기 실적 핵심 보도를 고를 때 쓴다)


def news():
    out = []
    for c in MAIN:
        seen = set()
        for q in NEWS_Q:
            url = "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": q.format(c=c) + " when:180d", "hl": "en-US", "gl": "US", "ceid": "US:en"})
            xml = get(url, 30).decode("utf-8", "ignore")
            for it in re.findall(r"<item>(.*?)</item>", xml, re.S):
                tt = html.unescape(re.search(r"<title>(.*?)</title>", it, re.S).group(1))
                if tt in seen:
                    continue
                seen.add(tt)
                head, _, outlet = tt.rpartition(" - ")
                head = head or tt
                low = head.lower()
                # 주어가 이 회사인 제목만(다른 회사 이름이 먼저 나오면 그 회사 기사)
                pos = {k: low.find(k.lower()) for k in MAIN + OTHER_CO if k.lower() in low}
                pd = re.search(r"<pubDate>(.*?)</pubDate>", it)
                day = datetime.strptime(pd.group(1)[5:16], "%d %b %Y").strftime("%Y-%m-%d") if pd else None
                link = re.search(r"<link>(.*?)</link>", it)
                if c in pos and min(pos, key=pos.get) == c:
                    HEADS.append({"company": c, "date": day, "title": head.strip(), "outlet": outlet.strip(), "link": link.group(1) if link else ""})
                if c not in pos or min(pos, key=pos.get) != c:
                    continue
                if re.search(r"run[- ]rate|annuali[sz]ed|\barr\b|recurring", low):
                    metric = "run"
                elif re.search(r"\bq[1-4]\b|quarter", low) and REV.search(head):
                    metric = "quarter"
                else:
                    continue
                if (SKIP_Q if metric == "quarter" else SKIP).search(head):
                    continue
                am = pick_amt(head) if metric == "quarter" else AMT.search(head)
                if not am:
                    continue
                qn = re.search(r"\bq([1-4])\b", low) or re.search(r"\b(first|second|third|fourth)[- ]quarter", low)
                if qn and not qn.group(1).isdigit():
                    qn = type("Q", (), {"group": lambda self, i, v=str(["first", "second", "third", "fourth"].index(qn.group(1)) + 1): v})()
                out.append({"company": c, "metric": metric, "kind": "target" if PROJ.search(head) else "reported",
                            "usd": float(am.group(1)) * 1e9, "date": day, "title": head.strip(), "outlet": outlet.strip(),
                            "link": link.group(1) if link else "", "quarter": f"Q{qn.group(1)}" if qn else None})
    # 같은 회사·종류·금액(±3%)·14일 안의 기사는 한 묶음
    out.sort(key=lambda x: x["date"] or "")
    groups = []
    for x in out:
        g = next((g for g in groups if g["company"] == x["company"] and g["metric"] == x["metric"] and g["kind"] == x["kind"]
                  and abs(g["usd"] - x["usd"]) <= 0.03 * g["usd"] and x["date"] and g["date"]
                  and (datetime.strptime(x["date"], "%Y-%m-%d") - datetime.strptime(g["last"], "%Y-%m-%d")).days <= 14), None)
        if g:
            g["n"] += 1
            g["last"] = x["date"]
            if x["outlet"] not in g["outlets"]:
                g["outlets"].append(x["outlet"])
        else:
            groups.append({**x, "n": 1, "last": x["date"], "outlets": [x["outlet"]]})
    # 분기 기사는 몇 년 몇 분기인지 붙인다(보도일 기준 가장 최근에 끝난 그 분기)
    for g in groups:
        if g["quarter"] and g["date"]:
            y, mo, qi = int(g["date"][:4]), int(g["date"][5:7]), int(g["quarter"][1])
            g["quarter"] = f"{y if qi * 3 <= mo or qi * 3 - mo < 3 else y - 1}Q{qi}"   # 진행 중인 분기 전망도 올해로
    # 나중에 '정정·수정' 기사가 나오면 앞선 숫자는 정정됨으로 표시
    for g in groups:
        for h in groups:
            if h is not g and h["company"] == g["company"] and h["metric"] == g["metric"] == "run" and h["date"] > g["date"] \
                    and (datetime.strptime(h["date"], "%Y-%m-%d") - datetime.strptime(g["date"], "%Y-%m-%d")).days <= 30 \
                    and re.search(r"correct|revis|restat", h["title"], re.I) and g["kind"] == h["kind"] == "reported":
                g["superseded"] = h["date"]
    # 분기 실적은 금액 없는 제목으로 보도되는 일이 많다('OpenAI's Second-Quarter Sales Show Tepid Growth' - WSJ).
    # 금액 있는 기사가 한 곳뿐이어도 ±3일 안에 다른 매체 두 곳 이상이 같은 회사의 같은 분기 실적을 다뤘으면 확인된 것으로 본다.
    for g in groups:
        if g["metric"] != "quarter" or not g.get("quarter") or not g["date"]:
            continue
        qi = g["quarter"][-1]
        qx = re.compile(rf"\bq{qi}\b|{QN[qi]}[- ]quarter", re.I)
        d0 = datetime.strptime(g["date"], "%Y-%m-%d")
        others = {h["outlet"] for h in HEADS if h["company"] == g["company"] and h["date"] and qx.search(h["title"])
                  and abs((datetime.strptime(h["date"], "%Y-%m-%d") - d0).days) <= 3 and h["outlet"] not in g["outlets"]}
        if len(others) >= 2:
            g["corroborated"] = sorted(others)[:6]
    # 기사 두 곳 이상이거나 주요 매체 한 곳이거나(분기 실적은) 다른 매체 보도로 확인되면 채택
    keep = [g for g in groups if len(g["outlets"]) >= 2 or any(t.lower() in g["outlets"][0].lower() for t in TRUST) or g.get("corroborated")]
    return sorted(keep, key=lambda g: g["date"], reverse=True)[:40]


# ---------- 상장 서류: SEC EDGAR
SEC_CIK = {"Anthropic": 2130357}            # OpenAI 등은 공개 S-1을 내면 여기에 CIK를 더한다
SEC_FORMS = ("424B4", "424B1", "S-1/A", "S-1")
MON = {m: i for i, m in enumerate(["January", "February", "March", "April", "May", "June", "July", "August",
                                    "September", "October", "November", "December"], 1)}


def _d(s):
    m = re.match(r"(\w+) (\d{1,2}), (\d{4})", s)
    return f"{m.group(3)}-{MON[m.group(1)]:02d}-{int(m.group(2)):02d}" if m and m.group(1) in MON else None


def _q(end):
    y, mo = int(end[:4]), int(end[5:7])
    return f"{y}Q{(mo - 1) // 3 + 1}"


def _usd(num, unit):
    return float(num.replace(",", "")) * (1e9 if unit.lower().startswith("b") else 1e6)


def parse_s1(t):
    """S-1 본문(태그 뺀 글)에서 분기 매출·런레이트를 읽는다. 금액 칸이 비어 있으면 pending으로 남긴다."""
    q = {}
    # 1) MD&A 분기 매출표: 'Three Months Ended (in millions) <날짜들> Revenue $ 376 $ 787 ...'
    for m in re.finditer(r"Three Months Ended \(in millions\) ((?:[A-Z][a-z]+ \d{1,2}, \d{4} ){2,12})Revenue((?: \$? ?[\d,]+){2,12})", t):
        ds = [_d(x) for x in re.findall(r"[A-Z][a-z]+ \d{1,2}, \d{4}", m.group(1))]
        vs = [float(v.replace(",", "")) * 1e6 for v in re.findall(r"[\d,]+", m.group(2))][:len(ds)]
        if len(vs) == len(ds) and all(ds):
            for d, v in zip(ds, vs):
                q[d] = {"q": _q(d), "end": d, "usd": v, "kind": "reported", "where": "S-1 MD&A 분기표"}
            break
    # 2) 본문 문구: '$197 million for the three months ended December 31, 2024'
    for m in re.finditer(r"\$([\d,.]+) (million|billion) for the three months ended ([A-Z][a-z]+ \d{1,2}, \d{4})", t):
        d = _d(m.group(3))
        if d and d not in q:
            q[d] = {"q": _q(d), "end": d, "usd": _usd(m.group(1), m.group(2)), "kind": "reported", "where": "S-1 본문"}
    pending = []
    # 3) 금액이 빈칸인 분기: 'revenue for the three months ended September 30, 2026 was 86 times our revenue for ... December 31, 2024'
    for m in re.finditer(r"revenue for the three months ended ([A-Z][a-z]+ \d{1,2}, \d{4}) was (\d+(?:\.\d+)?) times our revenue for the three months ended ([A-Z][a-z]+ \d{1,2}, \d{4})", t):
        d, k, b = _d(m.group(1)), float(m.group(2)), _d(m.group(3))
        if d and d not in q and b in q:
            q[d] = {"q": _q(d), "end": d, "usd": round(q[b]["usd"] * k / 1e6) * 1e6, "kind": "derived",
                    "where": f"S-1 문구 '{_q(b)}의 {m.group(2)}배'로 계산(금액 칸은 빈칸)"}
            pending.append({"what": f"{_q(d)} 매출 금액", "note": "서류에 금액 칸이 비어 있어 배수로 계산한 추정치예요. 수정 S-1에서 확정돼요."})
    # 4) 런레이트: 'our Run-Rate Revenue was $ as of October 31, 2026' (빈칸) 또는 '$123.4 billion'
    run = None
    for m in re.finditer(r"Run-Rate Revenue was \$ ?(?:([\d,.]+) ?(billion|million))? ?as of ([A-Z][a-z]+ \d{1,2}, \d{4})", t):
        d = _d(m.group(3))
        if m.group(1):
            run = {"date": d, "usd": _usd(m.group(1), m.group(2))}
            break
        pending.insert(0, {"what": f"런레이트({d} 기준)", "note": "서류에 금액 칸이 비어 있어요. 로드쇼 전 수정 S-1에서 채워질 가능성이 커요."})
        break
    defn = re.search(r"Run-Rate Revenue ?” is an operating metric.{20,500}?multiplied by 1[23]\.(?:.{0,300}?multiplied by 1[23]\.)?", t)
    return {"quarters": sorted(q.values(), key=lambda x: x["end"]), "run_rate": run, "pending": pending,
            "run_def": re.sub(r"\s+", " ", defn.group(0))[:700] if defn else None}


def sec_filings(prev):
    contact = os.environ.get("SEC_CONTACT", "").strip()
    if not contact:
        raise RuntimeError("SEC_CONTACT 없음(깃허브 비밀값을 넣으면 자동 수집)")
    ua = {"User-Agent": f"industry-strength {contact}"}

    def sec(url, timeout=120):
        with urllib.request.urlopen(urllib.request.Request(url, headers=ua), timeout=timeout) as r:
            return r.read()
    out = {}
    for co, cik in SEC_CIK.items():
        sub = json.loads(sec(f"https://data.sec.gov/submissions/CIK{cik:010d}.json"))
        r = sub["filings"]["recent"]
        idx = [i for i, f in enumerate(r["form"]) if f in SEC_FORMS]
        if not idx:
            continue
        i = idx[0]   # 가장 최근 서류
        acc = r["accessionNumber"][i]
        meta = {"form": r["form"][i], "filed": r["filingDate"][i], "accession": acc,
                "url": f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc.replace('-', '')}/{r['primaryDocument'][i]}",
                "history": [{"form": r["form"][j], "filed": r["filingDate"][j]} for j in idx[:8]]}
        old = (prev or {}).get(co) or {}
        if old.get("accession") == acc and old.get("quarters"):
            out[co] = {**old, **meta}          # 같은 서류면 다시 받지 않는다(본문이 14MB 안팎)
            continue
        t = html.unescape(re.sub(r"<[^>]+>", " ", sec(meta["url"], 300).decode("utf-8", "ignore")))
        p = parse_s1(re.sub(r"\s+", " ", t))
        if len(p["quarters"]) < 2:
            raise RuntimeError(f"{co}: 분기 매출표를 못 읽음({meta['form']} {meta['filed']})")
        out[co] = {**meta, **p}
        print(f"SEC {co}: 새 서류 {meta['form']} {meta['filed']} · 분기 {len(p['quarters'])}개 · 런레이트 {p['run_rate']}")
    return out


# ---------- 매출 보충: config/ai_revenue_manual.json (S-1 분기 매출, Epoch에 아직 없는 최신 보도)
def manual(rv):
    if not MANUAL.exists():
        return rv
    m = json.loads(MANUAL.read_text(encoding="utf-8"))
    rv = dict(rv or {"companies": {}, "others": []})
    fil = {k: dict(v) for k, v in (m.get("filings") or {}).items()}
    # SEC에서 읽은 값이 있으면 그걸 쓰고, 설명(doc·basis·sources)만 수동 파일에서 가져온다
    for co, s in (rv.get("sec") or {}).items():
        base = fil.get(co, {})
        fil[co] = {**base, "quarters": s["quarters"], "pending": s["pending"], "run_rate": s.get("run_rate"),
                   "doc": f"Form {s['form']} ({s['filed']} 제출)", "url": s["url"], "auto": True,
                   "history": s.get("history"), "run_def": s.get("run_def")}
    rv["filings"] = fil
    day = lambda d: datetime.strptime(d, "%Y-%m-%d").date()
    sup = []
    for x in m.get("supplements") or []:
        # Epoch에 같은 회사·비슷한 날짜(±20일)·비슷한 금액(±10%) 점이 생기면 보충 점은 뺀다(중복 방지)
        dup = any(abs((day(e["date"]) - day(x["date"])).days) <= 20 and abs(e["usd"] - x["usd"]) <= 0.1 * x["usd"]
                  for e in (rv.get("companies", {}).get(x["company"]) or []))
        if not dup:
            sup.append(x)
    rv["supplements"] = sup
    rv["_manual_q"] = m.get("quarters") or {}
    return rv


# ---------- 분기 실적표 (2026-11-11 사용자: OpenAI 3분기 실적을 숫자 하나가 아니라 성장률·내용까지, Anthropic과 합산도)
FACT = [  # 핵심 보도에서 뽑을 사실: (종류, 정규식) — 제목에 그대로 있는 숫자만 쓴다
    ("qoq", re.compile(r"(\d+(?:\.\d+)?)\s?%\s*(?:quarter[- ]over[- ]quarter|q/?q|qoq|sequential|from the (?:prior|previous) quarter)", re.I)),
    ("qoq", re.compile(r"(?:surge|jump|rise|grow|grew|climb|soar|leap)\w*\s+(?:nearly |about |almost |by )?(\d+(?:\.\d+)?)\s?%", re.I)),
    ("enterprise", re.compile(r"(enterprise|business|corporate)[^.;]*?(doubl\w*|tripl\w*|half|\d+(?:\.\d+)?\s?%)", re.I)),
    ("loss", re.compile(r"(?:operating )?loss[^.;$]*?(?:US)?\$\s?(\d+(?:\.\d+)?)\s?(?:billion|bn|b)\b", re.I)),
    ("driver", re.compile(r"\b(coding|codex|claude code|agents?|agentic|api|chatgpt|consumer|subscri\w+|enterprise)\b", re.I)),
]
DRIVER_KO = {"coding": "코딩", "codex": "코딩(Codex)", "claude code": "코딩(Claude Code)", "agent": "에이전트", "agents": "에이전트",
             "agentic": "에이전트", "api": "API", "chatgpt": "ChatGPT", "consumer": "소비자", "enterprise": "기업"}


def _qkey(q):
    return int(q[:4]) * 4 + int(q[-1])


def _prev_q(q, n=1):
    k = _qkey(q) - n
    return f"{(k - 1) // 4}Q{(k - 1) % 4 + 1}"


def highlights(co, q, day):
    """분기 실적 보도 무렵(보도일 −3일~+10일) 그 회사가 주어인 제목 중 실적 관련 제목을 골라 핵심 보도로. 주요 매체 먼저."""
    if not day:
        return {"heads": [], "facts": {}}
    d0 = datetime.strptime(day, "%Y-%m-%d")
    pool = list(HEADS)
    try:   # 실적 기사 전용 검색 한 번 더(매출 숫자가 제목에 없는 해설 기사까지)
        qq = f'{co} ("{QN[q[-1]]} quarter" OR "Q{q[-1]}") (revenue OR enterprise OR loss OR growth)'
        url = "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": qq + " when:30d", "hl": "en-US", "gl": "US", "ceid": "US:en"})
        xml = get(url, 30).decode("utf-8", "ignore")
        for it in re.findall(r"<item>(.*?)</item>", xml, re.S):
            tt = html.unescape(re.search(r"<title>(.*?)</title>", it, re.S).group(1))
            head, _, outlet = tt.rpartition(" - ")
            pd = re.search(r"<pubDate>(.*?)</pubDate>", it)
            lk = re.search(r"<link>(.*?)</link>", it)
            low = (head or tt).lower()
            pos = {k: low.find(k.lower()) for k in MAIN + OTHER_CO if k.lower() in low}
            if co in pos and min(pos, key=pos.get) == co:
                pool.append({"company": co, "date": datetime.strptime(pd.group(1)[5:16], "%d %b %Y").strftime("%Y-%m-%d") if pd else None,
                             "title": (head or tt).strip(), "outlet": outlet.strip(), "link": lk.group(1) if lk else ""})
    except Exception as e:  # noqa: BLE001
        print(f"핵심 보도 검색 실패 {co} {q}: {type(e).__name__}")
    rel = re.compile(r"quarter|\bq[1-4]\b|revenue|enterprise|loss|growth|doubl|%", re.I)
    seen, heads = set(), []
    for h in pool:
        if h["company"] != co or not h["date"] or not rel.search(h["title"]) or PROJ.search(h["title"]) and not REV.search(h["title"]):
            continue
        dd = (datetime.strptime(h["date"], "%Y-%m-%d") - d0).days
        key = re.sub(r"\W+", " ", h["title"].lower())[:60]
        if -3 <= dd <= 10 and key not in seen:
            seen.add(key)
            heads.append(h)
    heads.sort(key=lambda h: (not any(t.lower() in h["outlet"].lower() for t in TRUST), h["date"]))
    facts = {}
    for h in heads:
        for kind, rx in FACT:
            m = rx.search(h["title"])
            if not m:
                continue
            if kind == "driver":
                facts.setdefault("drivers", [])
                w = DRIVER_KO.get(m.group(1).lower(), m.group(1))
                if w not in facts["drivers"]:
                    facts["drivers"].append(w)
            elif kind not in facts:
                facts[kind] = {"text": m.group(0), "value": m.group(1) if kind != "enterprise" else m.group(2), "outlet": h["outlet"], "title": h["title"]}
    return {"heads": heads[:6], "facts": facts}


def quarterly(rv, prev_q, manual_q):
    """회사별 분기 매출: S-1 공시 > 확인된 보도(config) > 기사 자동 판독(두 곳 이상·주요 매체) 순으로 하나를 고른다.
    다른 출처 값도 alt 로 남기고, 전분기·전년 대비와 두 회사 합계(기준이 달라 참고용)를 계산한다."""
    out, warn = {}, []
    for co in MAIN:
        cand = {}
        f = (rv.get("filings") or {}).get(co) or {}
        for x in f.get("quarters") or []:
            cand.setdefault(x["q"], []).append({"usd": x["usd"], "src": "S-1 공시" if x.get("kind") == "reported" else "S-1 계산",
                                                "rank": 0 if x.get("kind") == "reported" else 2, "where": x.get("where"), "date": None})
        for x in manual_q.get(co) or []:
            cand.setdefault(x["q"], []).append({"usd": x["usd"], "src": "확인된 보도", "rank": 1, "where": x.get("note"), "date": x.get("report_date"),
                                                "link": x.get("source"), "outlets": x.get("outlets")})
        notes = {x["q"]: x.get("facts") or [] for x in manual_q.get(co) or [] if x.get("facts")}
        for g in rv.get("news") or []:
            if g["company"] != co or g["metric"] != "quarter" or g["kind"] != "reported" or not g.get("quarter") or g.get("superseded"):
                continue
            cand.setdefault(g["quarter"], []).append({"usd": g["usd"], "src": "기사 자동 판독", "rank": 3 - min(len(g["outlets"]), 9) / 10,
                                                      "where": g["title"], "date": g["date"], "link": g.get("link"), "outlets": g["outlets"]})
        rows = []
        for q in sorted(cand, key=_qkey):
            # 직전 분기 값의 5배를 넘거나 5분의 1 아래면 판독 오류로 보고 기사 값은 버린다(공시·확인된 보도는 그대로)
            pv = rows[-1]["usd"] if rows and _qkey(rows[-1]["q"]) == _qkey(q) - 1 else None
            ok = [c for c in cand[q] if c["rank"] < 2 or not pv or 0.2 <= c["usd"] / pv <= 5]
            if not ok:
                warn.append({"kind": "check", "msg": f"{co} {q} 기사 금액이 직전 분기와 너무 달라 뺌: " + ", ".join(f"{c['usd'] / 1e8:,.0f}억" for c in cand[q])})
                continue
            cand[q] = ok
            best = sorted(cand[q], key=lambda c: c["rank"])[0]
            alt = [{"usd": c["usd"], "src": c["src"]} for c in cand[q] if c is not best and abs(c["usd"] - best["usd"]) > 0.03 * best["usd"]]
            rows.append({"q": q, **{k: v for k, v in best.items() if k != "rank"}, "alt": alt, **({"facts": notes[q]} if q in notes else {})})
        by = {r["q"]: r for r in rows}
        for r in rows:
            p, y = by.get(_prev_q(r["q"])), by.get(_prev_q(r["q"], 4))
            r["qoq"] = round((r["usd"] / p["usd"] - 1) * 100, 1) if p else None
            r["yoy"] = round((r["usd"] / y["usd"] - 1) * 100, 1) if y else None
            if r["qoq"] is not None and p and p.get("qoq") is not None:
                r["qoq_prev"] = p["qoq"]
            # 핵심 보도: 기사로 확인된 분기(최근 4개)만. 지난번에 모은 것이 있으면 그대로 쓴다(매번 다시 찾지 않게)
            old = ((prev_q or {}).get(co) or {})
            old = next((o for o in old.get("rows", []) if o["q"] == r["q"] and o.get("hl")), None)
            if r["src"] != "S-1 공시" and r.get("date") and _qkey(r["q"]) >= _qkey(rows[-1]["q"]) - 1:
                hl = old["hl"] if old and old["hl"].get("heads") and old.get("date") == r.get("date") else highlights(co, r["q"], r["date"])
                if hl["heads"]:
                    r["hl"] = hl
        out[co] = {"rows": rows, "basis": "총액" if co == "Anthropic" else "순액"}
        # 누락 감시: 기사로 잡힌 분기 실적이 표에 없거나(분기 미상), 표의 값과 크게 다르면 경고
        for g in rv.get("news") or []:
            if g["company"] == co and g["metric"] == "quarter" and g["kind"] == "reported" and not g.get("superseded") \
                    and (len(g["outlets"]) >= 2 or any(t.lower() in g["outlets"][0].lower() for t in TRUST) or g.get("corroborated")):
                if not g.get("quarter"):
                    warn.append({"kind": "gap", "msg": f"{co} 분기 실적 보도({g['date']}, {g['usd'] / 1e8:,.0f}억 달러)가 몇 분기인지 못 읽어 분기 실적표에 빠짐: {g['title']}"})
                elif g["quarter"] in by and abs(by[g["quarter"]]["usd"] - g["usd"]) > 0.1 * g["usd"] and by[g["quarter"]]["src"] == "기사 자동 판독":
                    warn.append({"kind": "check", "msg": f"{co} {g['quarter']} 보도 금액이 엇갈림: {g['usd'] / 1e8:,.0f}억 vs 표 {by[g['quarter']]['usd'] / 1e8:,.0f}억"})
    # 두 회사 합계: 둘 다 있는 분기만(기준이 달라 참고용)
    a = {r["q"]: r for r in out.get("Anthropic", {}).get("rows", [])}
    o = {r["q"]: r for r in out.get("OpenAI", {}).get("rows", [])}
    comb = []
    for q in sorted(set(a) & set(o), key=_qkey):
        t = a[q]["usd"] + o[q]["usd"]
        comb.append({"q": q, "usd": t, "Anthropic": a[q]["usd"], "OpenAI": o[q]["usd"], "a_share": round(a[q]["usd"] / t * 100, 1)})
    for i, c in enumerate(comb):
        if i and _qkey(comb[i - 1]["q"]) == _qkey(c["q"]) - 1:
            c["qoq"] = round((c["usd"] / comb[i - 1]["usd"] - 1) * 100, 1)
    return {"companies": out, "combined": comb, "warnings": warn}


# ---------- 토큰: OpenRouter
def openrouter(prev):
    base = "https://openrouter.ai/api/frontend/v1/rankings/"
    ms = getj(base + "market-share")["data"]
    week_models = getj(base + "models?view=week")["data"]
    models = getj("https://openrouter.ai/api/v1/models")["data"]
    # 같은 canonical_slug에 배치·변형판이 여럿 있으면 이름이 짧은(기본판) 쪽을 쓴다
    meta = {}
    for m in sorted(models, key=lambda m: len(m.get("name") or "")):
        meta.setdefault(m.get("canonical_slug") or m["id"], m)
        meta.setdefault(m["id"], m)

    def cls(slug):
        m = meta.get(slug)
        return None if m is None else ("open" if m.get("hugging_face_id") else "closed")

    def nice(slug):
        m = meta.get(slug)
        if m and m.get("name"):
            return m["name"].split(": ", 1)[-1]
        return re.sub(r"-\d{8}$", "", slug.split("/", 1)[-1])

    # 모델별 주간 합계
    tot, by_model, by_author = {"open": 0, "closed": 0, "unknown": 0}, {}, {}
    for x in week_models:
        t = (x.get("total_prompt_tokens") or 0) + (x.get("total_completion_tokens") or 0)
        slug = x["model_permaslug"]
        k = cls(slug) or "unknown"
        tot[k] += t
        by_model[slug] = by_model.get(slug, 0) + t
        a = slug.split("/", 1)[0]
        ba = by_author.setdefault(a, {"open": 0, "closed": 0, "unknown": 0})
        ba[k] += t
    T = sum(tot.values())
    # 이 합계가 어느 주인지: 회사별 주간 합계와 가장 가까운 주
    week = min(ms, key=lambda w: abs(sum(w["ys"].values()) - T))["x"] if ms else None
    top = sorted(by_model.items(), key=lambda kv: -kv[1])[:12]
    latest = {"week": week, "total": T,
              "pct": {k: round(v / T * 100, 2) for k, v in tot.items()} if T else {},
              "top_models": [{"slug": s, "name": nice(s), "author": s.split("/", 1)[0], "tokens": t,
                              "pct": round(t / T * 100, 2), "cls": cls(s) or "unknown"} for s, t in top]}

    # 지난 주들의 오픈웨이트 비중: 실제(모델 단위)는 이번부터 쌓고, 과거는 회사별 비중으로 추정
    ratio = {a: v["open"] / (v["open"] + v["closed"]) for a, v in by_author.items() if v["open"] + v["closed"] > 0}
    hist_actual = {h["week"]: h for h in (prev.get("open_history") or []) if h.get("method") == "model"}
    if week and T:
        cl = tot["open"] + tot["closed"]
        hist_actual[week] = {"week": week, "method": "model", "open_pct": round(tot["open"] / cl * 100, 2) if cl else None,
                             "unknown_pct": round(tot["unknown"] / T * 100, 2)}
    est = []
    for w in ms:
        named = set(w["ys"]) - {"others"}
        o = c = 0.0
        for a, t in w["ys"].items():
            if a == "others":
                rest = {k: v for k, v in by_author.items() if k not in named}
                ro, rc = sum(v["open"] for v in rest.values()), sum(v["closed"] for v in rest.values())
                r = ro / (ro + rc) if ro + rc else None
            else:
                r = ratio.get(a)
            if r is None:
                continue
            o += t * r
            c += t * (1 - r)
        est.append({"week": w["x"], "method": "est", "open_pct": round(o / (o + c) * 100, 2) if o + c else None})
    # 주 시작(월요일 00:00 UTC)부터 7일이 안 지난 주는 아직 진행 중
    today = datetime.now(timezone.utc).date()
    partial = lambda wk: (today - datetime.strptime(wk, "%Y-%m-%d").date()).days < 7
    for e in est:
        e["partial"] = partial(e["week"])
    weeks = [{"week": w["x"], "total": sum(w["ys"].values()), "authors": w["ys"], "partial": partial(w["x"])} for w in ms]
    return {"weeks": weeks, "latest": latest, "author_open_ratio": {a: round(r, 3) for a, r in ratio.items()},
            "open_history": sorted(hist_actual.values(), key=lambda h: h["week"]), "open_est": est,
            "rank_chart": rank_chart(base, nice, cls, partial),
            **model_history(prev, base, nice, cls, partial, week, by_model, T)}


def model_history(prev, base, nice, cls, partial, week, by_model, T, keep_top=40):
    """모델별 주간 토큰 비중 기록(2026-11-02 사용자 요청: 모델을 누르면 추이 팝업).
    OpenRouter 'Top Models' 차트(1년치, 주마다 상위 9개)로 채우고, 이번 주 전체 모델 목록(상위 40개)을 덧붙여 쌓는다.
    진행 중인 주는 넣지 않는다. 같은 주·모델은 차트 값이 이긴다."""
    hist = {s: dict(v) for s, v in (prev.get("model_hist") or {}).items()}
    info = dict(prev.get("model_info") or {})
    if week and T and not partial(week):
        for s_, t in sorted(by_model.items(), key=lambda kv: -kv[1])[:keep_top]:
            hist.setdefault(s_, {})[week] = round(t / T * 100, 3)
    for w in getj(base + "model-rankings-chart")["data"]["data"]:
        if partial(w["x"]):
            continue
        tot = sum(w["ys"].values())
        for s_, t in w["ys"].items():
            if s_ != "Others" and tot:
                hist.setdefault(s_, {})[w["x"]] = round(t / tot * 100, 3)
    for s_ in hist:
        b = s_.split(":")[0]
        info[s_] = {"name": nice(b) + (" (무료)" if s_.endswith(":free") else ""), "author": s_.split("/", 1)[0],
                    "cls": cls(b) or (info.get(s_) or {}).get("cls") or "unknown"}
    return {"model_hist": {s_: dict(sorted(v.items())[-160:]) for s_, v in hist.items()}, "model_info": info}


def rank_chart(base, nice, cls, partial, keep=13, back=4):
    """OpenRouter 'Top Models' 차트(주마다 상위 9개 + Others)로 최근 13주 순위와 '치고 올라오는 모델'.
    무료판(:free)은 OpenRouter가 따로 세므로 따로 둔다."""
    raw = getj(base + "model-rankings-chart")["data"]["data"]
    weeks = []
    for w in raw[-(keep + 1):]:
        tot = sum(w["ys"].values())
        ms = sorted(((s, t) for s, t in w["ys"].items() if s != "Others"), key=lambda kv: -kv[1])
        weeks.append({"week": w["x"], "partial": partial(w["x"]), "total": tot,
                      "models": [{"slug": s, "rank": i + 1, "pct": round(t / tot * 100, 2)} for i, (s, t) in enumerate(ms)]})
    slugs = {m["slug"] for w in weeks for m in w["models"]}

    def label(s):
        b, free = (s[:-5], True) if s.endswith(":free") else (s, False)
        return nice(b) + (" (무료)" if free else "")
    info = {s: {"name": label(s), "author": s.split("/", 1)[0], "cls": cls(s.split(":")[0]) or "unknown"} for s in slugs}
    full = [w for w in weeks if not w["partial"]]
    risers = []
    if len(full) > back:
        now, was = full[-1], full[-1 - back]
        wr = {m["slug"]: m for m in was["models"]}
        for m in now["models"]:
            p = wr.get(m["slug"])
            gain = (10 if p is None else p["rank"]) - m["rank"]   # 9위 밖은 10위로 친다
            if gain > 0 or p is None:
                risers.append({"slug": m["slug"], **info[m["slug"]], "now": m["rank"], "was": p["rank"] if p else None,
                               "pct": m["pct"], "pct_was": p["pct"] if p else None, "gain": gain})
        risers.sort(key=lambda r: (-r["gain"], r["now"]))
    return {"weeks": weeks, "info": info, "risers": risers, "back": back}


# ---------- 토큰 vs 지출: Vercel AI Gateway
def vercel(open_names, prev_history=None, prev_models=None):
    s = get("https://vercel.com/ai-gateway/leaderboards").decode("utf-8", "ignore").replace('\\"', '"')
    days = {}
    for m in re.finditer(r'\{"day":"(\d{4}-\d\d-\d\d)T[^"]*","metric":"(tokens|cost)","chef_values":(\[\[.*?\]\])\}', s):
        days.setdefault(m.group(1), {})[m.group(2)] = json.loads(m.group(3))
    both = sorted(d for d, v in days.items() if "tokens" in v and "cost" in v)
    if not both:
        raise RuntimeError("vercel: 토큰·지출이 함께 있는 날이 없음")

    def cls(name):
        n = re.sub(r"\s+", " ", name.lower()).strip()
        best = None
        for on, c in open_names:
            if (n == on or n.startswith(on + " ")) and (best is None or len(on) > len(best[0])):
                best = (on, c)
        return best[1] if best else "unknown"

    def summary(d):
        v = days[d]
        rows = {}
        for metric in ("tokens", "cost"):
            for name, pct in v[metric]:
                rows.setdefault(name, {"name": name, "tokens": None, "cost": None, "cls": cls(name)})[metric] = round(pct, 2)
        s_ = {}
        for metric in ("tokens", "cost"):
            s_[metric] = {k: round(sum(p for nm, p in v[metric] if cls(nm) == k), 2) for k in ("open", "closed", "unknown")}
            s_[metric]["top10"] = round(sum(p for _, p in v[metric]), 2)
        return rows, s_

    last = both[-1]
    rows, s_ = summary(last)
    # 날마다 쌓는다(2026-11-02 사용자 요청: 지출 비중도 시간 누적 그래프). Vercel 페이지에는 최근 몇십 일만 보이므로
    # 지난 기록(prev_history)에 이번에 받은 날을 덮어 합친다. 같은 날은 이번에 받은 값이 이긴다.
    hist = {h["day"]: h for h in (prev_history or []) if isinstance(h, dict) and h.get("day")}
    for d in both:
        _, sd = summary(d)
        hist[d] = {"day": d, "open_tokens": sd["tokens"]["open"], "open_cost": sd["cost"]["open"],
                   "closed_tokens": sd["tokens"]["closed"], "closed_cost": sd["cost"]["closed"],
                   "top10_tokens": sd["tokens"]["top10"], "top10_cost": sd["cost"]["top10"]}
    hist = [hist[d] for d in sorted(hist)][-1100:]
    # 모델별 매일 [토큰 비중, 지출 비중] 기록(그날 10위 밖이면 null). 팝업 추이 그래프용, 지난 기록에 덮어 쌓는다.
    mh = {n: dict(v) for n, v in (prev_models or {}).items()}
    for d in both:
        cur = {}
        for i, metric in enumerate(("tokens", "cost")):
            for name, p in days[d][metric]:
                cur.setdefault(name, [None, None])[i] = round(p, 2)
        for name, v in cur.items():
            mh.setdefault(name, {})[d] = v
    mh = {n: dict(sorted(v.items())[-400:]) for n, v in mh.items()}
    # 모델별 최근 7일 평균(2026-11-02 사용자 요청: 하루 튐으로 순위가 뒤집히지 않게). 그날 10위 밖이면 0으로 센다.
    wk = both[-7:]
    acc = {}
    for d in wk:
        for metric in ("tokens", "cost"):
            for name, p in days[d][metric]:
                r = acc.setdefault(name, {"name": name, "tokens": 0.0, "cost": 0.0, "cls": cls(name), "days": set()})
                r[metric] += p
                r["days"].add(d)
    week_models = [{"name": r["name"], "cls": r["cls"], "tokens": round(r["tokens"] / len(wk), 2),
                    "cost": round(r["cost"] / len(wk), 2), "days": len(r["days"])} for r in acc.values()]
    week_models.sort(key=lambda r: -r["cost"])
    return {"day": last, "models": sorted(rows.values(), key=lambda r: -((r["tokens"] or 0) + (r["cost"] or 0))),
            "share": s_, "history": hist,
            "week": {"from": wk[0], "to": wk[-1], "n": len(wk), "models": week_models}, "model_hist": mh}


def open_name_table():
    """OpenRouter 모델 이름(회사명 뺀 부분) → open/closed. Vercel 이름 맞추기에 쓴다."""
    out = []
    for m in getj("https://openrouter.ai/api/v1/models")["data"]:
        n = (m.get("name") or "").split(": ", 1)[-1].lower()
        n = re.sub(r"\s*\((free|thinking|beta|preview)\)", "", n).strip()
        if n:
            out.append((n, "open" if m.get("hugging_face_id") else "closed"))
    return out


def main():
    dry = "--dry-run" in sys.argv
    prev = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    now = datetime.now(KST)
    data = {"updated_at": now.strftime("%Y-%m-%d %H:%M KST"), "sources": dict(prev.get("sources") or {})}
    jobs = [("revenue", epoch, ()), ("openrouter", openrouter, (prev.get("openrouter") or {},))]
    for key, fn, args in jobs:
        try:
            data[key] = fn(*args)
            data["sources"][key] = {"ok": True, "fetched_at": data["updated_at"]}
        except Exception as e:  # noqa: BLE001
            print(f"{key}: 실패 {type(e).__name__}: {e}")
            data[key] = prev.get(key)
            data["sources"][key] = {**(prev.get("sources", {}).get(key) or {}), "ok": False, "error": f"{type(e).__name__}"}
    try:
        pv = prev.get("vercel") or {}
        data["vercel"] = vercel(open_name_table(), pv.get("history"), pv.get("model_hist"))
        data["sources"]["vercel"] = {"ok": True, "fetched_at": data["updated_at"]}
    except Exception as e:  # noqa: BLE001
        print(f"vercel: 실패 {type(e).__name__}: {e}")
        data["vercel"] = prev.get("vercel")
        data["sources"]["vercel"] = {**(prev.get("sources", {}).get("vercel") or {}), "ok": False, "error": type(e).__name__}

    try:
        sec = sec_filings((prev.get("revenue") or {}).get("sec"))
        data["sources"]["sec"] = {"ok": True, "fetched_at": data["updated_at"]}
    except Exception as e:  # noqa: BLE001
        print(f"sec: {type(e).__name__}: {e}")
        sec = (prev.get("revenue") or {}).get("sec")
        if os.environ.get("SEC_CONTACT"):
            data["sources"]["sec"] = {**(prev.get("sources", {}).get("sec") or {}), "ok": False, "error": type(e).__name__}
    if data.get("revenue") is not None:
        data["revenue"] = {**data["revenue"], "sec": sec} if sec else data["revenue"]
    try:
        nw = news()
        data["sources"]["news"] = {"ok": True, "fetched_at": data["updated_at"]}
    except Exception as e:  # noqa: BLE001
        print(f"news: 실패 {type(e).__name__}: {e}")
        nw = (prev.get("revenue") or {}).get("news")
        data["sources"]["news"] = {**(prev.get("sources", {}).get("news") or {}), "ok": False, "error": type(e).__name__}
    if data.get("revenue") is not None and nw is not None:
        data["revenue"] = {**data["revenue"], "news": nw}
    try:
        data["revenue"] = manual(data.get("revenue"))
    except Exception as e:  # noqa: BLE001
        print(f"보충 자료: 실패 {type(e).__name__}: {e}")
    gaps = []
    if data.get("revenue") is not None:
        mq = data["revenue"].pop("_manual_q", {})
        try:
            qt = quarterly(data["revenue"], (prev.get("revenue") or {}).get("quarterly", {}).get("companies"), mq)
            data["revenue"]["quarterly"] = {"companies": qt["companies"], "combined": qt["combined"]}
            data["warnings"] = qt["warnings"]
            gaps = [w for w in qt["warnings"] if w["kind"] == "gap"]
            for co, v in qt["companies"].items():
                r = v["rows"][-1] if v["rows"] else None
                if r:
                    print(f"{co} 분기: {r['q']} {r['usd'] / 1e8:,.0f}억 달러({r['src']}) 전분기 대비 {r['qoq']}% · 핵심 보도 {len((r.get('hl') or {}).get('heads', []))}개 {(r.get('hl') or {}).get('facts', {}).keys()}")
            if qt["combined"]:
                c = qt["combined"][-1]
                print(f"두 회사 합계 {c['q']}: {c['usd'] / 1e8:,.0f}억 달러 (Anthropic {c['a_share']}%)")
        except Exception as e:  # noqa: BLE001
            print(f"분기 실적표 실패: {type(e).__name__}: {e}")
            data["warnings"] = [{"kind": "gap", "msg": f"분기 실적표를 만들지 못함({type(e).__name__})"}]
            gaps = data["warnings"]
        for w in data.get("warnings") or []:
            print(("::error::" if w["kind"] == "gap" else "::warning::") + w["msg"])
    rv, orr, vc = data.get("revenue") or {}, data.get("openrouter") or {}, data.get("vercel") or {}
    for c in MAIN:
        last = (rv.get("companies", {}).get(c) or [{}])[-1]
        print(f"{c}: {last.get('usd', 0) / 1e9:.0f}B ({last.get('date')})")
    lt = orr.get("latest") or {}
    print(f"OpenRouter {lt.get('week')}: {lt.get('pct')}")
    print(f"Vercel {vc.get('day')}: {vc.get('share')}")
    if dry:
        return
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"저장: {OUT} ({OUT.stat().st_size // 1024}KB)")
    if not any(v.get("ok") for v in data["sources"].values()):
        sys.exit(1)
    if gaps:   # 잡힌 실적이 표에서 빠졌으면 실패로 끝내 알림이 가게 한다(파일은 위에서 저장)
        sys.exit("분기 실적 누락: " + " / ".join(w["msg"] for w in gaps))


if __name__ == "__main__":
    main()
