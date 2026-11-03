"""AI 인프라 수요 자료 모으기 → docs/data/ai_infra.json  (AI 시장 탭 아래 'AI 인프라 수요' 카드, 2026-11-03 추가)

네 곳에서 따로 모으고, 한 곳이 실패해도 나머지는 갱신한다(실패한 곳은 지난 값 유지 + ok=false).
- 토큰 총량: OpenRouter 순위 화면이 쓰는 회사별 주간 합계(market-share, 최근 1년치).
  받은 값을 지난 기록에 덮어 합쳐서 1년이 넘어도 계속 쌓는다. 주는 월요일 00:00 UTC(09:00 KST)에 마감.
- 토큰 지출(추정): OpenRouter는 금액 합계를 공개하지 않는다. 그래서 모델별 주간 입력·출력·캐시 토큰에
  각 모델의 OpenRouter 정가를 곱해 더한 추정치다. 무료판(:free)은 0원. 마감된 주만 기록한다(2026-11-03부터 쌓임).
- 빅테크 설비투자: SEC EDGAR XBRL 현금흐름표 '유형자산 취득'(Amazon은 PaymentsToAcquireProductiveAssets).
  10-Q는 연초부터 누적값이라 앞 분기를 빼서 분기값을 만든다. 회계연도가 다른 MS·오라클은 분기 끝 날짜로 달력 분기에 맞춘다.
  SEC는 요청마다 연락처를 요구해서 환경변수 SEC_CONTACT(깃허브 비밀값)를 쓴다.
- GPU 임대료: Vast.ai 공개 마켓 검색(지금 빌릴 수 있는 매물의 GPU 1장당 시간당 값, GPU 수로 가중한 중앙값)과
  RunPod 공개 정가(시큐어·커뮤니티). 과거 이력은 공개되지 않아 매일 한 줄씩 쌓는다(2026-11-03부터).

python scripts/ai_infra.py            # 수집 + 저장
python scripts/ai_infra.py --dry-run  # 저장하지 않고 요약만 출력
"""
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "data" / "ai_infra.json"
UA = {"User-Agent": "Mozilla/5.0 (industry-strength ai_infra; +https://dhandori.github.io/industry-strength/)"}
KST = timezone(timedelta(hours=9))
OR_BASE = "https://openrouter.ai/api/frontend/v1/rankings/"


def get(url, headers=None, data=None, timeout=60):
    req = urllib.request.Request(url, headers=headers or UA, data=data)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def getj(url, **kw):
    return json.loads(get(url, **kw).decode("utf-8"))


def partial(week):
    """주 시작(월요일 00:00 UTC)부터 7일이 안 지난 주는 아직 진행 중"""
    return (datetime.now(timezone.utc).date() - date.fromisoformat(week)).days < 7


# ---------- 1) 토큰 총량: OpenRouter 주간 합계
def tokens(prev):
    ms = getj(OR_BASE + "market-share")["data"]
    hist = {h["week"]: h for h in (prev.get("weeks") or [])}
    for w in ms:
        hist[w["x"]] = {"week": w["x"], "total": int(sum(w["ys"].values())), "partial": partial(w["x"])}
    # 지난번엔 진행 중이었는데 이번 자료에서 빠진 주는 마감 여부만 다시 판정
    for h in hist.values():
        h["partial"] = partial(h["week"])
    weeks = [hist[k] for k in sorted(hist)]
    cum = 0
    for h in weeks:
        if not h["partial"]:
            cum += h["total"]
        h["cum"] = cum
    return {"weeks": weeks[-260:]}


