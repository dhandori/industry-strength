"""네이버 증권 업종별 등락률만 가볍게 받아 업종 탐색의 '네이버 업종' 보기를 만든다.

- 출처: 네이버 증권 모바일 업종 목록(JSON) — 업종 이름, 등락률, 상승·하락·보합 종목 수
- 종목 단위 자료는 받지 않는다. 업종마다 네이버 업종 화면 링크를 달아 자세한 종목은 거기서 본다.
- 5·20·60일은 매일 저장한 업종 하루 등락률(data/naver/<날짜>.json)을 이어 곱해서 계산한다.

결과: docs/data/KR_naver.json
"""
from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KST = timezone(timedelta(hours=9))
API = "https://m.stock.naver.com/api/stocks/industry"
PAGE_URL = "https://finance.naver.com/sise/sise_group_detail.naver?type=upjong&no={no}"
LIST_URL = "https://finance.naver.com/sise/sise_group.naver?type=upjong"
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"}
SNAP_DIR = ROOT / "data/naver"
OUT = ROOT / "docs/data/KR_naver.json"
PERIODS = {"ret5": 5, "ret20": 20, "ret60": 60}

# 네이버 업종 이름 → 큰 섹터 (앞에서부터 먼저 맞는 규칙)
SECTOR_RULES = [
    ("유틸리티", ["유틸리티"]),
    ("반도체", ["반도체"]),
    ("2차전지·전기장비", ["전기제품", "전기장비"]),
    ("디스플레이·전자부품", ["디스플레이", "전자장비", "전자제품", "전자부품", "사무용전자"]),
    ("IT하드웨어·통신장비", ["핸드폰", "핸드셋", "통신장비", "컴퓨터"]),
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
    ("의류·생활용품", ["섬유", "의류", "가정용", "생활용품", "가구", "문구"]),
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


def fnum(v):
    try:
        return float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return None


def fetch_groups() -> list[dict]:
    """업종 목록 전체. 한 번에 다 오지 않으면 페이지를 넘겨 받는다."""
    import requests

    seen, out = set(), []
    for page in range(1, 11):
        r = requests.get(API, params={"page": page, "pageSize": 100}, headers=UA, timeout=20)
        if page > 1 and r.status_code == 404:   # 마지막 페이지를 넘으면 404
            break
        r.raise_for_status()
        groups = r.json().get("groups") or []
        new = [g for g in groups if g.get("no") not in seen]
        if not new:
            break
        for g in new:
            seen.add(g.get("no"))
            out.append(g)
        time.sleep(0.3)
    return out


def trading_dates() -> tuple[str | None, list[str]]:
    try:
        d = json.loads((ROOT / "docs/data/KR.json").read_text(encoding="utf-8"))
        return d.get("basis_date"), d["history"]["dates"]
    except Exception:  # noqa: BLE001
        return None, []


def main():
    now = datetime.now(KST)
    if now.weekday() < 5 and (9, 0) <= (now.hour, now.minute) < (15, 45) and "--force" not in sys.argv:
        log("한국장 진행 중이라 이번에는 받지 않음(장중 값 저장 방지)")
        return
    bdate, tdates = trading_dates()
    try:
        groups = fetch_groups()
    except Exception as e:  # noqa: BLE001
        log("업종 목록 실패", e)
        return keep_previous(f"업종 목록 실패: {str(e)[:200]}", now)
    if len(groups) < 30:
        return keep_previous(f"업종 수가 너무 적음({len(groups)})", now)

    SNAP_DIR.mkdir(parents=True, exist_ok=True)
    if bdate:
        snap = {"date": bdate, "rates": {str(g["no"]): fnum(g.get("changeRate")) for g in groups}}
        (SNAP_DIR / f"{bdate}.json").write_text(json.dumps(snap, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for f in sorted(SNAP_DIR.glob("*.json"))[:-90]:
        f.unlink()
    snaps = {}
    for f in SNAP_DIR.glob("*.json"):
        try:
            sj = json.loads(f.read_text(encoding="utf-8"))
            snaps[sj["date"]] = sj["rates"]
        except Exception:  # noqa: BLE001
            pass
    avail = {k: tdates[-n:] for k, n in PERIODS.items() if len(tdates) >= n and all(d in snaps for d in tdates[-n:])}

    inds = []
    for g in groups:
        no = str(g["no"])
        it = {"no": no, "name": g.get("name", ""), "sector": sector_of(g.get("name", "")),
              "chg1": fnum(g.get("changeRate")), "total": g.get("totalCount"),
              "rise": g.get("riseCount"), "fall": g.get("fallCount"), "steady": g.get("steadyCount"),
              "url": PAGE_URL.format(no=no)}
        for key, days in avail.items():
            acc, ok = 1.0, True
            for d in days:
                v = snaps[d].get(no)
                if v is None:
                    ok = False
                    break
                acc *= 1 + v / 100
            it[key] = round((acc - 1) * 100, 2) if ok else None
        inds.append(it)

    out = {"source": "네이버 증권 업종별 시세", "source_url": LIST_URL,
           "updated_at": now.strftime("%Y-%m-%d %H:%M KST"), "basis_date": bdate,
           "periods_available": ["chg1"] + list(avail),
           "days_recorded": sum(1 for d in tdates if d in snaps),
           "n_industries": len(inds), "n_stocks": sum(i["total"] or 0 for i in inds),
           "industries": inds}
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log("완료", bdate, "업종", len(inds), "누적 가능 기간", list(avail))


def keep_previous(msg: str, now: datetime):
    """실패하면 이전 화면 자료는 그대로 두고 오류만 남긴다."""
    try:
        prev = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    except Exception:  # noqa: BLE001
        prev = {}
    prev["last_error"] = {"at": now.strftime("%Y-%m-%d %H:%M KST"), "error": msg}
    OUT.write_text(json.dumps(prev, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log(msg)


if __name__ == "__main__":
    main()
