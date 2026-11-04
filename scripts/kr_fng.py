"""한국 공포탐욕지수 → docs/data/kr_fng.json

CNN 공포탐욕지수(미국)의 7가지 재료를 한국 자료로 바꾸고, 한국에만 있는 '빚투 속도'를 더한 8가지로 만든다.
재료마다 오늘 값이 최근 2년(500거래일) 중 어디쯤인지 0~100점(높을수록 탐욕)으로 바꾸고, 점수를 평균한다.

  ① 주가 모멘텀   코스피 ÷ 125일 평균 − 1                    높을수록 탐욕     네이버 지수 일봉
  ② 신고가 vs 신저가  (52주 신고가 종목 − 신저가 종목) ÷ 전체   높을수록 탐욕     코스피 보통주 전 종목 일봉(네이버)
  ③ 시장 폭       오른 종목 거래대금 vs 내린 종목 거래대금의 맥클렐런 합산 지수(CNN과 같은 방식)  높을수록 탐욕
  ④ 레버리지 쏠림 레버리지 ETF 거래대금 ÷ (레버리지 + 인버스) — 5일 합   높을수록 탐욕  (미국 풋콜레이시오 대신, 한국 개인 투자자 쏠림)
  ⑤ 변동성        VKOSPI ÷ 50일 평균 − 1                     높을수록 공포     wamo_macro.json(한투) — 매일 쌓아 둔다
  ⑥ 안전자산 선호 코스피 20일 수익률 − 국고채10년 ETF 20일 수익률  높을수록 탐욕
  ⑦ 신용 위험     회사채 BBB- 금리 − AA- 금리(가산금리 차)      높을수록 공포     wamo_macro.json(한국은행 ECOS) — 매일 쌓아 둔다
  ⑧ 빚투 속도     신용융자 잔고 20거래일 증가율                 높을수록 탐욕     data/kr_credit.json(네이버 증시자금동향)

처음엔 2022년부터 전 종목을 받아 과거를 계산(수 분)하고, 그 뒤엔 최근 1년 남짓만 받아 최근 30거래일을 다시 계산해 붙인다.
us-econ.yml 이 매일 밤(한국 장 마감 뒤)·아침에 돌린다.
"""
import json
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "data" / "kr_fng.json"
KST = timezone(timedelta(hours=9))
UA = {"User-Agent": "Mozilla/5.0 (industry-strength-bot)"}
SISE = "https://api.finance.naver.com/siseJson.naver?symbol={}&requestType=1&startTime={}&endTime={}&timeframe=day"
LIST = "https://m.stock.naver.com/api/stocks/marketValue/KOSPI?page={}&pageSize=100"
WAMO = "https://dhandori.github.io/wamo-choochoo-dashboard/wamo_macro.json"
LEV, INV = "122630", ("252670", "114800")   # KODEX 레버리지 / KODEX 200선물인버스2X · KODEX 인버스
BOND = "148070"                              # KOSEF 국고채10년
WIN, MINW = 500, 120                          # 점수 기준 기간(거래일)·최소 기간
START = "20220101"

COMPS = [  # key, 이름, 높을수록 탐욕이면 +1
    ("mom", "주가 모멘텀", 1), ("str", "신고가 vs 신저가", 1), ("brd", "시장 폭(오른 종목 거래대금)", 1),
    ("lev", "레버리지 쏠림", 1), ("vol", "변동성(VKOSPI)", -1), ("safe", "주식 vs 국채", 1),
    ("junk", "신용 위험(BBB−AA 금리차)", -1), ("crd", "빚투 속도", 1),
]


