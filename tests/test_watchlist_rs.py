"""차트북 RS 등급 검사: 상장 시장 지수 대비 강도를 1~99로 매기고, 변화·RS선 신고가를 붙이며, 지수·매크로는 뺀다."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import watchlist_fetch as wf  # noqa: E402


def item(y, growth, n=251):
    return {"y": y, "c": [100 * (1 + growth) ** (i / 250) for i in range(n)]}


class RsTest(unittest.TestCase):
    def tabs(self, stocks, us=0.0, kr=0.0):
        macro = [item("^GSPC", us), item("^KS11", kr)]
        return [("macro", [{"items": macro}]), ("ai", [{"items": stocks}])], macro

    def test_rank_against_own_market(self):
        # 한국 종목은 1년 -10%로 절대 수익률이 가장 낮아도 코스피(-40%)보다 훨씬 강하니 맨 위로 간다
        a, b, c = item("AAA", 0.5), item("BBB", 0.0), item("005930.KS", -0.1)
        tabs, macro = self.tabs([a, b, c], us=0.2, kr=-0.4)
        self.assertEqual(wf.add_rs(tabs), 3)
        self.assertEqual((c["rs"], a["rs"], b["rs"]), (99, 50, 1))
        self.assertTrue(c["rsh"])
        self.assertFalse(b["rsh"])
        self.assertTrue(all("rs" not in m for m in macro))

    def test_rs_line_stored_for_chart(self):
        # 화면의 RS선 칸: 첫 값 100, 종가와 같은 길이, 마지막 값은 종목 ÷ 지수의 1년 변화, 비교 지수 이름
        a, c = item("AAA", 0.5), item("005930.KS", -0.1)
        tabs, macro = self.tabs([a, c], us=0.2, kr=-0.4)
        wf.add_rs(tabs)
        self.assertEqual(len(a["rl"]), len(a["c"]))
        self.assertEqual(a["rl"][0], 100.0)
        self.assertAlmostEqual(a["rl"][-1], 100 * 1.5 / 1.2, delta=0.1)
        self.assertEqual((a["rb"], c["rb"]), ("S&P500", "코스피"))
        self.assertTrue(all("rl" not in m for m in macro))

    def test_change_over_20_days(self):
        # 앞쪽엔 빠지다가 최근 20일 급등한 종목은 등급이 맨 아래에서 맨 위로 오른다
        up = {"y": "UP", "c": [100 - i * 0.13 for i in range(231)] + [70 * 1.03 ** i for i in range(1, 21)]}
        flat = item("FLAT", 0.1)
        down = item("DOWN", -0.2)
        tabs, _ = self.tabs([up, flat, down])
        wf.add_rs(tabs)
        self.assertEqual((up["rs"], up["rsd"]), (99, 98))

    def test_no_benchmark_or_short_history_skipped(self):
        eu, short, fx = item("SAP.DE", 0.3), {"y": "NEW", "c": [1.0] * 30}, item("USDKRW=X", 0.9)
        tabs, _ = self.tabs([eu, short, fx])
        self.assertEqual(wf.add_rs(tabs), 0)
        self.assertTrue(all("rs" not in x for x in (eu, short, fx)))

    def test_stale_rs_removed(self):
        it = {"y": "^VIX", "c": [1.0] * 100, "rs": 50, "rsd": 3, "rsh": True, "rl": [100.0], "rb": "S&P500"}
        wf.add_rs([("macro", [{"items": [it]}])])
        self.assertFalse({"rs", "rsd", "rsh", "rl", "rb"} & set(it))


if __name__ == "__main__":
    unittest.main()
