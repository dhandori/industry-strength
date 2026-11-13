/* 화면 공통 도우미 (2026-10-28 추가) — 모든 탭에 같이 쓴다. 다른 탭 코드는 건드리지 않는다.
   - 탭 안 바로가기: 지금 보이는 탭의 카드 제목을 모아 위쪽(머리 아래)에 칩으로. 누르면 그 카드로, 읽는 중인 카드는 진하게.
   - 휴대폰: 아래로 내리면 머리(제목·탭)를 접고 바로가기 칩만 남긴다. 위로 올리면 다시 보인다.
   - 맨 위로 단추. */
(() => {
  const top = document.querySelector("header.top");
  if (!top) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const nav = document.createElement("nav");
  nav.className = "sec-nav";
  nav.setAttribute("aria-label", "이 탭 안에서 바로가기");
  nav.hidden = true;
  top.appendChild(nav);
  const up = document.createElement("button");
  up.className = "to-top"; up.type = "button"; up.hidden = true;
  up.setAttribute("aria-label", "맨 위로"); up.textContent = "↑";
  document.body.appendChild(up);
  up.addEventListener("click", () => scrollTo({ top: 0, behavior: "smooth" }));

  // 카드 제목(h2)과 매크로 탭의 나라·묶음 제목
  const SEL = "section.card > .card-head h2, .mx-market-h h2, .mx-group-h h3";
  const mainNow = () => [...document.querySelectorAll("main")].find((m) => !m.hidden);
  const label = (h) => { const c = h.cloneNode(true); c.querySelectorAll(".sub, button, .help, select, input").forEach((x) => x.remove()); return c.textContent.replace(/\s+/g, " ").trim(); };
  let items = [], active = -1;

  function setHeaderVar() {
    document.documentElement.style.setProperty("--hdr-h", top.offsetHeight + "px");
    document.documentElement.style.setProperty("--nav-h", (nav.hidden ? 0 : nav.offsetHeight) + "px");
  }
  function build() {
    const m = mainNow();
    const seen = new Set();
    items = m ? [...m.querySelectorAll(SEL)].filter((h) => h.offsetParent && label(h)).map((h) => {
      const el = h.closest(".mx-group-h") || h.closest("section") || h;
      return { el, t: label(h).replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, "") };
    }).filter((x) => !seen.has(x.el) && seen.add(x.el))
      // 매크로 탭은 CSS order 로 화면 순서가 코드 순서와 다르다 → 화면 위치 순으로
      .sort((a, b) => a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top) : [];
    nav.hidden = items.length < 3;
    if (!nav.hidden) {
      // 끝에 '모두 펼치기/모두 접기': 지금 탭의 접을 수 있는 카드를 한 번에(2026-11-13)
      const foldable = [...m.querySelectorAll("section.card")].filter((s) => s.querySelector(":scope > .card-head > .cf-btn"));
      const anyShut = foldable.some((s) => s.classList.contains("cf-shut"));
      nav.innerHTML = items.map((x, i) => `<button type="button" data-i="${i}">${esc(x.t)}</button>`).join("")
        + (foldable.length > 1 ? `<button type="button" class="sn-all">${anyShut ? "모두 펼치기 ▾" : "모두 접기 ▴"}</button>` : "");
      nav.querySelector(".sn-all")?.addEventListener("click", () => { foldable.forEach((s) => setShut(s, !anyShut)); build(); });
      nav.querySelectorAll("button[data-i]").forEach((b) => b.addEventListener("click", () => {
        const i = +b.dataset.i, x = items[i];
        if (!x) return;
        // 접힌 카드로 가면 펼쳐서 보여 준다
        if (x.el.classList?.contains("cf-shut")) setShut(x.el, false);
        // 휴대폰에서 아래로 갈 땐 머리가 접히므로 칩 줄 높이만큼만 띄운다
        const r = x.el.getBoundingClientRect(), down = r.top > 0;
        const small = innerWidth < 640;
        const off = (small && down ? nav.offsetHeight : top.offsetHeight) + 10;
        if (small) top.classList.toggle("folded", down);
        hold = Date.now() + 900;
        mark(i);
        scrollTo({ top: scrollY + r.top - off, behavior: "smooth" });
      }));
    }
    active = -1;
    setHeaderVar();
    spy();
  }
  // 읽는 중인 카드: 머리 아래 선을 지난 마지막 카드
  let hold = 0;
  function spy() {
    if (nav.hidden || Date.now() < hold) return;
    const line = top.getBoundingClientRect().bottom + 24;
    let k = 0;
    items.forEach((x, i) => { if (x.el.getBoundingClientRect().top <= line) k = i; });
    mark(k);
  }
  function mark(k) {
    if (k === active) return;
    active = k;
    const bs = nav.querySelectorAll("button");
    bs.forEach((b, i) => b.classList.toggle("on", i === k));
    const b = bs[k];
    if (b) nav.scrollTo({ left: b.offsetLeft - nav.clientWidth / 2 + b.offsetWidth / 2, behavior: "smooth" });
  }

  // 휴대폰: 내리면 머리 접기(바로가기 칩만), 올리면 펴기
  let lastY = scrollY, ticking = false;
  function onScroll() {
    const y = scrollY;
    const small = innerWidth < 640;
    if (Date.now() < hold) { lastY = y; ticking = false; return; }
    const fold = small && !nav.hidden && y > 160 && y > lastY + 4;
    const unfold = !small || y < 160 || y < lastY - 8;
    if (fold) top.classList.add("folded");
    else if (unfold) top.classList.remove("folded");
    lastY = y;
    up.hidden = y < 1400;
    spy();
    ticking = false;
  }
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener("resize", () => { setHeaderVar(); top.classList.remove("folded"); });

  // ---------- 카드 접기·펼치기 (2026-11-07): 제목 줄이 있는 카드마다 오른쪽 위에 단추. 처음 상태는 data-fold="closed"면 접힘,
  // 그 외엔 펼침. 사용자가 바꾼 건 기억한다(제목 글자로 구분). 매크로 탭 지표 카드는 접지 않는다(2026-11-11 사용자: 모두 펼쳐 보이게).
  let fmem = {};
  try { fmem = JSON.parse(localStorage.getItem("cfold") || "{}") || {}; } catch (e) {}
  // 기억 열쇠는 '탭 id:제목'(2026-11-13: 다른 탭의 같은 제목과 섞이지 않게). 예전 제목만 쓴 기억도 읽는다.
  const fkey = (sec) => { const h = sec.querySelector(":scope > .card-head h2, :scope > .card-head summary h2"); return h ? (sec.closest("main")?.id || "") + ":" + label(h) : ""; };
  const fget = (k) => k in fmem ? fmem[k] : fmem[k.slice(k.indexOf(":") + 1)];
  const fsave = () => { try { localStorage.setItem("cfold", JSON.stringify(fmem)); } catch (e) {} };
  function setShut(sec, shut) { const k = fkey(sec); if (!k) return; fmem[k] = shut; delete fmem[k.slice(k.indexOf(":") + 1)]; fsave(); paint(sec); }
  function folds() {
    document.querySelectorAll("main section.card").forEach((sec) => {
      const head = sec.querySelector(":scope > .card-head");
      if (!head || sec.classList.contains("guide") || !fkey(sec)) return;
      let b = head.querySelector(":scope > .cf-btn");
      if (!b) { b = document.createElement("button"); b.type = "button"; b.className = "cf-btn"; head.appendChild(b); b.addEventListener("click", () => { setShut(sec, !sec.classList.contains("cf-shut")); later(); }); }
      paint(sec);
    });
  }
  function paint(sec) {
    const k = fkey(sec), v = fget(k), shut = v != null ? v : sec.dataset.fold === "closed";
    sec.classList.toggle("cf-shut", shut);
    const b = sec.querySelector(":scope > .card-head > .cf-btn");
    const t = shut ? "펼치기 ▾" : "접기 ▴";
    if (b && b.textContent !== t) { b.textContent = t; b.setAttribute("aria-expanded", !shut); }
  }

  // 탭을 바꾸거나 내용이 새로 그려지면 다시 만든다
  let t;
  const later = () => { clearTimeout(t); t = setTimeout(() => { folds(); build(); }, 250); };
  // 새로 그려진 카드는 그 자리에서 바로 접힘 상태를 입힌다(잠깐 펼쳐졌다 접히며 화면이 튀던 것, 2026-11-13).
  const mo = new MutationObserver((recs) => { if (recs.some((r) => r.type === "attributes" || [...r.addedNodes].some((n) => n.nodeType === 1 && (n.matches?.(SEL) || n.querySelector?.(SEL))))) { folds(); later(); } });
  // 다른 화면 코드가 접힌 카드를 펼칠 때(바로가기 등)
  window.__cfold = { open: (sec) => { if (sec && sec.classList.contains("cf-shut")) setShut(sec, false); } };
  document.querySelectorAll("main").forEach((m) => mo.observe(m, { attributes: true, attributeFilter: ["hidden"], childList: true, subtree: true }));
  addEventListener("load", later);
  later();
})();
