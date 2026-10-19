"""네이버 증권 '업종별 시세'를 받아 업종 탐색용 데이터를 만든다.

- 업종 목록: https://finance.naver.com/sise/sise_group.naver?type=upjong
- 업종별 종목: https://finance.naver.com/sise/sise_group_detail.naver?type=upjong&no=<번호>

1일 등락률은 네이버가 보여주는 값을 그대로 쓴다. 5·20·60일은 매일 저장한 종목별 하루 등락률
(data/naver/<날짜>.json)을 이어 곱해서 계산하므로, 기록이 그 일수만큼 쌓여야 표시된다.

결과: docs/data/KR_naver.json
"""
from __future__ import annotations

import json
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KST = timezone(timedelta(hours=9))
BASE = "https://finance.naver.com"
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      "Referer": "https://finance.naver.com/sise/"}
SNAP_DIR = ROOT / "data/naver"
OUT = ROOT / "docs/data/KR_naver.json"
PERIODS = {"ret5": 5, "ret20": 20, "ret60": 60}

# 네이버 업종 이름 → 큰 섹터 (앞에서부터 먼저 맞는 규칙을 쓴다)
SECTOR_RULES = [
    ("유틸리티", ["유틸리티"]),
    ("반도체", ["반도체"]),
    ("2차전지·전기장비", ["전기제품", "전기장비"]),
    ("디스플레이·전자부품", ["디스플레이", "전자장비", "전자제품", "전자부품", "사무용전자"]),
    ("IT하드웨어·통신장비", ["핸드폰", "통신장비", "컴퓨터"]),
    ("통신서비스", ["통신서비스"]),
    ("소프트웨어·IT서비스", ["소프트웨어", "IT서비스"]),
    ("인터넷·게임", ["게임", "양방향미디어", "인터넷"]),
    ("미디어·엔터", ["방송", "엔터테인먼트", "광고", "출판"]),
    ("화학", ["화학"]),
    ("철강·비철금속", ["철강", "비철금속"]),
    ("정유·에너지", ["석유", "가스", "에너지"]),
    ("제약", ["제약"]),
    ("바이오", ["생물공학", "생명과학"]),
    ("의료기기·헬스케어서비스", ["건강관리"]),
    ("자동차·부품", ["자동차", "타이어"]),
    ("조선", ["조선"]),
    ("방산·우주항공", ["우주", "국방"]),
    ("기계", ["기계"]),
    ("건설·건자재", ["건설", "건축"]),
    ("해운·항공·물류", ["해운", "항공사", "항공화물", "도로와철도", "운송인프라"]),
    ("은행", ["은행"]),
    ("증권·창투", ["증권", "창업투자"]),
    ("보험·카드·기타금융", ["보험", "카드", "기타금융"]),
    ("화장품", ["화장품"]),
    ("음식료·담배", ["식품", "음료", "담배"]),
    ("유통·레저·교육", ["백화점", "판매업체", "소매", "호텔", "레저", "교육", "다각화된소비자"]),
    ("의류·생활용품", ["섬유", "의류", "가정용", "생활용품", "가구"]),
    ("종이·포장", ["종이", "포장"]),
    ("지주·상사·서비스", ["복합기업", "무역회사", "상업서비스", "전문서비스"]),
    ("부동산", ["부동산"]),
]


def log(*a):
    print("[naver]", *a, flush=True)


def sector_of(name: str) -> str:
    for sec, keys in SECTOR_RULES:
        if any(k in name for k in keys):
            return sec
    return "기타"


def num(s: str) -> float | None:
    s = re.sub(r"<[^>]+>", "", s or "")
    s = unescape(s).replace(",", "").replace("%", "").strip()
    m = re.search(r"[+\-]?\d+(?:\.\d+)?", s)
    return float(m.group()) if m else None


def get(url: str) -> str:
    import requests

    last = None
    for i in range(3):
        try:
            r = requests.get(url, headers=UA, timeout=20)
            r.raise_for_status()
            return r.content.decode("euc-kr", errors="replace")
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2 + i * 2)
    raise RuntimeError(f"{url} 실패: {last}")


def parse_list(html: str) -> list[dict]:
    """업종 목록 표: 업종명, 번호, 등락률."""
    out = []
    for row in re.split(r"<tr[\s>]", html):
        m = re.search(r"sise_group_detail\.naver\?type=upjong&(?:amp;)?no=(\d+)[^>]*>\s*([^<]+?)\s*</a>", row)
        if not m:
            continue
        tds = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
        rate = None
        for td in tds[1:]:
            if "%" in td:
                rate = num(td)
                break
        out.append({"no": m.group(1), "name": unescape(m.group(2)).strip(), "rate": rate})
    return out


def parse_detail(html: str) -> list[dict]:
    """업종 상세 표: 종목명·코드, 현재가, 등락률, 거래대금(백만 원)."""
    out = []
    for row in re.split(r"<tr[\s>]", html):
        m = re.search(r"/item/main\.naver\?code=(\d{6})[^>]*>\s*([^<]+?)\s*</a>", row)
        if not m:
            continue
        tds = [td for td in re.findall(r"<td[^>]*class=\"[^\"]*number[^\"]*\"[^>]*>(.*?)</td>", row, re.S)]
        if len(tds) < 3:
            continue
        rate = None
        for td in tds[1:4]:
            if "%" in td:
                rate = num(td)
                break
        value = num(tds[6]) if len(tds) > 6 else None   # 거래대금(백만)
        out.append({"code": m.group(1), "name": unescape(m.group(2)).strip(),
                    "close": num(tds[0]), "chg1": rate, "value_mil": value})
    return out


