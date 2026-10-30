/* 매크로 탭 카드 접기 (2026-10-30) — macro.js·econ.js가 그린 카드를 손대지 않고 접었다 편다.
   - 접힌 카드: 이름·상태·값(국채는 표, VIX·공포탐욕은 한 줄 판정)만. 누르면 그래프·설명이 펼쳐진다.
   - 처음엔 모두 접어 둔다(상태 색·꼬리표로 위험한 카드는 접힌 채로도 보인다). 사용자가 열고 닫은 건 기억한다.
   - 카드는 기간 버튼 등으로 자주 새로 그려지므로, 새로 그려질 때마다 상태를 다시 입힌다. */
(() => {
  const view = document.querySelector("#viewMacro");
  if (!view) return;
  const bar = document.querySelector("#mxfBar"), allBtn = document.querySelector("#mxfAll");
  const SEL = "article.mx-card, article.mx-duo";
  let mem = {};
  try { mem = JSON.parse(localStorage.getItem("mxf") || "{}") || {}; } catch (e) {}
  const save = () => { try { localStorage.setItem("mxf", JSON.stringify(mem)); } catch (e) {} };
  const keyOf = (c) => (c.querySelector(".mx-name")?.textContent || "").trim();
  const wantOpen = (c) => !!mem[keyOf(c)];

  function apply() {
    const cards = [...view.querySelectorAll(SEL)];
    cards.forEach((c) => {
      if (!c.classList.contains("mxf")) {
        c.classList.add("mxf");
        const h = c.querySelector(".mx-head");
        if (h) { h.setAttribute("role", "button"); h.tabIndex = 0; }
      }
      // 맨 아래 펼치기/접기 단추(한 번만 붙인다 — 다시 붙이면 감시가 또 돈다)
      if (!c.querySelector(":scope > .mxf-x")) c.insertAdjacentHTML("beforeend", `<button type="button" class="mxf-x"></button>`);
      const o = wantOpen(c);
      c.classList.toggle("open", o);
      c.querySelector(".mx-head")?.setAttribute("aria-expanded", o);
      const x = c.querySelector(":scope > .mxf-x"), tx = o ? "접기 ▴" : "그래프·설명 펼치기";
      if (x.textContent !== tx) { x.textContent = tx; x.setAttribute("aria-label", tx); }
    });
    bar.hidden = !cards.length;
    const t = cards.length && cards.every((c) => c.classList.contains("open")) ? "모두 접기" : "모두 펼치기";
    if (allBtn.textContent !== t) allBtn.textContent = t;   // 같은 글자를 다시 쓰면 감시가 또 돌아 무한 반복
  }
  function toggle(c, o) {
    o = o ?? !c.classList.contains("open");
    mem[keyOf(c)] = o;
    c.classList.toggle("open", o);
    c.querySelector(".mx-head")?.setAttribute("aria-expanded", o);
  }

  // 접힌 카드는 아무 데나 눌러도 펼치고, 펼친 카드는 제목 줄을 눌러야 접는다(안의 기간 버튼을 누르다 접히지 않게)
  view.addEventListener("click", (e) => {
    const c = e.target.closest(SEL);
    if (!c || e.target.closest("a, button:not(.mxf-x), summary, select, input")) return;
    if (c.classList.contains("open") && !e.target.closest(".mx-head, .mxf-x")) return;
    toggle(c); save(); apply();
  });
  view.addEventListener("keydown", (e) => {
    const h = e.target.closest && e.target.closest(".mxf > .mx-head");
    if (!h || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault(); toggle(h.parentElement); save(); apply();
  });
  allBtn.addEventListener("click", () => {
    const cards = [...view.querySelectorAll(SEL)], o = !cards.every((c) => c.classList.contains("open"));
    cards.forEach((c) => toggle(c, o)); save(); apply();
  });

  let t;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(apply, 30); })
    .observe(view, { childList: true, subtree: true });
})();