def get(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                return r.read().decode("utf-8", "ignore")
        except Exception:  # noqa: BLE001
            time.sleep(2 * (i + 1))
    return None


def sise(code, start, end):
    """네이버 일봉 → [(날짜, 시, 고, 저, 종, 거래량)]"""
    txt = get(SISE.format(code, start, end))
    out = []
    if not txt:
        return out
    for line in txt.splitlines():
        line = line.strip().rstrip(",")
        if not line.startswith('["2'):
            continue
        try:
            a = json.loads(line.replace("'", '"'))
            d = f"{a[0][:4]}-{a[0][4:6]}-{a[0][6:8]}"
            out.append((d, float(a[1]), float(a[2]), float(a[3]), float(a[4]), float(a[5])))
        except (ValueError, IndexError):
            continue
    return out


def kospi_commons():
    """코스피 보통주 코드(ETF·ETN·우선주 제외)"""
    codes, p = [], 1
    while True:
        txt = get(LIST.format(p))
        if not txt:
            break
        st = json.loads(txt).get("stocks") or []
        if not st:
            break
        codes += [s["itemCode"] for s in st if s.get("stockEndType") == "stock" and s["itemCode"].endswith("0") and s["itemCode"].isdigit()]
        p += 1
        if p > 40:
            break
    return sorted(set(codes))


def breadth(codes, start, end):
    """날짜별 [52주 신고가 수, 신저가 수, 비교 가능 종목 수, 오른 종목 거래대금, 내린 종목 거래대금]"""
    agg = {}
    def one(c):
        rows = sise(c, start, end)
        res = []
        for i in range(1, len(rows)):
            d, o, h, l, cl, v = rows[i]
            pc = rows[i - 1][4]
            if not pc or not cl:
                continue
            val = cl * v
            up = cl > pc
            dn = cl < pc
            hi = lo = None
            if i >= 250 and l > 0:
                win = [r for r in rows[i - 250:i] if r[3] > 0]   # 거래정지(0원) 날은 뺀다
                if len(win) >= 200:
                    hi = h > max(r[2] for r in win)
                    lo = l < min(r[3] for r in win)
            res.append((d, hi, lo, up, dn, val))
        return res
    with ThreadPoolExecutor(8) as ex:
        for res in ex.map(one, codes):
            for d, hi, lo, up, dn, val in res:
                a = agg.setdefault(d, [0, 0, 0, 0.0, 0.0])
                if hi is not None:
                    a[2] += 1
                    a[0] += hi
                    a[1] += lo
                if up:
                    a[3] += val
                elif dn:
                    a[4] += val
    return agg


def ema(v, n):
    k, out, e = 2 / (n + 1), [], None
    for x in v:
        e = x if e is None else e + k * (x - e)
        out.append(e)
    return out


def pct_score(vals, sign):
    """각 날짜 값의 최근 WIN 거래일 중 백분위 → 0~100 (sign=-1이면 뒤집기)"""
    out = []
    for i, v in enumerate(vals):
        if v is None:
            out.append(None)
            continue
        w = [x for x in vals[max(0, i - WIN + 1):i + 1] if x is not None]
        if len(w) < MINW:
            out.append(None)
            continue
        p = (sum(1 for x in w if x < v) + 0.5 * sum(1 for x in w if x == v)) / len(w) * 100
        out.append(round(p if sign > 0 else 100 - p, 1))
    return out


def main():
    old = json.loads(OUT.read_text()) if OUT.exists() else {}
    today = date.today()
    end = today.strftime("%Y%m%d")
    first = not old.get("breadth")
    start = START if first else (today - timedelta(days=430)).strftime("%Y%m%d")

    codes = kospi_commons()
    if len(codes) < 600:
        print(f"종목 목록이 이상해서 건너뜀({len(codes)}개)")
        return
    br = dict((r[0], r[1:]) for r in old.get("breadth", []))
    new = breadth(codes, start, end)
    keep = sorted(new)[-30:] if not first else sorted(new)
    for d in keep:
        if new[d][2] >= 300 or first:   # 비교 가능 종목이 너무 적은 날(자료 앞부분)은 신고가 계산 안 됨
            br[d] = [new[d][0], new[d][1], new[d][2], round(new[d][3] / 1e8), round(new[d][4] / 1e8)]

    # 지수·ETF
    ks = sise("KOSPI", START, end)
    px = {c: {r[0]: r for r in sise(c, START, end)} for c in (LEV, *INV, BOND)}
    # wamo: VKOSPI·회사채 가산금리 (2년치만 오므로 매일 쌓아 둔다)
    vk, jk = dict(old.get("vkospi", [])), dict(old.get("junk", []))
    try:
        wm = json.loads(get(WAMO) or "{}")
        ind = {r["key"]: r for r in wm.get("indicators", [])}
        for d, v in (ind.get("vkospi") or {}).get("series") or []:
            vk[d] = v
        aa = dict((ind.get("kr_aa") or {}).get("series") or [])
        for d, v in (ind.get("kr_bbb") or {}).get("series") or []:
            if d in aa:
                jk[d] = round(v - aa[d], 1)
    except Exception as e:  # noqa: BLE001
        print("wamo 자료 실패:", e)
    # 빚투
    crd = {}
    try:
        kc = json.loads((ROOT / "docs/data/kr_credit.json").read_text())
        crd = {r[0]: r[1] for r in kc.get("series", [])}
    except Exception:  # noqa: BLE001
        pass

    dates = [r[0] for r in ks]
    close = [r[4] for r in ks]
    n = len(dates)
    raw = {k: [None] * n for k, _, _ in COMPS}
    ma125 = [None if i < 124 else sum(close[i - 124:i + 1]) / 125 for i in range(n)]
    # ③ 맥클렐런: 오른 종목 거래대금 비율 → 19·39일 지수이동평균 차이 → 누적
    ra = []
    for d in dates:
        b = br.get(d)
        ra.append(((b[3] - b[4]) / (b[3] + b[4]) * 1000) if b and (b[3] + b[4]) else 0.0)
    osc = [a - b for a, b in zip(ema(ra, 19), ema(ra, 39))]
    summ, s = [], 0.0
    for o in osc:
        s += o
        summ.append(s)
    # VKOSPI·회사채 금리차·신용융자는 하루이틀 늦게 나온다 → 최근 5거래일 안의 마지막 값을 이어 쓴다
    def ffill(m):
        out, last, age = [], None, 99
        for d in dates:
            if d in m:
                last, age = m[d], 0
            else:
                age += 1
            out.append(last if age <= 5 else None)
        return out
    vkd = ffill(vk)
    jkd = ffill(jk)
    cl_dates = sorted(crd)
    for i, d in enumerate(dates):
        if ma125[i]:
            raw["mom"][i] = round((close[i] / ma125[i] - 1) * 100, 2)
        b = br.get(d)
        if b and b[2] >= 300:
            raw["str"][i] = round((b[0] - b[1]) / b[2] * 100, 2)
        if b and i >= 60:
            raw["brd"][i] = round(summ[i], 1)
        # ④ 5일 거래대금 합
        lv = iv = 0.0
        for j in range(max(0, i - 4), i + 1):
            dd = dates[j]
            r = px[LEV].get(dd)
            lv += r[4] * r[5] if r else 0
            for c in INV:
                r = px[c].get(dd)
                iv += r[4] * r[5] if r else 0
        if lv + iv:
            raw["lev"][i] = round(lv / (lv + iv) * 100, 2)
        # ⑤ VKOSPI ÷ 50일 평균
        w = [x for x in vkd[max(0, i - 49):i + 1] if x is not None]
        if vkd[i] is not None and len(w) >= 40:
            raw["vol"][i] = round((vkd[i] / (sum(w) / len(w)) - 1) * 100, 2)
        # ⑥ 20일 수익률 차이
        if i >= 20:
            b0, b1 = px[BOND].get(dates[i - 20]), px[BOND].get(d)
            if b0 and b1:
                raw["safe"][i] = round(((close[i] / close[i - 20]) - (b1[4] / b0[4])) * 100, 2)
        if jkd[i] is not None:
            raw["junk"][i] = jkd[i]
        # ⑧ 신용융자 20거래일 증가율
        dc = d if d in crd else next((x for x in reversed(cl_dates) if x <= d), None)
        if dc and (datetime.fromisoformat(d) - datetime.fromisoformat(dc)).days <= 7:
            k = cl_dates.index(dc)
            if k >= 20 and crd[cl_dates[k - 20]]:
                raw["crd"][i] = round((crd[dc] / crd[cl_dates[k - 20]] - 1) * 100, 2)
    score = {k: pct_score(raw[k], sg) for k, _, sg in COMPS}
    total = []
    for i in range(n):
        s = [score[k][i] for k, _, _ in COMPS if score[k][i] is not None]
        total.append(round(sum(s) / len(s), 1) if len(s) >= 5 else None)
    i0 = next((i for i, t in enumerate(total) if t is not None), n)
    data = {"_note": "한국 공포탐욕지수(CNN 방식 한국판). scripts/kr_fng.py", "updated_at": datetime.now(KST).strftime("%Y-%m-%d %H:%M KST"),
            "comps": [{"key": k, "name": nm, "sign": sg} for k, nm, sg in COMPS], "win": WIN,
            "dates": dates[i0:], "kospi": [round(c, 2) for c in close[i0:]], "total": total[i0:],
            "raw": {k: raw[k][i0:] for k in raw}, "score": {k: score[k][i0:] for k in score},
            "breadth": sorted([d, *v] for d, v in br.items()), "vkospi": sorted([d, v] for d, v in vk.items()), "junk": sorted([d, v] for d, v in jk.items())}
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    last = len(data["dates"]) - 1
    if last >= 0:
        parts = " · ".join(f"{nm} {data['score'][k][last]}" for k, nm, _ in COMPS)
        print(f"한국 공포탐욕 {data['dates'][last]}: {data['total'][last]} ({parts}) · {data['dates'][0]}부터 {len(data['dates'])}일 · 종목 {len(codes)}개")


if __name__ == "__main__":
    main()
