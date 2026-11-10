"""밀린 예약 작업 찾기 (2026-11-10 추가).

GitHub 예약 실행이 이 저장소에서 5~7시간씩 늦는 일이 잦다(11/10: 09:20 KST 'AI 시장' 예약이 오후까지 안 돎).
시장 흐름판 갱신(update.yml)은 마감 갱신 예약이 직접 걸어 줘서 제때 돌므로, 그 끝에서 이 스크립트로
'오늘 돌았어야 하는데 자료가 안 바뀐' 작업을 찾아 바로 깨운다. 출력: 깨울 워크플로 파일 이름(한 줄에 하나).
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

KST = timezone(timedelta(hours=9))
DATA = Path(__file__).resolve().parent.parent / "docs" / "data"
# (워크플로, 자료 파일, 오늘 이 시각(KST)이 지났으면 자료가 그 뒤 것이어야 함, 평일만)
JOBS = [
    ("ai-market.yml", "ai_market.json", (9, 20), False),
    ("ai-infra.yml", "ai_infra.json", (9, 40), False),
    ("chip-prices.yml", "chip_prices.json", (12, 40), True),
    ("us-econ.yml", "us_econ.json", (7, 20), False),
]


def updated_at(path: Path):
    try:
        s = json.loads(path.read_text(encoding="utf-8")).get("updated_at") or ""
        return datetime.strptime(s.replace(" KST", ""), "%Y-%m-%d %H:%M").replace(tzinfo=KST)
    except (OSError, ValueError, AttributeError):
        return None


def stale(now: datetime, data: Path = DATA) -> list[str]:
    out = []
    for wf, name, (h, m), weekdays in JOBS:
        if weekdays and now.weekday() >= 5:
            continue
        due = now.replace(hour=h, minute=m, second=0, microsecond=0)
        if now < due:
            continue
        got = updated_at(data / name)
        if got is None or got < due:
            out.append(wf)
    return out


if __name__ == "__main__":
    now = datetime.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else datetime.now(KST)
    print("\n".join(stale(now.astimezone(KST))))
