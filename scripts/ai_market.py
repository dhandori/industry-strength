"""AI 시장 탭 자료 모으기 → docs/data/ai_market.json

세 곳에서 따로 모으고, 한 곳이 실패해도 나머지는 갱신한다(실패한 곳은 지난 값 유지 + ok=false).
- 매출(런레이트): Epoch AI 'Data on AI companies' (CC BY 4.0). 파일은 매일 다시 만들어지지만
  새 매출 보도는 뉴스가 날 때만 추가된다(대개 2~4주에 한 번).
- 토큰 점유율: OpenRouter 순위 화면이 쓰는 자료. 주 단위(월요일 00:00 UTC = 09:00 KST 마감).
  오픈웨이트 여부는 OpenRouter 모델 목록의 hugging_face_id(가중치 공개 저장소)가 있는지로 판정.
- 토큰 vs 지출: Vercel AI Gateway 순위 화면에 박힌 하루 단위 상위 10개 모델 비중.

python scripts/ai_market.py            # 수집 + 저장
python scripts/ai_market.py --dry-run  # 저장하지 않고 요약만 출력
"""
import csv
import io
import json
import re
import sys
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


# ---------- 매출 보충: config/ai_revenue_manual.json (S-1 분기 매출, Epoch에 아직 없는 최신 보도)
def manual(rv):
    if not MANUAL.exists():
        return rv
    m = json.loads(MANUAL.read_text(encoding="utf-8"))
    rv = dict(rv or {"companies": {}, "others": []})
    rv["filings"] = m.get("filings") or {}
    day = lambda d: datetime.strptime(d, "%Y-%m-%d").date()
    sup = []
    for x in m.get("supplements") or []:
        # Epoch에 같은 회사·비슷한 날짜(±20일)·비슷한 금액(±10%) 점이 생기면 보충 점은 뺀다(중복 방지)
        dup = any(abs((day(e["date"]) - day(x["date"])).days) <= 20 and abs(e["usd"] - x["usd"]) <= 0.1 * x["usd"]
                  for e in (rv.get("companies", {}).get(x["company"]) or []))
        if not dup:
            sup.append(x)
    rv["supplements"] = sup
    return rv


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
            "rank_chart": rank_chart(base, nice, cls, partial)}


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
def vercel(open_names):
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
    hist = []
    for d in both[-120:]:
        _, sd = summary(d)
        hist.append({"day": d, "open_tokens": sd["tokens"]["open"], "open_cost": sd["cost"]["open"]})
    return {"day": last, "models": sorted(rows.values(), key=lambda r: -((r["tokens"] or 0) + (r["cost"] or 0))),
            "share": s_, "history": hist}


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
        data["vercel"] = vercel(open_name_table())
        data["sources"]["vercel"] = {"ok": True, "fetched_at": data["updated_at"]}
    except Exception as e:  # noqa: BLE001
        print(f"vercel: 실패 {type(e).__name__}: {e}")
        data["vercel"] = prev.get("vercel")
        data["sources"]["vercel"] = {**(prev.get("sources", {}).get("vercel") or {}), "ok": False, "error": type(e).__name__}

    try:
        data["revenue"] = manual(data.get("revenue"))
    except Exception as e:  # noqa: BLE001
        print(f"보충 자료: 실패 {type(e).__name__}: {e}")
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


if __name__ == "__main__":
    main()