# ---------- 2) 토큰 지출 추정: 모델별 주간 토큰 x OpenRouter 정가
def spend(prev, weeks):
    rows = getj(OR_BASE + "models?view=week")["data"]
    models = getj("https://openrouter.ai/api/v1/models")["data"]
    price = {}
    for m in sorted(models, key=lambda m: len(m.get("name") or "")):
        p = m.get("pricing") or {}
        rec = {"in": float(p.get("prompt") or 0), "out": float(p.get("completion") or 0),
               "cache": float(p.get("input_cache_read") or p.get("prompt") or 0),
               "name": (m.get("name") or m["id"]).split(": ", 1)[-1]}
        for k in (m.get("canonical_slug"), m["id"]):
            if k:
                price.setdefault(k, rec)
    tot_usd = tot_tok = paid_tok = unpriced_tok = 0
    by = {}
    for r in rows:
        slug = r["model_permaslug"]
        pin, pout = r.get("total_prompt_tokens") or 0, r.get("total_completion_tokens") or 0
        cached = min(r.get("total_native_tokens_cached") or 0, pin)
        tot_tok += pin + pout
        if r.get("variant") == "free" or slug.endswith(":free"):
            continue
        p = price.get(slug) or price.get(slug.rsplit("-", 1)[0])
        if p is None:
            unpriced_tok += pin + pout
            continue
        usd = (pin - cached) * p["in"] + cached * p["cache"] + pout * p["out"]
        paid_tok += pin + pout
        tot_usd += usd
        b = by.setdefault(slug, {"slug": slug, "name": p["name"], "usd": 0.0, "tokens": 0})
        b["usd"] += usd
        b["tokens"] += pin + pout
    # 이 묶음이 어느 주인지: 주간 합계와 가장 가까운 주(ai_market.py와 같은 방식)
    cands = [w for w in weeks if w["total"]]
    week = min(cands, key=lambda w: abs(w["total"] - tot_tok))["week"] if cands else None
    hist = {h["week"]: h for h in (prev.get("weeks") or [])}
    top = sorted(by.values(), key=lambda b: -b["usd"])[:10]
    rec = {"week": week, "usd": round(tot_usd), "tokens": tot_tok, "paid_tokens": paid_tok, "unpriced_tokens": unpriced_tok,
           "usd_per_m": round(tot_usd / paid_tok * 1e6, 3) if paid_tok else None,
           "top": [{**t, "usd": round(t["usd"])} for t in top]}
    # 'view=week'은 수집 시점부터 거꾸로 7일이라, 주가 막 끝난 월요일(UTC)에 받은 값이 그 주와 정확히 겹친다.
    # 다른 요일 값은 그 주를 아직 못 채웠을 때만 '근사'로 넣고, 월요일 값이 오면 덮어쓴다.
    if week and not partial(week):
        ended = date.fromisoformat(week) + timedelta(days=7)
        lag = (datetime.now(timezone.utc).date() - ended).days
        if lag == 0:
            hist[week] = rec
        elif lag <= 2 and (week not in hist or hist[week].get("approx")):
            hist[week] = {**rec, "approx": True}
    return {"weeks": [hist[k] for k in sorted(hist)][-260:], "latest_seen": rec}


# ---------- 3) 빅테크 설비투자: SEC XBRL
CAPEX = [  # (회사, CIK, 태그 후보) — 태그는 최신 값이 있는 쪽을 쓴다
    ("Microsoft", 789019, ("PaymentsToAcquirePropertyPlantAndEquipment",)),
    ("Alphabet", 1652044, ("PaymentsToAcquirePropertyPlantAndEquipment",)),
    ("Amazon", 1018724, ("PaymentsToAcquireProductiveAssets", "PaymentsToAcquirePropertyPlantAndEquipment")),
    ("Meta", 1326801, ("PaymentsToAcquirePropertyPlantAndEquipment",)),
    ("Oracle", 1341439, ("PaymentsToAcquirePropertyPlantAndEquipment",)),
]


def cal_q(end):
    """분기 끝 날짜 → 달력 분기. 45일을 빼서 판정하므로 오라클(8·11·2·5월 말)도 가장 가까운 달력 분기로 간다."""
    d = date.fromisoformat(end) - timedelta(days=45)
    return f"{d.year}Q{(d.month - 1) // 3 + 1}"


