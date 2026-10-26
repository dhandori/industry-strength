/* 섹터 워치 차트 카드: 업종 ETF의 당일·5일·20일·60일·200일 흐름 (2026-10-26)
   자료: data/{시장}_sectorflow.json (scripts/sector_flow.py). 파일이 없는 시장은 아무것도 그리지 않는다.
   - 선 = 기간 시작 가격 대비 %, 점선 = 기준(0%), 위는 빨강 면, 아래는 파랑 면
   - 점 = 기간 중 최고·최저, 이동평균선은 20일 이상에서만
   - 카드를 누르면 축이 있는 큰 차트가 열리고, 거기서 세부 산업 순위로 내려갈 수 있다. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = (v, d = 2) => v == null ? "–" : (v > 0 ? "+" : "") + v.toFixed(d);
  const cls = (v) => v == null ? "" : v > 0 ? "up" : v < 0 ? "down" : "";
  const PERIODS = [["1d", "당일"], ["5d", "5일"], ["20d", "20일"], ["60d", "60일"], ["200d", "200일"]];
  const HOT = { "1d": 3, "5d": 5, "20d": 10, "60d": 15, "200d": 25 };      // 이 이상 움직이면 칸을 칠한다
  const MA_NAME = { 5: "5일선", 20: "20일선", 50: "50일선", 200: "200일선" };
  const MA_CLS = { 5: "m-s", 20: "m-s", 50: "m-m", 200: "m-l" };
  const BASE_NAME = { "1d": "전일 종가", "5d": "5거래일 전 종가", "20d": "20거래일 전 종가", "60d": "60거래일 전 종가", "200d": "200거래일 전 종가" };
  let store = {}, market = null, uid = 0;
  const pref = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  let period = pref("is-sf-period", "1d");
  let open = pref("is-sf-open", "0") === "1";
  if (!PERIODS.some(([k]) => k === period)) period = "1d";

  async function get(m) {
    if (m in store) return store[m];
    store[m] = null;
    try {
      const r = await fetch(`data/${m}_sectorflow.json?v=${Date.now()}`, { cache: "no-store" });
      if (r.ok) store[m] = await r.json();
    } catch (e) { store[m] = null; }
    return store[m];
  }

  // ---------- 작은 카드 그림
  function geom(p, W, H) {
    const line = p.line || [];
    const vals = [0, ...line.filter((x) => x != null)];
    Object.values(p.ma || {}).forEach((a) => a.forEach((x) => { if (x != null) vals.push(x); }));
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo || 1) * 0.08; lo -= pad; hi += pad;
    const n = Math.max(1, line.length - 1);
    const X = (k) => (k / n) * W, Y = (v) => H - ((v - lo) / (hi - lo)) * H;
    return { X, Y, n, by: Y(0) };
  }
  function path(arr, X, Y) {
    let s = "", pen = false;
    arr.forEach((v, k) => {
      if (v == null) { pen = false; return; }
      s += `${pen ? "L" : "M"}${X(k).toFixed(1)},${Y(v).toFixed(1)}`; pen = true;
    });
    return s;
  }
  function chartSvg(p, key) {
    const W = 200, H = 84, line = p.line || [];
    if (line.length < 2) return `<div class="sf-empty">그림 자료 없음</div>`;
    const { X, Y, by } = geom(p, W, H);
    const id = "sf" + (++uid);
    const d = path(line, X, Y);
    const first = line.findIndex((x) => x != null), last = line.length - 1 - [...line].reverse().findIndex((x) => x != null);
    const area = `${d}L${X(last).toFixed(1)},${by.toFixed(1)}L${X(first).toFixed(1)},${by.toFixed(1)}Z`;
    const cuts = (p.cuts || []).slice(1).map((c) => `<line class="sf-cut" x1="${X(c - 0.5).toFixed(1)}" x2="${X(c - 0.5).toFixed(1)}" y1="0" y2="${H}"/>`).join("");
    const mas = Object.entries(p.ma || {}).map(([w, a]) => `<path class="sf-ma ${MA_CLS[w] || "m-s"}" d="${path(a, X, Y)}"/>`).join("");
    const dot = (k, c) => k == null || line[k] == null ? "" :
      `<i class="sf-dot ${c}" style="left:${(X(k) / W * 100).toFixed(2)}%;top:${(Y(line[k]) / H * 100).toFixed(2)}%"></i>`;
    return `<div class="sf-plot"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <defs><clipPath id="${id}a"><rect x="0" y="0" width="${W}" height="${Math.max(0, by).toFixed(1)}"/></clipPath>
      <clipPath id="${id}b"><rect x="0" y="${Math.max(0, by).toFixed(1)}" width="${W}" height="${H}"/></clipPath></defs>
      ${cuts}
      <path class="sf-area up" d="${area}" clip-path="url(#${id}a)"/><path class="sf-area down" d="${area}" clip-path="url(#${id}b)"/>
      <line class="sf-base" x1="0" x2="${W}" y1="${by.toFixed(1)}" y2="${by.toFixed(1)}"/>
      ${mas}
      <path class="sf-line up" d="${d}" clip-path="url(#${id}a)"/><path class="sf-line down" d="${d}" clip-path="url(#${id}b)"/>
    </svg>${dot(p.hi, "hi")}${dot(p.lo, "lo")}</div>
    <div class="sf-axis">${(p.labels || []).map((x) => `<span>${esc(x)}</span>`).join("")}</div>`;
  }

  function badge(v, key, big) {
    const hot = v != null && Math.abs(v) >= HOT[key];
    return `<em class="sf-ret ${cls(v)}${hot ? " hot" : ""}${big ? " big" : ""}">${fmt(v)}</em>`;
  }
  function card(s, key, mret, kind) {
    const p = s.periods[key] || {};
    const vs = p.ret != null && mret != null && kind !== "bench" ? p.ret - mret : null;
    const flags = [];
    if (vs != null) flags.push(`<span class="sf-vs ${cls(vs)}">시장보다 ${fmt(vs, 1)}%p</span>`);
    if (p.sparse) flags.push(`<span class="sf-flag" title="오늘 거래가 적어서(체결된 분 ${p.traded}/391) 선이 계단처럼 보여요. 흐름보다는 끝 숫자를 보세요.">거래 적음</span>`);
    if (p.coarse) flags.push(`<span class="sf-flag">일봉으로 그림</span>`);
    if (p.missing) flags.push(`<span class="sf-flag">장중 자료 없음</span>`);
    const stocks = (s.stocks || []).map((x) => {
      const v = x.ret ? x.ret[key] : null;
      return `<li><span>${esc(x.name)}</span>${badge(v, key)}</li>`;
    }).join("");
    return `<button type="button" class="sf-card${kind === "bench" ? " bench" : ""}" data-code="${esc(s.code)}" aria-label="${esc(s.name)} ${fmt(p.ret)}% 큰 차트 열기">
      <span class="sf-head"><b>${esc(s.name)}</b><small>${esc(s.etf)}</small>${badge(p.ret, key, true)}</span>
      <span class="sf-flags">${flags.join("")}</span>
      <span class="sf-body${stocks ? "" : " solo"}"><span class="sf-chart">${chartSvg(p, key)}</span>${stocks ? `<ol class="sf-stocks">${stocks}</ol>` : ""}</span>
    </button>`;
  }

  function summary(d, key) {
    const m = d.bench[0], mret = m && m.periods[key] ? m.periods[key].ret : null;
    const rows = d.sectors.filter((s) => s.periods[key] && s.periods[key].ret != null);
    const strong = mret == null ? 0 : rows.filter((s) => s.periods[key].ret > mret).length;
    const top = rows.slice(0, 3).map((s) => `${esc(s.name)} <b class="${cls(s.periods[key].ret)}-t">${fmt(s.periods[key].ret)}</b>`).join(", ");
    const bot = rows.slice(-3).reverse().map((s) => `${esc(s.name)} <b class="${cls(s.periods[key].ret)}-t">${fmt(s.periods[key].ret)}</b>`).join(", ");
    return `<p class="sf-sum"><span>${esc(m ? m.name : "시장")} <b class="${cls(mret)}-t">${fmt(mret)}%</b>, 시장보다 강한 업종 <b>${strong}</b>/${rows.length}</span>
      <span>강한 업종: ${top}</span><span>약한 업종: ${bot}</span></p>`;
  }

  function sorted(d, key) {
    const r = (s) => (s.periods[key] || {}).ret;
    d.sectors.sort((a, b) => (r(b) ?? -1e9) - (r(a) ?? -1e9));
  }

  function draw() {
    const d = store[market], box = $("#secFlow"), btn = $("#secExpand");
    if (!box || !btn) return;
    btn.hidden = !d;
    box.hidden = !d || !open;
    btn.setAttribute("aria-expanded", String(!!(d && open)));
    btn.textContent = open ? "차트 접기 ▴" : "차트로 펼치기 ▾";
    if (!d || !open) return;
    sorted(d, period);
    const mret = d.bench[0] && d.bench[0].periods[period] ? d.bench[0].periods[period].ret : null;
    const board = window.__isBoard && window.__isBoard().data[market];
    const old = board && board.basis_date && board.basis_date !== d.basis;
    $("#sfSeg").innerHTML = PERIODS.map(([k, t]) => `<button type="button" data-k="${k}" aria-pressed="${k === period}">${t}</button>`).join("");
    $("#sfMeta").textContent = `${market === "US" ? "뉴욕 " : ""}${d.basis.slice(5).replace("-", "/")} 종가 기준${old ? " (순위표보다 하루 전 자료)" : ""} · 점선 = ${BASE_NAME[period]} · 오른쪽은 소속 종목 시가총액 상위 5`;
    $("#sfSum").innerHTML = summary(d, period);
    $("#sfBench").innerHTML = d.bench.map((s) => card(s, period, mret, "bench")).join("");
    $("#sfGrid").innerHTML = d.sectors.map((s) => card(s, period, mret, "sector")).join("");
    const mas = { "20d": "주황 = 5일선", "60d": "주황 = 20일선", "200d": "초록 = 50일선, 보라 = 200일선" }[period];
    $("#sfLegend").innerHTML = `선은 ${BASE_NAME[period]}를 0%로 놓고 그린 흐름이에요. 점선 위로 올라간 부분은 빨강, 아래는 파랑이고 점은 기간 중 최고·최저예요.${mas ? ` ${mas}.` : ""} 칠한 칸은 ${HOT[period]}% 이상 움직인 경우예요. 숫자는 모두 정규장 종가 기준이라 장 마감 뒤 애프터마켓 가격과 다를 수 있어요.${market === "US" ? " 이 카드는 위 섹터 워치(큰 업종 11개)보다 잘게 나눈 세부 업종 ETF예요. 장중 시각은 뉴욕 시각이에요." : ""} 카드를 누르면 큰 차트가 열려요.`;
  }

  // ---------- 큰 차트
  let big = null;
  function times(d, key, p) {
    // 분봉은 한국 시각을 그대로 UTC 시각처럼 넣어 축에 한국 시각이 보이게 한다.
    const ses = d.session || { open: "09:00", minutes: 390, step1: 2, step5: 10 };
    const days = key === "1d" ? [d.basis] : d.dates.slice(-5);
    const step = key === "1d" ? ses.step1 : ses.step5;
    const len = ses.minutes;
    const out = [];
    const cuts = key === "1d" ? [0] : (p.cuts || []);
    days.forEach((day, j) => {
      const startIdx = cuts[j] ?? 0, endIdx = j + 1 < cuts.length ? cuts[j + 1] : p.line.length;
      const t0 = Date.parse(`${day}T${ses.open}:00Z`) / 1000;
      for (let k = startIdx; k < endIdx; k++) out.push(Math.min(t0 + (k - startIdx) * step * 60, t0 + len * 60));
    });
    return out;
  }
  function openBig(code) {
    const d = store[market];
    const s = d && [...d.bench, ...d.sectors].find((x) => x.code === code);
    if (!s) return;
    big = { code };
    const m = $("#sfModal");
    m.hidden = false;
    document.body.style.overflow = "hidden";
    drawBig();
    $("#sfmClose").focus();
  }
  function closeBig() {
    const m = $("#sfModal");
    if (m.hidden) return;
    m.hidden = true;
    document.body.style.overflow = "";
    if (big && big.chart) big.chart.remove();
    big = null;
  }
  function drawBig() {
    if (!big) return;
    const d = store[market];
    const s = [...d.bench, ...d.sectors].find((x) => x.code === big.code);
    const p = s.periods[period] || {};
    const mret = d.bench[0] && d.bench[0].periods[period] ? d.bench[0].periods[period].ret : null;
    $("#sfmTitle").innerHTML = `${esc(s.name)} <small>${esc(s.etf)} · ${esc(s.code)}</small>`;
    $("#sfmSeg").innerHTML = PERIODS.map(([k, t]) => `<button type="button" data-k="${k}" aria-pressed="${k === period}">${t}</button>`).join("");
    const vs = s.stocks && p.ret != null && mret != null ? `, 시장(${esc(d.bench[0].name)}) ${fmt(mret)}% 대비 <b class="${cls(p.ret - mret)}-t">${fmt(p.ret - mret, 1)}%p</b>` : "";
    $("#sfmSub").innerHTML = `${PERIODS.find(([k]) => k === period)[1]} 수익률 <b class="${cls(p.ret)}-t">${fmt(p.ret)}%</b>${vs} · 세로축 = ${BASE_NAME[period]} 대비 %`;
    const el = $("#sfmChart");
    if (big.chart) { big.chart.remove(); big.chart = null; }
    el.innerHTML = "";
    const LW = window.LightweightCharts;
    const line = p.line || [];
    if (!LW || !LW.createChart || line.length < 2) {
      el.innerHTML = `<div class="sf-empty">${line.length < 2 ? "이 기간 그림 자료가 없어요." : "차트 도구를 불러오지 못했어요."}</div>`;
    } else {
      const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
      const intraday = period === "1d" || (period === "5d" && !p.coarse);
      const ch = LW.createChart(el, {
        autoSize: true, height: 300,
        layout: { background: { color: "transparent" }, textColor: css("--ink-2"), fontFamily: "Pretendard Variable, Pretendard, system-ui, sans-serif" },
        grid: { vertLines: { color: css("--grid") }, horzLines: { color: css("--grid") } },
        rightPriceScale: { borderColor: css("--line") },
        timeScale: { borderColor: css("--line"), timeVisible: intraday, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true },
        localization: { priceFormatter: (v) => (v > 0 ? "+" : "") + v.toFixed(Math.abs(v) < 10 ? 2 : 1) + "%", locale: "ko-KR" },
        handleScroll: false, handleScale: false,
      });
      let t;
      if (intraday) t = times(d, period, p);
      else if (period === "5d") t = d.dates.slice(-6);
      else t = d.dates.slice(-line.length);
      const pts = (arr) => arr.map((v, k) => v == null || t[k] == null ? null : { time: t[k], value: v }).filter(Boolean);
      const area = ch.addBaselineSeries({
        baseValue: { type: "price", price: 0 }, lineWidth: 2,
        topLineColor: css("--up"), topFillColor1: "rgba(209,47,47,.22)", topFillColor2: "rgba(209,47,47,.04)",
        bottomLineColor: css("--down"), bottomFillColor1: "rgba(31,99,196,.04)", bottomFillColor2: "rgba(31,99,196,.22)",
        priceLineVisible: false, lastValueVisible: true,
      });
      area.setData(pts(line));
      area.createPriceLine({ price: 0, color: css("--muted"), lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
      const mcol = { 5: css("--ma20"), 20: css("--ma20"), 50: css("--good"), 200: css("--ma200") };
      Object.entries(p.ma || {}).forEach(([w, a]) => {
        const sr = ch.addLineSeries({ color: mcol[w], lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        sr.setData(pts(a));
      });
      ch.timeScale().fitContent();
      big.chart = ch;
    }
    const mas = Object.keys(p.ma || {});
    $("#sfmLegend").innerHTML = `<span><i class="lg up"></i>점선(0%) 위</span><span><i class="lg down"></i>점선 아래</span>` +
      mas.map((w) => `<span><i class="lg ${MA_CLS[w]}"></i>${MA_NAME[w]}</span>`).join("") + (p.sparse ? `<span class="sf-flag">거래 적음: 선이 계단처럼 보일 수 있어요</span>` : "");
    const stocks = s.stocks || [];
    $("#sfmStocks").innerHTML = stocks.length ? `<h4>소속 종목 시가총액 상위 5 <span class="sub">정규장 종가 기준</span></h4>
      <table class="sf-tbl"><thead><tr><th>종목</th>${PERIODS.map(([k, n]) => `<th${k === period ? ' class="on"' : ""}>${n}</th>`).join("")}</tr></thead>
      <tbody>${stocks.map((x) => `<tr><td>${esc(x.name)}</td>${PERIODS.map(([k]) => { const v = x.ret ? x.ret[k] : null; return `<td class="${cls(v)}-t${k === period ? " on" : ""}">${fmt(v, 1)}</td>`; }).join("")}</tr>`).join("")}</tbody></table>` : "";
    const go = $("#sfmGo");
    go.hidden = !s.ticker;
    go.textContent = `${s.name} 세부 산업 순위 보기 →`;
    go.onclick = () => { closeBig(); window.__isSectorPick && window.__isSectorPick(s.ticker, s.name, s.items); };
  }

  // ---------- 이벤트
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("#secExpand")) { open = !open; save("is-sf-open", open ? "1" : "0"); draw(); return; }
    const pb = t.closest("#sfSeg button, #sfmSeg button");
    if (pb) { period = pb.dataset.k; save("is-sf-period", period); draw(); if (big) drawBig(); return; }
    const c = t.closest(".sf-card");
    if (c) { openBig(c.dataset.code); return; }
    if (t.closest("#sfmClose") || t.id === "sfModal") closeBig();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeBig(); });

  window.__secflow = {
    async show(m) {
      market = m;
      const d = await get(m);
      if (market !== m) return;
      const card = $("#sectorCard");
      if (d && card) card.hidden = false;
      draw();
    },
    has: (m) => !!store[m],
    rerender() { draw(); if (big) drawBig(); },
  };
})();
