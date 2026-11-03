"""예약 실행이 휴장일에 헛돌지 않게 한다(update.yml 첫 단계, 표준 라이브러리만 쓴다).

예약 실행의 대상 시장을 한국 시각으로 고른다. 오후(12~23시) 실행은 한국장, 아침(0~11시) 실행은 뉴욕장 몫이다.
그 시장의 현지 오늘이 docs/data/calendar.json(scripts/market_calendar.py)에 휴장일로 있으면 go=false 를 내고,
뒤 단계(설치·마감 대기·수집·저장)가 모두 건너뛴다. 휴장일 목록이 없거나 오늘이 목록 범위 밖이면 평소처럼 돈다.
수동 실행·push 실행은 늘 돈다.
"""
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
import json
import os
import sys

ROOT = Path(__file__).resolve().parents[1]
CAL = ROOT / "docs" / "data" / "calendar.json"
TZ = {"KR": "Asia/Seoul", "US": "America/New_York"}


def decide(now, event, cal):
    """(go, 이유)"""
    if event != "schedule":
        return True, f"{event or '수동'} 실행 · 휴장일 확인 안 함"
    market = "KR" if 12 <= now.astimezone(ZoneInfo(TZ["KR"])).hour <= 23 else "US"
    block = ((cal or {}).get("markets") or {}).get(market) or {}
    today = now.astimezone(ZoneInfo(block.get("timeZone") or TZ[market])).date().isoformat()
    if not block or not (block.get("from", "") <= today <= block.get("to", "")):
        return True, f"{market} {today} · 휴장일 목록 범위 밖이라 평소처럼 진행"
    hit = next((x for x in block.get("closed") or [] if x.get("date") == today), None)
    if not hit:
        return True, f"{market} {today} 거래일 · 진행"
    nxt = f" · 다음 개장 {hit['nextOpen']}" if hit.get("nextOpen") else ""
    return False, f"{market} {today} {hit.get('name') or '휴장'}{nxt} · 수집 건너뜀"


def main():
    try:
        cal = json.loads(CAL.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        cal = None
    go, why = decide(datetime.now(timezone.utc), os.environ.get("GITHUB_EVENT_NAME", ""), cal)
    print(f"[holiday] {why}", flush=True)
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write(f"go={'true' if go else 'false'}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
