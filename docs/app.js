/* 산업 강도판 화면 */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const state = { market: "KR", sort: "rank", group: "전체", data: {}, series: {}, charts: [], openId: null };
  const HEAT_DAYS = 40;
  const WEAK = ["3단계 둔화", "4단계 하락", "1단계 바닥"];

  // ---------- theme
  const root = document.documentElement;
  try { const t = localStorage.getItem("is-theme"); if (t) root.dataset.theme = t; } catch (e) {}
  const isDark = () => root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  $("#themeBtn").addEventListener("click", () => {
    root.dataset.theme = isDark() ? "light" : "dark";
    try { localStorage.setItem("is-theme", root.dataset.theme); } catch (e) {}
    rerenderCharts();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", rerenderCharts);
  const css = (v) => getComputedStyle(root).getPropertyValue(v).trim();

  // ---------- helpers
  const fmtPct = (v, d = 1) => v == null ? "–" : (v > 0 ? "+" : "") + v.toFixed(d) + "%";
  const cls = (v) => v == null ? "" : v > 0 ? "up" : v < 0 ? "down" : "";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtNum = (v, cur) => v == null ? "–" : cur === "원" ? Math.round(v).toLocaleString("ko-KR") + "원" : "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const md = (d) => { const [, m, dd] = d.split("-"); return `${+m}/${+dd}`; };

  async function getJSON(url) {
    const r = await fetch(url + "?v=" + Math.floor(Date.now() / 600000), { cache: "no-store" });
    if (!r.ok) throw new Error(url + " " + r.status);
    return r.json();
  }

  // ---------- market switch
  $$(".seg[role=tablist] button").forEach((b) => b.addEventListener("click", () => {
    state.market = b.dataset.market;
    $$(".seg[role=tablist] button").forEach((x) => x.setAttribute("aria-selected", x === b));
    state.group = "전체";
    try { history.replaceState(null, "", "#" + state.market); } catch (e) {}
    load();
  }));
  $$("#sortSeg button").forEach((b) => b.addEventListener("click", () => {
    state.sort = b.dataset.sort;
    $$("#sortSeg button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    renderTable();
  }));
  $("#groupSel").addEventListener("change", (e) => { state.group = e.target.value; renderTable(); });

  async function load() {
    const m = state.market;
    $("#meta").textContent = "불러오는 중…";
    try {
      if (!state.data[m]) state.data[m] = await getJSON(`data/${m}.json`);
    } catch (e) {
      $("#meta").textContent = "데이터를 불러오지 못했어요. 잠시 후 새로고침해 주세요.";
      return;
    }
    render();
  }

  function render() {
    const d = state.data[state.market];
    $("#meta").textContent = `${d.label} 기준일 ${d.basis_date} 종가 · 갱신 ${d.updated_at} · 세부 산업 ${d.items.length}개`;
    const w = $("#warn");
    if (d.warnings && d.warnings.length) { w.hidden = false; w.innerHTML = "<b>데이터 확인 필요</b> · " + d.warnings.map(esc).join(" · "); }
    else w.hidden = true;
    const groups = ["전체", ...new Set(d.items.map((i) => i.group))];
    $("#groupSel").innerHTML = groups.map((g) => `<option${g === state.group ? " selected" : ""}>${esc(g)}</option>`).join("");
    renderTiles(d); renderSignals(d); renderTable(); renderHeat(d); renderGroups(d); renderBreadth(d);
  }

  // ---------- tiles
  function renderTiles(d) {
    const b = d.benchmark;
    const rc = b.regime === "상승 추세" ? "up" : b.regime === "하락 추세" ? "down" : "neutral";
    const br = d.breadth.above50.filter((v) => v != null);
    const brNow = br.at(-1), brPrev = br.at(-21);
    const s2 = d.items.filter((i) => i.stage === "2단계 상승").length;
    const s2t = d.items.filter((i) => i.stage === "2단계 진입 시도").length;
    $("#tiles").innerHTML = `
      <div class="tile"><div class="k">시장 국면</div>
        <div class="v"><span class="badge ${rc}" style="font-size:15px;padding:3px 10px"><span class="dot"></span>${b.regime}</span></div>
        <div class="d">${esc(b.etf)} ${b.above50 ? "50일선 위" : "50일선 아래"} · ${b.above200 ? "200일선 위" : "200일선 아래"} · 200일선 ${b.ma200_up ? "상승" : "하락"}</div></div>
      <div class="tile"><div class="k">${esc(b.name)} 20일 수익률</div>
        <div class="v ret ${cls(b.ret20)}">${fmtPct(b.ret20)}</div>
        <div class="d">5일 ${fmtPct(b.ret5)} · 60일 ${fmtPct(b.ret60)}</div></div>
      <div class="tile"><div class="k">50일선 위 산업 비율</div>
        <div class="v">${brNow == null ? "–" : brNow.toFixed(0) + "%"}</div>
        <div class="d">20거래일 전 ${brPrev == null ? "–" : brPrev.toFixed(0) + "%"}${brNow != null && brPrev != null ? ` (${brNow >= brPrev ? "▲" : "▼"}${Math.abs(brNow - brPrev).toFixed(0)}%p)` : ""}</div></div>
      <div class="tile"><div class="k">2단계 상승 산업</div>
        <div class="v">${s2}<span style="font-size:15px;color:var(--muted);font-weight:600"> / ${d.items.length}</span></div>
        <div class="d">진입 시도 ${s2t}개 포함 시 ${s2 + s2t}개</div></div>`;
  }

  // ---------- signals
  function renderSignals(d) {
    const groups = [
      { t: "순위 급상승", c: "var(--up)", desc: "5일 새 크게 올라온 산업" },
      { t: "신규 상위권", c: "var(--accent)" },
      { t: "52주 신고가", c: "var(--good)" },
      { t: "RS 신고가", c: "var(--good)" },
      { t: "50일선 돌파", c: "var(--accent)" },
      { t: "약화 경고", c: "var(--down)", any: ["상위권 이탈", "50일선 이탈"] },
    ];
    $("#signals").innerHTML = groups.map((g) => {
      const keys = g.any || [g.t];
      const list = d.items.filter((i) => i.tags.some((t) => keys.includes(t)));
      return `<div class="sig"><h3><span class="dot" style="color:${g.c}"></span>${g.t} <span class="cnt">${list.length}</span></h3>
        <div class="chips">${list.length ? list.map((i) => {
          const weak = !g.any && WEAK.includes(i.stage);
          return `<button class="chip${weak ? " weak" : ""}" data-id="${i.id}"${weak ? ' title="가격 추세는 아직 약함(하락 속 상대 강세)"' : ""}>${esc(i.name)}${weak ? " ↘" : ""}</button>`;
        }).join("") : '<span class="none">해당 없음</span>'}</div></div>`;
    }).join("") + `<p class="foot-note" style="grid-column:1/-1;margin:0">↘ 표시는 순위는 올랐지만 가격은 아직 하락·둔화 단계인 산업이에요. 덜 빠져서 순위가 오른 경우일 수 있으니 추세 확인이 먼저예요.</p>`;
    $$("#signals .chip").forEach((c) => c.addEventListener("click", () => openDetail(c.dataset.id)));
  }

  // ---------- table
  function renderTable() {
    const d = state.data[state.market];
    if (!d) return;
    let rows = d.items.filter((i) => state.group === "전체" || i.group === state.group);
    const k = state.sort;
    rows = rows.slice().sort((a, b) => {
      const av = a[k], bv = b[k];
      if (av == null && bv == null) return (a.rank ?? 999) - (b.rank ?? 999);
      if (av == null) return 1; if (bv == null) return -1;
      return k === "rank_chg5" ? bv - av || a.rank - b.rank : av - bv;
    });
    const stageCls = { "2단계 상승": "s2", "2단계 진입 시도": "s2t", "4단계 하락": "s4" };
    const ret = (v, rk) => `<span class="ret ${cls(v)}">${fmtPct(v)}</span><span class="rsub">${rk == null ? "–" : rk + "위"}</span>`;
    $("#rankTable tbody").innerHTML = rows.map((i) => {
      const ch = i.rank_chg5;
      const chg = ch == null ? "" : ch > 0 ? `<span class="chg up">▲${ch}</span>` : ch < 0 ? `<span class="chg down">▼${-ch}</span>` : `<span class="chg flat">–</span>`;
      const checks = i.checks ? `<span class="checks" aria-label="추세 조건 ${i.checks.filter(Boolean).length}/5">${i.checks.map((c) => `<i class="${c ? "on" : ""}"></i>`).join("")}</span>` : `<span class="rsub">이력 부족</span>`;
      const tags = i.tags.filter((t) => !t.includes("이탈")).slice(0, 2).map((t) => `<span class="tag-mini">${t}</span>`).join("");
      return `<tr data-id="${i.id}" class="${i.top ? "top" : ""}">
        <td><span class="rk">${i.rank ?? "–"}</span>${chg}</td>
        <td class="name"><b>${esc(i.name)}${i.stale ? '<span class="stale">지연</span>' : ""}</b><span>${esc(i.etf)}</span>${tags ? "<br>" + tags : ""}</td>
        <td><div class="bar"><i><b style="width:${i.score ?? 0}%"></b></i><span>${i.score == null ? "–" : Math.round(i.score)}</span></div></td>
        <td class="num">${ret(i.ret5, i.rank5)}</td>
        <td class="num">${ret(i.ret20, i.rank20)}</td>
        <td class="num">${ret(i.ret60, i.rank60)}</td>
        <td class="num" title="${i.streak_start ? i.streak_start + "부터" : ""}">${i.streak ? `<b>${i.streak}일</b><span class="rsub">${md(i.streak_start)}~</span>` : '<span class="rsub">–</span>'}</td>
        <td>${checks}</td>
        <td class="num">${i.dist_high == null ? "–" : i.dist_high.toFixed(1) + "%"}</td>
        <td><span class="stage ${stageCls[i.stage] || ""}">${i.stage}</span></td>
      </tr>`;
    }).join("");
    $$("#rankTable tbody tr").forEach((tr) => tr.addEventListener("click", () => openDetail(tr.dataset.id)));
    $("#tableNote").innerHTML = `파란 띠 = 종합 순위 상위 25%(${d.top_cut}위 이내). 수익률 아래 작은 숫자는 그 기간 순위예요. 표가 넘치면 옆으로 밀어서 보세요.`;
  }

  // ---------- heatmap
  function heatColor(rank, n) {
    if (rank == null) return "transparent";
    const p = n > 1 ? 1 - (rank - 1) / (n - 1) : 1;
    const step = Math.min(7, Math.max(0, Math.floor(p * 8)));
    return `var(--h${step})`;
  }
  function renderHeat(d) {
    const dates = d.history.dates.slice(-HEAT_DAYS);
    const n = d.n;
    const items = d.items.filter((i) => i.rank != null);
    const el = $("#heat");
    el.style.gridTemplateColumns = `minmax(84px, 130px) repeat(${dates.length}, minmax(6px, 1fr))`;
    let h = "";
    for (const it of items) {
      const rk = d.history.rank[it.id].slice(-HEAT_DAYS);
      h += `<div class="hn" data-id="${it.id}" title="${esc(it.name)}">${it.rank}. ${esc(it.name)}</div>`;
      h += rk.map((r, k) => `<div class="hc" style="background:${heatColor(r, n)}" data-t="${esc(it.name)} · ${dates[k]} · ${r == null ? "데이터 없음" : r + "위"}"></div>`).join("");
    }
    h += `<div></div>` + dates.map((dt, k) => `<div class="hd">${k % 10 === 0 || k === dates.length - 1 ? md(dt) : ""}</div>`).join("");
    el.innerHTML = h;
    $$(".hn", el).forEach((x) => x.addEventListener("click", () => openDetail(x.dataset.id)));
    bindTips(el, ".hc");
  }

  const tip = $("#tip");
  function bindTips(el, sel) {
    el.addEventListener("pointermove", (e) => {
      const c = e.target.closest(sel);
      if (!c) { tip.hidden = true; return; }
      tip.textContent = c.dataset.t; tip.hidden = false;
      const x = Math.min(e.clientX + 12, innerWidth - tip.offsetWidth - 8);
      tip.style.left = x + "px"; tip.style.top = (e.clientY - 36) + "px";
    });
    el.addEventListener("pointerleave", () => { tip.hidden = true; });
  }

  // ---------- groups
  function renderGroups(d) {
    $("#groups").innerHTML = d.groups.map((g) => `
      <div class="grp" data-t="${esc(g.group)}: 평균 강도 ${g.score} · 상위 절반 ${g.top_half}/${g.n} · 2단계 ${g.stage2}/${g.n}">
        <span class="gn">${esc(g.group)}</span>
        <span class="gb"><b style="width:${g.score ?? 0}%"></b></span>
        <span class="gm">${g.score == null ? "–" : Math.round(g.score)}점 · 상위 ${g.top_half}/${g.n}</span>
      </div>`).join("");
    bindTips($("#groups"), ".grp");
  }

  // ---------- charts
  function baseChart(el, opts = {}) {
    const LW = window.LightweightCharts;
    const ch = LW.createChart(el, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: css("--muted"), fontSize: 11,
                fontFamily: getComputedStyle(document.body).fontFamily },
      grid: { vertLines: { color: css("--grid") }, horzLines: { color: css("--grid") } },
      rightPriceScale: { borderColor: css("--line"), scaleMargins: { top: 0.08, bottom: 0.06 }, ...(opts.priceScale || {}) },
      timeScale: { borderColor: css("--line"), timeVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: { mode: 1 },
      handleScroll: { vertTouchDrag: false },
      localization: { locale: "ko-KR", priceFormatter: opts.fmt },
    });
    state.charts.push(ch);
    return ch;
  }
  const pts = (dates, vals) => dates.map((t, k) => ({ time: t, value: vals[k] })).filter((p) => p.value != null);
  function line(ch, dates, vals, color, width = 2, extra = {}) {
    const s = ch.addLineSeries({ color, lineWidth: width, priceLineVisible: false, lastValueVisible: true, crosshairMarkerRadius: 4, ...extra });
    s.setData(pts(dates, vals));
    return s;
  }
  function legend(el, items, ch) {
    const draw = (vals) => { el.innerHTML = items.map((it, k) => `<span><i style="background:${it.c}"></i>${it.n}${vals && vals[k] != null ? ` <b class="tnum">${it.f(vals[k])}</b>` : ""}</span>`).join(""); };
    draw(items.map((it) => it.last));
    ch.subscribeCrosshairMove((p) => {
      if (!p || !p.time) { draw(items.map((it) => it.last)); return; }
      draw(items.map((it) => { const v = p.seriesData.get(it.s); return v ? v.value : null; }));
    });
  }
  function clearCharts(scope) {
    state.charts = state.charts.filter((c) => {
      const el = c.chartElement ? c.chartElement() : null;
      if (!scope || (el && scope.contains(el))) { try { c.remove(); } catch (e) {} return false; }
      return true;
    });
  }

  function renderBreadth(d) {
    const el = $("#breadthChart");
    clearCharts(el); el.innerHTML = "";
    const ch = baseChart(el, { fmt: (v) => v.toFixed(0) + "%", priceScale: { autoScale: false } });
    const s1 = line(ch, d.breadth.dates, d.breadth.above50, css("--accent"), 2);
    const s2 = line(ch, d.breadth.dates, d.breadth.stage2, css("--good"), 2, { lineStyle: 0 });
    s1.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });
    s1.createPriceLine({ price: 50, color: css("--muted"), lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
    ch.timeScale().fitContent();
    let lg = el.previousElementSibling;
    if (!lg || !lg.classList.contains("chart-legend")) { lg = document.createElement("div"); lg.className = "chart-legend"; el.before(lg); }
    legend(lg, [
      { n: "50일선 위", c: css("--accent"), s: s1, f: (v) => v.toFixed(0) + "%", last: d.breadth.above50.at(-1) },
      { n: "2단계 상승", c: css("--good"), s: s2, f: (v) => v.toFixed(0) + "%", last: d.breadth.stage2.at(-1) },
    ], ch);
  }

  // ---------- detail
  async function openDetail(id) {
    const d = state.data[state.market];
    const it = d.items.find((x) => x.id === id);
    if (!it) return;
    state.openId = id;
    $("#drawer").hidden = false;
    document.body.style.overflow = "hidden";
    $("#dTitle").textContent = `${it.name}`;
    $("#dSub").textContent = `${it.etf} (${it.ticker}) · ${it.group} · 종가 ${fmtNum(it.close, d.currency)} (${fmtPct(it.chg1, 2)}) · ${it.last_date}`;
    const st = [
      ["종합 순위", it.rank == null ? "–" : `${it.rank}위 / ${d.n}`],
      ["5일 순위 변화", it.rank_chg5 == null ? "–" : it.rank_chg5 > 0 ? `▲${it.rank_chg5}` : it.rank_chg5 < 0 ? `▼${-it.rank_chg5}` : "변화 없음"],
      ["20일 순위 변화", it.rank_chg20 == null ? "–" : it.rank_chg20 > 0 ? `▲${it.rank_chg20}` : it.rank_chg20 < 0 ? `▼${-it.rank_chg20}` : "변화 없음"],
      ["상위권 지속", it.streak ? `${it.streak}일 (${md(it.streak_start)}~)` : "–"],
      ["20일 수익률", fmtPct(it.ret20)], ["60일 수익률", fmtPct(it.ret60)], ["120일 수익률", fmtPct(it.ret120)],
      ["52주 고점 대비", it.dist_high == null ? "–" : it.dist_high.toFixed(1) + "%"],
      ["단계", it.stage], ["RS선 50일 평균 위", it.rs_above_ma50 == null ? "–" : it.rs_above_ma50 ? "예" : "아니오"],
      ["거래량(20일/60일)", it.vol_ratio == null ? "–" : it.vol_ratio.toFixed(2) + "배"],
      ["종합 강도", it.score == null ? "–" : Math.round(it.score) + "점"],
    ];
    $("#dStats").innerHTML = st.map(([k, v]) => `<div><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`).join("");
    $("#dTags").innerHTML = it.tags.map((t) => `<span class="badge ${t.includes("이탈") ? "down" : "up"}">${t}</span>`).join("") || "";
    try {
      if (!state.series[state.market]) state.series[state.market] = await getJSON(`data/${state.market}_series.json`);
    } catch (e) { $("#cPrice").textContent = "차트 데이터를 불러오지 못했어요."; return; }
    if (state.openId !== id) return;
    drawDetail(it);
  }
  function drawDetail(it) {
    const d = state.data[state.market];
    const S = state.series[state.market];
    const s = S.items[it.id];
    const dates = S.dates;
    const panel = $(".drawer-panel");
    clearCharts(panel);
    ["#cPrice", "#cRs", "#cRank"].forEach((q) => { $(q).innerHTML = ""; });
    const pf = d.currency === "원" ? (v) => Math.round(v).toLocaleString("ko-KR") : (v) => v.toFixed(2);

    const c1 = baseChart($("#cPrice"), { fmt: pf });
    const sp = line(c1, dates, s.close, css("--price"), 2);
    const m20 = line(c1, dates, s.ma20, css("--ma20"), 1.5, { lastValueVisible: false });
    const m50 = line(c1, dates, s.ma50, css("--ma50"), 1.5, { lastValueVisible: false });
    const m200 = line(c1, dates, s.ma200, css("--ma200"), 1.5, { lastValueVisible: false });
    c1.timeScale().fitContent();
    const lastOf = (a) => { for (let k = a.length - 1; k >= 0; k--) if (a[k] != null) return a[k]; return null; };
    legend($("#lgPrice"), [
      { n: "종가", c: css("--price"), s: sp, f: pf, last: lastOf(s.close) },
      { n: "20일선", c: css("--ma20"), s: m20, f: pf, last: lastOf(s.ma20) },
      { n: "50일선", c: css("--ma50"), s: m50, f: pf, last: lastOf(s.ma50) },
      { n: "200일선", c: css("--ma200"), s: m200, f: pf, last: lastOf(s.ma200) },
    ], c1);

    const c2 = baseChart($("#cRs"), { fmt: (v) => v.toFixed(1) });
    const rs = line(c2, dates, s.rs, css("--accent"), 2);
    const rsm = line(c2, dates, s.rs_ma50, css("--ma20"), 1.5, { lastValueVisible: false });
    c2.timeScale().fitContent();
    legend($("#lgRs"), [
      { n: `RS선 (${d.benchmark.etf} 대비)`, c: css("--accent"), s: rs, f: (v) => v.toFixed(1), last: lastOf(s.rs) },
      { n: "RS 50일 평균", c: css("--ma20"), s: rsm, f: (v) => v.toFixed(1), last: lastOf(s.rs_ma50) },
    ], c2);

    const c3 = baseChart($("#cRank"), { fmt: (v) => Math.round(v) + "위", priceScale: { invertScale: true } });
    const rk = line(c3, d.history.dates, d.history.rank[it.id], css("--accent"), 2, { lineType: 1 });
    rk.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: 1, maxValue: d.n } }) });
    rk.createPriceLine({ price: d.top_cut + 0.5, color: css("--good"), lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "상위 25%" });
    c3.timeScale().fitContent();
    // 세 차트의 시간축을 함께 움직이게
    const all = [c1, c2, c3];
    all.forEach((c) => c.timeScale().subscribeVisibleLogicalRangeChange((r) => {
      if (!r || syncing) return; syncing = true;
      all.forEach((o) => { if (o !== c) o.timeScale().setVisibleLogicalRange(r); });
      syncing = false;
    }));
  }
  let syncing = false;

  function closeDrawer() {
    $("#drawer").hidden = true; document.body.style.overflow = ""; state.openId = null;
    clearCharts($(".drawer-panel"));
  }
  $$("[data-close]").forEach((b) => b.addEventListener("click", closeDrawer));
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#drawer").hidden) closeDrawer(); });

  function rerenderCharts() {
    const d = state.data[state.market];
    if (!d) return;
    requestAnimationFrame(() => {
      renderBreadth(d);
      if (state.openId && state.series[state.market]) drawDetail(d.items.find((x) => x.id === state.openId));
    });
  }

  // start
  const h = (location.hash || "").replace("#", "").toUpperCase();
  if (h === "US" || h === "KR") {
    state.market = h;
    $$(".seg[role=tablist] button").forEach((x) => x.setAttribute("aria-selected", x.dataset.market === h));
  }
  load();
})();
