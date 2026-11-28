/* 시장 상황판 화면 */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const state = { market: "KR", sort: "rank", memSort: "ret20", memDir: 1, group: "전체", data: {}, series: {}, charts: [], openId: null };
  window.__isMarket = () => state.market;
  const HEAT_DAYS = 40;
  const WEAK = ["상승 둔화", "하락 추세", "바닥 다지기"];

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
  const fmtNum = (v, cur) => v == null ? "–" : cur === "원" || cur === "엔" ? Math.round(v).toLocaleString("ko-KR") + cur : "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const md = (d) => { const [, m, dd] = d.split("-"); return `${+m}/${+dd}`; };

  async function getJSON(url) {
    const r = await fetch(url + "?v=" + dataStamp, { cache: "no-store" });
    if (!r.ok) throw new Error(url + " " + r.status);
    return r.json();
  }

  // ---------- market switch
  $$(".seg[role=tablist] button").forEach((b) => b.addEventListener("click", () => {
    state.market = b.dataset.market;
    $$(".seg[role=tablist] button").forEach((x) => x.setAttribute("aria-selected", x === b));
    marketTabs();
    if (!viewOk(state.view)) setView("strength");
    state.group = "전체"; state.sector = null; state.exOpen = new Set(); state.exAll = new Set();
    setHash();
    load();
    if (state.view === "highs") window.__highs && window.__highs.show(state.market);
    if (state.view === "macro") window.__macro && window.__macro.rerender();
  }));

  // ---------- 화면 전환: 산업 강도 / 52주 신고가 (2026-10-21)
  state.view = "strength";
  // 시장별로 의미 있는 탭만 (2026-11-12 사용자 결정): 한국은 산업 강도·52주 신고가·매크로 3개, 미국은 6개 모두.
  // AI 시장(세계 공통)·페어(미국 ETF 위주)·포지셔닝(미국 CTA·S&P500·CFTC)은 미국에서만 보인다.
  // 한국인 채로 이 탭 주소(#KR-ai 등)로 들어오면 시장을 미국으로 바꿔 연다(옛 링크가 깨지지 않게).
  // 일본(2026-11-16 추가)은 한국처럼 산업 강도·52주 신고가·매크로 지수 3개.
  const US_ONLY = ["ai", "pairs", "positioning"];
  const JP_VIEWS = ["strength", "highs", "macro"];
  const viewOk = (v, mk = state.market) => mk === "US" || (mk === "JP" ? JP_VIEWS.includes(v) : !US_ONLY.includes(v));
  function marketTabs() {
    $$(".view-tabs button").forEach((x) => { x.hidden = !viewOk(x.dataset.view); });
  }
  function useMarket(m) {
    if (state.market === m) return;
    state.market = m;
    $$(".seg[role=tablist] button").forEach((x) => x.setAttribute("aria-selected", x.dataset.market === m));
    marketTabs();
    load();
  }
  function setHash() { try { history.replaceState(null, "", "#" + state.market + (state.view !== "strength" ? "-" + state.view : "")); } catch (e) {} }
  function setView(v) {
    if (!viewOk(v)) useMarket(US_ONLY.includes(v) ? "US" : "KR");
    state.view = v;
    $$(".view-tabs button").forEach((x) => x.setAttribute("aria-selected", x.dataset.view === v));
    $("#viewStrength").hidden = v !== "strength";
    $("#viewHighs").hidden = v !== "highs";
    $("#viewMacro").hidden = v !== "macro";
    $("#viewAi").hidden = v !== "ai";
    $("#viewPairs").hidden = v !== "pairs";
    $("#viewPositioning").hidden = v !== "positioning";
    document.body.classList.toggle("v-highs", v === "highs");
    document.body.classList.toggle("v-macro", v === "macro");
    document.body.classList.toggle("v-ai", v === "ai");
    document.body.classList.toggle("v-pairs", v === "pairs");
    document.body.classList.toggle("v-positioning", v === "positioning");
    setHash();
    if (v === "highs") window.__highs && window.__highs.show(state.market);
    else if (v === "macro") window.__macro && window.__macro.show();
    else if (v === "ai") window.__ai && window.__ai.show();
    else if (v === "pairs") window.__pairs && window.__pairs.show();
    else if (v === "positioning") window.__positioning && window.__positioning.show();
    else requestAnimationFrame(rerenderCharts);
    scrollTo({ top: 0 });
  }
  $$(".view-tabs button").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
  window.__isBoard = () => ({ data: state.data, series: state.series, open: openDetail });
  // 섹터 차트 카드에서 '세부 산업 순위 보기'를 누르면 섹터 칸을 누른 것과 같게 거른다.
  window.__isSectorPick = (ticker, name, items) => {
    const d = state.data[state.market];
    if (!d) return;
    // 섹터 워치 칸에 없는 업종(미국 세부 업종 ETF)은 넘겨받은 세부 산업 목록으로 거른다.
    state.flowSec = (d.sectors || []).some((x) => x.ticker === ticker) ? null : { ticker, name, items: items || [] };
    state.sector = ticker; state.group = "전체"; $("#groupSel").value = "전체";
    renderSectors(d); renderTable();
    document.getElementById("rank-h").closest("section").scrollIntoView({ behavior: "smooth", block: "start" });
  };
  // ---------- 표 정렬 공통 (2026-11-03): 정렬 단추나 열 제목을 누르면 그 기준, 같은 걸 한 번 더 누르면 방향이 뒤집힌다.
  // 값 함수는 '클수록 좋은' 숫자를 돌려준다(순위는 −순위). 빈 값은 방향과 상관없이 늘 맨 아래. 이름은 가나다순.
  const STAGE_ORD = { "상승 추세": 5, "상승 전환 시도": 4, "바닥 다지기": 3, "상승 둔화": 2, "하락 추세": 1 };
  function sortBy(rows, val, dir, tie) {
    return rows.slice().sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av == null && bv == null) return tie(a, b);
      if (av == null) return 1; if (bv == null) return -1;
      const c = typeof av === "string" ? av.localeCompare(bv, "ko") : bv - av;
      return c * dir || tie(a, b);
    });
  }
  // 정렬 단추·열 제목 표시: 고른 기준은 진하게, 거꾸로(나쁜 순·가나다 역순)일 땐 ▲
  function markSort(seg, attr, table, key, dir) {
    if (seg) $$("button", seg).forEach((x) => { const on = x.dataset[attr] === key; x.setAttribute("aria-pressed", on); x.dataset.rev = on && dir < 0 ? "1" : ""; });
    if (table) $$("th[data-sk]", table).forEach((th) => { const on = th.dataset.sk === key; th.classList.toggle("on", on); th.dataset.dir = on ? (dir < 0 ? "up" : "down") : ""; th.setAttribute("aria-sort", on ? (dir < 0 ? "ascending" : "descending") : "none"); });
  }
  const pick = (cur, dir, key) => (cur === key ? [key, -dir] : [key, 1]);
  state.sortDir = 1;
  const setRankSort = (key) => { [state.sort, state.sortDir] = pick(state.sort, state.sortDir, key); renderTable(); };
  $$("#sortSeg button").forEach((b) => b.addEventListener("click", () => setRankSort(b.dataset.sort)));
  $$("#rankTable th[data-sk]").forEach((th) => { th.tabIndex = 0; th.addEventListener("click", () => setRankSort(th.dataset.sk)); th.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setRankSort(th.dataset.sk); } }); });
  // 순위 흐름 줄 순서: 지금 순위 / 화면 기간 동안 순위가 많이 오른 순(강세가 막 시작된 산업이 위로)
  state.heatSort = "rank";
  $$("#heatSort button").forEach((b) => b.addEventListener("click", () => {
    state.heatSort = b.dataset.hs;
    $$("#heatSort button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    renderHeat(state.data[state.market]);
  }));
  $("#heatMore").addEventListener("click", () => { state.heatAll = !state.heatAll; renderHeat(state.data[state.market]); });
  $("#groupSel").addEventListener("change", (e) => { state.group = e.target.value; renderTable(); });
  $("#secFilter").addEventListener("click", () => { state.sector = null; renderSectors(state.data[state.market]); renderTable(); });
  // RS 강한 종목 박스
  Object.assign(state, { rsstSort: "rs_rating", rsstDir: 1, rsstUp: false, rsstGroup: "전체", rsstAll: false });
  const setRsstSort = (key) => { [state.rsstSort, state.rsstDir] = pick(state.rsstSort, state.rsstDir, key); renderRsStocks(state.data[state.market]); };
  $$("#rsstSort button").forEach((b) => b.addEventListener("click", () => setRsstSort(b.dataset.k)));
  $$("#rsstTable th[data-sk]").forEach((th) => { th.tabIndex = 0; th.addEventListener("click", () => setRsstSort(th.dataset.sk)); th.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setRsstSort(th.dataset.sk); } }); });
  $("#rsstUp").addEventListener("click", (e) => {
    state.rsstUp = !state.rsstUp;
    e.currentTarget.setAttribute("aria-pressed", state.rsstUp);
    renderRsStocks(state.data[state.market]);
  });
  $("#rsstGroup").addEventListener("change", (e) => { state.rsstGroup = e.target.value; renderRsStocks(state.data[state.market]); });
  $("#rankMore").addEventListener("click", () => {
    state.rankAll = !state.rankAll;
    renderTable();
    if (!state.rankAll) $("#rank-h").closest(".card").scrollIntoView({ block: "start" });
  });
  $("#rsstMore").addEventListener("click", () => { state.rsstAll = !state.rsstAll; renderRsStocks(state.data[state.market]); });
  $("#rsOnly").addEventListener("click", (e) => {
    state.rsOnly = !state.rsOnly;
    e.currentTarget.setAttribute("aria-pressed", state.rsOnly);
    renderTable();
  });
  $("#trendOnly").addEventListener("click", (e) => {
    state.trendOnly = !state.trendOnly;
    e.currentTarget.setAttribute("aria-pressed", state.trendOnly);
    renderTable();
  });

  async function load() {
    const m = state.market;
    $("#meta").textContent = "불러오는 중…";
    try {
      if (!state.data[m]) state.data[m] = await getJSON(`data/${m}.json`);
      if (m === "KR" && window.__supply) await window.__supply.attach(state.data[m]);   // 한국 수급(없어도 화면은 그대로)
    } catch (e) {
      $("#meta").textContent = "데이터를 불러오지 못했습니다. 잠시 후 새로고침해 주십시오.";
      return;
    }
    render();
    window.__isRefresh && window.__isRefresh.repaint();
  }
  // 새 데이터가 올라오면 캐시를 비우고 다시 그린다.
  let dataStamp = Date.now();
  function reloadData() { state.data = {}; state.series = {}; dataStamp = Date.now(); window.__supply && window.__supply.reload(); load(); }

  // 당일 순위: 바구니 지수의 하루 변동(chg1)을 시장 안에서 줄 세운다.
  function addDayRank(d) {
    if (d._dayRanked) return;
    const ranked = d.items.filter((i) => i.chg1 != null).sort((a, b) => b.chg1 - a.chg1);
    ranked.forEach((i, k) => { i.rank1 = k + 1; });
    d._dayRanked = true;
  }
  function render() {
    const d = state.data[state.market];
    addDayRank(d);
    $("#meta").textContent = `${d.label} 기준일 ${d.basis_date} 종가 · 갱신 ${d.updated_at} · 세부 산업 ${d.items.length}개 · 종목 ${d.n_stocks ?? "–"}개`;
    const w = $("#warn");
    if (d.warnings && d.warnings.length) { w.hidden = false; w.innerHTML = "<b>데이터 확인 필요</b> · " + d.warnings.map(esc).join(" · "); }
    else w.hidden = true;
    const groups = ["전체", ...new Set(d.items.map((i) => i.group))];
    $("#groupSel").innerHTML = groups.map((g) => `<option${g === state.group ? " selected" : ""}>${esc(g)}</option>`).join("");
    if (!groups.includes(state.rsstGroup)) state.rsstGroup = "전체";
    $("#rsstGroup").innerHTML = groups.map((g) => `<option${g === state.rsstGroup ? " selected" : ""}>${esc(g)}</option>`).join("");
    renderTiles(d); renderSectors(d); window.__flow && window.__flow.render(d); renderSignals(d); window.__supply && window.__supply.renderForeign(d); renderExplore(d); renderTable(); renderRsStocks(d); renderHeat(d); renderGroups(d); renderStageMix(d); renderBreadth(d);
  }

  // ---------- 섹터 워치: 큰 업종 칸. 위 단추로 당일·5일·20일·60일·200일 가운데 기간을 고르면
  // 막대·큰 숫자·정렬·작은 선이 그 기간을 따른다(2026-11-26 사용자 요청). 칸을 누르면 순위표를 그 업종 소속으로 거른다.
  const SEC_PER = { chg1: { l: "당일", n: 20 }, ret5: { l: "5일", n: 5 }, ret20: { l: "20일", n: 20 }, ret60: { l: "60일", n: 60 }, ret200: { l: "200일", n: 200 } };
  try { const v = localStorage.getItem("is-sec-per"); if (SEC_PER[v]) state.secPer = v; } catch (e) {}
  if (!state.secPer) state.secPer = "chg1";
  function sparkSvg(vals) {
    const v = (vals || []).filter((x) => x != null);
    if (v.length < 2) return "";
    const W = 60, H = 18, lo = Math.min(...v), hi = Math.max(...v), sp = hi - lo || 1;
    const pts = v.map((x, k) => `${(k / (v.length - 1) * (W - 2) + 1).toFixed(1)},${(H - 2 - (x - lo) / sp * (H - 4)).toFixed(1)}`).join(" ");
    return `<svg class="sec-spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${pts}"/></svg>`;
  }
  function renderSectors(d) {
    const card = $("#sectorCard"), all = d && d.sectors;
    window.__secflow && window.__secflow.show(state.market);
    $("#secNote").textContent = state.market === "KR"
      ? "한국 업종 20개를 대표 업종 ETF(KODEX 반도체, PLUS K방산 등) 종가로 봅니다. 위 단추로 당일·5일·20일·60일·200일 등락을 골라 볼 수 있습니다. 칸을 누르면 아래 세부 산업 순위에 그 업종에 묶인 산업만 남습니다. 원전, 전자부품, 통신, 리츠는 아직 칸이 없습니다."
      : state.market === "JP"
      ? "도쿄 증시 TOPIX-17 업종을 노무라 NEXT FUNDS 업종 ETF(1617~1633) 종가로 봅니다. 위 단추로 당일·5일·20일·60일·200일 등락을 골라 볼 수 있습니다. 칸을 누르면 아래 세부 산업 순위에 그 업종에 묶인 산업만 남습니다. 업종 ETF는 거래가 적어서 하루 등락이 지수와 조금 다를 수 있습니다."
      : "S&P 500 큰 업종 11개를 섹터 ETF(XLK, XLE 등) 종가로 봅니다. 위 단추로 당일·5일·20일·60일·200일 등락을 골라 볼 수 있습니다. 칸을 누르면 아래 세부 산업 순위에 그 업종에 속한 산업만 남습니다. 세부 산업은 저마다 가장 가까운 큰 업종 하나에 넣어 묶었습니다.";
    $("#sectors").hidden = !(all && all.length);
    $("#secPer").hidden = !(all && all.length);
    card.hidden = !(all && all.length) && !(window.__secflow && window.__secflow.has(state.market));
    if (!(all && all.length)) { $("#secSub").textContent = ""; return; }
    // 자료에 아직 없는 기간(60일·200일 칸이 생기기 전 자료)은 단추를 끄고 당일로 돌린다.
    const has = (k) => all.some((x) => x[k] != null);
    $$("#secPer button").forEach((b) => { b.disabled = !has(b.dataset.k); });
    const k = has(state.secPer) ? state.secPer : "chg1", P = SEC_PER[k];
    $$("#secPer button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.k === k));
    const list = [...all].sort((a, b) => (a[k] == null) - (b[k] == null) || (b[k] ?? 0) - (a[k] ?? 0));
    const max = Math.max(...list.map((x) => Math.abs(x[k] || 0)), k === "chg1" ? 0.5 : 2);
    const up = list.filter((x) => (x[k] || 0) > 0).length, down = list.filter((x) => (x[k] || 0) < 0).length;
    const stale = list.some((x) => x.stale);
    $("#secSub").textContent = `${list[0].date.slice(5).replace("-", "/")} 종가 · ${k === "chg1" ? "" : P.l + " 동안 "}오른 업종 ${up}개, 내린 업종 ${down}개${stale ? " · 일부 최신 아님" : ""}`;
    const sk = k === "chg1" ? "ret20" : "chg1", SL = k === "chg1" ? "20일" : "당일";   // 아래 줄은 비교용 다른 기간 하나
    $("#sectors").innerHTML = list.map((x) => {
      const v = x[k], w = Math.max(3, Math.abs(v || 0) / max * 50);
      const on = state.sector === x.ticker;
      const sp = (x.spark || []).slice(-(P.n + 1));
      return `<button type="button" role="listitem" class="sec-cell ${cls(v)}${on ? " on" : ""}${x.stale ? " stale" : ""}" data-sec="${esc(x.ticker)}" aria-pressed="${on}"
        title="${esc(x.name)} (${esc(x.en)}, ${esc(x.ticker)}) · 종가 ${x.close} · 당일 ${fmtPct(x.chg1, 2)} · 5일 ${fmtPct(x.ret5)} · 20일 ${fmtPct(x.ret20)} · 60일 ${fmtPct(x.ret60)} · 200일 ${fmtPct(x.ret200)} · 소속 세부 산업 ${x.items.length}개 · 작은 선 = 최근 ${Math.max(0, sp.length - 1)}거래일">
        <span class="sec-top"><b>${esc(x.name)}</b><em class="${cls(v)}-t">${fmtPct(v, k === "chg1" ? 2 : 1)}</em></span>
        <span class="sec-bar"><i class="${(v || 0) >= 0 ? "pos" : "neg"}" style="width:${w.toFixed(1)}%"></i></span>
        <span class="sec-bottom"><small>${SL} <span class="${cls(x[sk])}-t">${fmtPct(x[sk], sk === "chg1" ? 2 : 1)}</span></small>${sparkSvg(sp)}</span>
      </button>`;
    }).join("");
    $("#sectors").querySelectorAll("[data-sec]").forEach((b) => b.addEventListener("click", () => {
      state.sector = state.sector === b.dataset.sec ? null : b.dataset.sec;
      state.group = "전체"; $("#groupSel").value = "전체";
      renderSectors(d); renderTable();
      if (state.sector) document.getElementById("rank-h").closest("section").scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    $("#secPer").onclick = (e) => {
      const b = e.target.closest("button[data-k]");
      if (!b || b.disabled) return;
      state.secPer = b.dataset.k;
      try { localStorage.setItem("is-sec-per", state.secPer); } catch (err) {}
      renderSectors(d);
    };
  }

  // ---------- tiles
  function renderTiles(d) {
    const b = d.benchmark;
    const rc = b.regime === "상승 추세" ? "up" : b.regime === "하락 추세" ? "down" : "neutral";
    const br = d.breadth.above50.filter((v) => v != null);
    const brNow = br.at(-1), brPrev = br.at(-21);
    const s2 = d.items.filter((i) => i.stage === "상승 추세").length;
    const s2t = d.items.filter((i) => i.stage === "상승 전환 시도").length;
    const idxs = [b, d.benchmark2].filter(Boolean);
    const reg = (x) => { const c = x.regime === "상승 추세" ? "up" : x.regime === "하락 추세" ? "down" : "neutral"; return `<span class="badge ${c}"><span class="dot"></span>${x.regime}</span>`; };
    // 첫 번째 타일이 결론: 지금 추세가 살아 있는 산업이 몇 개인가.
    const tone = s2 / Math.max(1, d.items.length) >= 0.3 ? "up" : s2 / Math.max(1, d.items.length) <= 0.1 ? "down" : "";
    // 카드 4장은 같은 틀(이름표 → 큰 숫자 → 비교 한 줄)로 맞춘다. 긴 설명은 ? 도움말로 뺐다(2026-11-16 배치 정리).
    const n = Math.max(1, d.items.length);
    const regHelp = "지수가 50일선과 200일선 위에 있는지만 보고 내린 판정입니다. ‘이격’은 종가가 200일선보다 몇 % 위나 아래에 있는지 적은 참고 숫자로, 판정에는 넣지 않았습니다. 지수마다 평소 벌어지는 크기가 달라서 지난 1년 범위와 함께 보여 드립니다." + (state.market === "JP" ? "" : " 분산일·거래량·신고가 수까지 합친 판정은 레이더 ‘시장 날씨’에 따로 있어서, 여기 판정과 다를 수 있습니다.");
    const help = (t, label) => `<button class="help" type="button" aria-label="${label} 뜻" data-help="${esc(t)}">?</button>`;
    $("#tiles").innerHTML = `
      <div class="tile tile-main"><div class="k">상승 추세 산업</div>
        <div class="v big ${tone}">${s2}<span class="of"> / ${d.items.length}</span></div>
        <div class="tile-bar" role="img" aria-label="상승 추세 ${s2}개, 상승 전환 시도 ${s2t}개, 전체 ${d.items.length}개"><i class="s2" style="width:${(s2 / n * 100).toFixed(1)}%"></i><i class="s2t" style="width:${(s2t / n * 100).toFixed(1)}%"></i></div>
        <div class="d">상승 전환 시도 ${s2t}개까지 합치면 ${s2 + s2t}개</div></div>
      <div class="tile"><div class="k">시장 국면${help(regHelp, "시장 국면")}</div>
        ${idxs.map((x) => `<div class="idx-row"><span class="idx-n">${esc(x.name)}</span>${reg(x)}</div>
        <div class="d">${x.above50 ? "50일선 위" : "50일선 아래"} · ${x.above200 ? "200일선 위" : "200일선 아래"} · 200일선 ${x.ma200_up ? "상승" : "하락"}${x.gap200 != null ? ` · 이격 <b class="ret ${cls(x.gap200)}">${fmtPct(x.gap200)}</b>` : ""}</div>${x.gap200_lo != null && x.gap200_pct != null ? `<div class="d">${gapRangeText(x.gap200_lo, x.gap200_hi, x.gap200_pct, x.gap200_days)}</div>` : ""}`).join("")}</div>
      <div class="tile"><div class="k">지수 20일 수익률</div>
        ${idxs.map((x) => `<div class="idx-row"><span class="idx-n">${esc(x.name)}</span><span class="ret ${cls(x.ret20)} idx-v">${fmtPct(x.ret20)}</span></div>
        <div class="d">5일 ${fmtPct(x.ret5)} · 60일 ${fmtPct(x.ret60)}</div>`).join("")}</div>
      <div class="tile"><div class="k">50일선 위 산업 비율</div>
        <div class="v">${brNow == null ? "–" : brNow.toFixed(0) + "%"}</div>
        <div class="tile-bar" role="img" aria-label="50일선 위 산업 비율"><i class="s2" style="width:${brNow == null ? 0 : Math.min(100, brNow).toFixed(1)}%"></i></div>
        <div class="d">20거래일 전 ${brPrev == null ? "–" : brPrev.toFixed(0) + "%"}${brNow != null && brPrev != null ? ` (${brNow >= brPrev ? "▲" : "▼"}${Math.abs(brNow - brPrev).toFixed(0)}%p)` : ""}</div></div>`;
    $$(".help", $("#tiles")).forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); showHelp(b, b.dataset.help); }));
    renderBreadthStrip();
  }

  // ---------- 마켓 브레스 한 줄(2026-11-28): 레이더 '시장 날씨'가 계산한 값(wamo_trend.json)을 받아 타일 아래 짧게 보여 준다.
  // 같은 dhandori.github.io 주소라 바로 읽힌다. 못 받거나 그 시장 값이 없으면 줄을 숨긴다.
  const MB_SRC = "/wamo-choochoo-dashboard/wamo_trend.json";
  let mbLoad = null;
  const MB_HELP = {
    nh: "52주 신고가 비율: 전체 종목 가운데 오늘 1년 최고가를 새로 쓴 종목의 비중입니다. 높을수록 주도주가 많습니다.",
    adl: "ADL(등락주선): 날마다 오른 종목 수에서 내린 종목 수를 빼서 계속 더한 선입니다. 지수는 큰 종목 몇 개에 끌려가지만 ADL은 종목마다 한 표라 시장 전체 분위기를 보여 줍니다. 숫자는 최근 20거래일 동안 움직인 크기입니다.",
    a200: "200일선 위 종목 비율: 장기 상승 추세(200일선 위)에 있는 종목의 비중입니다. 50% 아래면 약한 시장입니다.",
    all: "지수가 올라도 시장이 건강하지 않을 수 있습니다. 소수 대형주가 지수를 끌어올리는 동안 나머지 종목은 빠질 수 있어서, 52주 신고가 비율·ADL·200일선 위 종목 비율을 같이 봐야 합니다. 지수는 오르는데 셋 가운데 둘 이상이 나빠지면 '속이 빈 상승'으로 봅니다. 값은 와모 레이더 '시장 날씨'와 같습니다."
  };
  function renderBreadthStrip() {
    let box = $("#mbStrip");
    if (!box) { box = document.createElement("section"); box.id = "mbStrip"; box.className = "mb-strip"; box.setAttribute("aria-label", "마켓 브레스"); $("#tiles").after(box); }
    box.hidden = true;
    const market = state.market;
    mbLoad = mbLoad || fetch(MB_SRC, { cache: "no-store" }).then((res) => (res.ok ? res.json() : null)).catch(() => null);
    mbLoad.then((j) => {
      if (state.market !== market) return;
      const mb = j && j.markets && j.markets[market] && j.markets[market].weather && j.markets[market].weather.marketBreadth;
      if (!mb || mb.status !== "OK") return;
      const v = mb.verdict || {}, a = mb.adl || {};
      const tone = { DIVERGENCE: "down", WEAK: "down", HEALTHY: "up", POSITIVE: "up" }[v.key] || "neutral";
      const ar = (d) => (d > 0 ? "↗" : d < 0 ? "↘" : d === 0 ? "→" : "");
      const dc = (d) => (d > 0 ? "up" : d < 0 ? "down" : "");
      const num = (x, k) => (x == null ? "–" : x.toFixed(k));
      // 지표 이름은 누르면(휴대폰) 또는 마우스를 올리면(PC) 풀이 창이 뜨는 단추다(2026-11-28 사용자 지적: title 말풍선은 눌러도 안 뜸)
      const item = (label, val, d, tip) => `<span class="mb-i"><button type="button" class="mb-k" data-help="${esc(tip)}">${label}</button> <b class="${dc(d)}">${val} ${ar(d)}</b></span>`;
      const help = (t, label) => `<button class="help" type="button" aria-label="${label} 뜻" data-help="${esc(t)}">?</button>`;
      box.innerHTML = `<div class="mb-head"><span class="k">마켓 브레스${help(MB_HELP.all, "마켓 브레스")}</span>
          <span class="badge ${tone}"><span class="dot"></span>${esc(v.label || "–")}</span>
          ${mb.indexChangePct != null ? `<span class="mb-sub">지수 ${mb.lookback}일 ${fmtPct(mb.indexChangePct)}</span>` : ""}
          <a class="mb-link" href="/wamo-choochoo-dashboard/radar.html?market=${market}&tab=trend&sub=weather">레이더에서 자세히 ›</a></div>
        <div class="mb-items">${item("52주 신고가 비율", num(mb.newHighPct, 1) + "%", mb.newHighDir, MB_HELP.nh)}
          ${item("ADL 20일", (a.change > 0 ? "+" : "") + (a.change == null ? "–" : a.change), a.dir, MB_HELP.adl)}
          ${item("200일선 위 종목", num(mb.above200Pct, 0) + "%", mb.above200Dir, MB_HELP.a200)}</div>
        <div class="mb-means"><span>신고가 비율: 1년 최고가를 새로 쓴 종목 비중</span><span>ADL: 오른 종목 수 − 내린 종목 수의 누적(오르면 많은 종목이 함께 오름)</span><span>200일선 위: 장기 상승 추세 종목 비중</span></div>
        <div class="mb-text">${esc(v.text || "")}</div>`;
      $$(".help, .mb-k", box).forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); showHelp(b, b.dataset.help); }));
      $$(".mb-k", box).forEach((b) => b.addEventListener("mouseenter", () => { if (matchMedia("(hover: hover)").matches) showHelp(b, b.dataset.help); }));
      box.hidden = false;
    });
  }

  // ---------- signals
  const SHOW = 5, SHOW_WIDE = 10;   // 5개가 넘는 신호는 두 칸 너비(벤토)로 키우고 10개까지 바로 보인다
  const weakHelp = "순위는 올랐지만 가격은 아직 내리고 있거나 힘이 빠진 산업입니다. 덜 빠져서 순위만 오른 것일 수 있어서 추세를 먼저 확인하는 편이 낫습니다.";
  function renderSignals(d) {
    // 강세 신호 3종은 한 줄, 주의 신호 2종은 그 아래 한 줄. 0개인 카드는 한 줄로 접는다.
    const rows = [
      { title: "강세 신호", groups: [
        { t: "순위 급상승", c: "var(--up)", help: "5거래일 전보다 종합 순위가 크게 오른 산업" },
        { t: "신규 상위권", c: "var(--accent)", help: "오늘 처음 상위 25% 안에 들어온 산업" },
        { t: "종목 확산", c: "var(--good)", help: "구성 종목의 70% 이상이 50일선 위인 산업" },
        { t: "52주 신고가", c: "var(--good)", help: "바구니 지수가 52주 고점을 넘긴 산업" },
        { t: "RS 신고가", c: "var(--good)", help: "시장 대비 강도(RS선)가 1년 중 최고인 산업" },
      ] },
      { title: "주의 신호", groups: [
        { t: "50일선 돌파", c: "var(--accent)", help: "바구니 지수가 오늘 50일선 위로 올라온 산업으로, 추세가 막 바뀌기 시작했을 수 있습니다" },
        { t: "약화 경고", c: "var(--down)", any: ["상위권 이탈", "50일선 이탈"], help: "상위 25%에서 밀려났거나 50일선 아래로 내려간 산업" },
      ] },
    ];
    if (d._sup && window.__supply) rows.push(window.__supply.signalRow());   // 한국만: 외국인·기관 수급과 가격을 합친 신호
    const empties = [];   // 0건 신호는 줄마다 흩지 않고 맨 아래 한 줄로 모은다
    $("#signals").innerHTML = rows.map((row) => {
      const cards = row.groups.map((g) => {
        const keys = g.any || [g.t];
        const list = d.items.filter((i) => i.tags.some((t) => keys.includes(t)));
        const chip = (i) => {
          const weak = !g.any && !g.t.startsWith("수급") && g.t !== "매집 의심" && WEAK.includes(i.stage);
          return `<button class="chip${weak ? " weak" : ""}" data-id="${i.id}"${weak ? ` title="${weakHelp}"` : ""}>${esc(i.name)}${weak ? '<span class="chip-tail">순위↑ 가격↓</span>' : ""}</button>`;
        };
        const head = `<h3><span class="dot" style="color:${g.c}"></span>${g.t} <span class="cnt">${list.length}</span><button class="help" type="button" aria-label="${g.t} 뜻" data-help="${esc(g.help)}">?</button></h3>`;
        if (!list.length) { empties.push(`<span class="sig-empty"><span class="dot" style="color:${g.c}"></span>${g.t}<button class="help" type="button" aria-label="${g.t} 뜻" data-help="${esc(g.help)}">?</button></span>`); return ""; }
        const wide = list.length > SHOW, show = wide ? SHOW_WIDE : SHOW;
        const more = list.length > show ? `<button class="chip more" type="button" data-more="${g.t}">+${list.length - show}개 더</button>` : "";
        return `<div class="sig${wide ? " wide" : ""}" data-sig="${g.t}">${head}
          <div class="chips">${list.slice(0, show).map(chip).join("")}${more}</div>
          ${list.length > show ? `<div class="chips rest" hidden>${list.slice(show).map(chip).join("")}<button class="chip more" type="button" data-less="${g.t}">접기</button></div>` : ""}</div>`;
      }).filter(Boolean);
      return cards.length ? `<div class="sig-row"><div class="sig-row-title">${row.title}</div><div class="sig-grid">${cards.join("")}</div></div>` : "";
    }).join("") + (empties.length ? `<div class="sig-empties"><span class="sig-row-title">오늘 없는 신호</span>${empties.join("")}</div>` : "");
    const sg = $("#signals");
    $$(".chip[data-id]", sg).forEach((c) => c.addEventListener("click", () => openDetail(c.dataset.id)));
    $$(".chip[data-more]", sg).forEach((b) => b.addEventListener("click", () => { const s = b.closest(".sig"); $(".rest", s).hidden = false; b.hidden = true; }));
    $$(".chip[data-less]", sg).forEach((b) => b.addEventListener("click", () => { const s = b.closest(".sig"); $(".rest", s).hidden = true; $(".chip[data-more]", s).hidden = false; }));
    $$(".help", sg).forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); showHelp(b, b.dataset.help); }));
  }
  function showHelp(anchor, text) {
    tip.textContent = text; tip.hidden = false; tip.classList.add("wide");
    const r = anchor.getBoundingClientRect();
    const x = Math.max(8, Math.min(r.left, innerWidth - tip.offsetWidth - 8));
    tip.style.left = x + "px"; tip.style.top = (r.bottom + 8) + "px";
    const off = () => { tip.hidden = true; tip.classList.remove("wide"); removeEventListener("pointerdown", off, true); removeEventListener("scroll", off, true); };
    setTimeout(() => { addEventListener("pointerdown", off, true); addEventListener("scroll", off, true); }, 0);
  }

  // ---------- 외부 링크
  // 종목 이름 → 종목 상세 창(stock.js) 단추 + 지금 52주 신고가 중이면 🚀 표시
  function skBtn(m, market) {
    const code = market === "KR" ? m.code : (m.ticker || m.code);
    return `<button class="lnk sk-name" type="button" data-stock="${esc(code)}" data-sname="${esc(m.name)}" data-smarket="${market}" title="${esc(m.name)} 종목 상세">${esc(m.name)}</button>${window.__stock ? window.__stock.highMark(code, market) : ""}`;
  }
  function stockLinks(m, market) {
    const L = window.__links, code = m.code || m.ticker;
    if (market === "KR") {
      return `<span class="xl"><a href="${L.naver(code)}" target="_blank" rel="noopener" title="네이버 증권에서 보기">네이버</a><a href="${L.tvChart(code, "KR")}" target="_blank" rel="noopener" title="TradingView 차트">TV</a></span>`;
    }
    if (market === "JP") {
      return `<span class="xl"><a href="${L.naverJP(code)}" target="_blank" rel="noopener" title="네이버 증권에서 보기">네이버</a><a href="${L.tvChart(code, "JP")}" target="_blank" rel="noopener" title="TradingView 차트">TV</a><a href="${L.yahooJP(code)}" target="_blank" rel="noopener" title="야후 재팬 파이낸스에서 보기">야후JP</a></span>`;
    }
    const t = m.ticker || code;
    const nu = L.naverUS(t);
    return `<span class="xl">${nu ? `<a href="${nu}" target="_blank" rel="noopener" title="네이버 증권에서 보기">네이버</a>` : ""}<a href="${L.tvChart(t, "US")}" target="_blank" rel="noopener" title="TradingView 차트">TV</a><a href="${L.finviz(t)}" target="_blank" rel="noopener" title="Finviz에서 보기">Finviz</a></span>`;
  }


  // ---------- 업종 탐색 (분류 → 세부 산업 → 종목)
  state.exKey = "chg1"; state.exOpen = new Set(); state.exSrc = "board"; state.exAll = new Set();
  const PLABEL = { chg1: "1일", ret5: "5일", ret20: "20일", ret60: "60일" };
  $$("#exSeg button").forEach((b) => b.addEventListener("click", () => {
    state.exKey = b.dataset.k;
    $$("#exSeg button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    renderExplore(state.data[state.market]);
  }));
  $$("#exSrc button").forEach((b) => b.addEventListener("click", async () => {
    state.exSrc = b.dataset.src; state.exOpen = new Set(); state.exAll = new Set();
    $$("#exSrc button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    renderExplore(state.data[state.market]);
  }));
  function avgOf(list, k) {
    const v = list.map((m) => m[k]).filter((x) => x != null);
    return v.length ? v.reduce((a, c) => a + c, 0) / v.length : null;
  }
  async function loadNaver() {
    if (state.naver !== undefined) return state.naver;
    try { state.naver = await getJSON("data/KR_naver.json"); } catch (e) { state.naver = null; }
    return state.naver;
  }
  function boardTree(d, k) {
    const groups = {};
    for (const it of d.items) {
      const g = groups[it.group] || (groups[it.group] = { key: "g:" + it.group, name: it.group, children: [], stocks: new Map() });
      const mem = (it.members || []).filter((m) => !m.missing);
      g.children.push({ key: "s:" + it.id, name: it.name, v: avgOf(mem, k), n: mem.length, detail: it.id,
        stocks: mem.map((m) => ({ ...m, v: m[k] })) });
      mem.forEach((m) => g.stocks.set(m.ticker, m));
    }
    return Object.values(groups).map((g) => ({ ...g, v: avgOf([...g.stocks.values()], k), n: g.stocks.size }));
  }
  function naverTree(nv, k) {
    const secs = {};
    for (const ind of nv.industries) {
      const sc = secs[ind.sector] || (secs[ind.sector] = { key: "n:" + ind.sector, name: ind.sector, children: [] });
      sc.children.push({ key: "u:" + ind.no, name: ind.name, n: ind.total, v: ind[k], link: ind.url,
        rise: ind.rise, fall: ind.fall, leaf: true });
    }
    // 섹터 등락률 = 소속 업종 등락률을 종목 수로 가중 평균
    return Object.values(secs).map((sc) => {
      const ok = sc.children.filter((c) => c.v != null && c.n);
      const w = ok.reduce((a, c) => a + c.n, 0);
      return { ...sc, n: sc.children.reduce((a, c) => a + (c.n || 0), 0),
        v: w ? ok.reduce((a, c) => a + c.v * c.n, 0) / w : null };
    });
  }
  async function renderExplore(d) {
    const k = state.exKey, mk = state.market;
    const srcBox = $("#exSrc");
    srcBox.hidden = mk !== "KR";
    const src = mk === "KR" ? state.exSrc : "board";
    const el = $("#explore");
    let tree, note = "";
    if (src === "naver") {
      const nv = await loadNaver();
      if (state.market !== mk || state.exSrc !== "naver") return;
      if (!nv || !nv.industries) {
        el.innerHTML = `<p class="empty">네이버 업종 자료가 아직 없습니다. 한국장 마감 뒤 자동 수집이 한 번 돌고 나면 채워집니다.</p>`;
        $("#exSub").textContent = "네이버 업종"; return;
      }
      if (!nv.periods_available.includes(k)) {
        el.innerHTML = `<p class="empty">네이버 업종의 ${PLABEL[k]} 등락률은 매일 쌓은 기록을 이어 붙여 계산합니다. 기록이 ${k.replace("ret", "")}거래일 쌓이면 보여 드리겠습니다(지금 ${nv.days_recorded}일치).<br>1일 등락률은 지금도 볼 수 있습니다.</p>`;
        $("#exSub").textContent = `네이버 업종 · ${nv.basis_date} 종가 기준`; return;
      }
      tree = naverTree(nv, k);
      $("#exSub").innerHTML = `네이버 업종 ${nv.n_industries}개 · ${nv.basis_date} 종가 · ${PLABEL[k]} <a class="xl-inline" href="${nv.source_url}" target="_blank" rel="noopener">네이버 업종별 시세 ↗</a>`;
      note = (k === "chg1" ? "업종 등락률은 네이버가 발표한 값을 그대로 씁니다." : "여러 날 등락률은 네이버 업종의 하루 등락률을 이어 곱해 계산했습니다.") + " 섹터는 소속 업종을 종목 수로 가중 평균했습니다. 업종 안 종목은 '네이버' 버튼을 누르면 네이버 화면에서 볼 수 있습니다.";
    } else {
      tree = boardTree(d, k);
      $("#exSub").textContent = `강도판 분류 · ${d.basis_date} 종가 · ${PLABEL[k]} 등락률`;
      note = "분류와 세부 산업 등락률은 구성 종목 등락률을 단순 평균한 값입니다(종목마다 같은 비중).";
    }
    $("#exNote").textContent = `큰 분류를 누르면 세부 업종이 펼쳐지고, 강도판 분류에서는 세부 업종을 누르면 종목까지 나옵니다. ${note} 빨강은 상승, 파랑은 하락입니다. 네이버·TV·Finviz 버튼은 새 창으로 열립니다.`;
    const sorted = (arr) => arr.slice().sort((a, b) => (b.v ?? -1e9) - (a.v ?? -1e9));
    const scale = (arr) => Math.max(1e-9, ...arr.map((x) => Math.abs(x.v ?? 0)));
    const bar = (v, mx) => v == null ? `<span class="ex-bar"></span>`
      : `<span class="ex-bar"><i class="${v >= 0 ? "pos" : "neg"}" style="width:${Math.min(50, Math.abs(v) / mx * 50)}%"></i></span>`;
    const val = (v) => `<span class="ex-val ret ${cls(v)}">${fmtPct(v, 2)}</span>`;
    const top = sorted(tree), gmx = scale(top);
    let h = "";
    for (const g of top) {
      const open = state.exOpen.has(g.key);
      h += `<div class="ex-row lv0${open ? " open" : ""}" data-k="${esc(g.key)}" role="button" tabindex="0"><span class="chev">›</span><span class="ex-name">${esc(g.name)} <em>${g.n}</em></span>${bar(g.v, gmx)}${val(g.v)}</div>`;
      if (!open) continue;
      const subs = sorted(g.children), smx = scale(subs);
      for (const sb of subs) {
        const so = state.exOpen.has(sb.key);
        const lk = sb.link ? `<a class="xl-pill" href="${sb.link}" target="_blank" rel="noopener" title="네이버 업종 화면">네이버 ↗</a>` : "";
        if (sb.leaf) {
          const rf = sb.rise != null ? `<em class="rf"><b class="up">▲${sb.rise}</b> <b class="dn">▼${sb.fall}</b></em>` : "";
          h += `<div class="ex-row lv1 leaf"><span class="chev"></span><span class="ex-name">${esc(sb.name)} <em>${sb.n ?? ""}</em>${rf}${lk}</span>${bar(sb.v, smx)}${val(sb.v)}</div>`;
          continue;
        }
        h += `<div class="ex-row lv1${so ? " open" : ""}" data-k="${esc(sb.key)}" role="button" tabindex="0"><span class="chev">›</span><span class="ex-name">${esc(sb.name)} <em>${sb.n}</em>${lk}</span>${bar(sb.v, smx)}${val(sb.v)}</div>`;
        if (!so) continue;
        const ms = sorted(sb.stocks), mmx = scale(ms);
        const showAll = state.exAll.has(sb.key) || ms.length <= 20;
        for (const m of (showAll ? ms : ms.slice(0, 20))) {
          const extra = m.value_mil != null ? `<em>거래대금 ${m.value_mil >= 100 ? Math.round(m.value_mil / 100).toLocaleString() + "억" : "1억 미만"}</em>` : `<em>${esc(m.code || "")}</em>`;
          h += `<div class="ex-row lv2"><span class="chev"></span><span class="ex-name">${skBtn(m, mk)} ${extra}${stockLinks(m, mk)}</span>${bar(m.v, mmx)}${val(m.v)}</div>`;
        }
        if (!showAll) h += `<button class="ex-more" data-all="${esc(sb.key)}">전체 ${ms.length}개 보기 ›</button>`;
        if (sb.detail) h += `<button class="ex-more" data-id="${sb.detail}">${esc(sb.name)} 차트·상세 보기 ›</button>`;
      }
    }
    el.innerHTML = h;
    const toggle = (key) => { state.exOpen.has(key) ? state.exOpen.delete(key) : state.exOpen.add(key); renderExplore(d); };
    $$(".ex-row[data-k]", el).forEach((b) => {
      b.addEventListener("click", (e) => { if (e.target.closest("a")) return; toggle(b.dataset.k); });
      b.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(b.dataset.k); } });
    });
    $$(".ex-more[data-id]", el).forEach((b) => b.addEventListener("click", () => openDetail(b.dataset.id)));
    $$(".ex-more[data-all]", el).forEach((b) => b.addEventListener("click", () => { state.exAll.add(b.dataset.all); renderExplore(d); }));
  }

  // ---------- table
  function renderTable() {
    const d = state.data[state.market];
    if (!d) return;
    const sec = state.sector && ((d.sectors || []).find((x) => x.ticker === state.sector)
      || (state.flowSec && state.flowSec.ticker === state.sector ? state.flowSec : null));
    const fb = $("#secFilter");
    fb.hidden = !sec;
    if (sec) fb.innerHTML = `${esc(sec.name)} 소속만 보는 중 <b aria-hidden="true">✕</b>`;
    let rows = d.items.filter((i) => (state.group === "전체" || i.group === state.group)
      && (!sec || sec.items.includes(i.name))
      && (!state.trendOnly || i.stage === "상승 추세" || i.stage === "상승 전환 시도")
      && (!state.rsOnly || i.rs_above_ma50 === true));
    const k = state.sort;
    const RV = { name: (i) => i.name, checks: (i) => i.checks ? i.checks.filter(Boolean).length : null, stage: (i) => STAGE_ORD[i.stage] ?? null,
      rank_chg5: (i) => i.rank_chg5, rs_rating: (i) => i.rs_rating, sup20: (i) => i.sup20, dist_high: (i) => i.dist_high };
    const val = RV[k] || ((i) => i[k] == null ? null : -i[k]);   // rank·rank1·rank5… : 순위는 작을수록 좋다
    rows = sortBy(rows, val, state.sortDir, (a, b) => (a.rank ?? 999) - (b.rank ?? 999));
    markSort($("#sortSeg"), "sort", $("#rankTable"), k, state.sortDir);
    // 2026-10-28: 처음엔 위쪽만(PC 25개·휴대폰 12개) 보여 주고 '전체 보기'로 펼친다 — 70줄이 한 번에 나와 화면이 너무 길었다
    const allRows = rows, RLIM = innerWidth < 640 ? 12 : 25;
    if (!state.rankAll && rows.length > RLIM + 3) rows = rows.slice(0, RLIM);
    const rmore = $("#rankMore");
    if (rmore) { rmore.hidden = allRows.length <= RLIM + 3; rmore.textContent = state.rankAll ? `위쪽 ${RLIM}개만 보기 ‹` : `나머지 ${allRows.length - RLIM}개 더 보기 ›`; }
    const stageCls = { "상승 추세": "s2", "상승 전환 시도": "s2t", "하락 추세": "s4" };
    const ret = (v, rk) => `<span class="ret ${cls(v)}">${fmtPct(v)}</span><span class="rsub">${rk == null ? "–" : rk + "위"}</span>`;
    // 막대 길이는 시장 안 순위 백분위(1위=100%, 꼴찌=0%): 점수가 55~90에 몰려도 차이가 보이게.
    const nAll = d.items.filter((x) => x.rank != null).length;
    const pctile = (i) => i.rank == null || nAll < 2 ? 0 : Math.round((1 - (i.rank - 1) / (nAll - 1)) * 100);
    const CHECK_LABELS = ["50", "50>150", "150>200", "200↑", "고점"];
    const checksOf = (i, labels) => i.checks ? `<span class="checks${labels ? " labeled" : ""}" aria-label="추세 조건 ${i.checks.filter(Boolean).length}/5" title="${i.checks.map((c, k) => (c ? "●" : "○") + " " + ["가격>50일선", "50일>150일선", "150일>200일선", "200일선 상승", "고점 -15% 안"][k]).join("  ")}">${i.checks.map((c, k) => `<span class="ck"><i class="${c ? "on" : ""}"></i>${labels ? `<em>${CHECK_LABELS[k]}</em>` : ""}</span>`).join("")}</span>` : `<span class="rsub">데이터 부족</span>`;
    const chgOf = (i) => { const ch = i.rank_chg5; return ch == null ? "" : ch > 0 ? `<span class="chg up">▲${ch}</span>` : ch < 0 ? `<span class="chg down">▼${-ch}</span>` : `<span class="chg flat">–</span>`; };
    // RS 표시: 시장 지수 대비 강도. 신고가(1년 최고 -0.5% 이내) / 강함(50일 평균 위) / 약함(아래)
    const rsState = (i) => i.rs_hi_dist != null && i.rs_hi_dist >= -0.5 ? ["RS 신고가", "rs-hi"]
      : i.rs_above_ma50 === true ? ["시장보다 강함", "rs-up"] : i.rs_above_ma50 === false ? ["시장보다 약함", "rs-dn"] : ["데이터 부족", ""];
    const rsNum = (i) => i.rs_rating == null ? "" : `<b class="rs-num ${i.rs_rating >= 80 ? "hi" : i.rs_rating < 40 ? "lo" : ""}" title="RS 지수 ${i.rs_rating} (1~99, 1년 가중 수익률을 산업끼리 비교한 백분위)${i.rs_rating_chg20 == null ? "" : ` · 20일 전보다 ${i.rs_rating_chg20 > 0 ? "+" : ""}${i.rs_rating_chg20}`}">${i.rs_rating}</b>`;
    const rsTip = (i) => `RS 지수 ${i.rs_rating ?? "–"} · ${esc(i.bench || d.benchmark.name)} 대비 · RS선 1년 최고 대비 ${i.rs_hi_dist == null ? "–" : i.rs_hi_dist.toFixed(1) + "%"} · 20일 시장 대비 ${i.rs_ex20 == null ? "–" : (i.rs_ex20 > 0 ? "+" : "") + i.rs_ex20.toFixed(1) + "%p"}`;
    const rsOf = (i) => { const [t, c] = rsState(i); return `<span class="rs-chip ${c}" title="${rsTip(i)}">${t}</span>`; };
    const rsSub = (i) => i.rs_hi_dist == null ? "" : `<span class="rsub">RS 고점 ${i.rs_hi_dist >= -0.05 ? "0.0" : i.rs_hi_dist.toFixed(1)}%</span>`;
    const subOf = (i) => `대장 ${esc(i.leader || "–")} · ${i.n ?? 0}종목` + (i.streak ? ` · 상위권 ${i.streak}일째` : "") + (i.breadth50 == null ? "" : ` · 50일선 위 ${i.breadth50}%`) + (i.near_high ? ` · 신고가권 ${i.near_high}` : "");
    const sup = d._sup && window.__supply;
    $("#rankTable").classList.toggle("no-sup", !sup);
    $("#sortSup").hidden = !sup;
    $("#rankTable tbody").innerHTML = rows.map((i) => {
      const tags = i.tags.filter((t) => !t.includes("이탈")).slice(0, 2).map((t) => `<span class="tag-mini">${t}</span>`).join("");
      return `<tr data-id="${i.id}" class="${i.top ? "top" : ""}">
        <td><span class="rk">${i.rank ?? "–"}</span>${chgOf(i)}</td>
        <td class="name"><b>${esc(i.name)}${i.stale ? '<span class="stale">지연</span>' : ""}${tags ? `<span class="name-tags">${tags}</span>` : ""}</b><span>${subOf(i)}</span></td>
        <td><div class="bar" title="시장 안 순위 백분위 ${pctile(i)}% · 종합 강도 ${i.score == null ? "–" : Math.round(i.score)}점"><i><b style="width:${pctile(i)}%"></b></i><span>${i.score == null ? "–" : Math.round(i.score)}</span></div></td>
        <td class="c-rs"><div class="rs-cell">${rsNum(i)}<div>${rsOf(i)}${rsSub(i)}</div></div></td>
        <td class="c-sup">${sup ? sup.cell(i) : ""}</td>
        <td class="num">${ret(i.chg1, i.rank1)}</td>
        <td class="num">${ret(i.ret5, i.rank5)}</td>
        <td class="num">${ret(i.ret20, i.rank20)}</td>
        <td class="num">${ret(i.ret60, i.rank60)}</td>
        <td class="num">${ret(i.ret200, i.rank200)}</td>
        <td>${checksOf(i, true)}</td>
        <td class="num">${i.dist_high == null ? "–" : i.dist_high.toFixed(1) + "%"}</td>
        <td><span class="stage ${stageCls[i.stage] || ""}">${i.stage}</span></td>
      </tr>`;
    }).join("");
    // 휴대폰: 표 대신 카드. 1줄 순위·이름·상태, 2줄 강도·수익률, 3줄 추세 점검.
    $("#rankCards").innerHTML = rows.map((i) => `
      <button class="rcard${i.top ? " top" : ""}" type="button" data-id="${i.id}">
        <div class="rc1"><span class="rk">${i.rank ?? "–"}</span>${chgOf(i)}<b class="rc-name">${esc(i.name)}</b>${i.rs_rating == null ? "" : `<span class="rc-rs">RS ${rsNum(i)}</span>`}<span class="stage ${stageCls[i.stage] || ""}">${i.stage}</span></div>
        <div class="rc-sub">${subOf(i)}</div>
        <div class="rc2"><div class="bar"><i><b style="width:${pctile(i)}%"></b></i><span>${i.score == null ? "–" : Math.round(i.score)}</span></div>
          <span class="rc-ret"><em>당일</em>${ret(i.chg1, i.rank1)}</span><span class="rc-ret"><em>5일</em>${ret(i.ret5, i.rank5)}</span><span class="rc-ret"><em>20일</em>${ret(i.ret20, i.rank20)}</span><span class="rc-ret"><em>60일</em>${ret(i.ret60, i.rank60)}</span><span class="rc-ret"><em>200일</em>${ret(i.ret200, i.rank200)}</span></div>
        <div class="rc3">${checksOf(i, true)}<span class="rc-dist">고점 대비 <b>${i.dist_high == null ? "–" : i.dist_high.toFixed(1) + "%"}</b></span></div>
        ${sup ? sup.card(i) : ""}
        <div class="rc4">${rsOf(i)}<span class="rc-dist">RS선 1년 최고 대비 <b>${i.rs_hi_dist == null ? "–" : i.rs_hi_dist.toFixed(1) + "%"}</b> · 20일 시장 대비 <b class="ret ${cls(i.rs_ex20)}">${i.rs_ex20 == null ? "–" : (i.rs_ex20 > 0 ? "+" : "") + i.rs_ex20.toFixed(1) + "%p"}</b></span></div>
      </button>`).join("");
    if (!rows.length) {
      const msg = "조건에 맞는 산업이 없습니다. 검색어나 필터를 바꿔 보십시오.";
      $("#rankTable tbody").innerHTML = `<tr><td colspan="13" style="text-align:center;color:var(--muted);padding:24px">${msg}</td></tr>`;
      $("#rankCards").innerHTML = `<p class="none" style="padding:16px 0">${msg}</p>`;
    }
    $$("#rankTable tbody tr[data-id], #rankCards .rcard").forEach((tr) => tr.addEventListener("click", () => openDetail(tr.dataset.id)));
    $("#tableNote").innerHTML = `파란 띠는 종합 순위 상위 25%(${d.top_cut}위 이내)를 표시합니다. 막대 길이는 전체 산업 가운데 몇 % 자리에 있는지를, 막대 옆 숫자는 종합 강도 점수를 나타냅니다. 수익률 아래 작은 숫자는 그 기간 수익률 순위입니다.` + (sup ? sup.tableNote(d) : "");
  }

  // ---------- RS 강한 종목: 시장 안 전체 종목을 한 줄로 세운다 (같은 종목이 여러 산업에 있으면 한 번만).
  const RSST_LABEL = { rs_rating: "RS 지수", chg1: "당일", ret5: "5일", ret20: "20일", ret60: "60일", ret200: "200일" };
  function renderRsStocks(d) {
    if (!d) return;
    const byTicker = new Map();
    for (const it of d.items) {
      for (const m of it.members || []) {
        if (m.missing) continue;
        const cur = byTicker.get(m.ticker);
        if (cur) { if (!cur.inds.some((x) => x.id === it.id)) cur.inds.push(it); }
        else byTicker.set(m.ticker, { m, inds: [it] });
      }
    }
    let rows = [...byTicker.values()].filter(({ m, inds }) => (state.rsstGroup === "전체" || inds.some((i) => i.group === state.rsstGroup))
      && (!state.rsstUp || m.rs_up === true));
    const k = state.rsstSort;
    const hasRs = rows.some(({ m }) => m.rs_rating != null), has200 = rows.some(({ m }) => m.ret200 != null);
    const SV = { name: (r) => r.m.name, ind: (r) => r.inds[0] && r.inds[0].name, stage: (r) => STAGE_ORD[r.m.stage] ?? null, sup: (r) => r.m.sup ? r.m.sup.pct20 ?? null : null };
    const sval = SV[k] || ((r) => r.m[k] ?? null);
    rows = sortBy(rows, sval, state.rsstDir, (a, b) => (b.m.rs_rating ?? -1) - (a.m.rs_rating ?? -1) || (b.m.ret20 ?? -1e9) - (a.m.ret20 ?? -1e9));
    markSort($("#rsstSort"), "k", $("#rsstTable"), k, state.rsstDir);
    const total = rows.length, LIMIT = innerWidth < 640 ? 15 : 30;
    const shown = state.rsstAll ? rows : rows.slice(0, LIMIT);
    const stageCls = { "상승 추세": "s2", "상승 전환 시도": "s2t", "하락 추세": "s4" };
    const rsNum = (m) => m.rs_rating == null ? `<span class="rsub">–</span>` : `<b class="rs-num ${m.rs_rating >= 80 ? "hi" : m.rs_rating < 40 ? "lo" : ""}" title="RS 지수 ${m.rs_rating} (1~99, 1년 가중 수익률을 시장 안 전체 종목끼리 비교한 백분위)">${m.rs_rating}</b>`;
    const rsChip = (m) => m.rs_up === true ? `<span class="rs-chip rs-up">시장보다 강함</span>` : m.rs_up === false ? `<span class="rs-chip rs-dn">시장보다 약함</span>` : "";
    const r = (v) => `<span class="ret ${cls(v)}">${fmtPct(v)}</span>`;
    const indBtns = (inds) => inds.map((i) => `<button class="ind-link" type="button" data-id="${i.id}" title="${esc(i.name)} 상세 보기">${esc(i.name)}</button>`).join("");
    const code = (m) => esc(state.market === "US" ? m.ticker : m.code);
    const sup = d._sup && window.__supply;
    $("#rsstTable").classList.toggle("no-sup", !sup);
    $("#rsstTable tbody").innerHTML = shown.map(({ m, inds }, n) => `<tr>
        <td><span class="rk">${n + 1}</span></td>
        <td class="name"><b>${skBtn(m, state.market)}${m.stale ? '<span class="stale">지연</span>' : ""}</b><span>${code(m)} ${stockLinks(m, state.market)}</span></td>
        <td class="inds">${indBtns(inds)}</td>
        <td class="c-rs"><div class="rs-cell">${rsNum(m)}<div>${rsChip(m)}</div></div></td>
        <td class="c-sup">${sup ? sup.stockCell(m) : ""}</td>
        <td class="num">${r(m.chg1)}</td>
        <td class="num">${r(m.ret5)}</td>
        <td class="num">${r(m.ret20)}</td>
        <td class="num">${r(m.ret60)}</td>
        <td class="num">${r(m.ret200)}</td>
        <td class="num">${m.dist_high == null ? "–" : m.dist_high.toFixed(1) + "%"}</td>
        <td>${m.stage ? `<span class="stage ${stageCls[m.stage] || ""}">${m.stage}</span>` : ""}</td>
      </tr>`).join("");
    $("#rsstCards").innerHTML = shown.map(({ m, inds }, n) => `
      <div class="rcard rsst-card">
        <div class="rc1"><span class="rk">${n + 1}</span><b class="rc-name">${skBtn(m, state.market)}</b>${m.rs_rating == null ? "" : `<span class="rc-rs">RS ${rsNum(m)}</span>`}${m.stage ? `<span class="stage ${stageCls[m.stage] || ""}">${m.stage}</span>` : ""}</div>
        <div class="rc-sub">${code(m)} ${stockLinks(m, state.market)} ${rsChip(m)}</div>
        ${sup && m.sup && m.sup.pct20 != null ? `<div class="rc-sub">수급 20일 ${sup.stockCell(m)}</div>` : ""}
        <div class="rc2"><span class="rc-ret"><em>당일</em>${r(m.chg1)}</span><span class="rc-ret"><em>5일</em>${r(m.ret5)}</span><span class="rc-ret"><em>20일</em>${r(m.ret20)}</span><span class="rc-ret"><em>60일</em>${r(m.ret60)}</span><span class="rc-ret"><em>200일</em>${r(m.ret200)}</span></div>
        <div class="rc-inds">${indBtns(inds)}</div>
      </div>`).join("");
    if (!total) {
      const msg = "조건에 맞는 종목이 없습니다.";
      $("#rsstTable tbody").innerHTML = `<tr><td colspan="12" style="text-align:center;color:var(--muted);padding:24px">${msg}</td></tr>`;
      $("#rsstCards").innerHTML = `<p class="none" style="padding:16px 0">${msg}</p>`;
    }
    const more = $("#rsstMore");
    more.hidden = total <= LIMIT;
    more.textContent = state.rsstAll ? `상위 ${LIMIT}개만 보기 ‹` : `전체 ${total}개 보기 ›`;
    $$("#rsstTable .ind-link, #rsstCards .ind-link").forEach((b) => b.addEventListener("click", () => openDetail(b.dataset.id)));
    $("#rsstSub").textContent = `${d.basis_date} 종가 · ${RSST_LABEL[k]} 높은 순 · ${total}종목`;
    const pending = (!hasRs && k === "rs_rating") || (!has200 && k === "ret200") ? " 지금 데이터에는 이 값이 아직 없어서 20일 수익률 순으로 보여 드립니다. 다음 자동 갱신부터 채워집니다." : "";
    $("#rsstNote").textContent = `시장 안 전체 종목을 한 줄로 세웠습니다. 여러 산업에 함께 속한 종목은 한 번만 나오고, 소속 산업을 누르면 그 산업의 차트와 상세가 열립니다. RS 지수는 산업 순위에 쓰는 RS 지수와 같은 방식(최근 3개월 40%, 6·9·12개월 각 20%)으로 종목끼리 비교한 1~99 백분위입니다. '시장보다 강함'이 붙은 종목은 RS선(주가÷시장 지수)이 50일 평균 위에 있습니다.${pending}`;
  }

  // ---------- heatmap
  function heatColor(rank, n) {
    if (rank == null) return "var(--hn)";
    const p = rank / n;                      // 0에 가까울수록 상위
    if (p <= 0.10) return "var(--h1)";
    if (p <= 0.25) return "var(--h2)";
    if (p <= 0.50) return "var(--h3)";
    if (p <= 0.75) return "var(--h4)";
    return "var(--h5)";
  }
  const fmtGain = (g) => g == null ? "–" : g > 0 ? "▲" + g : g < 0 ? "▼" + -g : "–";
  function renderHeat(d) {
    const days = innerWidth < 640 ? 20 : HEAT_DAYS;
    const dates = d.history.dates.slice(-days);
    const n = d.n;
    const el = $("#heat");
    const rise = state.heatSort === "rise";
    const gain = (i) => { const r0 = (d.history.rank[i.id] || []).at(-days); return r0 == null ? null : r0 - i.rank; };
    let all = d.items.filter((i) => i.rank != null);
    if (rise) all = all.map((i) => ({ i, g: gain(i) })).sort((a, b) => (b.g ?? -1e9) - (a.g ?? -1e9) || a.i.rank - b.i.rank).map((x) => x.i);
    const items = state.heatAll ? all : rise ? all.slice(0, d.top_cut) : all.filter((i) => i.rank <= d.top_cut);
    const btn = $("#heatMore");
    btn.hidden = all.length <= items.length;
    btn.textContent = state.heatAll ? `${rise ? "많이 오른" : "상위 25%"} ${d.top_cut}개만 보기` : `전체 ${all.length}개 보기`;
    el.classList.toggle("rise", rise);
    el.style.gridTemplateColumns = `minmax(110px, 150px) repeat(${dates.length}, minmax(7px, 1fr))`;
    let h = "", sepDone = false;
    const last = dates.length - 1;
    for (const it of items) {
      if (!rise && !sepDone && it.rank > d.top_cut) { h += `<div class="hsep" aria-hidden="true"></div>`; sepDone = true; }
      const rk = d.history.rank[it.id].slice(-days);
      h += `<div class="hn" data-id="${it.id}" title="${esc(it.name)} · 지금 ${it.rank}위"><em>${rise ? fmtGain(gain(it)) : it.rank}</em>${esc(it.name)}</div>`;
      h += rk.map((r, k) => `<div class="hc${k === last ? " today" : ""}" style="background:${heatColor(r, n)}" data-t="${esc(it.name)} · ${dates[k]} · ${r == null ? "데이터 없음" : r + "위 / " + n}"></div>`).join("");
    }
    h += `<div></div>` + dates.map((dt, k) => `<div class="hd">${(last - k) % 5 === 0 ? md(dt) : ""}</div>`).join("");
    el.innerHTML = h;
    $$(".hn", el).forEach((x) => x.addEventListener("click", () => openDetail(x.dataset.id)));
    const wrap = el.parentElement; wrap.scrollLeft = wrap.scrollWidth;
    $("#heat-h .sub").textContent = `최근 ${dates.length}거래일 · 종합 순위${rise ? ` · 이 기간 순위가 많이 오른 순${state.heatAll ? "" : ` ${d.top_cut}개`}` : state.heatAll ? "" : " · 상위 25%만"}`;
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
      <div class="grp" data-t="${esc(g.group)}: 평균 강도 ${g.score} · 상위 절반 ${g.top_half}/${g.n} · 상승 추세 ${g.stage2}/${g.n}">
        <span class="gn">${esc(g.group)}</span>
        <span class="gb"><b style="width:${g.score ?? 0}%"></b></span>
        <span class="gm">${g.score == null ? "–" : Math.round(g.score)}점 · 상위 ${g.top_half}/${g.n}</span>
      </div>`).join("");
    bindTips($("#groups"), ".grp");
  }

  // ---------- 상승 추세 종목 비중(Stage 2 순위, 2026-11-17): 구성 종목의 단계 판정을 묶음별로 모은다.
  const SM_ORDER = [["상승 추세", "sm-s2"], ["상승 전환 시도", "sm-s2t"], ["상승 둔화", "sm-s3"], ["바닥 다지기", "sm-s1"], ["하락 추세", "sm-s4"]];
  function renderStageMix(d) {
    const el = $("#stageMix");
    if (!el || !d) return;
    const mode = state.smMode || "group";
    $$("#smSeg button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.k === mode));
    const tally = (list) => {
      const c = Object.fromEntries(SM_ORDER.map(([k]) => [k, 0]));
      let n = 0;
      for (const m of list) if (m && c[m.stage] != null) { c[m.stage]++; n++; }
      return { c, n, s2: n ? c["상승 추세"] / n * 100 : null };
    };
    const uniq = (items) => { const seen = new Map(); for (const it of items) for (const m of it.members || []) if (!m.missing && !seen.has(m.ticker)) seen.set(m.ticker, m); return [...seen.values()]; };
    const all = tally(uniq(d.items));
    let rows;
    if (mode === "group") {
      const names = [...new Set(d.items.map((i) => i.group))];
      rows = names.map((g) => ({ key: g, name: g, ...tally(uniq(d.items.filter((i) => i.group === g))) }));
    } else {
      rows = d.items.map((i) => ({ key: i.id, name: i.name, sub: i.group, ...tally((i.members || []).filter((m) => !m.missing)) })).filter((r) => r.n >= 5);
    }
    rows = rows.filter((r) => r.n > 0).sort((a, b) => (b.s2 - a.s2) || (b.c["상승 전환 시도"] / b.n - a.c["상승 전환 시도"] / a.n) || (b.n - a.n));
    const LIM = 15, showAll = state.smAll || rows.length <= LIM + 3, shown = showAll ? rows : rows.slice(0, LIM);
    const pct = (v) => v == null ? "–" : Math.round(v) + "%";
    const bar = (r) => `<span class="sm-bar" role="img" aria-label="${SM_ORDER.map(([k]) => `${k} ${r.c[k]}`).join(", ")}">${SM_ORDER.map(([k, c]) => r.c[k] ? `<i class="${c}" style="width:${r.c[k] / r.n * 100}%"></i>` : "").join("")}</span>`;
    const tip = (r) => `${r.name}: ` + SM_ORDER.map(([k]) => `${k} ${r.c[k]}`).join(" · ") + ` (${r.n}종목)`;
    const legend = `<div class="sm-legend">${SM_ORDER.map(([k, c]) => `<span><i class="${c}"></i>${k} <b>${pct(all.n ? all.c[k] / all.n * 100 : null)}</b></span>`).join("")}</div>`;
    const s4all = all.n ? all.c["하락 추세"] / all.n * 100 : null;
    const head = `<p class="sm-all">바구니 전체 <b>${all.n.toLocaleString()}종목</b> 중 상승 추세 <b class="sm-good">${pct(all.s2)}</b> · 하락 추세 <b class="sm-bad">${pct(s4all)}</b></p>`;
    // 한 줄 결론: 가장 강한 묶음 2곳과 상승 추세가 하나도 없는 묶음.
    const strong = rows.filter((r) => r.s2 > 0).slice(0, 2), none = rows.filter((r) => r.s2 === 0);
    const unit = mode === "group" ? "분류" : "산업";
    const [unitTopic, unitSubj] = mode === "group" ? ["분류는", "분류가"] : ["산업은", "산업이"];   // 받침 따라 조사가 갈린다
    const verdict = !rows.length ? "" : (strong.length
      ? `상승 추세 종목이 가장 많은 ${unitTopic} ${strong.map((r) => `<b>${esc(r.name)}</b>(${pct(r.s2)})`).join(", ")}입니다.`
      : `상승 추세 종목이 있는 ${unitSubj} 없습니다.`)
      + (none.length && strong.length ? ` ${none.length >= 4 ? `${none.length}개 ${unit}` : none.map((r) => esc(r.name)).join(", ")}에는 상승 추세 종목이 하나도 없습니다.` : "");
    const cols = `<div class="sm-cols" aria-hidden="true"><span></span><span>${mode === "group" ? "큰 분류" : "세부 산업"}</span><span>단계 분포</span><span>상승 추세</span><span>종목</span></div>`;
    el.innerHTML = (verdict ? `<p class="sm-verdict">${verdict}</p>` : "") + head + `<div class="sm-all-bar">${bar({ ...all, name: "전체" })}</div>` + legend
      + cols + `<div class="sm-rows">${shown.map((r, k) => `<button type="button" class="sm-row" data-k="${esc(r.key)}" title="${esc(tip(r))}">
          <span class="sm-rk">${k + 1}</span><span class="sm-name"><b>${esc(r.name)}</b>${r.sub ? `<em>${esc(r.sub)}</em>` : ""}</span>
          ${bar(r)}<span class="sm-pct">${pct(r.s2)}</span><span class="sm-n">${r.c["상승 추세"]}/${r.n}</span></button>`).join("")}</div>`
      + (showAll ? "" : `<button class="ex-more" id="smMore">나머지 ${rows.length - LIM}개 더 보기 ›</button>`)
      + (!rows.length ? `<p class="none">5종목 이상인 세부 산업이 없습니다.</p>` : "");
    $$(".sm-row", el).forEach((b) => b.addEventListener("click", () => {
      if (mode === "item") { openDetail(b.dataset.k); return; }
      state.group = b.dataset.k; const sel = $("#groupSel"); if (sel) sel.value = b.dataset.k;
      renderTable(); const t = $("#rank-h"); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    const more = $("#smMore", el); if (more) more.addEventListener("click", () => { state.smAll = true; renderStageMix(d); });
  }
  $$("#smSeg button").forEach((b) => b.addEventListener("click", () => { state.smMode = b.dataset.k; state.smAll = false; renderStageMix(state.data[state.market]); }));

  // ---------- charts
  const hasLW = () => !!(window.LightweightCharts && window.LightweightCharts.createChart);
  // 차트 라이브러리(CDN)를 못 불러오면 빈칸 대신 안내 + 숫자 표로 대체한다.
  function chartFallback(el, dates, series) {
    const last = (a) => { for (let k = a.length - 1; k >= 0; k--) if (a[k] != null) return a[k]; return null; };
    const prev = (a, n) => { const idx = a.length - 1 - n; return idx >= 0 ? a[idx] : null; };
    el.innerHTML = `<div class="chart-fallback"><p>차트 라이브러리를 불러오지 못해서 최근 값을 숫자로 보여 드립니다.</p>
      <table class="mem-table"><thead><tr><th>항목</th><th class="num">최근</th><th class="num">5일 전</th><th class="num">20일 전</th></tr></thead><tbody>
      ${series.map(([n, a, f]) => `<tr><td><b>${n}</b></td><td class="num">${last(a) == null ? "–" : f(last(a))}</td><td class="num">${prev(a, 5) == null ? "–" : f(prev(a, 5))}</td><td class="num">${prev(a, 20) == null ? "–" : f(prev(a, 20))}</td></tr>`).join("")}
      </tbody></table></div>`;
  }
  function baseChart(el, opts = {}) {
    const LW = window.LightweightCharts;
    const ch = LW.createChart(el, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: css("--muted"), fontSize: 12,
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
    if (!hasLW()) { el.classList.add("as-table"); chartFallback(el, d.breadth.dates, [["50일선 위 산업", d.breadth.above50, (v) => v.toFixed(0) + "%"], ["상승 추세 산업", d.breadth.stage2, (v) => v.toFixed(0) + "%"]]); return; }
    el.classList.remove("as-table");
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
      { n: "상승 추세", c: css("--good"), s: s2, f: (v) => v.toFixed(0) + "%", last: d.breadth.stage2.at(-1) },
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
    $("#dSub").textContent = `${it.group} · 구성 종목 ${it.n}개 · 같은 비중 · 지수 ${it.close == null ? "–" : it.close.toFixed(1)} (${fmtPct(it.chg1, 2)}) · ${it.last_date}`;
    renderMembers(it, d);
    window.__supply ? window.__supply.drawer(it, d) : null;
    if (!d._sup) { const b = document.getElementById("dSupply"); if (b) b.hidden = true; }
    const st = [
      ["종합 순위", it.rank == null ? "–" : `${it.rank}위 / ${d.n}`],
      ["5일 순위 변화", it.rank_chg5 == null ? "–" : it.rank_chg5 > 0 ? `▲${it.rank_chg5}` : it.rank_chg5 < 0 ? `▼${-it.rank_chg5}` : "변화 없음"],
      ["20일 순위 변화", it.rank_chg20 == null ? "–" : it.rank_chg20 > 0 ? `▲${it.rank_chg20}` : it.rank_chg20 < 0 ? `▼${-it.rank_chg20}` : "변화 없음"],
      ["상위권 지속", it.streak ? `${it.streak}일 (${md(it.streak_start)}~)` : "–"],
      ["20일 수익률", fmtPct(it.ret20)], ["60일 수익률", fmtPct(it.ret60)], ["120일 수익률", fmtPct(it.ret120)],
      ["52주 고점 대비", it.dist_high == null ? "–" : it.dist_high.toFixed(1) + "%"],
      ["200일선 이격도", gap200Text(state.series[state.market], it.id), "gap200"],
      ["추세 상태", it.stage], [`RS선이 50일 평균 위 (${it.bench || d.benchmark.name} 대비)`, it.rs_above_ma50 == null ? "–" : it.rs_above_ma50 ? "예" : "아니오"],
      ["RS 지수 (1~99)", it.rs_rating == null ? "–" : it.rs_rating + (it.rs_rating_chg20 == null ? "" : ` (20일 전 대비 ${it.rs_rating_chg20 > 0 ? "+" : ""}${it.rs_rating_chg20})`)], ["RS선 1년 최고 대비", it.rs_hi_dist == null ? "–" : it.rs_hi_dist.toFixed(1) + "%"], ["20일 시장 대비 초과수익", it.rs_ex20 == null ? "–" : (it.rs_ex20 > 0 ? "+" : "") + it.rs_ex20.toFixed(1) + "%p"],
      ["50일선 위 종목", it.breadth50 == null ? "–" : `${it.breadth50}%`],
      ["종합 강도", it.score == null ? "–" : Math.round(it.score) + "점"],
    ];
    $("#dStats").innerHTML = st.map(([k, v, id]) => `<div${id ? ` data-stat="${id}"` : ""}><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`).join("");
    $("#dTags").innerHTML = it.tags.map((t) => `<span class="badge ${t.includes("이탈") ? "down" : "up"}">${t}</span>`).join("") || "";
    // RS 한눈에: 산업 RS 지수 vs 시장 기준선(지수를 산업들 사이에 넣은 점수), RS선 흐름, 왜 중요한가
    const dRs = window.__rsbox && window.__rsbox.drawerSlot();
    if (dRs && window.__rsbox) dRs.innerHTML = window.__rsbox.html({ d, kind: "industry", b2: !!(d.benchmark2 && it.bench === d.benchmark2.name),
      score: it.rs_rating, up: it.rs_above_ma50, hiDist: it.rs_hi_dist, who: "이 산업" });
    try {
      if (!state.series[state.market]) state.series[state.market] = await getJSON(`data/${state.market}_series.json`);
    } catch (e) { $("#cPrice").textContent = "차트 데이터를 불러오지 못했습니다."; return; }
    if (state.openId !== id) return;
    drawDetail(it);
    if (d._sup && window.__supply) window.__supply.chart(it, d, state.series[state.market]);
  }
  function renderMembers(it, d) {
    const cur = d.currency;
    const fmtP = (v) => v == null ? "–" : cur === "원" || cur === "엔" ? Math.round(v).toLocaleString("ko-KR") : v.toFixed(2);
    const stCls = { "상승 추세": "s2", "상승 전환 시도": "s2t", "하락 추세": "s4" };
    const link = (m) => {
      const code = String(m.code || "").trim();
      if (!/^[A-Za-z0-9.\-]{1,12}$/.test(code)) return "";
      const tv = window.__links.tvPage(state.market === "KR" ? code : (m.ticker || code), state.market);
      const nu = window.__links.naverAny(state.market === "KR" ? code : (m.ticker || code), state.market);
      const naver = nu ? `<a href="${nu}" target="_blank" rel="noopener noreferrer">네이버</a>` : "";
      return `<span class="mem-links">${naver}<a href="${tv}" target="_blank" rel="noopener noreferrer">TradingView</a></span>`;
    };
    const sup = d._sup && window.__supply;
    // 열 제목을 누르면 정렬(처음엔 20일 수익률 높은 순). 같은 열을 다시 누르면 방향이 뒤집힌다
    const MK = state.memSort, MV = { name: (m) => m.name, above50: (m) => m.above50 == null ? null : +m.above50, stage: (m) => STAGE_ORD[m.stage] ?? null };
    const mlist = MK ? sortBy((it.members || []).map((m, n) => ({ ...m, _n: n })), (m) => m.missing ? null : (MV[MK] || ((x) => x[MK] ?? null))(m), state.memDir, (a, b) => a._n - b._n) : (it.members || []);
    const rsCell = (m) => m.rs_rating == null ? "–" : `<b class="rs-num ${m.rs_rating >= 80 ? "hi" : m.rs_rating < 40 ? "lo" : ""}" title="RS 지수 ${m.rs_rating} (1~99, 시장 안 전체 종목끼리 비교한 백분위)">${m.rs_rating}</b>`;
    const rows = mlist.map((m) => m.missing ? `<tr><td>${esc(m.name)}</td><td colspan="${sup ? 9 : 7}" class="rsub">가격 없음</td></tr>` : `
      <tr title="${esc(m.path || "")}">
        <td><b>${skBtn(m, state.market)}</b>${m.stale ? '<span class="stale">지연</span>' : ""}${sup ? sup.blockMark(m) : ""}<span class="rsub">${esc(m.code)} · ${fmtP(m.close)}${link(m)}</span></td>
        <td class="num">${rsCell(m)}</td>
        <td class="num"><span class="ret ${cls(m.ret20)}">${fmtPct(m.ret20)}</span></td>
        <td class="num"><span class="ret ${cls(m.ret5)}">${fmtPct(m.ret5)}</span></td>
        <td class="num"><span class="ret ${cls(m.ret60)}">${fmtPct(m.ret60)}</span></td>
        <td class="num">${m.dist_high == null ? "–" : m.dist_high.toFixed(1) + "%"}</td>
        <td>${m.above50 == null ? "–" : m.above50 ? '<span class="ok">위</span>' : '<span class="no">아래</span>'}</td>
        <td><span class="stage ${stCls[m.stage] || ""}">${m.stage}</span></td>
        ${sup ? sup.memberCols(m) : ""}
      </tr>`).join("");
    const mth = (k, t, num) => `<th${num ? ' class="num"' : ""} data-sk="${k}" tabindex="0">${t}</th>`;
    $("#dMembers").innerHTML = `<table class="mem-table mem-sort"><thead><tr>${mth("name", "종목")}${mth("rs_rating", "RS", 1)}${mth("ret20", "20일", 1)}${mth("ret5", "5일", 1)}${mth("ret60", "60일", 1)}${mth("dist_high", "고점 대비", 1)}${mth("above50", "50일선")}${mth("stage", "추세 상태")}${sup ? sup.memberHead() : ""}</tr></thead><tbody>${rows}</tbody></table>`;
    const mt = $("#dMembers table");
    markSort(null, "", mt, MK, state.memDir);
    $$("th[data-sk]", mt).forEach((th) => {
      const go = () => { [state.memSort, state.memDir] = pick(state.memSort, state.memDir, th.dataset.sk); renderMembers(it, d); };
      th.addEventListener("click", go); th.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
  }

  // 200일선 이격도(보조자료): 바구니 지수 종가가 200일선보다 몇 % 위·아래인지. 차트 시리즈가 온 뒤에 채운다.
  // 바구니마다 평소 벌어지는 크기가 달라, 지난 1년(시리즈 260거래일) 범위 안에서 지금 자리를 함께 적는다.
  function gapRangeText(lo, hi, p, days) {
    const r1 = (v) => Math.round(v * 10) / 10 || 0;
    const where = p >= 90 ? " 과거와 견줘 많이 벌어진 편입니다." : p <= 10 ? " 과거와 견줘 많이 눌린 편입니다." : "";
    return `${days >= 250 ? "지난 1년" : `최근 ${days}거래일`} 범위 ${fmtPct(r1(lo))} ~ ${fmtPct(r1(hi))} · 이 기간 중 지금보다 낮았던 날이 ${Math.round(p)}%입니다.${where}`;
  }
  function gap200Of(S, id) {
    const s = S && S.items && S.items[id];
    if (!s || !s.close || !s.ma200) return null;
    const g = [];
    for (let k = 0; k < s.close.length; k++) if (s.close[k] != null && s.ma200[k]) g.push((s.close[k] / s.ma200[k] - 1) * 100);
    if (!g.length || s.close[s.close.length - 1] == null) return null;
    const cur = g[g.length - 1], past = g.slice(-252, -1), w = g.slice(-252);
    return { cur, range: past.length >= 19 ? gapRangeText(Math.min(...w), Math.max(...w), past.filter((v) => v < cur).length / past.length * 100, w.length) : "" };
  }
  function gap200Text(S, id) { const g = gap200Of(S, id); return g ? fmtPct(g.cur) : "–"; }

  function drawDetail(it) {
    const d = state.data[state.market];
    const S = state.series[state.market];
    const g200 = $('#dStats [data-stat="gap200"]'), gp = gap200Of(S, it.id);
    if (g200 && gp) { $(".v", g200).textContent = fmtPct(gp.cur); if (gp.range && !$(".sub", g200)) g200.insertAdjacentHTML("beforeend", `<div class="k sub">${esc(gp.range)}</div>`); }
    const s = S.items[it.id];
    const dates = S.dates;
    const panel = $(".drawer-panel");
    clearCharts(panel);
    ["#cPrice", "#cRs", "#cRank", "#cBench"].forEach((q) => { $(q).innerHTML = ""; });
    const pf = (v) => v.toFixed(1);
    // 바구니 지수 아래에 같은 날짜축의 시장 지수(시리즈 파일의 bench)를 붙이고 기간 수익률을 비교한다.
    const bn = d.benchmark.name, bc = S.bench && S.bench.close;
    const hasBench = !!(bc && bc.length === dates.length && bc.some((v) => v != null));
    $("#capBench").hidden = $("#cBench").hidden = !hasBench;
    if (hasBench) {
      const k0 = dates.findIndex((_, k) => s.close[k] != null && bc[k] != null);
      const k1 = dates.length - 1 - [...dates].reverse().findIndex((_, k) => s.close[dates.length - 1 - k] != null && bc[dates.length - 1 - k] != null);
      const r = (a) => (a[k1] / a[k0] - 1) * 100;
      const sg = (v) => `<b class="ret ${cls(v)}">${fmtPct(v)}</b>`;
      if (k0 >= 0 && k1 > k0) {
        const rt = r(s.close), rb = r(bc), ex = rt - rb;
        $("#capBench").innerHTML = `${esc(bn)} · 같은 기간, 대상 ${sg(rt)} · ${esc(bn)} ${sg(rb)} → 지수 대비 <b class="ret ${cls(ex)}">${ex > 0 ? "+" : ""}${ex.toFixed(1)}%p</b>`;
      } else $("#capBench").textContent = `${bn} · 같은 기간 비교할 값이 부족합니다.`;
    }
    if (!hasLW()) {
      $("#lgPrice").innerHTML = ""; $("#lgRs").innerHTML = "";
      chartFallback($("#cPrice"), dates, [["바구니 지수", s.close, pf], ["20일선", s.ma20, pf], ["50일선", s.ma50, pf], ["200일선", s.ma200, pf]]);
      if (hasBench) chartFallback($("#cBench"), dates, [[esc(bn), bc, (v) => v.toFixed(v >= 1000 ? 0 : 2)]]);
      chartFallback($("#cRs"), dates, [["RS선", s.rs, pf], ["RS 50일 평균", s.rs_ma50, pf]]);
      chartFallback($("#cRank"), d.history.dates, [["종합 순위", d.history.rank[it.id], (v) => Math.round(v) + "위"]]);
      return;
    }

    const c1 = baseChart($("#cPrice"), { fmt: pf });
    const sp = line(c1, dates, s.close, css("--price"), 2);
    const m20 = line(c1, dates, s.ma20, css("--ma20"), 1.5, { lastValueVisible: false });
    const m50 = line(c1, dates, s.ma50, css("--ma50"), 1.5, { lastValueVisible: false });
    const m200 = line(c1, dates, s.ma200, css("--ma200"), 1.5, { lastValueVisible: false });
    c1.timeScale().fitContent();
    const lastOf = (a) => { for (let k = a.length - 1; k >= 0; k--) if (a[k] != null) return a[k]; return null; };
    legend($("#lgPrice"), [
      { n: "지수", c: css("--price"), s: sp, f: pf, last: lastOf(s.close) },
      { n: "20일선", c: css("--ma20"), s: m20, f: pf, last: lastOf(s.ma20) },
      { n: "50일선", c: css("--ma50"), s: m50, f: pf, last: lastOf(s.ma50) },
      { n: "200일선", c: css("--ma200"), s: m200, f: pf, last: lastOf(s.ma200) },
    ], c1);

    let c4 = null;
    if (hasBench) {
      c4 = baseChart($("#cBench"), { fmt: (v) => v.toFixed(v >= 1000 ? 0 : 2) });
      line(c4, dates, bc, css("--accent"), 2);
      c4.timeScale().fitContent();
    }
    const c2 = baseChart($("#cRs"), { fmt: (v) => v.toFixed(1) });
    const rs = line(c2, dates, s.rs, css("--accent"), 2);
    const rsm = line(c2, dates, s.rs_ma50, css("--ma20"), 1.5, { lastValueVisible: false });
    c2.timeScale().fitContent();
    legend($("#lgRs"), [
      { n: `RS선 (${it.bench || d.benchmark.name} 대비)`, c: css("--accent"), s: rs, f: (v) => v.toFixed(1), last: lastOf(s.rs) },
      { n: "RS 50일 평균", c: css("--ma20"), s: rsm, f: (v) => v.toFixed(1), last: lastOf(s.rs_ma50) },
    ], c2);

    const c3 = baseChart($("#cRank"), { fmt: (v) => Math.round(v) + "위", priceScale: { invertScale: true } });
    const rk = line(c3, d.history.dates, d.history.rank[it.id], css("--accent"), 2, { lineType: 1 });
    rk.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: 1, maxValue: d.n } }) });
    rk.createPriceLine({ price: d.top_cut + 0.5, color: css("--good"), lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "상위 25%" });
    c3.timeScale().fitContent();
    // 차트들의 시간축을 함께 움직이게
    const all = [c1, c2, c3, c4].filter(Boolean);
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
    window.__highs && window.__highs.rerender();
    window.__secflow && window.__secflow.rerender();
    const d = state.data[state.market];
    if (!d) return;
    requestAnimationFrame(() => {
      renderBreadth(d);
      window.__flow && window.__flow.redraw();
      if (state.openId && state.series[state.market]) {
        const it = d.items.find((x) => x.id === state.openId);
        drawDetail(it);
        if (d._sup && window.__supply) window.__supply.chart(it, d, state.series[state.market]);
      }
    });
  }

  // resize-heat: 화면 폭이 바뀌면 색 지도 기간 다시 맞춤
  let rzT; addEventListener("resize", () => { clearTimeout(rzT); rzT = setTimeout(() => { const d = state.data[state.market]; if (d) renderHeat(d); }, 200); });

  // start
  const [hm, hv] = (location.hash || "").replace("#", "").split("-");
  const h = (hm || "").toUpperCase();
  if (h === "US" || h === "KR" || h === "JP") {
    state.market = h;
    $$(".seg[role=tablist] button").forEach((x) => x.setAttribute("aria-selected", x.dataset.market === h));
  }
  if (hv && !viewOk(hv)) {   // 이 시장에 없는 탭 주소: 미국 전용 탭은 미국으로, 일본에서 연 신고가·매크로는 한국으로
    state.market = US_ONLY.includes(hv) ? "US" : "KR";
    $$(".seg[role=tablist] button").forEach((x) => x.setAttribute("aria-selected", x.dataset.market === state.market));
  }
  marketTabs();
  load();
  window.__isRefresh && window.__isRefresh.init(() => { reloadData(); window.__highs && window.__highs.reload(); window.__macro && window.__macro.reload(); window.__ai && window.__ai.reload(); window.__pairs && window.__pairs.reload(); });
  if (hv === "highs" || hv === "macro" || hv === "ai" || hv === "pairs" || hv === "positioning") addEventListener("DOMContentLoaded", () => setView(hv), { once: true });
})();
