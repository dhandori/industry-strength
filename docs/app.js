/* 산업 강도판 화면 */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const state = { market: "KR", sort: "rank", group: "전체", data: {}, series: {}, charts: [], openId: null };
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
  const fmtNum = (v, cur) => v == null ? "–" : cur === "원" ? Math.round(v).toLocaleString("ko-KR") + "원" : "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    state.group = "전체"; state.exOpen = new Set(); state.exAll = new Set();
    setHash();
    load();
    if (state.view === "highs") window.__highs && window.__highs.show(state.market);
  }));

  // ---------- 화면 전환: 산업 강도 / 52주 신고가 (2026-10-21)
  state.view = "strength";
  function setHash() { try { history.replaceState(null, "", "#" + state.market + (state.view === "highs" ? "-highs" : "")); } catch (e) {} }
  function setView(v) {
    state.view = v;
    $$(".view-tabs button").forEach((x) => x.setAttribute("aria-selected", x.dataset.view === v));
    $("#viewStrength").hidden = v !== "strength";
    $("#viewHighs").hidden = v !== "highs";
    document.body.classList.toggle("v-highs", v === "highs");
    setHash();
    if (v === "highs") window.__highs && window.__highs.show(state.market);
    else requestAnimationFrame(rerenderCharts);
    scrollTo({ top: 0 });
  }
  $$(".view-tabs button").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
  window.__isBoard = () => ({ data: state.data, open: openDetail });
  $$("#sortSeg button").forEach((b) => b.addEventListener("click", () => {
    state.sort = b.dataset.sort;
    $$("#sortSeg button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    renderTable();
  }));
  // 순위 흐름 줄 순서: 지금 순위 / 화면 기간 동안 순위가 많이 오른 순(강세가 막 시작된 산업이 위로)
  state.heatSort = "rank";
  $$("#heatSort button").forEach((b) => b.addEventListener("click", () => {
    state.heatSort = b.dataset.hs;
    $$("#heatSort button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    renderHeat(state.data[state.market]);
  }));
  $("#heatMore").addEventListener("click", () => { state.heatAll = !state.heatAll; renderHeat(state.data[state.market]); });
  $("#groupSel").addEventListener("change", (e) => { state.group = e.target.value; renderTable(); });
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
    } catch (e) {
      $("#meta").textContent = "데이터를 불러오지 못했어요. 잠시 후 새로고침해 주세요.";
      return;
    }
    render();
    window.__isRefresh && window.__isRefresh.repaint();
  }
  // 새 데이터가 올라오면 캐시를 비우고 다시 그린다.
  let dataStamp = Date.now();
  function reloadData() { state.data = {}; state.series = {}; dataStamp = Date.now(); load(); }

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
    renderTiles(d); window.__flow && window.__flow.render(d); renderSignals(d); renderExplore(d); renderTable(); renderHeat(d); renderGroups(d); renderBreadth(d);
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
    $("#tiles").innerHTML = `
      <div class="tile tile-main"><div class="k">상승 추세 산업</div>
        <div class="v big ${tone}">${s2}<span class="of"> / ${d.items.length}</span></div>
        <div class="d">상승 전환 시도 ${s2t}개까지 합치면 ${s2 + s2t}개</div></div>
      <div class="tile"><div class="k">시장 국면</div>
        ${idxs.map((x) => `<div class="idx-row"><span class="idx-n">${esc(x.name)}</span>${reg(x)}</div>
        <div class="d">${x.above50 ? "50일선 위" : "50일선 아래"} · ${x.above200 ? "200일선 위" : "200일선 아래"} · 200일선 ${x.ma200_up ? "상승" : "하락"}</div>`).join("")}</div>
      <div class="tile"><div class="k">지수 20일 수익률</div>
        ${idxs.map((x) => `<div class="idx-row"><span class="idx-n">${esc(x.name)}</span><span class="ret ${cls(x.ret20)} idx-v">${fmtPct(x.ret20)}</span></div>
        <div class="d">5일 ${fmtPct(x.ret5)} · 60일 ${fmtPct(x.ret60)}</div>`).join("")}</div>
      <div class="tile"><div class="k">50일선 위 산업 비율</div>
        <div class="v">${brNow == null ? "–" : brNow.toFixed(0) + "%"}</div>
        <div class="d">20거래일 전 ${brPrev == null ? "–" : brPrev.toFixed(0) + "%"}${brNow != null && brPrev != null ? ` (${brNow >= brPrev ? "▲" : "▼"}${Math.abs(brNow - brPrev).toFixed(0)}%p)` : ""}</div></div>`;
  }

  // ---------- signals
  const SHOW = 5;
  const weakHelp = "순위는 올랐지만 가격은 아직 하락하거나 힘이 빠진 산업이에요. 덜 빠져서 순위가 오른 경우일 수 있으니 추세 확인이 먼저예요.";
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
        { t: "50일선 돌파", c: "var(--accent)", help: "바구니 지수가 오늘 50일선 위로 올라온 산업 · 전환 초입일 수 있어요" },
        { t: "약화 경고", c: "var(--down)", any: ["상위권 이탈", "50일선 이탈"], help: "상위 25%에서 밀려났거나 50일선 아래로 내려간 산업" },
      ] },
    ];
    $("#signals").innerHTML = rows.map((row) => {
      const empties = [];
      const cards = row.groups.map((g) => {
        const keys = g.any || [g.t];
        const list = d.items.filter((i) => i.tags.some((t) => keys.includes(t)));
        const chip = (i) => {
          const weak = !g.any && WEAK.includes(i.stage);
          return `<button class="chip${weak ? " weak" : ""}" data-id="${i.id}"${weak ? ` title="${weakHelp}"` : ""}>${esc(i.name)}${weak ? '<span class="chip-tail">순위↑ 가격↓</span>' : ""}</button>`;
        };
        const head = `<h3><span class="dot" style="color:${g.c}"></span>${g.t} <span class="cnt">${list.length}</span><button class="help" type="button" aria-label="${g.t} 뜻" data-help="${esc(g.help)}">?</button></h3>`;
        if (!list.length) { empties.push(`<span class="sig-empty">${head}<span class="none">해당 없음</span></span>`); return ""; }
        const more = list.length > SHOW ? `<button class="chip more" type="button" data-more="${g.t}">+${list.length - SHOW}개 더</button>` : "";
        return `<div class="sig" data-sig="${g.t}">${head}
          <div class="chips">${list.slice(0, SHOW).map(chip).join("")}${more}</div>
          ${list.length > SHOW ? `<div class="chips rest" hidden>${list.slice(SHOW).map(chip).join("")}<button class="chip more" type="button" data-less="${g.t}">접기</button></div>` : ""}</div>`;
      });
      return `<div class="sig-row"><div class="sig-row-title">${row.title}</div><div class="sig-grid">${cards.join("")}</div>${empties.length ? `<div class="sig-empties">${empties.join("")}</div>` : ""}</div>`;
    }).join("");
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
  function stockLinks(m, market) {
    const code = m.code || m.ticker;
    if (market === "KR") {
      return `<span class="xl"><a href="https://finance.naver.com/item/main.naver?code=${code}" target="_blank" rel="noopener" title="네이버 증권에서 보기">네이버</a><a href="https://www.tradingview.com/chart/?symbol=KRX:${code}" target="_blank" rel="noopener" title="TradingView 차트">TV</a></span>`;
    }
    const t = m.ticker || code;
    return `<span class="xl"><a href="https://www.tradingview.com/chart/?symbol=${encodeURIComponent(t)}" target="_blank" rel="noopener" title="TradingView 차트">TV</a><a href="https://finviz.com/quote.ashx?t=${encodeURIComponent(t)}" target="_blank" rel="noopener" title="Finviz에서 보기">Finviz</a></span>`;
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
        el.innerHTML = `<p class="empty">네이버 업종 자료가 아직 없어요. 한국장 마감 뒤 자동 수집이 한 번 끝나면 채워져요.</p>`;
        $("#exSub").textContent = "네이버 업종"; return;
      }
      if (!nv.periods_available.includes(k)) {
        el.innerHTML = `<p class="empty">네이버 업종의 ${PLABEL[k]} 등락률은 매일 쌓은 기록을 이어 붙여 계산해요. 기록이 ${k.replace("ret", "")}거래일 쌓이면 보여 드릴게요(지금 ${nv.days_recorded}일치).<br>1일 등락률은 지금 바로 볼 수 있어요.</p>`;
        $("#exSub").textContent = `네이버 업종 · ${nv.basis_date} 종가 기준`; return;
      }
      tree = naverTree(nv, k);
      $("#exSub").innerHTML = `네이버 업종 ${nv.n_industries}개 · ${nv.basis_date} 종가 · ${PLABEL[k]} <a class="xl-inline" href="${nv.source_url}" target="_blank" rel="noopener">네이버 업종별 시세 ↗</a>`;
      note = (k === "chg1" ? "업종 등락률은 네이버가 발표한 값 그대로예요." : "여러 날 등락률은 네이버 업종 하루 등락률을 이어 곱했어요.") + " 섹터는 소속 업종을 종목 수로 가중 평균했어요. 업종 안 종목은 '네이버' 버튼으로 네이버 화면에서 보세요.";
    } else {
      tree = boardTree(d, k);
      $("#exSub").textContent = `강도판 분류 · ${d.basis_date} 종가 · ${PLABEL[k]} 등락률`;
      note = "분류·세부 산업 등락률은 구성 종목 등락률의 단순 평균(종목 수 같은 비중)이에요.";
    }
    $("#exNote").textContent = `큰 분류를 누르면 세부 업종이 펼쳐지고, 강도판 분류에서는 세부 업종을 누르면 종목까지 펼쳐져요. ${note} 빨강은 상승, 파랑은 하락이에요. 네이버·TV·Finviz 버튼은 새 창으로 열려요.`;
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
          h += `<div class="ex-row lv2"><span class="chev"></span><span class="ex-name">${esc(m.name)} ${extra}${stockLinks(m, mk)}</span>${bar(m.v, mmx)}${val(m.v)}</div>`;
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
    let rows = d.items.filter((i) => (state.group === "전체" || i.group === state.group)
      && (!state.trendOnly || i.stage === "상승 추세" || i.stage === "상승 전환 시도")
      && (!state.rsOnly || i.rs_above_ma50 === true));
    const k = state.sort;
    rows = rows.slice().sort((a, b) => {
      const av = a[k], bv = b[k];
      if (av == null && bv == null) return (a.rank ?? 999) - (b.rank ?? 999);
      if (av == null) return 1; if (bv == null) return -1;
      return k === "rank_chg5" || k === "rs_rating" ? bv - av || a.rank - b.rank : av - bv;
    });
    const stageCls = { "상승 추세": "s2", "상승 전환 시도": "s2t", "하락 추세": "s4" };
    const ret = (v, rk) => `<span class="ret ${cls(v)}">${fmtPct(v)}</span><span class="rsub">${rk == null ? "–" : rk + "위"}</span>`;
    // 막대 길이는 시장 안 순위 백분위(1위=100%, 꼴찌=0%): 점수가 55~90에 몰려도 차이가 보이게.
    const nAll = d.items.filter((x) => x.rank != null).length;
    const pctile = (i) => i.rank == null || nAll < 2 ? 0 : Math.round((1 - (i.rank - 1) / (nAll - 1)) * 100);
    const CHECK_LABELS = ["50", "50>150", "150>200", "200↑", "고점"];
    const checksOf = (i, labels) => i.checks ? `<span class="checks${labels ? " labeled" : ""}" aria-label="추세 조건 ${i.checks.filter(Boolean).length}/5">${i.checks.map((c, k) => `<span class="ck"><i class="${c ? "on" : ""}"></i>${labels ? `<em>${CHECK_LABELS[k]}</em>` : ""}</span>`).join("")}</span>` : `<span class="rsub">데이터 부족</span>`;
    const chgOf = (i) => { const ch = i.rank_chg5; return ch == null ? "" : ch > 0 ? `<span class="chg up">▲${ch}</span>` : ch < 0 ? `<span class="chg down">▼${-ch}</span>` : `<span class="chg flat">–</span>`; };
    // RS 표시: 시장 지수 대비 강도. 신고가(1년 최고 -0.5% 이내) / 강함(50일 평균 위) / 약함(아래)
    const rsState = (i) => i.rs_hi_dist != null && i.rs_hi_dist >= -0.5 ? ["RS 신고가", "rs-hi"]
      : i.rs_above_ma50 === true ? ["시장보다 강함", "rs-up"] : i.rs_above_ma50 === false ? ["시장보다 약함", "rs-dn"] : ["데이터 부족", ""];
    const rsNum = (i) => i.rs_rating == null ? "" : `<b class="rs-num ${i.rs_rating >= 80 ? "hi" : i.rs_rating < 40 ? "lo" : ""}" title="RS 지수 ${i.rs_rating} (1~99, 1년 가중 수익률을 산업끼리 비교한 백분위)${i.rs_rating_chg20 == null ? "" : ` · 20일 전보다 ${i.rs_rating_chg20 > 0 ? "+" : ""}${i.rs_rating_chg20}`}">${i.rs_rating}</b>`;
    const rsTip = (i) => `RS 지수 ${i.rs_rating ?? "–"} · ${esc(i.bench || d.benchmark.name)} 대비 · RS선 1년 최고 대비 ${i.rs_hi_dist == null ? "–" : i.rs_hi_dist.toFixed(1) + "%"} · 20일 시장 대비 ${i.rs_ex20 == null ? "–" : (i.rs_ex20 > 0 ? "+" : "") + i.rs_ex20.toFixed(1) + "%p"}`;
    const rsOf = (i) => { const [t, c] = rsState(i); return `<span class="rs-chip ${c}" title="${rsTip(i)}">${t}</span>`; };
    const rsSub = (i) => i.rs_hi_dist == null ? "" : `<span class="rsub">RS 고점 ${i.rs_hi_dist >= -0.05 ? "0.0" : i.rs_hi_dist.toFixed(1)}%</span>`;
    const subOf = (i) => `대장 ${esc(i.leader || "–")} · ${i.n ?? 0}종목` + (i.streak ? ` · 상위권 ${i.streak}일째` : "") + (i.breadth50 == null ? "" : ` · 50일선 위 ${i.breadth50}%`) + (i.near_high ? ` · 신고가권 ${i.near_high}` : "");
    $("#rankTable tbody").innerHTML = rows.map((i) => {
      const tags = i.tags.filter((t) => !t.includes("이탈")).slice(0, 2).map((t) => `<span class="tag-mini">${t}</span>`).join("");
      return `<tr data-id="${i.id}" class="${i.top ? "top" : ""}">
        <td><span class="rk">${i.rank ?? "–"}</span>${chgOf(i)}</td>
        <td class="name"><b>${esc(i.name)}${i.stale ? '<span class="stale">지연</span>' : ""}</b><span>${subOf(i)}</span>${tags ? "<br>" + tags : ""}</td>
        <td><div class="bar" title="시장 안 순위 백분위 ${pctile(i)}% · 종합 강도 ${i.score == null ? "–" : Math.round(i.score)}점"><i><b style="width:${pctile(i)}%"></b></i><span>${i.score == null ? "–" : Math.round(i.score)}</span></div></td>
        <td class="num">${ret(i.chg1, i.rank1)}</td>
        <td class="num">${ret(i.ret5, i.rank5)}</td>
        <td class="num">${ret(i.ret20, i.rank20)}</td>
        <td class="num">${ret(i.ret60, i.rank60)}</td>
        <td>${checksOf(i, true)}</td>
        <td class="num">${i.dist_high == null ? "–" : i.dist_high.toFixed(1) + "%"}</td>
        <td><span class="stage ${stageCls[i.stage] || ""}">${i.stage}</span></td>
        <td class="c-rs"><div class="rs-cell">${rsNum(i)}<div>${rsOf(i)}${rsSub(i)}</div></div></td>
      </tr>`;
    }).join("");
    // 휴대폰: 표 대신 카드. 1줄 순위·이름·상태, 2줄 강도·수익률, 3줄 추세 점검.
    $("#rankCards").innerHTML = rows.map((i) => `
      <button class="rcard${i.top ? " top" : ""}" type="button" data-id="${i.id}">
        <div class="rc1"><span class="rk">${i.rank ?? "–"}</span>${chgOf(i)}<b class="rc-name">${esc(i.name)}</b><span class="stage ${stageCls[i.stage] || ""}">${i.stage}</span></div>
        <div class="rc-sub">${subOf(i)}</div>
        <div class="rc2"><div class="bar"><i><b style="width:${pctile(i)}%"></b></i><span>${i.score == null ? "–" : Math.round(i.score)}</span></div>
          <span class="rc-ret"><em>당일</em>${ret(i.chg1, i.rank1)}</span><span class="rc-ret"><em>5일</em>${ret(i.ret5, i.rank5)}</span><span class="rc-ret"><em>20일</em>${ret(i.ret20, i.rank20)}</span><span class="rc-ret"><em>60일</em>${ret(i.ret60, i.rank60)}</span></div>
        <div class="rc3">${checksOf(i, true)}<span class="rc-dist">고점 대비 <b>${i.dist_high == null ? "–" : i.dist_high.toFixed(1) + "%"}</b></span></div>
        <div class="rc4">${i.rs_rating == null ? "" : `<span class="rc-dist">RS 지수</span>${rsNum(i)}`}${rsOf(i)}<span class="rc-dist">RS선 1년 최고 대비 <b>${i.rs_hi_dist == null ? "–" : i.rs_hi_dist.toFixed(1) + "%"}</b> · 20일 시장 대비 <b class="ret ${cls(i.rs_ex20)}">${i.rs_ex20 == null ? "–" : (i.rs_ex20 > 0 ? "+" : "") + i.rs_ex20.toFixed(1) + "%p"}</b></span></div>
      </button>`).join("");
    if (!rows.length) {
      const msg = "조건에 맞는 산업이 없어요. 지금 이 조건에서는 가격이 오르고 있는 산업이 없어요.";
      $("#rankTable tbody").innerHTML = `<tr><td colspan="11" style="text-align:center;color:var(--muted);padding:24px">${msg}</td></tr>`;
      $("#rankCards").innerHTML = `<p class="none" style="padding:16px 0">${msg}</p>`;
    }
    $$("#rankTable tbody tr[data-id], #rankCards .rcard").forEach((tr) => tr.addEventListener("click", () => openDetail(tr.dataset.id)));
    $("#tableNote").innerHTML = `파란 띠는 종합 순위 상위 25%(${d.top_cut}위 이내)예요. 막대 길이는 전체 산업 중 몇 % 위치인지, 막대 옆 숫자는 종합 강도 점수예요. 수익률 아래 작은 숫자는 그 기간 수익률 순위예요.`;
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

  // ---------- charts
  const hasLW = () => !!(window.LightweightCharts && window.LightweightCharts.createChart);
  // 차트 라이브러리(CDN)를 못 불러오면 빈칸 대신 안내 + 숫자 표로 대체한다.
  function chartFallback(el, dates, series) {
    const last = (a) => { for (let k = a.length - 1; k >= 0; k--) if (a[k] != null) return a[k]; return null; };
    const prev = (a, n) => { const idx = a.length - 1 - n; return idx >= 0 ? a[idx] : null; };
    el.innerHTML = `<div class="chart-fallback"><p>차트 라이브러리를 불러오지 못했어요. 최근 값을 숫자로 보여 드려요.</p>
      <table class="mem-table"><thead><tr><th>항목</th><th class="num">최근</th><th class="num">5일 전</th><th class="num">20일 전</th></tr></thead><tbody>
      ${series.map(([n, a, f]) => `<tr><td><b>${n}</b></td><td class="num">${last(a) == null ? "–" : f(last(a))}</td><td class="num">${prev(a, 5) == null ? "–" : f(prev(a, 5))}</td><td class="num">${prev(a, 20) == null ? "–" : f(prev(a, 20))}</td></tr>`).join("")}
      </tbody></table></div>`;
  }
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
    const st = [
      ["종합 순위", it.rank == null ? "–" : `${it.rank}위 / ${d.n}`],
      ["5일 순위 변화", it.rank_chg5 == null ? "–" : it.rank_chg5 > 0 ? `▲${it.rank_chg5}` : it.rank_chg5 < 0 ? `▼${-it.rank_chg5}` : "변화 없음"],
      ["20일 순위 변화", it.rank_chg20 == null ? "–" : it.rank_chg20 > 0 ? `▲${it.rank_chg20}` : it.rank_chg20 < 0 ? `▼${-it.rank_chg20}` : "변화 없음"],
      ["상위권 지속", it.streak ? `${it.streak}일 (${md(it.streak_start)}~)` : "–"],
      ["20일 수익률", fmtPct(it.ret20)], ["60일 수익률", fmtPct(it.ret60)], ["120일 수익률", fmtPct(it.ret120)],
      ["52주 고점 대비", it.dist_high == null ? "–" : it.dist_high.toFixed(1) + "%"],
      ["추세 상태", it.stage], [`RS선이 50일 평균 위 (${it.bench || d.benchmark.name} 대비)`, it.rs_above_ma50 == null ? "–" : it.rs_above_ma50 ? "예" : "아니오"],
      ["RS 지수 (1~99)", it.rs_rating == null ? "–" : it.rs_rating + (it.rs_rating_chg20 == null ? "" : ` (20일 전 대비 ${it.rs_rating_chg20 > 0 ? "+" : ""}${it.rs_rating_chg20})`)], ["RS선 1년 최고 대비", it.rs_hi_dist == null ? "–" : it.rs_hi_dist.toFixed(1) + "%"], ["20일 시장 대비 초과수익", it.rs_ex20 == null ? "–" : (it.rs_ex20 > 0 ? "+" : "") + it.rs_ex20.toFixed(1) + "%p"],
      ["50일선 위 종목", it.breadth50 == null ? "–" : `${it.breadth50}%`],
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
  function renderMembers(it, d) {
    const cur = d.currency;
    const fmtP = (v) => v == null ? "–" : cur === "원" ? Math.round(v).toLocaleString("ko-KR") : v.toFixed(2);
    const stCls = { "상승 추세": "s2", "상승 전환 시도": "s2t", "하락 추세": "s4" };
    const link = (m) => {
      const code = String(m.code || "").trim();
      if (!/^[A-Za-z0-9.\-]{1,12}$/.test(code)) return "";
      const tv = `https://www.tradingview.com/symbols/${encodeURIComponent(state.market === "KR" ? "KRX-" + code : code)}/`;
      const naver = state.market === "KR" ? `<a href="https://m.stock.naver.com/domestic/stock/${encodeURIComponent(code)}/total" target="_blank" rel="noopener noreferrer">네이버</a>` : "";
      return `<span class="mem-links">${naver}<a href="${tv}" target="_blank" rel="noopener noreferrer">TradingView</a></span>`;
    };
    const rows = (it.members || []).map((m) => m.missing ? `<tr><td>${esc(m.name)}</td><td colspan="6" class="rsub">가격 없음</td></tr>` : `
      <tr title="${esc(m.path || "")}">
        <td><b>${esc(m.name)}</b>${m.stale ? '<span class="stale">지연</span>' : ""}<span class="rsub">${esc(m.code)} · ${fmtP(m.close)}${link(m)}</span></td>
        <td class="num"><span class="ret ${cls(m.ret20)}">${fmtPct(m.ret20)}</span></td>
        <td class="num"><span class="ret ${cls(m.ret5)}">${fmtPct(m.ret5)}</span></td>
        <td class="num"><span class="ret ${cls(m.ret60)}">${fmtPct(m.ret60)}</span></td>
        <td class="num">${m.dist_high == null ? "–" : m.dist_high.toFixed(1) + "%"}</td>
        <td>${m.above50 == null ? "–" : m.above50 ? '<span class="ok">위</span>' : '<span class="no">아래</span>'}</td>
        <td><span class="stage ${stCls[m.stage] || ""}">${m.stage}</span></td>
      </tr>`).join("");
    $("#dMembers").innerHTML = `<table class="mem-table"><thead><tr><th>종목</th><th class="num">20일</th><th class="num">5일</th><th class="num">60일</th><th class="num">고점 대비</th><th>50일선</th><th>추세 상태</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function drawDetail(it) {
    const d = state.data[state.market];
    const S = state.series[state.market];
    const s = S.items[it.id];
    const dates = S.dates;
    const panel = $(".drawer-panel");
    clearCharts(panel);
    ["#cPrice", "#cRs", "#cRank"].forEach((q) => { $(q).innerHTML = ""; });
    const pf = (v) => v.toFixed(1);
    if (!hasLW()) {
      $("#lgPrice").innerHTML = ""; $("#lgRs").innerHTML = "";
      chartFallback($("#cPrice"), dates, [["바구니 지수", s.close, pf], ["20일선", s.ma20, pf], ["50일선", s.ma50, pf], ["200일선", s.ma200, pf]]);
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
    window.__highs && window.__highs.rerender();
    const d = state.data[state.market];
    if (!d) return;
    requestAnimationFrame(() => {
      renderBreadth(d);
      window.__flow && window.__flow.redraw();
      if (state.openId && state.series[state.market]) drawDetail(d.items.find((x) => x.id === state.openId));
    });
  }

  // resize-heat: 화면 폭이 바뀌면 색 지도 기간 다시 맞춤
  let rzT; addEventListener("resize", () => { clearTimeout(rzT); rzT = setTimeout(() => { const d = state.data[state.market]; if (d) renderHeat(d); }, 200); });

  // start
  const [hm, hv] = (location.hash || "").replace("#", "").split("-");
  const h = (hm || "").toUpperCase();
  if (h === "US" || h === "KR") {
    state.market = h;
    $$(".seg[role=tablist] button").forEach((x) => x.setAttribute("aria-selected", x.dataset.market === h));
  }
  load();
  window.__isRefresh && window.__isRefresh.init(() => { reloadData(); window.__highs && window.__highs.reload(); });
  if (hv === "highs") addEventListener("DOMContentLoaded", () => setView("highs"), { once: true });
})();
