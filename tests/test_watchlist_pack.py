"""차트북 자료 줄이기(pack)·되돌리기(unpack) 왕복 검사(2026-11-24)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import watchlist_fetch as w  # noqa: E402


def sample():
    c = [round(100 + i * 0.37 + (i % 7) * 0.9, 2) for i in range(250)]
    emas = {str(n): [round(x, 2) for x in w.ema(c, n)] for n in w.EMAS}
    days, d = [], w._ymd("251121")
    import datetime as dt
    while len(days) < 250:
        if d.weekday() < 5:
            days.append(d.strftime("%y%m%d"))
        d += dt.timedelta(days=1)
    return {"y": "TEST", "dg": 2, "c": c, "d": days, "e": emas}


def test_roundtrip():
    it = sample()
    p = w.pack(it)
    assert "e" not in p and "d" not in p and set(p["es"]) == {"20", "50", "200"}
    assert max(p["dd"]) <= 3
    u = w.unpack(dict(p))
    assert u["d"] == it["d"]
    for k in it["e"]:
        assert all(abs(a - b) <= 0.011 for a, b in zip(u["e"][k], it["e"][k]))


def test_old_shape_untouched():
    it = sample()
    assert w.unpack(dict(it))["e"] is it["e"]
