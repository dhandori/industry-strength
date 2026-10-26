/* 페어 트레이딩 탭 (2026-10-26 추가)
   데이터: docs/data/pairs.json — scripts/pairs.py 가 시장 흐름판 갱신 때 함께 만든다. 목록은 config/pairs.json.
   비율 = A ÷ B (오르면 A가 B보다 강함). 종가끼리의 비율만 쓴다.
   다른 탭과 코드를 섞지 않는다. 공유하는 것은 테마 색뿐이다. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const st = { data: null, loading: null, open: null, days: 130 };
  const NS = "http://www.w3.org/2000/svg";
  const md = (s) => { const [, m, d] = s.split("-"); return `${+m}/${+d}`; };
  const sgn = (v, d = 1, u = "%") => v == null ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(d)}${u}`;
  const cls = (v) => v == null ? "" : v > 0 ? "up" : v < 0 ? "down" : "";
  const tk = (t) => t.replace(/^\^KQ11$/, "코스닥").replace(/^\^KS11$/, "코스피");
  const fmtR = (v) => v == null ? "–" : v >= 100 ? v.toFixed(1) : v >= 1 ? v.toFixed(3) : v.toFixed(4);

  async function load(force) {
    if (!st.data || force) {
      if (!st.loading || force) st.loading = fetch("data/pairs.json?v=" + Date.now(), { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
      try { st.data = await st.loading; } catch (e) {
        st.loading = null;
        $("#pairsMeta").textContent = "페어 자료가 아직 없어요. 다음 자동 갱신(한국장·미국장 마감 후) 때 채워져요.";
        $("#pairsBody").innerHTML = ""; return;
      }
    }
    render();
  }

  function svg(w, h, cls) { const s = document.createElementNS(NS, "svg"); s.setAttribute("viewBox", `0 0 ${w} ${h}`); if (cls) s.setAttribute("class", cls); return s; }
  function add(p, tag, attrs, text) { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text != null) n.textContent = text; p.append(n); return n; }
  const pts = (vals, x, y) => vals.map((v, k) => v == null ? null : `${x(k).toFixed(1)},${y(v).toFixed(1)}`).filter(Boolean).join(" ");

  // 카드 안 작은 선: 최근 120거래일 비율 + 50일선
  function spark(s) {
    const n = s.dates.length, k0 = Math.max(0, n - 120), r = s.ratio.slice(k0), m = s.ma50.slice(k0);
    const W = 260, H = 54, vals = [...r, ...m].filter((v) => v != null);
    const lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.08 || hi * 0.01;
    const x = (k) => 2 + k / Math.max(1, r.length - 1) * (W - 4), y = (v) => 3 + (1 - (v - lo + pad) / (hi - lo + 2 * pad)) * (H - 6);
    const el = svg(W, H, "pr-spark");
    add(el, "polyline", { points: pts(m, x, y), class: "pr-ma50" });
    add(el, "polyline", { points: pts(r, x, y), class: "pr-ratio" });
    add(el, "circle", { cx: x(r.length - 1), cy: y(r.at(-1)), r: 2.6, class: "pr-dot" });
    return el;
  }

  // 큰 차트: 비율 + 20·50·200일선 + 52주 고저선, 아래 RSI(30·70선). 마우스·손가락을 대면 그날 값.
  function bigChart(p) {
    const s = p.series, n = s.dates.length, k0 = Math.max(0, n - st.days);
    const sl = (a) => a.slice(k0), D = sl(s.dates), R = sl(s.ratio), M20 = sl(s.ma20), M50 = sl(s.ma50), M200 = sl(s.ma200), RSI = sl(s.rsi);
    const narrow = innerWidth < 700, W = narrow ? 360 : 760, top = narrow ? 230 : 300, gap = 26, rsiH = narrow ? 80 : 96;
    const H = top + gap + rsiH + 22, L = 6, Rp = narrow ? 52 : 62, pw = W - L - Rp;
    const vals = [...R, ...M20, ...M50, ...M200, s.hi52, s.lo52].filter((v) => v != null);
    let lo = Math.min(...vals), hi = Math.max(...vals); const pad = (hi - lo) * 0.06 || hi * 0.01; lo -= pad; hi += pad;
    const x = (k) => L + k / Math.max(1, D.length - 1) * pw, y = (v) => 8 + (1 - (v - lo) / (hi - lo)) * (top - 16);
    const ry0 = top + gap, ry = (v) => ry0 + (1 - v / 100) * rsiH;
    const el = svg(W, H, "pr-big");
    for (let i = 0; i <= 4; i++) { const v = lo + (hi - lo) * i / 4; add(el, "line", { x1: L, x2: L + pw, y1: y(v), y2: y(v), class: "pr-gl" }); add(el, "text", { x: W - Rp + 6, y: y(v) + 4, class: "pr-axis" }, fmtR(v)); }
    for (const [v, c, t] of [[s.hi52, "pr-hi", "52주 고점"], [s.lo52, "pr-lo", "52주 저점"]]) if (v != null && v >= lo && v <= hi) {
      add(el, "line", { x1: L, x2: L + pw, y1: y(v), y2: y(v), class: c }); add(el, "text", { x: L + pw - 4, y: y(v) - 4, "text-anchor": "end", class: `pr-axis ${c}-t` }, t);
    }
    add(el, "polyline", { points: pts(M200, x, y), class: "pr-m200" });
    add(el, "polyline", { points: pts(M50, x, y), class: "pr-m50" });
    add(el, "polyline", { points: pts(M20, x, y), class: "pr-m20" });
    add(el, "polyline", { points: pts(R, x, y), class: "pr-ratio big" });
    add(el, "circle", { cx: x(R.length - 1), cy: y(R.at(-1)), r: 3.5, class: "pr-dot" });
    // RSI
    add(el, "rect", { x: L, y: ry(70), width: pw, height: ry(30) - ry(70), class: "pr-rsi-band" });
    for (const v of [30, 50, 70]) { add(el, "line", { x1: L, x2: L + pw, y1: ry(v), y2: ry(v), class: v === 50 ? "pr-gl" : "pr-rsi-lv" }); add(el, "text", { x: W - Rp + 6, y: ry(v) + 4, class: "pr-axis" }, v); }
    add(el, "text", { x: L + 2, y: ry0 - 7, class: "pr-axis strong" }, `비율 RSI(14) ${RSI.at(-1) ?? "–"}`);
    add(el, "polyline", { points: pts(RSI, x, ry), class: "pr-rsi" });
    // 날짜 축
    const ticks = narrow ? 3 : 6;
    for (let i = 0; i < ticks; i++) { const k = Math.round(i * (D.length - 1) / (ticks - 1)); add(el, "text", { x: x(k), y: H - 4, class: "pr-axis", "text-anchor": i === 0 ? "start" : i === ticks - 1 ? "end" : "middle" }, md(D[k])); }
    // 마우스 읽기
    const cross = add(el, "line", { y1: 4, y2: ry(0), class: "pr-cross", visibility: "hidden" });
    const hit = add(el, "rect", { x: L, y: 0, width: pw, height: ry(0), fill: "transparent" });
    const wrap = document.createElement("div"); wrap.className = "pr-chart";
    const tip = document.createElement("div"); tip.className = "pr-tip"; tip.hidden = true;
    const show = (e) => {
      const b = el.getBoundingClientRect(), px = (e.clientX - b.left) / b.width * W;
      const k = Math.max(0, Math.min(D.length - 1, Math.round((px - L) / pw * (D.length - 1))));
      cross.setAttribute("x1", x(k)); cross.setAttribute("x2", x(k)); cross.setAttribute("visibility", "visible");
      tip.innerHTML = `<b>${D[k]}</b><span>비율 ${fmtR(R[k])}</span><span>20일선 ${fmtR(M20[k])}</span><span>50일선 ${fmtR(M50[k])}</span><span>200일선 ${fmtR(M200[k])}</span><span>RSI ${RSI[k] ?? "–"}</span>`;
      tip.hidden = false;
      const left = x(k) / W * b.width; tip.style.left = `${left > b.width * 0.6 ? left - tip.offsetWidth - 10 : left + 10}px`;
    };
    hit.addEventListener("pointermove", show); hit.addEventListener("pointerdown", show);
    hit.addEventListener("pointerleave", () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); });
    wrap.append(el, tip);
    return wrap;
  }

  const chip = ([t, c]) => `<span class="pr-chip ${c}">${esc(t)}</span>`;
  function card(p) {
    const name = `${esc(tk(p.a))} / ${esc(tk(p.b))}`;
    if (!p.series) return `<div class="pr-card off"><div class="pr-h"><b>${name}</b></div><p class="pr-desc">${esc(p.desc)}</p><p class="pr-none">자료를 받지 못했어요. 다음 갱신 때 다시 시도해요.</p></div>`;
    const flags = (p.flags || []).map(chip).join("");
    const zc = p.z == null ? "" : Math.abs(p.z) >= 2 ? (p.z < 0 ? "down" : "up") : "";
    const rc = p.rsi == null ? "" : p.rsi <= 30 ? "down" : p.rsi >= 70 ? "up" : "";
    return `<button class="pr-card${st.open === p.id ? " open" : ""}" type="button" data-id="${p.id}" aria-expanded="${st.open === p.id}">
      <div class="pr-h"><b>${name}</b><span class="pr-names">${esc(p.a_name)} ÷ ${esc(p.b_name)}</span>${p.ok ? "" : '<span class="pr-chip flat">지난 값</span>'}</div>
      <p class="pr-desc">${esc(p.desc)}</p>
      <div class="pr-mid"><div class="pr-sp"></div>
        <div class="pr-nums">
          <span><em>20일 비율</em><b class="ret ${cls(p.chg20)}">${sgn(p.chg20)}</b></span>
          <span><em>RSI</em><b class="${rc}">${p.rsi ?? "–"}</b></span>
          <span><em>Z점수</em><b class="${zc}">${p.z == null ? "–" : sgn(p.z, 2, "")}</b></span>
          <span><em>52주 위치</em><b>${p.pos52 == null ? "–" : Math.round(p.pos52) + "%"}</b></span>
        </div></div>
      <div class="pr-chips">${chip(p.trend)}${flags}</div>
    </button>`;
  }

  function detail(p) {
    const d = document.createElement("div"); d.className = "pr-detail";
    const legs = `같은 20거래일 ${esc(tk(p.a))} <b class="ret ${cls(p.a_ret20)}">${sgn(p.a_ret20)}</b> · ${esc(tk(p.b))} <b class="ret ${cls(p.b_ret20)}">${sgn(p.b_ret20)}</b>`;
    d.innerHTML = `<div class="pr-dhead"><div><b>${esc(tk(p.a))} ÷ ${esc(tk(p.b))}</b> <span class="pr-names">${p.basis_date} 종가 · 비율 ${fmtR(p.ratio)} · 52주 고점 대비 ${sgn(p.dist_hi)}</span><div class="pr-legs">${legs}</div></div>
      <div class="seg small pr-days"><button data-d="130" aria-pressed="${st.days === 130}">6개월</button><button data-d="260" aria-pressed="${st.days === 260}">1년</button></div></div>
      <div class="pr-legend"><span><i class="k-ratio"></i>비율</span><span><i class="k-m20"></i>20일선</span><span><i class="k-m50"></i>50일선</span><span><i class="k-m200"></i>200일선</span><span><i class="k-hl"></i>52주 고·저</span></div>`;
    d.append(bigChart(p));
    d.insertAdjacentHTML("beforeend", `<p class="pr-chg">비율 변화: 5일 <b class="ret ${cls(p.chg5)}">${sgn(p.chg5)}</b> · 20일 <b class="ret ${cls(p.chg20)}">${sgn(p.chg20)}</b> · 60일 <b class="ret ${cls(p.chg60)}">${sgn(p.chg60)}</b></p>`);
    $$(".pr-days button", d).forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); st.days = +b.dataset.d; render(); }));
    return d;
  }

  function render() {
    const d = st.data; if (!d) return;
    const all = d.groups.flatMap((g) => g.pairs), basis = all.map((p) => p.basis_date).filter(Boolean).sort().at(-1);
    $("#pairsMeta").textContent = `기준 ${basis || "–"} 종가 · 갱신 ${d.updated_at} · 페어 ${all.length}개${d.errors && d.errors.length ? ` · 확인 필요 ${d.errors.length}건` : ""}`;
    const box = $("#pairsBody");
    box.innerHTML = `<details class="card pr-help"><summary>이 탭 보는 법</summary>
      <p><b>비율 = A ÷ B</b>예요. 선이 오르면 A가 B보다 강하고, 내리면 B가 더 강해요. 가격이 아니라 <b>두 종목 사이의 힘겨루기</b>를 보는 화면이에요.</p>
      <p><b>추세</b>: 비율이 50일선·200일선 위에서 차례로 놓여 있으면 A 우위 추세, 반대면 B 우위 추세예요. 200일선 돌파·이탈은 상대 추세가 바뀌는 첫 신호로 많이 써요.</p>
      <p><b>RSI</b>(14일): 30 이하는 A가 B보다 짧은 기간에 너무 많이 밀렸다는 뜻(과매도), 70 이상은 너무 앞서갔다는 뜻(과매수)이에요.</p>
      <p><b>Z점수</b>: 비율이 최근 60일 평균에서 표준편차 몇 개만큼 떨어졌는지예요. ±2를 넘으면 평소 범위를 벗어난 것이라 되돌아올 가능성을 살펴볼 만해요.</p>
      <p><b>52주 위치</b>: 1년 최저 비율 0% ~ 최고 비율 100% 사이 어디쯤인지예요.</p>
      <p class="pr-warn">상대강도 화면이지 매매 신호가 아니에요. 실제 페어 트레이딩에는 헤지 비율(얼마씩 사고팔지)과 두 가격이 다시 붙는 경향인지 확인이 더 필요해요. 종가끼리 나눈 선이라 캔들은 그리지 않아요.</p></details>`;
    for (const g of d.groups) {
      const sec = document.createElement("section"); sec.className = "card pr-group";
      sec.innerHTML = `<div class="card-head"><h2>${esc(g.name)} <span class="sub">${g.pairs.length}개 · 카드를 누르면 큰 차트</span></h2></div><div class="pr-grid">${g.pairs.map(card).join("")}</div>`;
      $$(".pr-card[data-id]", sec).forEach((b) => {
        const p = g.pairs.find((x) => x.id === b.dataset.id);
        if (p && p.series) b.querySelector(".pr-sp").append(spark(p.series));
        b.addEventListener("click", () => { st.open = st.open === p.id ? null : p.id; render(); if (st.open) requestAnimationFrame(() => $(`.pr-detail`)?.scrollIntoView({ behavior: "smooth", block: "nearest" })); });
      });
      const op = g.pairs.find((x) => x.id === st.open && x.series);
      if (op) $(`.pr-card[data-id="${op.id}"]`, sec).after(detail(op));
      box.append(sec);
    }
  }

  let resizeT; addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (st.open && !$("#viewPairs").hidden) render(); }, 200); });
  window.__pairs = { show: () => load(false), reload: () => { if (!$("#viewPairs").hidden) load(true); else st.data = null; } };
})();
