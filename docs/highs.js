/* 52주 신고가 탭 (2026-10-21 추가)
   데이터: data/highs.json — global-high-radar의 '52주 신고가 기록' 작업이 한국장 17시·미국장 08시 기록 뒤 올린다.
   산업 강도 탭(app.js)과 코드를 섞지 않는다. 공유하는 것은 시장 선택, 테마 색, 산업 상세 서랍(window.__isBoard)뿐이다. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const md = (d) => { const [, m, dd] = d.split("-"); return `${+m}/${+dd}`; };
  const WD = "일월화수목금토";
  const mdw = (d) => `${md(d)}(${WD[new Date(d + "T00:00:00Z").getUTCDay()]})`;
  const pct = (v, dg = 2) => v == null ? "–" : (v > 0 ? "+" : "") + v.toFixed(dg) + "%";
  const cls = (v) => v == null ? "" : v > 0 ? "up" : v < 0 ? "down" : "";
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const RECENT = 5;

  const st = { raw: null, market: "KR", day: null, listMode: "group", sortT: { k: "mcap", d: -1 }, sortF: { k: "days", d: -1 }, sortS: { k: "rec", d: -1 }, heatAll: false, freqAll: false, q: "", chart: null };

  async function loadRaw() {
    if (st.raw) return st.raw;
    const r = await fetch("data/highs.json?v=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error("highs.json " + r.status);
    st.raw = await r.json();
    return st.raw;
  }

  // 원자료 → 화면용 계산 (연속 일수, 처음 등장, 업종별 집계)
  function model(m) {
    const M = st.raw.markets[m];
    const days = M.days.map((x) => x.d);
    const byDay = Object.fromEntries(days.map((d) => [d, []]));
    for (const [d, code, chg, mcap, close] of M.rows) {
      const [name, ind, big] = M.stocks[code] || [code, "기타", "기타"];
      byDay[d].push({ d, code, name, ind, big, chg, mcap, close });
    }
    const run = {}, first = {}, count = {};
    days.forEach((d, i) => {
      const prev = i ? new Set(byDay[days[i - 1]].map((r) => r.code)) : new Set();
      byDay[d].forEach((r) => {
        r.run = prev.has(r.code) ? (run[days[i - 1] + r.code] || 0) + 1 : 1;
        run[d + r.code] = r.run;
        if (!first[r.code]) first[r.code] = d;
        r.isNew = first[r.code] === d;
        count[r.code] = (count[r.code] || 0) + 1;
      });
      byDay[d].sort((a, b) => b.mcap - a.mcap);
    });
    return { M, days, byDay, count, info: M.days };
  }

  // ---------- 산업 강도판 연결: 이 종목이 들어 있는 바구니(세부 산업)
  function basketOf(code) {
    const b = window.__isBoard && window.__isBoard();
    const d = b && b.data[st.market];
    if (!d) return null;
    if (!d._memIdx) { d._memIdx = {}; d.items.forEach((it) => (it.members || []).forEach((mm) => { const c = String(mm.code || "").toUpperCase(); if (c && !d._memIdx[c]) d._memIdx[c] = it; })); }
    return d._memIdx[String(code).toUpperCase()] || null;
  }
  // 산업 강도 자료의 구성 종목 값(수익률·RS·추세) — 바구니에 든 종목만 있다
  function memberOf(code) {
    const b = window.__isBoard && window.__isBoard();
    const d = b && b.data[st.market];
    if (!d) return null;
    if (!d._memObj) { d._memObj = {}; d.items.forEach((it) => (it.members || []).forEach((mm) => { if (mm.missing) return; [mm.code, mm.ticker].forEach((c) => { c = String(c || "").toUpperCase(); if (c && !d._memObj[c]) d._memObj[c] = mm; }); })); }
    return d._memObj[String(code).toUpperCase()] || null;
  }
  const nameBtn = (r) => `<button class="lnk sk-name" type="button" data-stock="${esc(r.code)}" data-sname="${esc(r.name)}" data-smarket="${st.market}" title="${esc(r.name)} 종목 상세">${esc(r.name)}</button>`;
  const STG = { "상승 추세": "s2", "상승 전환 시도": "s2t", "하락 추세": "s4" };
  const tvUrl = (code) => `https://www.tradingview.com/symbols/${encodeURIComponent(st.market === "KR" ? "KRX-" + code : code.replace(".", "-"))}/`;

  // ---------- 그리기
  async function render(market) {
    st.market = market || st.market;
    const meta = $("#hxMeta");
    try { await loadRaw(); } catch (e) { meta.textContent = "신고가 데이터를 불러오지 못했어요. 잠시 후 새로고침해 주세요."; return; }
    const D = model(st.market);
    if (!D.days.length) { meta.textContent = "아직 기록이 없어요."; return; }
    if (!st.day || !D.byDay[st.day]) st.day = D.days.at(-1);
    meta.textContent = `${st.market === "KR" ? "한국" : "미국"} 기준일 ${D.days.at(-1)} 종가 · 최근 ${D.days.length}거래일 기록 · 갱신 ${st.raw.updated_at}`;
    renderTiles(D); renderChart(D); renderStrong(D); renderHeat(D); renderFreq(D); renderDay(D);
  }

  function renderTiles(D) {
    const last = D.info.at(-1), prev = D.info.at(-2);
    const sum = (arr) => arr.reduce((s, x) => s + x.n, 0);
    const rec = D.info.slice(-RECENT), old = D.info.slice(-RECENT * 2, -RECENT);
    const sr = sum(rec), so = sum(old);
    const streak3 = D.byDay[last.d].filter((r) => r.run >= 3).length;
    const dl = prev ? last.n - prev.n : null;
    const avg = sum(D.info.slice(-10)) / Math.min(10, D.info.length);
    const tone = last.n >= avg * 1.3 ? "up" : last.n <= avg * 0.7 ? "down" : "";
    const idx = D.M.index;
    $("#hxTiles").innerHTML = `
      <div class="tile tile-main"><div class="k">${mdw(last.d)} 52주 신고가</div>
        <div class="v big ${tone}">${last.n}<span class="of">개</span></div>
        <div class="d">${dl == null ? "" : `전 거래일 ${prev.n}개 (${dl >= 0 ? "▲" : "▼"}${Math.abs(dl)})`} · 최근 10일 평균 ${avg.toFixed(0)}개</div></div>
      <div class="tile"><div class="k">최근 ${RECENT}거래일 합계</div>
        <div class="v">${sr}<span class="of">개</span></div>
        <div class="d">${old.length ? `그 전 ${RECENT}거래일 ${so}개 (<span class="${sr >= so ? "up-t" : "down-t"}">${sr >= so ? "▲" : "▼"}${Math.abs(sr - so)}</span>)` : "비교할 이전 기록이 아직 없어요"}</div></div>
      <div class="tile"><div class="k">${idx} 등락 · 신저가</div>
        <div class="v"><span class="ret ${cls(last.idx_chg)}">${pct(last.idx_chg)}</span></div>
        <div class="d">신저가 ${last.lows == null ? "기록 없음" : last.lows + "개"}${last.us_dir ? ` · 전날 미국장 ${last.us_dir}` : ""}</div></div>
      <div class="tile"><div class="k">사흘 이상 연속 신고가</div>
        <div class="v">${streak3}<span class="of">종목</span></div>
        <div class="d">${D.byDay[last.d].filter((r) => r.run >= 3).sort((a, b) => b.run - a.run).slice(0, 3).map((r) => `${esc(r.name)} ${r.run}일`).join(" · ") || "없음"}</div></div>`;
  }

  function renderChart(D) {
    const el = $("#hxChart");
    if (st.chart) { try { st.chart.remove(); } catch (e) {} st.chart = null; }
    el.innerHTML = "";
    const LW = window.LightweightCharts;
    const ns = D.info.map((x) => x.n);
    const ma = ns.map((_, k) => k >= 4 ? ns.slice(k - 4, k + 1).reduce((a, b) => a + b, 0) / 5 : null);
    const lg = $("#hxLegend");
    if (!LW || !LW.createChart) {
      el.classList.add("as-table");
      el.innerHTML = `<div class="chart-fallback"><p>차트를 불러오지 못해 숫자로 보여 드려요.</p>${D.info.slice(-10).map((x) => `${md(x.d)} <b>${x.n}</b>`).join(" · ")}</div>`;
      lg.innerHTML = ""; return;
    }
    el.classList.remove("as-table");
    const ch = LW.createChart(el, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: css("--muted"), fontSize: 11, fontFamily: getComputedStyle(document.body).fontFamily },
      grid: { vertLines: { color: css("--grid") }, horzLines: { color: css("--grid") } },
      rightPriceScale: { borderColor: css("--line"), scaleMargins: { top: 0.1, bottom: 0 } },
      timeScale: { borderColor: css("--line"), fixLeftEdge: true, fixRightEdge: true, tickMarkFormatter: (t) => { const s = typeof t === "string" ? t : `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`; return md(s); } },
      localization: { locale: "ko-KR", priceFormatter: (v) => Math.round(v) + "개", dateFormat: "yyyy-MM-dd" },
      handleScroll: { vertTouchDrag: false },
    });
    st.chart = ch;
    const avg = ns.reduce((a, b) => a + b, 0) / ns.length;
    const bars = ch.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false, base: 0 });
    bars.setData(D.info.map((x) => ({ time: x.d, value: x.n, color: x.n >= avg ? css("--up") : color50(css("--up")) })));
    const line = ch.addLineSeries({ color: css("--accent"), lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerRadius: 3 });
    line.setData(D.info.map((x, k) => ({ time: x.d, value: ma[k] })).filter((p) => p.value != null));
    ch.timeScale().fitContent();
    const draw = (n, a, d) => { lg.innerHTML = `<span><i style="background:${css("--up")};height:8px"></i>신고가 수${n != null ? ` <b class="tnum">${n}개</b>` : ""}</span><span><i style="background:${css("--accent")}"></i>5일 평균${a != null ? ` <b class="tnum">${a.toFixed(1)}개</b>` : ""}</span>${d ? `<span class="muted">${d}</span>` : ""}`; };
    draw(ns.at(-1), ma.at(-1), mdw(D.info.at(-1).d));
    ch.subscribeCrosshairMove((p) => {
      if (!p || !p.time) { draw(ns.at(-1), ma.at(-1), mdw(D.info.at(-1).d)); return; }
      const b = p.seriesData.get(bars), l = p.seriesData.get(line);
      const t = typeof p.time === "string" ? p.time : `${p.time.year}-${String(p.time.month).padStart(2, "0")}-${String(p.time.day).padStart(2, "0")}`;
      draw(b ? b.value : null, l ? l.value : null, mdw(t));
    });
  }
  // 차트 라이브러리는 color-mix를 못 읽어서 #rrggbb → rgba로 바꾼다.
  const color50 = (c) => { const m = /^#([0-9a-f]{6})$/i.exec(c); if (!m) return c; const v = parseInt(m[1], 16); return `rgba(${v >> 16}, ${(v >> 8) & 255}, ${v & 255}, 0.45)`; };

  // ---------- 최근 신고가가 자주 나온 업종
  function strongRows(D) {
    const rec = D.days.slice(-RECENT), old = D.days.slice(-RECENT * 2, -RECENT);
    const agg = {};
    const add = (r, key) => { const a = agg[r.ind] ||= { ind: r.ind, big: r.big, rec: 0, old: 0, uniq: new Set(), names: [] }; a[key]++; if (key === "rec") { a.uniq.add(r.code); if (!a.names.includes(r.name)) a.names.push(r.name); } };
    rec.forEach((d) => D.byDay[d].forEach((r) => add(r, "rec")));
    old.forEach((d) => D.byDay[d].forEach((r) => add(r, "old")));
    return Object.values(agg).map((a) => {
      const u = D.M.uni[a.ind] || 0;
      return { ...a, chg: a.rec - a.old, nu: a.uniq.size, uni: u, ratio: u >= 3 ? a.uniq.size / u * 100 : null };
    });
  }
  function renderStrong(D) {
    const rows = strongRows(D);
    const { k, d } = st.sortS;
    rows.sort((a, b) => ((a[k] ?? -1) - (b[k] ?? -1)) * d || b.rec - a.rec || b.chg - a.chg);
    const show = rows.filter((r) => r.rec > 0 || r.old > 0).slice(0, 15);
    const mx = Math.max(1, ...show.map((r) => Math.abs(r.chg)));
    const th = (key, label, numc) => `<th class="${numc ? "num " : ""}sortable${k === key ? " on" : ""}" data-k="${key}">${label}${k === key ? (d < 0 ? " ▼" : " ▲") : ""}</th>`;
    $("#hxStrong").innerHTML = `<table class="hx-table"><thead><tr><th>업종</th>${th("rec", `최근 ${RECENT}일 횟수`, 1)}${th("old", `그 전 ${RECENT}일 횟수`, 1)}${th("chg", "증감", 0)}${th("ratio", "업종 내 비율", 1)}<th>최근 신고가 종목</th></tr></thead><tbody>
      ${show.map((r) => `<tr>
        <td class="hx-name"><b>${esc(r.ind)}</b><span>${esc(r.big)}</span></td>
        <td class="num"><b>${r.rec}</b></td><td class="num muted">${r.old}</td>
        <td><span class="dbar"><i class="${r.chg >= 0 ? "pos" : "neg"}" style="width:${Math.abs(r.chg) / mx * 50}%"></i></span><span class="dval ${r.chg > 0 ? "up-t" : r.chg < 0 ? "down-t" : "muted"}">${r.chg > 0 ? "▲" + r.chg : r.chg < 0 ? "▼" + -r.chg : "–"}</span></td>
        <td class="num">${r.ratio == null ? '<span class="muted">–</span>' : `${r.nu}/${r.uni} <span class="muted">(${r.ratio.toFixed(0)}%)</span>`}</td>
        <td class="hx-names">${r.names.slice(0, 4).map(esc).join(" · ")}${r.names.length > 4 ? ` <span class="muted">외 ${r.names.length - 4}</span>` : ""}</td></tr>`).join("")}
      </tbody></table>`;
    $$("#hxStrong th.sortable").forEach((t) => t.addEventListener("click", () => { st.sortS = { k: t.dataset.k, d: st.sortS.k === t.dataset.k ? -st.sortS.d : -1 }; renderStrong(D); }));
  }

  // ---------- 업종 × 날짜
  function heatBg(n) { return !n ? "var(--hn)" : n === 1 ? "var(--x1)" : n <= 3 ? "var(--x2)" : n <= 6 ? "var(--x3)" : "var(--x4)"; }
  function renderHeat(D) {
    const N = innerWidth < 640 ? 10 : 20;
    const ds = D.days.slice(-N);
    const cnt = {}, tot = {};
    ds.forEach((d) => D.byDay[d].forEach((r) => { (cnt[r.ind] ||= {})[d] = (cnt[r.ind][d] || 0) + 1; tot[r.ind] = (tot[r.ind] || 0) + 1; }));
    const all = Object.keys(tot).sort((a, b) => tot[b] - tot[a]);
    const names = st.heatAll ? all : all.slice(0, 12);
    const el = $("#hxHeat");
    el.style.gridTemplateColumns = `minmax(110px, 160px) repeat(${ds.length}, minmax(22px, 1fr)) 36px`;
    const last = ds.length - 1;
    let h = `<div></div>` + ds.map((d, k) => `<div class="hd c">${k === last || (last - k) % 5 === 0 ? md(d) : ""}</div>`).join("") + `<div class="hd c">합계</div>`;
    for (const n of names) {
      h += `<div class="hn" title="${esc(n)}">${esc(n)}</div>`;
      h += ds.map((d, k) => { const v = (cnt[n] || {})[d] || 0; return `<div class="hc hx${k === last ? " today" : ""}${v >= 4 ? " dark" : ""}" style="background:${heatBg(v)}" data-t="${esc(n)} · ${mdw(d)} · ${v}개">${v || ""}</div>`; }).join("");
      h += `<div class="ht">${tot[n]}</div>`;
    }
    h += `<div class="hn tot">전체</div>` + ds.map((d) => `<div class="ht">${D.byDay[d].length}</div>`).join("") + `<div class="ht">${ds.reduce((s, d) => s + D.byDay[d].length, 0)}</div>`;
    el.innerHTML = h;
    const btn = $("#hxHeatMore");
    btn.hidden = all.length <= 12;
    btn.textContent = st.heatAll ? "상위 12개 업종만 보기" : `업종 ${all.length}개 모두 보기`;
    $("#hxHeatSub").textContent = `최근 ${ds.length}거래일 · ${st.heatAll ? "전체 업종" : "신고가가 많은 상위 12개 업종"}`;
    const wrap = el.parentElement; wrap.scrollLeft = wrap.scrollWidth;
    tips(el, ".hc");
  }

  // ---------- 자주 나온 종목
  function renderFreq(D) {
    const lastDay = D.days.at(-1);
    const latest = {};
    D.days.forEach((d) => D.byDay[d].forEach((r) => { latest[r.code] = r; }));
    let rows = Object.values(latest).map((r) => ({ ...r, days: D.count[r.code], now: r.d === lastDay ? r.run : 0 }));
    const { k, d } = st.sortF;
    const val = (r) => k === "name" ? r.name : k === "ind" ? r.ind : k === "d" ? r.d : r[k];
    rows.sort((a, b) => { const x = val(a), y = val(b); return (typeof x === "string" ? x.localeCompare(y, "ko") : (x ?? -1e18) - (y ?? -1e18)) * d || b.days - a.days || b.now - a.now || b.mcap - a.mcap; });
    const total = rows.length;
    if (!st.freqAll) rows = rows.slice(0, 20);
    const th = (key, label, numc) => `<th class="${numc ? "num " : ""}sortable${k === key ? " on" : ""}" data-k="${key}">${label}${k === key ? (d < 0 ? " ▼" : " ▲") : ""}</th>`;
    $("#hxFreq").innerHTML = `<table class="hx-table"><thead><tr>${th("name", "종목", 0)}${th("ind", "업종", 0)}${th("days", "신고가 일수", 1)}${th("now", "현재 연속", 1)}${th("d", "마지막 신고가일", 0)}${th("chg", "그날 등락률", 1)}${th("mcap", "시가총액", 1)}</tr></thead><tbody>
      ${rows.map((r) => `<tr class="${r.now >= 2 ? "streak" : ""}">
        <td class="hx-name">${stockCell(r)}</td><td>${esc(r.ind)}</td>
        <td class="num"><span class="pill n${Math.min(4, Math.ceil(r.days / 2))}">${r.days}일</span></td>
        <td class="num">${r.now >= 2 ? `<b>🔁 ${r.now}일째</b>` : r.now === 1 ? "1일" : '<span class="muted">–</span>'}</td>
        <td>${mdw(r.d)}</td><td class="num"><span class="ret ${cls(r.chg)}">${pct(r.chg)}</span></td><td class="num">${cap(r.mcap)}</td></tr>`).join("")}
      </tbody></table>`;
    const more = $("#hxFreqMore");
    more.hidden = total <= 20;
    more.textContent = st.freqAll ? "20개만 보기" : `${total}종목 모두 보기`;
    $$("#hxFreq th.sortable").forEach((t) => t.addEventListener("click", () => { st.sortF = { k: t.dataset.k, d: st.sortF.k === t.dataset.k ? -st.sortF.d : (["name", "ind"].includes(t.dataset.k) ? 1 : -1) }; renderFreq(D); }));
    bindStock($("#hxFreq"));
  }
  const cap = (v) => st.market === "KR" ? (v >= 10000 ? `${Math.floor(v / 10000)}조 ${(v % 10000).toLocaleString("ko-KR")}억` : `${v.toLocaleString("ko-KR")}억`) : `${v.toLocaleString("en-US")}억$`;
  function stockCell(r) {
    const b = basketOf(r.code);
    return `<b>${nameBtn(r)}</b><span>${esc(r.code)} · <a href="${tvUrl(r.code)}" target="_blank" rel="noopener noreferrer">차트</a>${b ? ` · <button class="lnk" data-bid="${esc(b.id)}" title="산업 강도 탭의 이 산업 상세">강도판: ${esc(b.name)}</button>` : ""}</span>`;
  }
  function bindStock(el) {
    $$("[data-bid]", el).forEach((x) => x.addEventListener("click", (e) => { e.stopPropagation(); const b = window.__isBoard && window.__isBoard(); b && b.open(x.dataset.bid); }));
  }

  // ---------- 날짜별 명단
  function renderDay(D) {
    const ds = D.days.slice(-12).reverse();
    $("#hxDays").innerHTML = ds.map((d) => `<button class="dchip${d === st.day ? " on" : ""}" data-d="${d}">${mdw(d)} <em>${D.byDay[d].length}</em></button>`).join("");
    $$("#hxDays .dchip").forEach((b) => b.addEventListener("click", () => { st.day = b.dataset.d; renderDay(D); }));
    $$("#hxMode button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.mode === st.listMode));
    const rows = D.byDay[st.day] || [];
    const i = D.days.indexOf(st.day);
    const prevSet = i > 0 ? new Set(D.byDay[D.days[i - 1]].map((r) => r.code)) : null;
    const gone = i > 0 ? D.byDay[D.days[i - 1]].filter((r) => !rows.some((x) => x.code === r.code)) : [];
    const newIn = prevSet ? rows.filter((r) => !prevSet.has(r.code)) : [];
    const q = st.q.trim().toLowerCase();
    const flt = q ? rows.filter((r) => (r.name + " " + r.code + " " + r.ind + " " + r.big).toLowerCase().includes(q)) : rows;
    $("#hxDaySum").innerHTML = `<b>${mdw(st.day)}</b> 신고가 ${rows.length}개${prevSet ? ` · 새로 진입 ${newIn.length}개 · 이탈 ${gone.length}개` : ""}${gone.length ? `<span class="gone">이탈한 종목: ${gone.slice(0, 12).map((r) => esc(r.name)).join(" · ")}${gone.length > 12 ? ` 외 ${gone.length - 12}` : ""}</span>` : ""}`;
    const el = $("#hxList");
    if (st.listMode === "group") {
      const g = {};
      flt.forEach((r) => (g[r.ind] ||= []).push(r));
      const keys = Object.keys(g).sort((a, b) => g[b].length - g[a].length || g[b][0].mcap - g[a][0].mcap);
      const mx = Math.max(1, ...keys.map((k) => g[k].length));
      el.innerHTML = keys.length ? `<div class="grp-list">${keys.map((k) => `
        <div class="gl-row"><div class="gl-head"><b>${esc(k)}</b><span class="muted">${esc(g[k][0].big)}</span></div>
          <div class="gl-bar"><i style="width:${g[k].length / mx * 100}%"></i><em>${g[k].length}</em></div>
          <div class="gl-chips">${g[k].map(chip).join("")}</div></div>`).join("")}</div>` : `<p class="empty">조건에 맞는 종목이 없어요.</p>`;
    } else {
      const { k, d } = st.sortT;
      const val = (r) => k === "name" ? r.name : k === "ind" ? r.ind : r[k];
      flt.forEach((r) => { const mm = memberOf(r.code); r.ret20 = mm ? mm.ret20 : null; r.rs = mm ? mm.rs_rating : null; r.stage = mm ? mm.stage : null; });
      const list = [...flt].sort((a, b) => { const x = val(a), y = val(b); return (typeof x === "string" ? x.localeCompare(y, "ko") : (x ?? -1e18) - (y ?? -1e18)) * d || b.mcap - a.mcap; });
      const th = (key, label, numc) => `<th class="${numc ? "num " : ""}sortable${k === key ? " on" : ""}" data-k="${key}">${label}${k === key ? (d < 0 ? " ▼" : " ▲") : ""}</th>`;
      el.innerHTML = `<div class="hx-wrap"><table class="hx-table"><thead><tr>${th("name", "종목", 0)}${th("ind", "업종", 0)}${th("chg", "등락률", 1)}${th("mcap", "시가총액", 1)}${th("run", "연속", 1)}${th("close", "종가", 1)}${th("ret20", "20일", 1)}${th("rs", "RS", 1)}<th>추세</th></tr></thead><tbody>
        ${list.map((r) => `<tr class="${r.run >= 2 ? "streak" : ""}"><td class="hx-name">${stockCell(r)}</td><td>${esc(r.ind)}<span class="rsub">${esc(r.big)}</span></td>
          <td class="num"><span class="ret ${cls(r.chg)}">${pct(r.chg)}</span></td><td class="num">${cap(r.mcap)}</td>
          <td class="num">${r.run >= 2 ? `<b>🔁 ${r.run}일째</b>` : r.isNew ? "🆕" : "1일"}</td><td class="num">${r.close == null ? "–" : st.market === "KR" ? Math.round(r.close).toLocaleString("ko-KR") : r.close.toFixed(2)}</td>
          <td class="num">${r.ret20 == null ? '<span class="muted">–</span>' : `<span class="ret ${cls(r.ret20)}">${pct(r.ret20, 1)}</span>`}</td>
          <td class="num">${r.rs == null ? '<span class="muted">–</span>' : `<b class="rs-num ${r.rs >= 80 ? "hi" : r.rs < 40 ? "lo" : ""}">${r.rs}</b>`}</td>
          <td>${r.stage ? `<span class="stage ${STG[r.stage] || ""}">${esc(r.stage)}</span>` : '<span class="muted">–</span>'}</td></tr>`).join("")}
        </tbody></table></div>`;
      $$("#hxList th.sortable").forEach((t) => t.addEventListener("click", () => { st.sortT = { k: t.dataset.k, d: st.sortT.k === t.dataset.k ? -st.sortT.d : (["name", "ind"].includes(t.dataset.k) ? 1 : -1) }; renderDay(D); }));
    }
    bindStock(el);
  }
  function chip(r) {
    const b = basketOf(r.code);
    const tag = r.run >= 2 ? `<span class="tagc run">🔁${r.run}일째</span>` : r.isNew ? `<span class="tagc new">🆕</span>` : "";
    return `<span class="schip${r.run >= 2 ? " run" : ""}" data-t="${esc(r.name)} · ${esc(r.code)} · ${pct(r.chg)} · 시총 ${cap(r.mcap)}${b ? " · 강도판 " + esc(b.name) : ""}${(() => { const mm = memberOf(r.code); return mm ? ` · 20일 ${pct(mm.ret20, 1)} · RS ${mm.rs_rating ?? "–"} · ${mm.stage || ""}` : ""; })()} · 누르면 종목 상세">${nameBtn(r)}${tag}<span class="ret ${cls(r.chg)}">${pct(r.chg, 1)}</span></span>`;
  }

  const tip = () => $("#tip");
  function tips(el, sel) {
    if (el._tips) return; el._tips = true;
    el.addEventListener("pointermove", (e) => {
      const c = e.target.closest(sel); const t = tip();
      if (!c) { t.hidden = true; return; }
      t.textContent = c.dataset.t; t.hidden = false;
      t.style.left = Math.min(e.clientX + 12, innerWidth - t.offsetWidth - 8) + "px"; t.style.top = (e.clientY - 36) + "px";
    });
    el.addEventListener("pointerleave", () => { tip().hidden = true; });
  }

  // ---------- 컨트롤
  function cur() { return st.raw ? model(st.market) : null; }
  $("#hxHeatMore").addEventListener("click", () => { st.heatAll = !st.heatAll; const D = cur(); D && renderHeat(D); });
  $("#hxFreqMore").addEventListener("click", () => { st.freqAll = !st.freqAll; const D = cur(); D && renderFreq(D); });
  $$("#hxMode button").forEach((b) => b.addEventListener("click", () => { st.listMode = b.dataset.mode; const D = cur(); D && renderDay(D); }));
  $("#hxSearch").addEventListener("input", (e) => { st.q = e.target.value; const D = cur(); D && renderDay(D); });
  tips($("#hxList"), ".schip");
  let rz; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (!$("#viewHighs").hidden) { const D = cur(); D && renderHeat(D); } }, 200); });

  window.__highs = {
    show(market) { if (market !== st.market) { st.day = null; st.q = ""; $("#hxSearch").value = ""; } render(market); },
    rerender() { const D = cur(); if (D && !$("#viewHighs").hidden) renderChart(D); },
    reload() { st.raw = null; if (!$("#viewHighs").hidden) render(); },
  };
})();
