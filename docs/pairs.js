/* 페어 트레이딩 탭 (2026-10-26 추가)
   데이터: docs/data/pairs.json — scripts/pairs.py 가 시장 흐름판 갱신 때 함께 만든다. 목록·해설 문구는 config/pairs.json.
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

  // ---------- 해석 문장
  // 추세는 비율과 50·200일선의 순서로, 극단은 RSI·Z점수로 판단한다. 같은 규칙을 카드와 큰 차트가 함께 쓴다.
  function verdict(p) {
    const t = p.trend?.[1];
    const head = t === "up" ? `${p.a_name} 쪽이 더 강한 흐름` : t === "down" ? `${p.b_name} 쪽이 더 강한 흐름` : "뚜렷한 우위 없이 엇갈리는 중";
    const ext = [];
    if (p.rsi != null && p.rsi <= 30) ext.push(`${p.a_name} 쪽이 단기로 너무 빨리 밀림`);
    else if (p.rsi != null && p.rsi >= 70) ext.push(`${p.a_name} 쪽이 단기로 너무 빨리 앞서감`);
    if (p.z != null && Math.abs(p.z) >= 2) ext.push("평소 범위를 벗어남");
    return { head, ext: ext.join(" · "), tone: t || "flat" };
  }
  function readings(p) {
    const out = [];
    const t = p.trend?.[1];
    out.push(t === "up" ? `<b>추세</b> 비율이 50일선과 200일선 위에 차례로 놓여 있어요 → <b>${esc(p.a_name)}</b> 우위가 이어지는 중. 뜻: ${esc(p.up)}.`
      : t === "down" ? `<b>추세</b> 비율이 50일선과 200일선 아래에 차례로 놓여 있어요 → <b>${esc(p.b_name)}</b> 우위가 이어지는 중. 뜻: ${esc(p.down)}.`
      : `<b>추세</b> 비율이 50일선·200일선 사이에서 엇갈려요(200일선 ${p.above200 ? "위" : "아래"}). 아직 어느 쪽 우위로 굳었다고 보기 어려워요.`);
    if (p.rsi != null) out.push(p.rsi <= 30 ? `<b>RSI ${p.rsi}</b> 30 이하 · 최근 2~3주 동안 ${esc(p.a_name)} 쪽이 너무 빨리 밀렸어요. 짧은 되돌림이 자주 나오는 자리지만, 추세가 강하면 더 내려가기도 해요.`
      : p.rsi >= 70 ? `<b>RSI ${p.rsi}</b> 70 이상 · 최근 2~3주 동안 ${esc(p.a_name)} 쪽이 너무 빨리 앞서갔어요. 쉬어 가는 경우가 많지만, 추세 초입엔 더 오르기도 해요.`
      : `<b>RSI ${p.rsi}</b> 30~70 사이 · 단기 과열이나 침체는 아니에요.`);
    if (p.z != null) out.push(Math.abs(p.z) >= 2 ? `<b>Z점수 ${sgn(p.z, 2, "")}</b> 최근 60일 평균에서 표준편차 ${Math.abs(p.z).toFixed(1)}개만큼 ${p.z < 0 ? "아래" : "위"} · 평소 범위를 벗어난 드문 자리라 평균 쪽으로 되돌아올지 지켜볼 만해요.`
      : `<b>Z점수 ${sgn(p.z, 2, "")}</b> 평소 범위(±2) 안이에요.`);
    if (p.pos52 != null) out.push(`<b>1년 범위</b> 최저 0% ~ 최고 100% 중 <b>${Math.round(p.pos52)}%</b> 위치 · 1년 최고 비율보다 ${Math.abs(p.dist_hi ?? 0).toFixed(1)}% 아래.`);
    return out;
  }

  // ---------- 그림
  function svg(w, h, cls) { const s = document.createElementNS(NS, "svg"); s.setAttribute("viewBox", `0 0 ${w} ${h}`); if (cls) s.setAttribute("class", cls); return s; }
  function add(p, tag, attrs, text) { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text != null) n.textContent = text; p.append(n); return n; }
  const pts = (vals, x, y) => vals.map((v, k) => v == null ? null : `${x(k).toFixed(1)},${y(v).toFixed(1)}`).filter(Boolean).join(" ");

  // 게이지: 값 위치에 점, 극단 구간은 색칠. 숫자는 위에 그대로.
  function gauge(label, text, v, min, max, zones, tone) {
    const pos = v == null ? null : Math.max(0, Math.min(100, (v - min) / (max - min) * 100));
    const z = zones.map(([a, b, c]) => `<i class="gz ${c}" style="left:${(a - min) / (max - min) * 100}%;width:${(b - a) / (max - min) * 100}%"></i>`).join("");
    return `<div class="pr-g"><div class="pr-gt"><em>${label}</em><b class="${tone || ""}">${text}</b></div><div class="pr-gb">${z}${pos == null ? "" : `<s style="left:${pos}%"></s>`}</div></div>`;
  }

  // 카드 안 작은 선: 최근 120거래일 비율 + 50일선, 오른쪽에 위·아래 방향 뜻
  function spark(p) {
    const s = p.series, n = s.dates.length, k0 = Math.max(0, n - 120), r = s.ratio.slice(k0), m = s.ma50.slice(k0);
    const W = 300, H = 66, vals = [...r, ...m].filter((v) => v != null);
    const lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.08 || hi * 0.01;
    const x = (k) => 2 + k / Math.max(1, r.length - 1) * (W - 6), y = (v) => 4 + (1 - (v - lo + pad) / (hi - lo + 2 * pad)) * (H - 8);
    const el = svg(W, H, "pr-spark");
    const area = `${x(0)},${H} ${pts(r, x, y)} ${x(r.length - 1)},${H}`;
    add(el, "polygon", { points: area, class: `pr-area ${p.trend?.[1] || "flat"}` });
    add(el, "polyline", { points: pts(m, x, y), class: "pr-ma50" });
    add(el, "polyline", { points: pts(r, x, y), class: "pr-ratio" });
    add(el, "circle", { cx: x(r.length - 1), cy: y(r.at(-1)), r: 3, class: "pr-dot" });
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
    // 위·아래 방향 뜻(왼쪽 위·아래 모서리)
    add(el, "text", { x: L + 4, y: 20, class: "pr-dir up" }, `↑ ${p.a_name} 강세`);
    add(el, "text", { x: L + 4, y: top - 8, class: "pr-dir down" }, `↓ ${p.b_name} 강세`);
    add(el, "polyline", { points: pts(M200, x, y), class: "pr-m200" });
    add(el, "polyline", { points: pts(M50, x, y), class: "pr-m50" });
    add(el, "polyline", { points: pts(M20, x, y), class: "pr-m20" });
    add(el, "polyline", { points: pts(R, x, y), class: "pr-ratio big" });
    add(el, "circle", { cx: x(R.length - 1), cy: y(R.at(-1)), r: 3.5, class: "pr-dot" });
    // RSI
    add(el, "rect", { x: L, y: ry(100), width: pw, height: ry(70) - ry(100), class: "pr-rsi-hot" });
    add(el, "rect", { x: L, y: ry(30), width: pw, height: ry(0) - ry(30), class: "pr-rsi-cold" });
    for (const v of [30, 50, 70]) { add(el, "line", { x1: L, x2: L + pw, y1: ry(v), y2: ry(v), class: v === 50 ? "pr-gl" : "pr-rsi-lv" }); add(el, "text", { x: W - Rp + 6, y: ry(v) + 4, class: "pr-axis" }, v); }
    add(el, "text", { x: L + 2, y: ry0 - 7, class: "pr-axis strong" }, `비율 RSI(14) ${RSI.at(-1) ?? "–"} · 70 위 과열 / 30 아래 침체`);
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

  // ---------- 카드·상세
  const chip = ([t, c]) => `<span class="pr-chip ${c}">${esc(t)}</span>`;
  function card(p) {
    const name = `${esc(tk(p.a))} / ${esc(tk(p.b))}`;
    if (!p.series) return `<div class="pr-card off"><div class="pr-h"><b>${name}</b></div><p class="pr-desc">${esc(p.desc)}</p><p class="pr-none">자료를 받지 못했어요. 다음 갱신 때 다시 시도해요.</p></div>`;
    const v = verdict(p);
    const rsiTone = p.rsi == null ? "" : p.rsi <= 30 ? "down" : p.rsi >= 70 ? "up" : "";
    const zTone = p.z == null ? "" : p.z <= -2 ? "down" : p.z >= 2 ? "up" : "";
    const gauges = gauge("RSI", p.rsi ?? "–", p.rsi, 0, 100, [[0, 30, "lo"], [70, 100, "hi"]], rsiTone)
      + gauge("Z점수", p.z == null ? "–" : sgn(p.z, 2, ""), p.z == null ? null : Math.max(-3, Math.min(3, p.z)), -3, 3, [[-3, -2, "lo"], [2, 3, "hi"]], zTone)
      + gauge("1년 범위 위치", p.pos52 == null ? "–" : Math.round(p.pos52) + "%", p.pos52, 0, 100, [[0, 10, "lo"], [90, 100, "hi"]], "");
    return `<button class="pr-card t-${v.tone}${st.open === p.id ? " open" : ""}" type="button" data-id="${p.id}" aria-expanded="${st.open === p.id}">
      <div class="pr-h"><b>${name}</b><span class="pr-names">${esc(p.a_name)} ÷ ${esc(p.b_name)}</span>${p.ok ? "" : '<span class="pr-chip flat">지난 값</span>'}
        <span class="pr-big20"><em>20일</em><b class="${cls(p.chg20)}">${sgn(p.chg20)}</b></span></div>
      <p class="pr-desc">${esc(p.desc)}</p>
      <p class="pr-verdict ${v.tone}">${esc(v.head)}${v.ext ? `<span> · ${esc(v.ext)}</span>` : ""}</p>
      <div class="pr-sp"><div class="pr-spwrap"></div><div class="pr-dirs"><span class="up">↑ ${esc(p.a_name)} 강세</span><span class="down">↓ ${esc(p.b_name)} 강세</span></div></div>
      <div class="pr-gauges">${gauges}</div>
      ${(p.flags || []).length ? `<div class="pr-chips">${p.flags.map(chip).join("")}</div>` : ""}
    </button>`;
  }

  function detail(p) {
    const d = document.createElement("div"); d.className = "pr-detail";
    const legs = `같은 20거래일 ${esc(tk(p.a))} <b class="ret ${cls(p.a_ret20)}">${sgn(p.a_ret20)}</b> · ${esc(tk(p.b))} <b class="ret ${cls(p.b_ret20)}">${sgn(p.b_ret20)}</b>`;
    d.innerHTML = `<div class="pr-dhead"><div><b>${esc(tk(p.a))} ÷ ${esc(tk(p.b))}</b> <span class="pr-names">${p.basis_date} 종가 · 비율 ${fmtR(p.ratio)}</span><div class="pr-legs">${legs}</div></div>
      <div class="seg small pr-days"><button data-d="130" aria-pressed="${st.days === 130}">6개월</button><button data-d="260" aria-pressed="${st.days === 260}">1년</button></div></div>
      <div class="pr-mean"><div class="up"><b>↑ 비율이 오르면</b>${esc(p.up)}</div><div class="down"><b>↓ 비율이 내리면</b>${esc(p.down)}</div></div>
      <div class="pr-read"><b>지금 읽기</b><ul>${readings(p).map((t) => `<li>${t}</li>`).join("")}</ul></div>
      <div class="pr-legend"><span><i class="k-ratio"></i>비율</span><span><i class="k-m20"></i>20일선</span><span><i class="k-m50"></i>50일선</span><span><i class="k-m200"></i>200일선</span><span><i class="k-hl"></i>52주 고·저</span></div>`;
    d.append(bigChart(p));
    d.insertAdjacentHTML("beforeend", `<p class="pr-chg">비율 변화: 5일 <b class="ret ${cls(p.chg5)}">${sgn(p.chg5)}</b> · 20일 <b class="ret ${cls(p.chg20)}">${sgn(p.chg20)}</b> · 60일 <b class="ret ${cls(p.chg60)}">${sgn(p.chg60)}</b></p>`);
    $$(".pr-days button", d).forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); st.days = +b.dataset.d; render(); }));
    return d;
  }

  function openPair(id) { st.open = st.open === id ? null : id; render(); if (st.open) requestAnimationFrame(() => $(".pr-detail")?.scrollIntoView({ behavior: "smooth", block: "nearest" })); }

  function render() {
    const d = st.data; if (!d) return;
    const all = d.groups.flatMap((g) => g.pairs), basis = all.map((p) => p.basis_date).filter(Boolean).sort().at(-1);
    $("#pairsMeta").textContent = `기준 ${basis || "–"} 종가 · 갱신 ${d.updated_at} · 페어 ${all.length}개${d.errors && d.errors.length ? ` · 확인 필요 ${d.errors.length}건` : ""}`;
    const box = $("#pairsBody");
    // 오늘 눈여겨볼 페어: 신호가 있는 페어를 먼저, 극단(Z·RSI)이 큰 순
    const hot = all.filter((p) => (p.flags || []).length).sort((a, b) => Math.abs(b.z ?? 0) - Math.abs(a.z ?? 0));
    const sum = `<section class="card pr-today"><div class="card-head"><h2>오늘 눈여겨볼 페어 <span class="sub">신호가 켜진 ${hot.length}개 · 누르면 큰 차트</span></h2></div>
      ${hot.length ? `<div class="pr-hot">${hot.map((p) => `<button class="pr-hotrow t-${verdict(p).tone}" type="button" data-id="${p.id}"><b>${esc(tk(p.a))} / ${esc(tk(p.b))}</b><span class="pr-hotv">${esc(verdict(p).head)}</span><span class="pr-hotc">${p.flags.map(chip).join("")}</span></button>`).join("")}</div>`
        : `<p class="pr-none">오늘은 추세 전환·과열·침체 신호가 켜진 페어가 없어요.</p>`}</section>`;
    box.innerHTML = sum + `<details class="card pr-help"><summary>이 탭 보는 법 <span class="sub">비율 · 추세 · RSI · Z점수 · 활용 예</span></summary>
      <div class="pr-help-grid">
        <div><h3>비율 읽기</h3><p><b>비율 = A ÷ B</b>예요. 두 종목이 같이 떨어져도 A가 덜 떨어지면 비율은 올라요. 그래서 <b>시장 방향과 상관없이 누가 더 센지</b>만 보여 줘요. 차트 왼쪽 위·아래의 ↑·↓ 표시가 각각 어느 쪽 강세인지 알려 줘요.</p></div>
        <div><h3>추세 (가장 먼저 볼 것)</h3><p>비율이 <b>50일선·200일선 위</b>에 차례로 있으면 A 우위가 굳은 상태, <b>아래</b>면 B 우위예요. 비율이 <b>200일선을 뚫거나 깨는 순간</b>이 상대 흐름이 바뀌는 첫 신호로 많이 쓰여요.</p></div>
        <div><h3>RSI (단기 과열·침체)</h3><p>최근 14거래일 동안 비율이 얼마나 한쪽으로 쏠렸는지예요. <b>70 위</b>는 A가 너무 빨리 앞서간 것, <b>30 아래</b>는 너무 빨리 밀린 것이에요. 되돌림이 자주 나오지만, 강한 추세 중엔 극단이 오래가기도 해요.</p></div>
        <div><h3>Z점수 (평소 범위)</h3><p>비율이 최근 60일 평균에서 표준편차 몇 개만큼 떨어졌는지예요. 보통 <b>±2 안</b>에서 움직이고, 넘으면 드문 자리라 평균으로 돌아올지 살펴볼 만해요. 페어 트레이딩에서 진입·청산 기준으로 많이 써요.</p></div>
        <div><h3>활용 예</h3><p>SMH/IGV가 200일선 아래로 내려가고 RSI가 30 아래면 → "소프트웨어 쪽으로 돈이 옮겨 가는 중인데, 단기로는 반도체가 너무 많이 밀렸다". 추세를 따를지, 되돌림을 노릴지는 <b>추세(50·200일선)를 먼저</b> 보고 정해요.</p></div>
        <div><h3>주의</h3><p class="pr-warn">상대강도를 보는 화면이지 매매 신호가 아니에요. 실제 페어 트레이딩에는 헤지 비율(얼마씩 사고팔지)과 두 가격이 다시 붙는 경향인지도 확인해야 해요. 종가끼리 나눈 선이라 캔들은 그리지 않아요.</p></div>
      </div></details>`;
    for (const g of d.groups) {
      const sec = document.createElement("section"); sec.className = "card pr-group";
      sec.innerHTML = `<div class="card-head"><h2>${esc(g.name)} <span class="sub">${g.pairs.length}개 · 카드를 누르면 큰 차트와 해설</span></h2></div><div class="pr-grid">${g.pairs.map(card).join("")}</div>`;
      $$(".pr-card[data-id]", sec).forEach((b) => {
        const p = g.pairs.find((x) => x.id === b.dataset.id);
        if (p && p.series) b.querySelector(".pr-spwrap").append(spark(p));
        b.addEventListener("click", () => openPair(p.id));
      });
      const op = g.pairs.find((x) => x.id === st.open && x.series);
      if (op) $(`.pr-card[data-id="${op.id}"]`, sec).after(detail(op));
      box.append(sec);
    }
    $$(".pr-hotrow", box).forEach((b) => b.addEventListener("click", () => { st.open = null; openPair(b.dataset.id); }));
  }

  let resizeT; addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (st.open && !$("#viewPairs").hidden) render(); }, 200); });
  window.__pairs = { show: () => load(false), reload: () => { if (!$("#viewPairs").hidden) load(true); else st.data = null; } };
})();
