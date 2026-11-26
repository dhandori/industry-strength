"""신규 상장 종목(일봉 30개 미만) 처리 검사(2026-11-26, Anthropic 11/19 상장)."""
import os
import sys
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import watchlist_fetch as w  # noqa: E402

DAY = 86400


def raw(n, first_ago_days):
    now = int(time.time())
    ts = [now - (n - i) * DAY for i in range(n)]
    c = [80 + i for i in range(n)]
    return now, {"meta": {"gmtoffset": 0, "firstTradeDate": now - first_ago_days * DAY},
                 "timestamp": ts,
                 "indicators": {"quote": [{"open": c, "high": c, "low": c, "close": c, "volume": [1000] * n}]}}


class NewListing(unittest.TestCase):
    item = {"y": "ANT", "n": "Anthropic", "k": "미국"}

    def test_new_listing_short_history_builds(self):
        now, r = raw(5, 7)
        it = w.build(self.item, r, now)
        self.assertEqual(len(it["c"]), 5)
        self.assertEqual(it["nl"], 5)
        self.assertNotIn("al", it)

    def test_old_listing_short_history_fails(self):
        now, r = raw(5, 400)
        with self.assertRaises(RuntimeError):
            w.build(self.item, r, now)

    def test_single_bar_fails(self):
        now, r = raw(1, 1)
        with self.assertRaises(RuntimeError):
            w.build(self.item, r, now)

    def test_normal_history_unchanged(self):
        now, r = raw(300, 2000)
        it = w.build(self.item, r, now)
        self.assertNotIn("nl", it)
        self.assertIn("al", it)


if __name__ == "__main__":
    unittest.main()