def basis_date() -> str | None:
    """이 판의 한국 기준일(코스피200 ETF 마지막 거래일)을 네이버 자료의 날짜로 쓴다."""
    try:
        d = json.loads((ROOT / "docs/data/KR.json").read_text(encoding="utf-8"))
        return d.get("basis_date")
    except Exception:  # noqa: BLE001
        return None


def in_session(now: datetime) -> bool:
    return now.weekday() < 5 and (9, 0) <= (now.hour, now.minute) < (15, 45)


def trading_dates() -> list[str]:
    try:
        d = json.loads((ROOT / "docs/data/KR.json").read_text(encoding="utf-8"))
        return d["history"]["dates"]
    except Exception:  # noqa: BLE001
        return []


def main():
    now = datetime.now(KST)
    if in_session(now) and "--force" not in sys.argv:
        log("한국장 진행 중이라 이번에는 수집하지 않음(장중 값 저장 방지)")
        return
    bdate = basis_date()
    status = {"updated_at": now.strftime("%Y-%m-%d %H:%M KST"), "basis_date": bdate, "ok": False}
    try:
        lst = parse_list(get(f"{BASE}/sise/sise_group.naver?type=upjong"))
    except Exception as e:  # noqa: BLE001
        status["error"] = str(e)[:300]
        log("업종 목록 실패", e)
        write_status_only(status)
        return
    log("업종", len(lst))
    if len(lst) < 30:
        status["error"] = f"업종 수가 너무 적음({len(lst)})"
        write_status_only(status)
        return
    inds = []
    for k, u in enumerate(lst):
        try:
            stocks = parse_detail(get(f"{BASE}/sise/sise_group_detail.naver?type=upjong&no={u['no']}"))
        except Exception as e:  # noqa: BLE001
            log("상세 실패", u["name"], e)
            stocks = []
        inds.append({**u, "sector": sector_of(u["name"]), "stocks": stocks})
        time.sleep(0.25)
    n_stocks = sum(len(i["stocks"]) for i in inds)
    log("종목", n_stocks)
    if n_stocks < 500:
        status["error"] = f"종목 수가 너무 적음({n_stocks})"
        write_status_only(status)
        return

    # 일별 기록 저장 (종목코드 → 하루 등락률, 업종 등락률)
    SNAP_DIR.mkdir(parents=True, exist_ok=True)
    if bdate:
        snap = {"date": bdate, "stocks": {}, "industries": {i["no"]: i["rate"] for i in inds}}
        for i in inds:
            for s in i["stocks"]:
                snap["stocks"][s["code"]] = s["chg1"]
        (SNAP_DIR / f"{bdate}.json").write_text(json.dumps(snap, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    # 오래된 기록 정리(90개 남김)
    files = sorted(SNAP_DIR.glob("*.json"))
    for f in files[:-90]:
        f.unlink()

    # 여러 날 누적 등락률
    tdates = trading_dates()
    snaps = {}
    for f in sorted(SNAP_DIR.glob("*.json")):
        try:
            sj = json.loads(f.read_text(encoding="utf-8"))
            snaps[sj["date"]] = sj
        except Exception:  # noqa: BLE001
            pass
    avail = {}
    for key, n in PERIODS.items():
        need = tdates[-n:] if len(tdates) >= n else []
        if need and all(d in snaps for d in need):
            avail[key] = need
    for i in inds:
        for s in i["stocks"]:
            for key, days in avail.items():
                acc, ok = 1.0, True
                for d in days:
                    v = snaps[d]["stocks"].get(s["code"])
                    if v is None:
                        ok = False
                        break
                    acc *= 1 + v / 100
                s[key] = round((acc - 1) * 100, 2) if ok else None

    have_days = sum(1 for d in tdates if d in snaps)
    out = {
        "source": "네이버 증권 업종별 시세",
        "source_url": f"{BASE}/sise/sise_group.naver?type=upjong",
        "updated_at": status["updated_at"], "basis_date": bdate,
        "periods_available": ["chg1"] + list(avail),
        "days_recorded": have_days,
        "n_industries": len(inds), "n_stocks": n_stocks,
        "industries": [{"no": i["no"], "name": i["name"], "sector": i["sector"], "rate": i["rate"],
                        "url": f"{BASE}/sise/sise_group_detail.naver?type=upjong&no={i['no']}",
                        "stocks": i["stocks"]} for i in inds],
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log("완료", bdate, "업종", len(inds), "종목", n_stocks, "누적 가능 기간", list(avail), "기록일수", have_days)


def write_status_only(status: dict):
    """실패 시 이전 화면 데이터는 그대로 두고 상태만 남긴다."""
    try:
        prev = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    except Exception:  # noqa: BLE001
        prev = {}
    prev["last_error"] = status
    OUT.write_text(json.dumps(prev, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