def quarterly(facts):
    """10-Q/10-K 사실(연초 누적 포함)에서 분기값을 만든다."""
    best = {}
    for f in facts:
        if f.get("form") not in ("10-Q", "10-K", "10-Q/A", "10-K/A") or not f.get("start"):
            continue
        k = (f["start"], f["end"])
        if k not in best or f["filed"] > best[k]["filed"]:
            best[k] = f
    dur = lambda f: (date.fromisoformat(f["end"]) - date.fromisoformat(f["start"])).days
    q = {}
    for f in best.values():                       # 분기값이 직접 있으면 그걸 쓴다
        if 80 <= dur(f) <= 100:
            q[f["end"]] = {"end": f["end"], "usd": f["val"], "filed": f["filed"], "how": "direct"}
    by_start = {}
    for f in best.values():
        by_start.setdefault(f["start"], []).append(f)
    for fs in by_start.values():                  # 같은 회계연도 누적값끼리 빼서 분기값
        fs.sort(key=lambda f: f["end"])
        for a, b in zip(fs, fs[1:]):
            if b["end"] not in q and 80 <= (date.fromisoformat(b["end"]) - date.fromisoformat(a["end"])).days <= 100:
                q[b["end"]] = {"end": b["end"], "usd": b["val"] - a["val"], "filed": b["filed"], "how": "ytd"}
    out = {}
    for v in sorted(q.values(), key=lambda v: v["end"]):
        if v["end"] >= "2019-02-01":
            out[cal_q(v["end"])] = v
    return out


def capex():
    contact = os.environ.get("SEC_CONTACT", "").strip()
    if not contact:
        raise RuntimeError("SEC_CONTACT 없음(깃허브 비밀값을 넣으면 자동 수집)")
    ua = {"User-Agent": f"industry-strength {contact}"}
    cos = {}
    for name, cik, tags in CAPEX:
        series = None
        for t in tags:
            try:
                d = getj(f"https://data.sec.gov/api/xbrl/companyconcept/CIK{cik:010d}/us-gaap/{t}.json", headers=ua)
            except Exception:  # noqa: BLE001
                continue
            s = quarterly(d["units"]["USD"])
            if s and (series is None or max(s) > max(series)):
                series = s
        if not series:
            raise RuntimeError(f"{name}: 설비투자 값을 못 읽음")
        cos[name] = {q: {"usd": v["usd"], "end": v["end"], "filed": v["filed"]} for q, v in series.items()}
    qs = sorted({q for s in cos.values() for q in s})
    total = []
    for q in qs:
        have = [n for n in cos if q in cos[n]]
        total.append({"q": q, "usd": sum(cos[n][q]["usd"] for n in have), "n": len(have), "missing": [n for n in cos if n not in have]})
    return {"companies": cos, "total": total}


# ---------- 4) GPU 임대료: Vast.ai 마켓 + RunPod 정가
GPUS = [  # (우리 이름, Vast gpu_name, Vast 최소 메모리 MB, RunPod id)
    ("A100", "A100 SXM4", 70000, "NVIDIA A100-SXM4-80GB"),
    ("H100", "H100 SXM", 0, "NVIDIA H100 80GB HBM3"),
    ("H200", "H200", 0, "NVIDIA H200"),
    ("B200", "B200", 0, "NVIDIA B200"),
    ("B300", "B300", 0, "NVIDIA B300 SXM6 AC"),
]


def wquant(pairs, q):
    """(값, 무게) 목록의 가중 분위수"""
    pairs = sorted(pairs)
    tot = sum(w for _, w in pairs)
    acc = 0
    for v, w in pairs:
        acc += w
        if acc >= q * tot:
            return v
    return pairs[-1][0]


