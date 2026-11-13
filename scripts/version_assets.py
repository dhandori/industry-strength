#!/usr/bin/env python3
"""docs/index.html 이 부르는 CSS·스크립트 주소의 ?v= 를 파일 내용 해시로 맞춘다.

예전에는 파일을 고칠 때마다 ?v=20261113-cf2 같은 값을 손으로 바꿨다. 잊으면 옛 파일이 브라우저에 남는다.
이제 파일 내용이 바뀔 때만 그 파일의 값이 바뀐다.

  python scripts/version_assets.py           index.html 을 고친다
  python scripts/version_assets.py --check   고칠 것이 남아 있으면 실패한다(CI)
"""
import hashlib
import re
import sys
from pathlib import Path

DOCS = Path(__file__).resolve().parents[1] / "docs"
PATTERN = re.compile(r'((?:href|src)=")([\w./-]+\.(?:css|js))(?:\?v=[\w.-]*)?(")')


def stamp(html, docs=DOCS):
    """(바뀐 html, 해시를 붙인 파일 이름들). 바깥 주소(https://, //)와 없는 파일은 건드리지 않는다."""
    done = []

    def one(match):
        name = match.group(2)
        path = docs / name
        if "//" in name or not path.is_file():
            return match.group(0)
        done.append(name)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()[:10]
        return f"{match.group(1)}{name}?v={digest}{match.group(3)}"

    return PATTERN.sub(one, html), done


def main(argv):
    page = DOCS / "index.html"
    html = page.read_text(encoding="utf-8")
    updated, done = stamp(html)
    if not done:
        print("index.html 에서 CSS·스크립트 주소를 찾지 못했습니다")
        return 1
    if updated == html:
        print(f"캐시 버전 최신: {len(done)}개")
        return 0
    if "--check" in argv:
        print("캐시 버전이 파일 내용과 다릅니다. python scripts/version_assets.py 를 돌린 뒤 index.html 을 함께 커밋하세요.")
        return 1
    page.write_text(updated, encoding="utf-8")
    print(f"캐시 버전 갱신: {len(done)}개")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
