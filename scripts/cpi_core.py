"""근원 CPI 분석 (2026-11-11 사용자 요청: CPI가 나오면 근원 위주로 어디가 문제였고 지속될 이슈인지 점검).

us_econ.py 가 부른다: analyze(fred) → us_econ.json 의 "cpi_core".
모두 FRED 공개 CSV(계절조정 지수)로 계산한다. 전월 대비는 BLS 발표와 같은 계절조정 기준이라 발표 수치와 맞는다(반올림 차이 ±0.1).

1) 공식 수치: 헤드라인·근원 전월 대비(%). 2025년 10월처럼 1년 전 자료가 없을 때도 전월 대비는 늘 공식으로 나온다.
2) 어디가 문제였나: 세부 항목마다 이번 달 전월 대비를 '평소'(직전 12개월 전월 대비의 중앙값)와 비교해 많이 벗어난 항목을 고른다.
3) 지속될까: 연준이 보는 지속성 지표로 점검 — 근원 0.3% 이상 연속 개월, 3·6개월 연율 가속, 경직 물가(애틀랜타 연준),
   중위·절사평균 CPI(클리블랜드 연준), 주거 뺀 서비스, 오름 폭이 평소보다 큰 항목의 비율, 변동성 큰 항목 쏠림.
   지속 신호 수로 '지속될 위험 큼 / 지켜봐야 함 / 일시적일 가능성'을 정한다.
"""
from __future__ import annotations

import statistics

# (키, 이름, FRED 계절조정 지수, 묶음, 변동성 큰 항목인지)
ITEMS = [
    ("core", "근원 CPI(식품·에너지 제외)", "CPILFESL", "core", False),
    ("core_svc", "근원 서비스", "CUSR0000SASLE", "svc", False),
    ("shelter", "주거비", "CUSR0000SAH1", "svc", False),
    ("oer", "자가주거비(OER)", "CUSR0000SEHC", "svc", False),
    ("rent", "월세", "CUSR0000SEHA", "svc", False),
    ("svc_x_shelter", "주거 뺀 서비스", "CUSR0000SASL2RS", "svc", False),
    ("med_svc", "의료 서비스", "CUSR0000SAM2", "svc", False),
    ("trans_svc", "운송 서비스(자동차 보험·정비 포함)", "CUSR0000SAS4", "svc", False),
    ("airfare", "항공료", "CUSR0000SETG01", "svc", True),
    ("recreation", "오락", "CPIRECSL", "svc", False),
    ("core_goods", "근원 상품", "CUSR0000SACL1E", "goods", False),
    ("new_car", "신차", "CUSR0000SETA01", "goods", False),
    ("used_car", "중고차", "CUSR0000SETA02", "goods", True),
    ("apparel", "의류", "CPIAPPSL", "goods", True),
]
HEAD = ("headline", "헤드라인 CPI", "CPIAUCSL")
# 연준 지속성 지표: (키, 이름, 1개월 연율 시리즈, 전년 대비 시리즈)
FED = [
    ("sticky", "경직 물가 근원(애틀랜타 연준)", "CORESTICKM158SFRBATL", "CORESTICKM159SFRBATL"),
    ("sticky_xs", "경직 물가 근원·주거 제외", "STICKCPIXSHLTRM158SFRBATL", "STICKCPIXSHLTRM159SFRBATL"),
    ("median", "중위 CPI(클리블랜드 연준)", "MEDCPIM158SFRBCLE", "MEDCPIM159SFRBCLE"),
    ("trimmed", "절사평균 CPI(클리블랜드 연준)", "TRMMEANCPIM158SFRBCLE", "TRMMEANCPIM159SFRBCLE"),
]


def _mk(d, k):
    y, m = int(d[:4]), int(d[5:7]) + k
    y, m = y + (m - 1) // 12, (m - 1) % 12 + 1
    return f"{y:04d}-{m:02d}-01"


def mom(s):
    """[(날짜, 지수)] → {날짜: 전월 대비 %}. 앞 달이 비어 있으면(2025년 10월 같은) 그 달은 계산하지 않는다."""
    m = dict(s)
    return {d: (v / m[_mk(d, -1)] - 1) * 100 for d, v in s if m.get(_mk(d, -1))}


