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

  // ---------- 탭 안내와 메뉴 묶음 (2026-11-18 사용자 요청: '메뉴가 많은데 처음 보는 사람도 분류 이유를 알게')
  // 탭마다 맨 위에 '이 탭은 무엇을 보고, 카드를 왜 이렇게 나눴는지' 안내 상자를 두고, 칩 줄에는 묶음 이름을 붙인다.
  // cards 는 카드 제목(h2, 부제 뺀 글자)의 앞부분. 어느 묶음에도 없는 카드는 rest:true 묶음으로 간다.
  // 카드 제목을 바꾸면 여기도 같이 바꾼다. 화면 순서도 이 묶음 순서와 같게 맞춰 두었다(index.html·ai.css).
  const TAB_GUIDE = {
    viewStrength: { intro: "어느 <b>산업</b>으로 돈이 가는지 순위로 보는 탭이에요. 위에서 아래로 시장 → 산업 → 종목 순서로 좁혀 가요.",
      groups: [
        { no: "①", name: "오늘 한눈에", why: "오늘 새로 생긴 신호와 섹터 움직임이에요.", cards: ["오늘의 신호", "섹터 워치", "업종 탐색"] },
        { no: "②", name: "돈의 흐름", why: "힘이 어느 분류로 옮겨 가는지, 강세가 넓게 퍼졌는지 봐요.", cards: ["산업 흐름", "큰 분류별 확산", "산업 폭", "상승 추세 종목 비중"] },
        { no: "③", name: "산업 순위", why: "세부 산업별 순위와 그 순위가 며칠째인지 봐요.", cards: ["세부 산업 순위", "순위 흐름"] },
        { no: "④", name: "종목 고르기", why: "고른 산업 안에서 강한 종목을 찾아요.", cards: ["RS 강한 종목", "외국인·기관 보유 변화"] },
      ], foot: "계산 방법과 용어는 맨 아래 <b>읽는 법</b>에 있어요." },
    viewHighs: { intro: "52주 신고가를 낸 <b>종목</b>을 모아 보는 탭이에요. 산업 강도 탭이 ‘어느 산업’이라면, 여기는 ‘어떤 종목이 실제로 뚫었나’예요.",
      groups: [
        { no: "①", name: "시장 전체", why: "신고가 종목이 늘면 시장이 넓게 강하다는 뜻이에요.", cards: ["신고가 종목 수 추이"] },
        { no: "②", name: "업종", why: "신고가가 어느 업종에 몰리는지 봐요.", cards: ["최근 신고가가 자주 나온 업종", "업종별 신고가 달력"] },
        { no: "③", name: "종목 명단", why: "날짜별 명단과 자주 나온 종목이에요.", cards: ["날짜별 신고가 종목", "신고가가 자주 나온 종목"] },
      ], foot: "업종 이름은 산업 강도 탭과 기준이 달라요(맨 아래 <b>기준</b>)." },
    viewMacro: { intro: "시장 전체의 <b>날씨</b>를 보는 탭이에요. 맨 위 종합 위험도가 결론이고, 아래 경기·시장 지표·빚투가 그 근거예요. 종목을 얼마나 과감하게 살지 정할 때 써요." },
    viewAi: { board: true, intro: "AI를 <b>돈의 흐름</b> 순서로 따라가는 탭이에요. 버는 돈 → 그 돈이 가는 곳 → 누가 이기나 순서예요.",
      groups: [
        { no: "①", name: "버는 돈", why: "OpenAI·Anthropic 매출이에요. 새 보도가 날 때만 바뀌어요.", cards: ["분기 실적", "매출 런레이트"] },
        { no: "②", name: "흘러가는 곳", why: "데이터센터·칩에 쓰는 돈이에요. 반도체·전력 주식과 이어져요.", cards: ["AI 인프라 수요", "반도체 가격"] },
        { no: "③", name: "모델 경쟁", why: "개발자들이 어떤 모델을 쓰는지예요. 매주 바뀌어 매출보다 빨라요.", cards: ["지출 점유율", "오픈웨이트 vs 클로즈드", "누가 치고 올라오나"] },
        { no: "④", name: "참고", why: "출처와 용어 풀이예요.", cards: ["출처와 갱신 주기", "용어 풀이"] },
      ] },
    viewPairs: { intro: "두 종목을 짝지어 <b>어느 쪽이 더 강한지</b> 보는 탭이에요. 시장 전체 등락을 걸러 내고 무엇이 앞서는지 봐요.",
      groups: [
        { no: "①", name: "오늘", why: "오늘 크게 움직인 짝이에요.", cards: ["오늘 눈여겨볼 페어"] },
        { no: "②", name: "주제별", why: "같은 질문에 답하는 짝끼리 묶었어요.", cards: [], rest: true },
      ] },
    viewPositioning: { intro: "가격 뒤에서 <b>누가 얼마나 사 두었나</b>를 보는 탭이에요. 자료가 매주 수요일에만 바뀌어 따로 나눴어요." },
  };
  const cardIn = (g, t) => g.cards.some((c) => t === c || t.startsWith(c));
  function groupIndex(cfg, t) {
    const i = cfg.groups.findIndex((g) => cardIn(g, t));
    return i >= 0 ? i : cfg.groups.findIndex((g) => g.rest);
  }
  function guideBox(m, cfg) {
    let box = m.querySelector(":scope > .tab-guide");
    if (!cfg || cfg.board) { box?.remove(); return; }   // AI 탭은 ai.js 의 '한눈에' 판이 안내를 맡는다
    if (!box) {
      box = document.createElement("section");
      box.className = "tab-guide";
      const anchor = m.querySelector(":scope > .ai-meta, :scope > .mx-meta, :scope > .pr-meta, :scope > .hx-meta");
      const first = m.querySelector(":scope > section.card, :scope > div.two-col");
      if (m.id === "viewStrength" || m.id === "viewHighs") (first ? m.insertBefore(box, first) : m.appendChild(box));
      else if (anchor) anchor.after(box);
      else m.prepend(box);
    }
    const html = `<p><b>📖 이 탭은</b> ${cfg.intro}${cfg.foot ? ` ${cfg.foot}` : ""}</p>`;
    if (box._h !== html) { box._h = html; box.innerHTML = html; }
  }
  // 묶음 띠: 묶음의 첫 카드 바로 위에 '① 이름 — 이유' 한 줄. 카드가 다른 그릇(격자 order)에 있어도 그 카드의 order 를 따라간다.
  function bands(m, cfg) {
    const want = new Map();
    if (cfg && cfg.groups) for (const x of items) if (x.g >= 0 && !want.has(x.g)) want.set(x.g, x.el);
    m.querySelectorAll(".grp-band").forEach((b) => { if (want.get(+b.dataset.g) !== b.nextElementSibling) b.remove(); });
    for (const [gi, el] of want) {
      if (el.previousElementSibling?.classList.contains("grp-band")) continue;
      const g = cfg.groups[gi], b = document.createElement("div");
      b.className = "grp-band"; b.dataset.g = gi;
      b.innerHTML = `<b>${g.no} ${esc(g.name)}</b><span>${g.why}</span>`;
      const o = getComputedStyle(el).order; if (o && o !== "0") b.style.order = o;
      el.before(b);
    }
    items.forEach((x) => { const b = x.el.previousElementSibling; x.band = b && b.classList.contains("grp-band") ? b : null; });
  }


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
    const cfg = m ? TAB_GUIDE[m.id] : null;
    if (cfg && cfg.groups) {
      items.forEach((x, i) => { x.g = groupIndex(cfg, x.t); x.o = i; });
      items.sort((a, b) => (a.g < 0 ? 99 : a.g) - (b.g < 0 ? 99 : b.g) || a.o - b.o);
    }
    if (m) { guideBox(m, cfg); bands(m, cfg); }
    nav.hidden = items.length < 3;
    if (!nav.hidden) {
      // 끝에 '모두 펼치기/모두 접기': 지금 탭의 접을 수 있는 카드를 한 번에(2026-11-13)
      const foldable = [...m.querySelectorAll("section.card")].filter((s) => s.querySelector(":scope > .card-head > .cf-btn"));
      const anyShut = foldable.some((s) => s.classList.contains("cf-shut"));
      const gs = cfg && cfg.groups;
      nav.classList.toggle("grouped", !!gs);
      nav.innerHTML = (gs ? gs.map((g, gi) => items.some((x) => x.g === gi) ? `<button type="button" data-g="${gi}" title="${esc(g.why.replace(/<[^>]+>/g, ""))}">${g.no} ${esc(g.name)}</button>` : "").join("")
        : items.map((x, i) => `<button type="button" data-i="${i}">${esc(x.t)}</button>`).join(""))
        + (foldable.length > 1 ? `<button type="button" class="sn-all">${anyShut ? "모두 펼치기 ▾" : "모두 접기 ▴"}</button>` : "");
      nav.querySelector(".sn-all")?.addEventListener("click", () => { foldable.forEach((s) => setShut(s, !anyShut)); build(); });
      nav.querySelectorAll("button[data-i]").forEach((b) => b.addEventListener("click", () => go(+b.dataset.i)));
      nav.querySelectorAll("button[data-g]").forEach((b) => b.addEventListener("click", () => goGroup(+b.dataset.g)));
    }
    active = -1;
    setHeaderVar();
    spy();
  }
  function goGroup(gi) { const i = items.findIndex((x) => x.g === gi); if (i >= 0) go(i); }
  window.__secnav = { goGroup: (gi) => goGroup(gi) };
  function go(i) {
    const x = items[i];
    if (!x) return;
    // 접힌 카드로 가면 펼쳐서 보여 준다
    if (x.el.classList?.contains("cf-shut")) setShut(x.el, false);
    // 휴대폰에서 아래로 갈 땐 머리가 접히므로 칩 줄 높이만큼만 띄운다
    const r = (x.band || x.el).getBoundingClientRect(), down = r.top > 0;
    const small = innerWidth < 640;
    const off = (small && down ? nav.offsetHeight : top.offsetHeight) + 10;
    if (small) top.classList.toggle("folded", down);
    hold = Date.now() + 900;
    mark(i);
    scrollTo({ top: scrollY + r.top - off, behavior: "smooth" });
  }
  // 읽는 중인 카드: 머리 아래 선을 지난 마지막 카드
  let hold = 0;
  function spy() {
    if (nav.hidden || Date.now() < hold) return;
    const line = top.getBoundingClientRect().bottom + 24;
    let k = 0, best = -Infinity;
    items.forEach((x, i) => { const t = x.el.getBoundingClientRect().top; if (t <= line && t > best) { best = t; k = i; } });
    mark(k);
  }
  function mark(k) {
    if (k === active) return;
    active = k;
    const grouped = nav.classList.contains("grouped"), want = grouped ? String(items[k]?.g) : String(k);
    let on = null;
    nav.querySelectorAll(grouped ? "button[data-g]" : "button[data-i]").forEach((b) => { const hit = (grouped ? b.dataset.g : b.dataset.i) === want; b.classList.toggle("on", hit); if (hit) on = b; });
    if (on) nav.scrollTo({ left: on.offsetLeft - nav.clientWidth / 2 + on.offsetWidth / 2, behavior: "smooth" });
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
  const mo = new MutationObserver((recs) => { const m = mainNow(); if (m && TAB_GUIDE[m.id] && !m.querySelector(":scope > .tab-guide")) later(); if (recs.some((r) => r.type === "attributes" || [...r.addedNodes].some((n) => n.nodeType === 1 && (n.matches?.(SEL) || n.querySelector?.(SEL))))) { folds(); later(); } });
  // 다른 화면 코드가 접힌 카드를 펼칠 때(바로가기 등)
  window.__cfold = { open: (sec) => { if (sec && sec.classList.contains("cf-shut")) setShut(sec, false); } };
  document.querySelectorAll("main").forEach((m) => mo.observe(m, { attributes: true, attributeFilter: ["hidden"], childList: true, subtree: true }));
  addEventListener("load", later);
  later();
})();
