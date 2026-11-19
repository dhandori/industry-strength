"""차트북 인더스트리 액션 검사: 같은 하부섹터 3종목 이상이 시장보다 함께 강할 때만 액션으로 본다."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import watchlist_fetch as wf  # noqa: E402


def line(n, start_up, daily):
    """처음엔 평평하다가 마지막 구간에 하루 daily 씩 움직이는 종가와 같은 길이의 EMA(낮게 둠)."""
    c = [100.0] * (n - start_up) + [100.0 * (1 + daily) ** (i + 1) for i in range(start_up)]
    return c


def item(y, t, daily, ema_below=True):
    c = line(260, 40, daily)
    e = [x * (0.97 if ema_below else 1.03) for x in c]
    return {"y": y, "t": [t], "c": c, "e": {"20": e, "50": e}}


class IaTest(unittest.TestCase):
    def tabs(self, members, bench_daily=0.0):
        macro = {"y": "^GSPC", "c": line(260, 40, bench_daily), "e": {}}
        return [("macro", [{"items": [macro]}]), ("ai", [{"items": members}])]

    def test_group_moving_together_is_action(self):
        g = [item(s, "후공정 장비", 0.004) for s in ("AAA", "BBB", "CCC")]
        other = item("DDD", "전공정 장비", 0.004)
        self.assertEqual(wf.add_ia(self.tabs(g + [other], bench_daily=0.001)), 1)
        self.assertEqual([x["ia"]["w"] for x in g], [[7, 30]] * 3)
        self.assertNotIn("ia", other)  # 한 종목뿐인 묶음은 보지 않는다

    def test_not_action_when_lagging_market(self):
        g = [item(s, "후공정 장비", 0.001) for s in ("AAA", "BBB", "CCC")]
        self.assertEqual(wf.add_ia(self.tabs(g, bench_daily=0.004)), 0)
        self.assertTrue(all("ia" not in x for x in g))

    def test_one_leader_is_not_action(self):
        g = [item("AAA", "로봇", 0.02), item("BBB", "로봇", -0.002), item("CCC", "로봇", -0.002)]
        self.assertEqual(wf.add_ia(self.tabs(g)), 0)

    def test_korean_stock_uses_kospi(self):
        self.assertEqual(wf.bench_of("005930.KS"), "^KS11")
        self.assertEqual(wf.bench_of("247540.KQ"), "^KQ11")
        self.assertEqual(wf.bench_of("NVDA"), "^GSPC")
        self.assertEqual(wf.bench_of("7203.T"), "^N225")


if __name__ == "__main__":
    unittest.main()
