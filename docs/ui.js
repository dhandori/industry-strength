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
      nav.innerHTML = items.map((x, i) => `<button type="button" data-i="${i}">${esc(x.t)}</button>`).join("");
      nav.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
        const i = +b.dataset.i, x = items[i];
        if (!x) return;
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

  // 탭을 바꾸거나 내용이 새로 그려지면 다시 만든다
  let t;
  const later = () => { clearTimeout(t); t = setTimeout(build, 250); };
  const mo = new MutationObserver((recs) => { if (recs.some((r) => r.type === "attributes" || [...r.addedNodes].some((n) => n.nodeType === 1 && (n.matches?.(SEL) || n.querySelector?.(SEL))))) later(); });
  document.querySelectorAll("main").forEach((m) => mo.observe(m, { attributes: true, attributeFilter: ["hidden"], childList: true, subtree: true }));
  addEventListener("load", later);
  later();
})();
