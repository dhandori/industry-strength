"""캐시 버전 자동화(scripts/version_assets.py) 검사."""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import version_assets as va


class VersionAssetsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.docs = Path(self.tmp.name)
        (self.docs / "app.js").write_text("x=1", encoding="utf-8")
        (self.docs / "style.css").write_text("a{}", encoding="utf-8")

    def test_내용이_같으면_값이_같고_바뀌면_그_파일만_바뀐다(self):
        html = '<link href="style.css?v=old"><script src="app.js"></script>'
        first, done = va.stamp(html, self.docs)
        self.assertEqual(done, ["style.css", "app.js"])
        self.assertEqual(va.stamp(first, self.docs)[0], first)
        (self.docs / "app.js").write_text("x=2", encoding="utf-8")
        second = va.stamp(first, self.docs)[0]
        self.assertNotEqual(second, first)
        self.assertEqual(second.split("app.js")[0], first.split("app.js")[0])   # style.css 값은 그대로

    def test_바깥_주소와_없는_파일은_건드리지_않는다(self):
        html = '<script src="https://cdn.example/x.js"></script><script src="//gc.zgo.at/count.js"></script><script src="none.js?v=1"></script>'
        self.assertEqual(va.stamp(html, self.docs), (html, []))

    def test_저장소의_index_가_최신이다(self):
        page = va.DOCS / "index.html"
        html = page.read_text(encoding="utf-8")
        self.assertEqual(va.stamp(html)[0], html, "python scripts/version_assets.py 를 돌려 index.html 을 함께 커밋하세요")


if __name__ == "__main__":
    unittest.main()
