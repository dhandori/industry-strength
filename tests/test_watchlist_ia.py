"""차트북 인더스트리 액션 검사: 종목이 속한 업종이 시장 흐름판에서 상위권일 때만 액션으로 본다."""
import datetime as dt
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import watchlist_fetch as wf  # noqa: E402

TODAY = dt.date(2026, 11, 20)


def ind(name, rank, top, tickers, streak=3):
    return {"name": name, "rank": rank, "top": top, "streak": streak, "breadth50": 80.0,
            "members": [{"ticker": t} for t in tickers]}


def write_flow(folder, mk, items, basis="2026-11-20"):
    Path(folder, f"{mk}.json").write_text(json.dumps({"basis_date": basis, "items": items}), encoding="utf-8")


class IaTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        d = self.tmp.name
        write_flow(d, "US", [ind("AI 가속기", 2, True, ["NVDA", "AMD"], streak=12),
                             ind("반도체 장비", 5, True, ["AMD"], streak=2),
                             ind("PC", 40, False, ["HPQ"])])
        write_flow(d, "KR", [ind("메모리", 1, True, ["000660.KS"])], basis="2026-11-01")  # 오래된 자료
        self.flow = wf.load_flow(d, TODAY)

    def tearDown(self):
        self.tmp.cleanup()

    def tabs(self, ys):
        return [("ai", [{"items": [{"y": y} for y in ys]}])]

    def test_top_industry_member_is_action(self):
        t = self.tabs(["NVDA", "HPQ", "2330.TW"])
        self.assertEqual(wf.add_ia(t, self.flow), 1)
        nv, hp, tw = t[0][1][0]["items"]
        self.assertEqual((nv["ia"]["g"], nv["ia"]["k"], nv["ia"]["of"], nv["ia"]["d"]), ("AI 가속기", 2, 3, 12))
        self.assertNotIn("ia", hp)  # 상위권이 아닌 업종
        self.assertNotIn("ia", tw)  # 흐름판에 없는 종목은 판정하지 않는다

    def test_best_ranked_industry_wins(self):
        t = self.tabs(["AMD"])
        wf.add_ia(t, self.flow)
        self.assertEqual(t[0][1][0]["items"][0]["ia"]["g"], "AI 가속기")

    def test_stale_market_is_skipped(self):
        self.assertNotIn("000660.KS", self.flow)


if __name__ == "__main__":
    unittest.main()
