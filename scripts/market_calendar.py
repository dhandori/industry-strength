"""한국·미국·일본 휴장일 목록을 docs/data/calendar.json 에 쓴다(화면 docs/refresh.js 가 읽는다).

거래소 달력(exchange_calendars: XKRX·XNYS·XTKS)으로 시장 현지 날짜 기준 30일 전~45일 뒤의 휴장일(주말 포함)과
각 휴장일 다음 개장일을 담는다. 화면은 보는 순간의 현지 날짜로 찾아
'오늘 휴장 · 개천절 · 다음 개장 10/5(월)'을 적고, 기대 기준일·다음 자동 갱신 계산에서 휴장일을 건너뛴다.
앞뒤로 넉넉히 담아 하루 이틀 갱신이 빠져도, 추석 같은 긴 연휴에도 맞게 한다.
휴일 이름 표는 wamo-choochoo-dashboard 의 wamo_runtime.HOLIDAY_KO 와 같다(한국·미국 몫).
"""
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
import json
import re

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "data" / "calendar.json"
MARKETS = {"KR": ("XKRX", "Asia/Seoul"), "US": ("XNYS", "America/New_York"), "JP": ("XTKS", "Asia/Tokyo")}
BACK, AHEAD = 30, 45

HOLIDAY_KO = {
    "New Year's Day": "신정", "End of Year Holiday": "연말 휴장", "Christmas": "성탄절",
    "Seollal (New Year's Day by the lunar)": "설날", "Seollal (New Year's Day by the lunar) (+1 day)": "설날 연휴",
    "Seollal (New Year's Day by the lunar) (-1 day)": "설날 연휴", "Independence Movement Day": "삼일절",
    "Labor Day": "근로자의 날", "Children's Day": "어린이날", "Buddha's Birthday": "부처님오신날", "Memorial Day": "현충일",
    "National Liberation Day": "광복절", "Chuseok (Korean Thanksgiving Day)": "추석",
    "Chuseok (Korean Thanksgiving Day) (+1 day)": "추석 연휴", "Chuseok (Korean Thanksgiving Day) (-1 day)": "추석 연휴",
    "Korean National Foundation Day": "개천절", "Hangul Proclamation Day": "한글날",
    "Dr. Martin Luther King Jr. Day": "마틴 루서 킹 데이", "President's Day": "대통령의 날", "Good Friday": "성금요일",
    "Juneteenth National Independence Day": "노예해방기념일", "July 4th": "독립기념일", "Thanksgiving": "추수감사절",
    # 일본(XTKS). 춘분·추분·대체휴일은 달력에 이름이 없어 '휴장일'로 나온다.
    "New Year's Holiday (Dec 31)": "연말 휴장", "New Year's Holiday (Jan 2)": "연초 휴장", "New Year's Holiday (Jan 3)": "연초 휴장",
    "Coming of Age Day": "성인의 날", "National Foundation Day": "건국기념일", "Emperor Naruhito's Birthday": "일왕 생일",
    "Showa Day": "쇼와의 날", "Constitution Memorial Day": "헌법기념일", "Greenery Day": "녹색의 날", "Marine Day": "바다의 날",
    "Mountain Day": "산의 날", "Respect for the Aged Day": "경로의 날", "Health and Sports Day": "스포츠의 날",
    "Culture Day": "문화의 날", "Labor Thanksgiving Day": "근로감사의 날",
}


def holiday_ko(name, market):
    base = re.sub(r"\s*\(\d{4} onwards\)$", "", name or "")
    ko = HOLIDAY_KO.get(name) or HOLIDAY_KO.get(base)
    if name == "Labor Day" and market == "US":
        ko = "노동절"
    if name == "Memorial Day" and market == "US":
        ko = "메모리얼 데이"
    if name == "Children's Day" and market == "JP":
        ko = "어린이날"
    return ko or "휴장일"


def closures(market, now):
    import exchange_calendars as xc
    import pandas as pd

    code, tz = MARKETS[market]
    cal = xc.get_calendar(code)
    today = now.astimezone(ZoneInfo(tz)).date()
    start, end = today - timedelta(days=BACK), today + timedelta(days=AHEAD)
    sessions = {d.date() for d in cal.sessions_in_range(pd.Timestamp(start), pd.Timestamp(end + timedelta(days=14)))}
    names = {}
    if cal.regular_holidays is not None:
        found = cal.regular_holidays.holidays(pd.Timestamp(start), pd.Timestamp(end), return_name=True)
        names = {d.date(): holiday_ko(n, market) for d, n in found.items()}
    out, day = [], start
    while day <= end:
        if day not in sessions:
            nxt = day + timedelta(days=1)
            while nxt not in sessions and nxt <= end + timedelta(days=14):
                nxt += timedelta(days=1)
            out.append({"date": day.isoformat(),
                        "name": "주말" if day.weekday() >= 5 and day not in names else names.get(day, "휴장일"),
                        "nextOpen": nxt.isoformat() if nxt in sessions else None})
        day += timedelta(days=1)
    return {"timeZone": tz, "from": start.isoformat(), "to": end.isoformat(), "closed": out}


def main(now=None):
    now = now or datetime.now(timezone.utc)
    data = {"_note": "한국·미국·일본 휴장일(주말 포함)과 다음 개장일. scripts/market_calendar.py",
            "markets": {m: closures(m, now) for m in MARKETS}}
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
        OUT.write_text(text, encoding="utf-8")
    print("[calendar]", " / ".join(f"{m} 휴장 {len(v['closed'])}일({v['from']}~{v['to']})" for m, v in data["markets"].items()))


if __name__ == "__main__":
    main()
