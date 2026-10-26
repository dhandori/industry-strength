"""예약 출발을 장 마감 직후로 맞춘다.

GitHub 예약 실행은 10~40분 늦게 출발한다. update.yml은 마감 전에 미리 출발하고,
이 스크립트가 가장 가까운 목표 시각(한국 15:52, 미국 뉴욕 16:12)까지 기다린다.
이미 지났거나 60분보다 멀면(다른 서머타임 후보, 주말) 기다리지 않는다.
휴장일은 모른다: 기다린 뒤 돌아도 새 가격이 없어 바뀌는 것이 없다.
"""
import sys
import time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

# 목표 시각 = 마감 + 몇 분(야후 한국 일봉 확정 여유 20분, 미국은 실시간이라 10분).
TARGET = {"KR": ("Asia/Seoul", 15, 52), "US": ("America/New_York", 16, 12)}
# 거래 시간이 바뀌는 날. 수능날 한국장은 10:00~16:30.
LATE = {"KR": {"2026-11-19": (16, 52)}}
MAX_WAIT = timedelta(minutes=60)


def targets(now):
    for mkey, (tz, hh, mm) in TARGET.items():
        local = now.astimezone(ZoneInfo(tz))
        if local.weekday() >= 5:
            continue
        h, m = LATE.get(mkey, {}).get(local.date().isoformat(), (hh, mm))
        yield mkey, local.replace(hour=h, minute=m, second=20, microsecond=0)


def main():
    now = datetime.now(timezone.utc)
    soon = sorted((t, mkey) for mkey, t in targets(now) if timedelta(0) < t - now <= MAX_WAIT)
    if not soon:
        print("[wait] 대기 없음 · 바로 진행")
        return 0
    t, mkey = soon[0]
    secs = (t - now).total_seconds()
    print(f"[wait] {mkey} 마감 후 목표 {t:%H:%M} (현지)까지 {secs / 60:.1f}분 대기", flush=True)
    time.sleep(secs)
    return 0


if __name__ == "__main__":
    sys.exit(main())
