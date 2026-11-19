"""차트북 RS 등급 계산 검사: 전체 종목 안에서 1~99로 매기고, 지수·매크로는 빼는지 본다."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import watchlist_fetch as wf  # noqa: E402


def item(y, growth):
    return {"y": y, "c": [100 * (1 + growth) ** (i / 250) for i in range(251)]}


class RsTest(unittest.TestCase):
    def test_rank_order_and_range(self):
        a, b, c = item("AAA", 0.5), item("BBB", 0.0), item("005930.KS", -0.3)
        macro = item("^GSPC", 0.9)
        fx = item("USDKRW=X", 0.9)
        tabs = [("macro", [{"items": [macro]}]), ("ai", [{"items": [a, b, fx]}, {"items": [c]}])]
        self.assertEqual(wf.add_rs(tabs), 3)
        self.assertEqual((a["rs"], b["rs"], c["rs"]), (99, 50, 1))
        self.assertNotIn("rs", macro)
        self.assertNotIn("rs", fx)

    def test_short_history_skipped(self):
        short = {"y": "NEW", "c": [1.0] * 30}
        self.assertEqual(wf.add_rs([("sw", [{"items": [short]}])]), 0)
        self.assertNotIn("rs", short)

    def test_stale_rs_removed(self):
        it = {"y": "^VIX", "c": [1.0] * 100, "rs": 50}
        wf.add_rs([("macro", [{"items": [it]}])])
        self.assertNotIn("rs", it)


if __name__ == "__main__":
    unittest.main()