def ann(s, n, at=None):
    """n개월 연율(%). at 이 없으면 최신 달."""
    m = dict(s)
    at = at or s[-1][0]
    a, b = m.get(at), m.get(_mk(at, -n))
    return None if not a or not b else ((a / b) ** (12 / n) - 1) * 100


def r1(x):
    return None if x is None else round(x, 1)


def r2(x):
    return None if x is None else round(x, 2)


def analyze(fred):
    raw = {}
    for _, _, sid, *_ in ITEMS[1:]:   # 세부 항목 하나가 막혀도 나머지로 분석한다(빠진 항목은 missing 으로 남는다)
        try:
            raw[sid] = fred(sid)
        except Exception:  # noqa: BLE001
            raw[sid] = []
    raw["CPILFESL"] = fred("CPILFESL")   # 근원·헤드라인은 꼭 있어야 한다
    raw[HEAD[2]] = fred(HEAD[2])
    core = raw["CPILFESL"]
    last = core[-1][0]
    months = [_mk(last, -k) for k in range(5, -1, -1)]   # 최근 6개월

    rows = []
    for key, name, sid, grp, vol in ITEMS:
        s = raw[sid]
        if not s or s[-1][0] != last:   # 이번 달 값이 아직 없는 항목은 건너뛰고 기록
            rows.append({"key": key, "name": name, "group": grp, "missing": True})
            continue
        mm = mom(s)
        prior = [mm[_mk(last, -k)] for k in range(1, 13) if _mk(last, -k) in mm]
        norm = statistics.median(prior) if prior else None
        now = mm.get(last)
        rows.append({
            "key": key, "name": name, "group": grp, "volatile": vol,
            "mom": [r2(mm.get(d)) for d in months],
            "now": r2(now), "norm": r2(norm),
            "excess": r2(None if now is None or norm is None else now - norm),
            "ann3": r1(ann(s, 3)), "ann6": r1(ann(s, 6)), "ann12": r1(ann(s, 12)),
            # 평소보다 빠른지: 이번 달이 직전 12개월 중앙값보다 0.1%p 넘게 높으면
            "hot": now is not None and norm is not None and now - norm > 0.1,
        })

    hm = mom(raw["CPIAUCSL"])
    cm = mom(core)
    official = {
        "date": last,
        "headline_mom": r1(hm.get(last)), "headline_prev": r1(hm.get(_mk(last, -1))),
        "core_mom": r1(cm.get(last)), "core_prev": r1(cm.get(_mk(last, -1))),
        "core_ann3": r1(ann(core, 3)), "core_ann6": r1(ann(core, 6)),
        "headline_ann3": r1(ann(raw["CPIAUCSL"], 3)),
    }

    fed = []
    for key, name, s1, s12 in FED:
        try:
            a, y = fred(s1), fred(s12)
        except Exception:  # noqa: BLE001  연준 지표 하나가 막혀도 나머지는 계속
            continue
        if not a or a[-1][0] != last:
            fed.append({"key": key, "name": name, "missing": True})
            continue
        last3 = [v for _, v in a[-3:]]
        fed.append({"key": key, "name": name, "m1": r1(a[-1][1]), "m3": r1(sum(last3) / len(last3)),
                    "yoy": r1(y[-1][1]) if y and y[-1][0] == last else None})

    # ---------- 어디가 문제였나: 근원 아래 항목 중 평소보다 많이 오른 순(근원·근원 서비스·근원 상품 같은 묶음 자체는 빼고)
    leaf = [r for r in rows if not r.get("missing") and r["key"] not in ("core", "core_svc", "core_goods") and r["excess"] is not None]
    drivers = sorted([r for r in leaf if r["excess"] > 0.1], key=lambda r: -r["excess"])[:4]
    easing = sorted([r for r in leaf if r["excess"] < -0.1], key=lambda r: r["excess"])[:3]

    # ---------- 지속될까
    by = {r["key"]: r for r in rows}
    fb = {f["key"]: f for f in fed}
    streak = 0
    for d in reversed(sorted(cm)):
        if round(cm[d], 1) >= 0.3:
            streak += 1
        else:
            break
    checks = []

    def chk(t, on, v, why):
        checks.append({"t": t, "on": bool(on), "v": v, "why": why})

    c3, c6 = official["core_ann3"], official["core_ann6"]
    chk("근원이 3개월 이상 연속 0.3% 넘게 올랐다", streak >= 3, f"{streak}개월 연속", "한 달은 우연일 수 있지만 석 달 연속이면 추세로 봐요. 0.3%를 1년 내내 이어 가면 연 3.7%예요.")
    chk("근원 3개월 연율이 6개월 연율보다 높다(가속)", c3 is not None and c6 is not None and c3 > c6 + 0.2, f"3개월 {c3}% · 6개월 {c6}%", "최근 석 달 속도가 반년 속도보다 빠르면 물가가 다시 빨라지는 중이에요.")
    sx = by.get("svc_x_shelter", {})
    chk("주거 뺀 서비스가 연 3.5% 넘게 오른다", (sx.get("ann3") or 0) > 3.5, f"3개월 연율 {sx.get('ann3')}%", "임금과 가장 가깝게 움직이는 항목이라 연준이 가장 끈질긴 물가로 봐요.")
    st = fb.get("sticky", {})
    chk("경직 물가가 전년 대비보다 빠르게 오른다", st.get("m3") is not None and st.get("yoy") is not None and st["m3"] > st["yoy"] + 0.3,
        f"최근 3개월 연율 {st.get('m3')}% · 전년 대비 {st.get('yoy')}%", "가격을 자주 안 바꾸는 품목(보험·학비·병원비 등)이 오르면 한번 오른 값이 오래가요.")
    md = fb.get("median", {})
    chk("중위 CPI가 연 3%를 넘는다", (md.get("m3") or 0) > 3.0, f"최근 3개월 연율 {md.get('m3')}%", "가운데 품목의 오름폭이라 일부 품목이 튄 것인지, 전체가 오르는 것인지 가려 줘요.")
    hot_share = round(sum(1 for r in leaf if r["hot"]) / len(leaf) * 100) if leaf else 0
    chk("평소보다 빨리 오른 항목이 절반을 넘는다(확산)", hot_share > 50, f"{hot_share}%", "많은 항목이 동시에 빨라지면 특정 품목 문제가 아니라 전반적인 물가 압력이에요.")
    vol_drv = [r for r in drivers if r["volatile"]]
    chk("오름을 이끈 항목이 변동성 큰 품목(항공료·중고차·의류)이 아니다", drivers and not vol_drv,
        ", ".join(r["name"] for r in drivers) or "없음", "튀기 쉬운 품목이 이끈 오름은 다음 달 되돌려지는 경우가 많아요.")
    score = sum(1 for c in checks if c["on"])
    verdict = ("지속될 위험 큼", "hi") if score >= 5 else ("지켜봐야 함", "mid") if score >= 3 else ("일시적일 가능성", "lo")

    # ---------- 한 줄 해설(화면용 문장)
    lines = []
    if official["core_mom"] is not None:
        lines.append(f"근원 CPI는 전월보다 {official['core_mom']:+.1f}% 올랐어요(직전 달 {official['core_prev']:+.1f}%). "
                     f"이 속도를 1년 이어 가면 연 {c3}%(최근 3개월 기준)예요.")
    if drivers:
        lines.append("평소보다 많이 오른 항목은 " + ", ".join(f"{r['name']} {r['now']:+.2f}%(평소 {r['norm']:+.2f}%)" for r in drivers) + "였어요.")
    if easing:
        lines.append("반대로 평소보다 덜 올라 물가를 누른 항목도 있어요. " + ", ".join(f"{r['name']} {r['now']:+.2f}%(평소 {r['norm']:+.2f}%)" for r in easing) + "예요.")
    sh = by.get("shelter", {})
    if sh.get("ann3") is not None:
        lines.append(f"주거비는 3개월 연율 {sh['ann3']}%로 6개월 연율 {sh['ann6']}%보다 {'빨라졌어요' if sh['ann3'] > sh['ann6'] + 0.2 else '느려졌어요' if sh['ann3'] < sh['ann6'] - 0.2 else '비슷해요'}.")
    lines.append(f"지속성 점검 {len(checks)}가지 중 {score}가지가 '오래간다' 쪽이라 '{verdict[0]}'으로 봐요.")

    return {"date": last, "months": months, "official": official, "rows": rows, "fed": fed,
            "drivers": [r["key"] for r in drivers], "easing": [r["key"] for r in easing],
            "checks": checks, "score": score, "verdict": verdict[0], "level": verdict[1], "lines": lines, "streak": streak}