def vast():
    out = {}
    for key, name, ram, _ in GPUS:
        q = {"gpu_name": {"eq": name}, "rentable": {"eq": True}, "type": "on-demand", "limit": 1000}
        if ram:
            q["gpu_ram"] = {"gte": ram}
        offers = getj("https://console.vast.ai/api/v0/bundles/?" + urllib.parse.urlencode({"q": json.dumps(q)}), timeout=60).get("offers") or []
        pairs = [(o["dph_total"] / o["num_gpus"], o["num_gpus"]) for o in offers if o.get("num_gpus") and o.get("dph_total")]
        if not pairs:
            out[key] = {"n": 0, "gpus": 0}
            continue
        out[key] = {"med": round(wquant(pairs, 0.5), 3), "p25": round(wquant(pairs, 0.25), 3), "p75": round(wquant(pairs, 0.75), 3),
                    "n": len(pairs), "gpus": sum(w for _, w in pairs)}
    return out


def runpod():
    body = json.dumps({"query": "query { gpuTypes { id securePrice communityPrice } }"}).encode()
    d = getj("https://api.runpod.io/graphql", headers={**UA, "Content-Type": "application/json"}, data=body)
    by = {g["id"]: g for g in d["data"]["gpuTypes"]}
    out = {}
    for key, _, _, rid in GPUS:
        g = by.get(rid) or {}
        out[key] = {"secure": g.get("securePrice") or None, "community": g.get("communityPrice") or None}
    return out


def gpu(prev, today):
    hist = {h["d"]: h for h in (prev.get("days") or [])}
    rec = dict(hist.get(today) or {"d": today})
    errs = []
    for k, fn in (("vast", vast), ("runpod", runpod)):
        try:
            rec[k] = fn()
        except Exception as e:  # noqa: BLE001
            errs.append(f"{k}: {type(e).__name__}")
    if "vast" not in rec and "runpod" not in rec:
        raise RuntimeError("; ".join(errs))
    hist[today] = rec
    return {"days": [hist[k] for k in sorted(hist)][-1100:], "errors": errs}


def main():
    dry = "--dry-run" in sys.argv
    prev = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    now = datetime.now(KST)
    data = {"updated_at": now.strftime("%Y-%m-%d %H:%M KST"), "sources": dict(prev.get("sources") or {})}

    def run(key, fn, *args):
        try:
            data[key] = fn(*args)
            data["sources"][key] = {"ok": True, "fetched_at": data["updated_at"]}
        except Exception as e:  # noqa: BLE001
            print(f"{key}: 실패 {type(e).__name__}: {e}")
            data[key] = prev.get(key)
            data["sources"][key] = {**(prev.get("sources", {}).get(key) or {}), "ok": False, "error": type(e).__name__}

    run("tokens", tokens, prev.get("tokens") or {})
    run("spend", spend, prev.get("spend") or {}, (data.get("tokens") or {}).get("weeks") or [])
    run("capex", capex)
    run("gpu", gpu, prev.get("gpu") or {}, now.strftime("%Y-%m-%d"))

    tw = [w for w in (data.get("tokens") or {}).get("weeks", []) if not w["partial"]]
    if tw:
        print(f"토큰: {len(tw)}주 · 지난주 {tw[-1]['week']} {tw[-1]['total'] / 1e12:.1f}조 · 누적 {tw[-1]["cum"] / 1e12:,.0f}조")
    sp = (data.get("spend") or {}).get("latest_seen") or {}
    print(f"지출 추정: {sp.get('week')} ${sp.get('usd', 0) / 1e6:.1f}M · 100만 토큰당 ${sp.get('usd_per_m')}")
    for t in ((data.get("capex") or {}).get("total") or [])[-4:]:
        print(f"설비투자 {t['q']}: ${t['usd'] / 1e9:.1f}B ({t['n']}개사)")
    gd = ((data.get("gpu") or {}).get("days") or [{}])[-1]
    print("GPU:", {k: v.get("med") for k, v in (gd.get("vast") or {}).items()}, gd.get("runpod"))
    if dry:
        return
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"저장: {OUT} ({OUT.stat().st_size // 1024}KB)")
    if not any(v.get("ok") for v in data["sources"].values()):
        sys.exit(1)


if __name__ == "__main__":
    main()
