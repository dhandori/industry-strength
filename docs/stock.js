/* 종목 상세 창 — 모든 탭이 같이 쓴다(산업 강도·52주 신고가·수급·외국인 보유 변화·섹터 워치).
   종목 이름을 누르면 열린다: window.__stock.open(code, market, name)  또는  <... data-stock="코드" data-sname="이름" data-smarket="KR">
   2026-10-27 처음 만듦. 2026-11-11 다시 구성(사용자: 탭마다 보이는 게 다르니 모든 탭 내용을 넣고 차트도 넣어 풍성하게).

   한 종목에 대해 이 판이 가진 정보를 한곳에 모은다.
   - 차트: data/{시장}_stocks.json(scripts/stock_charts.py) — 2년 종가·거래량. 이동평균 20·50·150·200일, 52주 최고 종가선,
     52주 신고가 기록일 표시, 거래량과 50일 평균. 같은 기간 속한 산업 바구니 지수·시장 지수와 비교, RS선.
     이 파일에 없는 종목(신고가 탭·외국인 보유 변화에만 있는 종목)은 한국은 네이버 차트 그림, 미국은 TradingView 차트로 대신한다.
   - 가격 지표: data/{시장}.json 의 구성 종목 값 — 당일·5·20·60·200일 수익률, 52주 고점 대비, RS 지수, 추세 상태, ATR·손절
   - 추세 점검(미너비니 템플릿): 차트 자료로 계산
   - 52주 신고가 기록: data/highs.json
   - 수급(한국): data/KR_supply.json(요약·외국인 보유 변화 순위) + KR_stocks.json 의 flows(일별 누적 순매수·외국인 보유율)
   - 속한 세부 산업·같은 바구니 종목, 섹터 워치 ETF(data/{시장}_sectorflow.json), 페어(data/pairs.json)
   다른 탭 코드는 건드리지 않는다. 산업 상세 서랍은 window.__isBoard().open 으로 연다. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pct = (v, d = 1) => v == null || !isFinite(v) ? "–" : (v > 0 ? "+" : "") + v.toFixed(d) + "%";
  const cls = (v) => v == null ? "" : v > 0 ? "up" : v < 0 ? "down" : "";
  const md = (d) => d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : "–";
  const WD = "일월화수목금토";
  const mdw = (d) => `${md(d)}(${WD[new Date(d + "T00:00:00Z").getUTCDay()]})`;
  const eok = (v) => {
    if (v == null) return "–";
    const s = v > 0 ? "+" : v < 0 ? "-" : "", a = Math.abs(v);
    return s + (a >= 10000 ? (a / 10000).toFixed(1) + "조" : Math.round(a).toLocaleString("ko-KR") + "억");
  };
  const root = document.documentElement;
  const css = (v) => getComputedStyle(root).getPropertyValue(v).trim();
  const cache = {};
  async function getJSON(path) {
    if (!cache[path]) cache[path] = fetch(`data/${path}?v=${Date.now()}`, { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).catch((e) => { delete cache[path]; throw e; });
    return cache[path];
  }
  const STAGE = {
    "상승 추세": ["s2", "이동평균선이 50일·150일·200일 순서로 가지런하고 200일선도 오르는 중. 가장 좋은 상태예요."],
    "상승 전환 시도": ["s2t", "가격이 50일선·200일선 위로 올라왔지만 이동평균선 정렬은 아직이에요. 오르기 시작하는 초입일 수 있어요."],
    "상승 둔화": ["", "가격이 50일선 아래로 내려왔지만 200일선은 아직 오르는 중. 힘이 빠지는 중이에요."],
    "하락 추세": ["s4", "가격이 200일선 아래이고 200일선도 내려가는 중. 피하는 게 좋은 상태예요."],
    "바닥 다지기": ["", "뚜렷한 방향 없이 옆으로 기는 구간이에요."],
  };
  const RANGES = [["3m", "3개월", 63], ["6m", "6개월", 126], ["1y", "1년", 252], ["2y", "2년", 9999]];
  let range = "1y";
  try { const r = localStorage.getItem("sk-range"); if (RANGES.some(([k]) => k === r)) range = r; } catch (e) {}

  // ---------- 자료 모으기
  async function board(market) {
    const b = window.__isBoard && window.__isBoard();
    if (b && b.data[market]) return b.data[market];
    try { return await getJSON(`${market}.json`); } catch (e) { return null; }
  }
  async function series(market) {
    const b = window.__isBoard && window.__isBoard();
    if (b && b.series && b.series[market]) return b.series[market];
    try { return await getJSON(`${market}_series.json`); } catch (e) { return null; }
  }
  function findInBoard(d, code) {
    if (!d) return { m: null, inds: [] };
    const C = String(code).toUpperCase();
    let m = null; const inds = [];
    for (const it of d.items) for (const x of it.members || []) {
      if (x.missing) continue;
      if (String(x.code || "").toUpperCase() === C || String(x.ticker || "").toUpperCase() === C) { m = m || x; inds.push(it); }
    }
    inds.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
    return { m, inds };
  }
  function highsOf(H, market, code) {
    const M = H && H.markets && H.markets[market];
    if (!M) return null;
    const C = String(code).toUpperCase();
    const days = M.days.map((x) => x.d);
    const hit = {};
    for (const [d, c, chg, mcap, close] of M.rows) if (String(c).toUpperCase() === C) hit[d] = { chg, mcap, close };
    const info = M.stocks[C] || M.stocks[code] || null;
    const list = days.filter((d) => hit[d]);
    let run = 0;
    for (let i = days.length - 1; i >= 0 && hit[days[i]]; i--) run++;
    return { days, hit, list, run, info, unit: M.cap_unit, updated: H.updated_at };
  }
  // 외국인·기관 보유 변화(수급 카드)의 상위 10 명단 중 이 종목이 든 곳
  function rankHits(S, code) {
    const R = S && S.rank && S.rank.markets;
    if (!R) return [];
    const out = [];
    for (const [mk, per] of Object.entries(R)) for (const [n, blk] of Object.entries(per)) for (const [who, nm] of [["foreign", "외국인"], ["inst", "기관"]]) {
      const L = blk[who];
      if (!L) continue;
      for (const side of ["buy", "sell"]) {
        const k = (L[side] || []).findIndex((r) => String(r.code) === String(code));
        if (k >= 0) out.push({ mk, n, who: nm, side, k: k + 1, r: L[side][k] });
      }
    }
    return out.sort((a, b) => +a.n - +b.n);
  }
  function sectorHits(F, code, KR) {
    if (!F || !F.sectors) return [];
    const C = String(code).toUpperCase();
    return F.sectors.map((s) => ({ s, x: (s.stocks || []).find((x) => String(KR ? x.code : (x.ticker || x.code)).toUpperCase() === C || String(x.code).toUpperCase() === C) })).filter((o) => o.x);
  }
  function pairHits(P, tick) {
    if (!P || !P.groups) return [];
    const T = String(tick).toUpperCase(), out = [];
    for (const g of P.groups) for (const p of g.pairs || []) if (String(p.a).toUpperCase() === T || String(p.b).toUpperCase() === T) out.push({ g, p });
    return out;
  }

  // ---------- 계산 도우미
  function sma(a, n) {
    const out = new Array(a.length).fill(null);
    let s = 0, c = 0;
    const q = [];
    for (let k = 0; k < a.length; k++) {
      const v = a[k];
      q.push(v); if (v != null) { s += v; c++; }
      if (q.length > n) { const o = q.shift(); if (o != null) { s -= o; c--; } }
      if (q.length === n && c >= n * 0.9) out[k] = s / c;
    }
    return out;
  }
  function rollMax(a, n) {
    const out = new Array(a.length).fill(null);
    for (let k = 0; k < a.length; k++) {
      let m = null;
      for (let j = Math.max(0, k - n + 1); j <= k; j++) if (a[j] != null && (m == null || a[j] > m)) m = a[j];
      out[k] = k >= 59 ? m : null;
    }
    return out;
  }
  const lastIdx = (a) => { for (let k = a.length - 1; k >= 0; k--) if (a[k] != null) return k; return -1; };
  const ffill = (a) => { let p = null; return a.map((v) => (v == null ? p : (p = v))); };

  // ---------- 창
  let box, charts = [];
  function ensure() {
    if (box) return box;
    box = document.createElement("div");
    box.className = "sk";
    box.hidden = true;
    box.innerHTML = `<div class="sk-backdrop" data-skclose></div>
      <article class="sk-panel" role="dialog" aria-modal="true" aria-labelledby="skTitle">
        <header class="sk-head"><div class="sk-ht"><h3 id="skTitle"></h3><p class="meta" id="skSub"></p></div>
          <button class="icon-btn" data-skclose aria-label="닫기"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
          <nav class="sk-nav" id="skNav" aria-label="종목 상세 바로가기"></nav></header>
        <div class="sk-body" id="skBody"></div>
      </article>`;
    document.body.appendChild(box);
    $$("[data-skclose]", box).forEach((b) => b.addEventListener("click", close));
    addEventListener("keydown", (e) => { if (e.key === "Escape" && !box.hidden) { e.stopImmediatePropagation(); close(); } }, true);
    $("#skNav", box).addEventListener("click", (e) => {
      const b = e.target.closest("[data-go]");
      if (!b) return;
      const t = $("#" + b.dataset.go, box), p = $(".sk-panel", box);
      if (t) p.scrollTo({ top: t.offsetTop - $(".sk-head", box).offsetHeight - 6, behavior: "smooth" });
    });
    return box;
  }
  let prevOverflow = "";
  function clearCharts() { charts.forEach((c) => { try { c.remove(); } catch (e) {} }); charts = []; }
  function close() { box.hidden = true; clearCharts(); document.body.style.overflow = prevOverflow; }

  async function open(code, market, nameHint) {
    if (!code) return;
    market = market || (window.__isMarket ? window.__isMarket() : "KR");
    ensure();
    if (box.hidden) prevOverflow = document.body.style.overflow;
    box.hidden = false;
    document.body.style.overflow = "hidden";
    clearCharts();
    $("#skTitle", box).textContent = nameHint || code;
    $("#skSub", box).textContent = "불러오는 중…";
    $("#skNav", box).innerHTML = "";
    $("#skBody", box).innerHTML = "";
    $(".sk-panel", box).scrollTop = 0;
    const token = (open._t = (open._t || 0) + 1);
    const KR = market === "KR";
    const [d, H, S, F, P] = await Promise.all([
      board(market),
      getJSON("highs.json").catch(() => null),
      KR ? getJSON("KR_supply.json").catch(() => null) : Promise.resolve(null),
      getJSON(`${market}_sectorflow.json`).catch(() => null),
      getJSON("pairs.json").catch(() => null),
    ]);
    if (token !== open._t) return;
    const ctx = render(code, market, nameHint, d, H, S, F, P);
    // 차트 자료(종목 2년치)는 크므로 글자 부분을 먼저 보여 주고 받는다
    const [X, SE] = await Promise.all([getJSON(`${market}_stocks.json`).catch(() => null), series(market)]);
    if (token !== open._t || box.hidden) return;
    $$("#skRange button", box).forEach((b) => b.addEventListener("click", () => {
      range = b.dataset.r;
      try { localStorage.setItem("sk-range", range); } catch (e) {}
      $$("#skRange button", box).forEach((x) => x.setAttribute("aria-pressed", x === b));
      clearCharts();
      drawCharts(ctx, X, SE);
    }));
    drawCharts(ctx, X, SE);
  }

  function render(code, market, nameHint, d, H, S, F, P) {
    const { m, inds } = findInBoard(d, code);
    const hx = highsOf(H, market, code);
    const sup = S && S.stocks ? S.stocks[String(code)] || null : null;
    const rk = rankHits(S, code);
    const name = (m && m.name) || (hx && hx.info && hx.info[0]) || (rk[0] && rk[0].r.name) || nameHint || code;
    const KR = market === "KR";
    const tick = (m && m.ticker) || code;
    const key = KR ? String((m && m.code) || code) : String(tick);
    const secs = sectorHits(F, KR ? key : tick, KR);
    const prs = KR ? [] : pairHits(P, tick);
    const lastHit = hx && hx.list.length ? hx.hit[hx.list.at(-1)] : null;
    const close = m && m.close != null ? m.close : lastHit ? lastHit.close : null;
    const money = (v) => v == null ? "–" : KR ? Math.round(v).toLocaleString("ko-KR") + "원" : "$" + v.toFixed(2);
    const price = close == null ? "" : money(close);
    const mcap = lastHit ? lastHit.mcap : sup && sup.mcap != null ? sup.mcap : rk[0] ? rk[0].r.mcap : null;
    const capTxt = mcap == null ? "" : KR ? (mcap >= 10000 ? `${(mcap / 10000).toFixed(1)}조` : `${Math.round(mcap).toLocaleString("ko-KR")}억`) + " 원" : `${Math.round(mcap).toLocaleString("en-US")}억 달러`;
    $("#skTitle", box).textContent = name;
    $("#skSub", box).innerHTML = [esc(KR ? code : tick), price && `${price}${m && m.chg1 != null ? ` <b class="ret ${cls(m.chg1)}">${pct(m.chg1, 2)}</b>` : ""}`,
      capTxt && `시가총액 ${capTxt}`, d && m ? `${esc(d.basis_date)} 종가` : ""].filter(Boolean).join(" · ");

    // 꼬리표: 이 종목의 지금 상태를 한 줄로
    const badges = [];
    if (m && m.stage) badges.push(`<span class="stage ${(STAGE[m.stage] || [""])[0]}">${esc(m.stage)}</span>`);
    if (m && m.rs_rating != null) badges.push(`<span class="sk-bd ${m.rs_rating >= 80 ? "hi" : m.rs_rating < 40 ? "lo" : ""}">RS ${m.rs_rating}</span>`);
    if (hx && hx.run) badges.push(`<span class="sk-bd hot">🚀 신고가 ${hx.run >= 2 ? hx.run + "일 연속" : "오늘"}</span>`);
    else if (m && m.dist_high != null && m.dist_high >= -5) badges.push(`<span class="sk-bd">고점 근처 ${m.dist_high.toFixed(1)}%</span>`);
    if (m && m.above50 != null) badges.push(`<span class="sk-bd ${m.above50 ? "ok" : "no"}">50일선 ${m.above50 ? "위" : "아래"}</span>`);
    if (inds[0] && inds[0].top) badges.push(`<span class="sk-bd ok">상위권 산업</span>`);
    if (sup && (sup.fs >= 3 || sup.is >= 3)) badges.push(`<span class="sk-bd hot">${sup.fs >= 3 ? `외국인 ${sup.fs}일째 매수` : `기관 ${sup.is}일째 매수`}</span>`);
    if (sup && (sup.fs <= -3 || sup.is <= -3)) badges.push(`<span class="sk-bd no">${sup.fs <= -3 ? `외국인 ${-sup.fs}일째 매도` : `기관 ${-sup.is}일째 매도`}</span>`);

    // 한눈에: 한 줄씩
    const lines = [];
    if (m) {
      const stg = m.stage ? `추세 <b>${esc(m.stage)}</b>` : "";
      const rs = m.rs_rating != null ? `RS 지수 <b>${m.rs_rating}</b>(시장 안 상위 ${100 - m.rs_rating + 1}% 안팎)` : "";
      lines.push([stg, rs, m.rs_up === true ? "시장보다 강함" : m.rs_up === false ? "시장보다 약함" : ""].filter(Boolean).join(" · "));
    }
    if (hx && hx.list.length) lines.push(hx.run >= 1 ? `🚀 52주 신고가 <b>${hx.run >= 2 ? hx.run + "일 연속" : "오늘"}</b> (최근 ${hx.days.length}거래일 중 ${hx.list.length}일)` : `52주 신고가는 최근 ${hx.days.length}거래일 중 ${hx.list.length}일, 마지막은 ${mdw(hx.list.at(-1))}`);
    else if (m && m.dist_high != null) lines.push(m.dist_high >= -1 ? "52주 고점 바로 아래" : `52주 고점보다 <b>${Math.abs(m.dist_high).toFixed(1)}%</b> 아래`);
    if (sup && sup.f20 != null) {
      const fi = (sup.f20 || 0) + (sup.i20 || 0);
      const run = sup.fs >= 2 ? `외국인 ${sup.fs}일째 매수` : sup.fs <= -2 ? `외국인 ${-sup.fs}일째 매도` : sup.is >= 2 ? `기관 ${sup.is}일째 매수` : sup.is <= -2 ? `기관 ${-sup.is}일째 매도` : "";
      lines.push(`외국인+기관 20일 <b class="ret ${cls(fi)}">${eok(fi)}</b>${run ? " · " + run : ""}`);
    }
    if (inds.length) lines.push(`속한 산업 <b>${esc(inds[0].name)}</b> ${inds[0].rank ?? "–"}위 / ${d.n}${inds[0].top ? " (상위 25%)" : ""}`);
    if (secs.length) lines.push(`섹터 워치 <b>${esc(secs[0].s.name)}</b>(${esc(secs[0].s.etf)}) 시가총액 상위 종목`);
    if (rk.length) { const r = rk[0]; lines.push(`${r.who} 보유 변화 ${r.n === "1" ? "하루" : r.n + "일"} 시총 대비 ${r.side === "buy" ? "순매수" : "순매도"} <b>${r.k}위</b>(${r.mk === "KOSPI" ? "코스피" : "코스닥"})`); }

    // 수익률 막대
    const RET = [["당일", "chg1"], ["5일", "ret5"], ["20일", "ret20"], ["60일", "ret60"], ["200일", "ret200"]];
    const retMax = m ? Math.max(5, ...RET.map(([, k]) => Math.abs(m[k] ?? 0))) : 1;
    const retHtml = m ? `<div class="sk-rets">${RET.map(([l, k]) => {
      const v = m[k];
      return `<div class="sk-ret"><em>${l}</em><b class="ret ${cls(v)}">${pct(v)}</b><span class="sk-rbar"><i class="${v >= 0 ? "pos" : "neg"}" style="width:${v == null ? 0 : Math.min(50, Math.abs(v) / retMax * 50)}%"></i></span></div>`;
    }).join("")}</div>` : "";

    // 상태·위험 관리 칸
    const stat = [];
    if (m) {
      const sg = STAGE[m.stage] || ["", ""];
      if (m.stage) stat.push(["추세 상태", `<span class="stage ${sg[0]}">${esc(m.stage)}</span>`, sg[1]]);
      if (m.rs_rating != null) stat.push(["RS 지수 (1~99)", `<b class="rs-num ${m.rs_rating >= 80 ? "hi" : m.rs_rating < 40 ? "lo" : ""}">${m.rs_rating}</b>`, "1년 수익률을 시장 안 모든 종목과 비교한 백분위. 80 이상이면 주도주 후보예요."]);
      if (m.atr_pct != null) stat.push(["ATR(14일) 평균 변동폭", `<b>${m.atr == null ? "" : money(m.atr) + " "}(${m.atr_pct.toFixed(1)}%)</b>`, `최근 14거래일 동안 하루에 보통 ${m.atr_pct.toFixed(1)}% 움직였어요(고가−저가, 전날 종가와의 갭 포함). 손절 폭·목표가를 잡는 기준으로 써요.`]);
      // 손절 기준 두 가지: −8% 한도(미너비니 최대 손절)와 2×ATR(그 종목의 보통 흔들림 밖). 종가를 매수가로 가정.
      if (m.close != null && m.close > 0) {
        stat.push(["기준 손절 −8%", `<b>${money(m.close * 0.92)}</b>`, "종가를 매수가로 봤을 때 −8%. 어떤 종목이든 이 아래로는 들고 가지 않는 한도예요."]);
        if (m.atr != null && m.atr_pct != null) {
          const p = m.atr_pct * 2, over = p > 8, used = Math.min(p, 8);
          stat.push(["ATR 손절 (2×ATR)", `<b class="${over ? "no" : "ok"}">${money(m.close - m.atr * 2)} (−${p.toFixed(1)}%)</b>`, over ? "8%보다 넓어요 → 8% 한도에서 자르고, 변동성이 커서 비중을 줄이거나 더 좁은 자리에서만 사요." : "8% 안에 들어와요 → 이 폭을 손절로 쓰면 보통의 흔들림에는 안 털려요."]);
          stat.push(["적용 최대 손절폭", `<b class="ok">−${used.toFixed(1)}%</b> <small>${money(over ? m.close * 0.92 : m.close - m.atr * 2)}</small>`, over ? "2×ATR이 8%보다 넓어서 8% 한도로 잘랐어요." : "2×ATR이 8% 안이라 2×ATR 손절가를 그대로 써요."]);
          const capAtr = 8 / m.atr_pct, tight = capAtr < 1.5;
          stat.push(["8% = 몇 ATR", `<b class="${tight ? "sk-warn" : capAtr >= 2 ? "ok" : ""}">${capAtr.toFixed(1)} ATR</b>`, tight ? `8%가 하루 평균 흔들림의 ${capAtr.toFixed(1)}배뿐이라 평소 움직임에도 털리기 쉬워요. 매수를 미루거나 비중을 줄여요.` : capAtr >= 2 ? "8% 한도가 평소 흔들림보다 넉넉해요." : "8% 한도가 빠듯한 편이에요."]);
          stat.push(["계좌 위험 2% 기준 비중", `<b>${Math.round(200 / used)}%</b>`, `손절 폭 ${used.toFixed(1)}%로 한 번에 계좌의 2%만 잃도록 할 때 살 수 있는 최대 비중이에요.`]);
        }
      }
      if (m.dist_high != null) stat.push(["52주 고점 대비", `<b>${m.dist_high.toFixed(1)}%</b>`, m.dist_high >= -5 ? "고점 근처(신고가권)예요." : m.dist_high >= -15 ? "고점에서 크게 멀지 않아요." : "고점에서 꽤 내려와 있어요."]);
      if (m.rs_up != null) stat.push(["시장 대비", m.rs_up ? '<span class="ok">강함</span>' : '<span class="no">약함</span>', "시장 지수로 나눈 선(RS선)이 50일 평균 위인지예요."]);
    }
    const statHtml = stat.length ? `<div class="sk-stats">${stat.map(([k, v, h]) => `<div title="${esc(h)}"><div class="k">${k}</div><div class="v">${v}</div><div class="h">${esc(h)}</div></div>`).join("")}</div>` : "";

    // 52주 신고가 기록
    let hxHtml = "";
    if (hx) {
      const cells = hx.days.map((dd) => { const h = hx.hit[dd]; return `<span class="sk-hd${h ? " on" : ""}" title="${esc(mdw(dd))}${h ? ` · 신고가 · ${pct(h.chg, 2)}` : " · 신고가 아님"}"><i></i><em>${md(dd)}</em></span>`; }).join("");
      const rows = hx.list.slice().reverse().slice(0, 8).map((dd) => { const h = hx.hit[dd]; return `<tr><td>${mdw(dd)}</td><td class="num"><span class="ret ${cls(h.chg)}">${pct(h.chg, 2)}</span></td><td class="num">${h.close == null ? "–" : KR ? Math.round(h.close).toLocaleString("ko-KR") : h.close.toFixed(2)}</td></tr>`; }).join("");
      hxHtml = `<section class="sk-sec" id="skHigh"><h4>🚀 52주 신고가 기록 <span class="sub">최근 ${hx.days.length}거래일 · 칸이 칠해진 날이 신고가 · 52주 신고가 탭과 같은 자료</span></h4>
        <div class="sk-hstrip">${cells}</div>
        ${hx.list.length ? `<div class="sk-tw"><table class="mem-table sk-ht"><thead><tr><th>신고가 낸 날</th><th class="num">그날 등락률</th><th class="num">종가</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="sk-none">이 기간에는 52주 신고가를 내지 않았어요.</p>`}
        ${hx.info ? `<p class="sk-note">신고가 탭 업종: ${esc(hx.info[1])}${hx.info[2] && hx.info[2] !== hx.info[1] ? ` (${esc(hx.info[2])})` : ""}</p>` : ""}</section>`;
    }

    // 속한 세부 산업 + 같은 바구니 비교 (산업 강도 탭)
    let indHtml = "";
    if (inds.length) {
      indHtml = `<section class="sk-sec" id="skInd"><h4>📊 속한 세부 산업 <span class="sub">산업 강도 탭 · 누르면 산업 상세</span></h4><div class="sk-inds">${inds.map((it) => {
        const peers = (it.members || []).filter((x) => !x.missing && x.ret20 != null).sort((a, b) => b.ret20 - a.ret20);
        const pos = peers.findIndex((x) => x === m) + 1;
        const ch = it.rank_chg5;
        return `<button class="sk-ind" type="button" data-ind="${esc(it.id)}"><b>${esc(it.name)}</b><span>${esc(it.group)} · 종합 ${it.rank ?? "–"}위/${d.n}${ch ? ` <em class="${ch > 0 ? "up" : "down"}">${ch > 0 ? "▲" : "▼"}${Math.abs(ch)}</em>` : ""} · ${esc(it.stage || "")}${it.score != null ? ` · 강도 ${Math.round(it.score)}점` : ""}</span>
          <span>산업 20일 <b class="ret ${cls(it.ret20)}">${pct(it.ret20)}</b> · 60일 <b class="ret ${cls(it.ret60)}">${pct(it.ret60)}</b>${it.breadth50 != null ? ` · 50일선 위 종목 ${it.breadth50}%` : ""}${pos ? ` · 바구니 ${peers.length}종목 중 20일 수익률 <b>${pos}위</b>` : ""}</span></button>`;
      }).join("")}</div>`;
      const it0 = inds[0];
      const peers = (it0.members || []).filter((x) => !x.missing).sort((a, b) => (b.ret20 ?? -1e9) - (a.ret20 ?? -1e9));
      if (peers.length > 1) {
        const mx = Math.max(1, ...peers.map((x) => Math.abs(x.ret20 ?? 0)));
        indHtml += `<h4>같은 산업 종목과 비교 <span class="sub">${esc(it0.name)} · 20일 수익률 순 · 누르면 그 종목</span></h4><div class="sk-peers">${peers.map((x) => `
          <button class="sk-peer${x === m ? " me" : ""}" type="button" data-code="${esc(KR ? x.code : x.ticker || x.code)}" data-name="${esc(x.name)}"><span class="pn">${esc(x.name)}</span>
            <span class="sk-rbar"><i class="${(x.ret20 ?? 0) >= 0 ? "pos" : "neg"}" style="width:${Math.min(50, Math.abs(x.ret20 ?? 0) / mx * 50)}%"></i></span>
            <b class="ret ${cls(x.ret20)}">${pct(x.ret20)}</b><span class="pr">${x.rs_rating != null ? "RS " + x.rs_rating : ""}</span></button>`).join("")}</div>`;
      }
      indHtml += `</section>`;
    }

    // 섹터 워치 (산업 강도 탭 맨 위 업종 ETF 카드)
    let secHtml = "";
    if (secs.length) {
      const PER = [["1d", "당일"], ["5d", "5일"], ["20d", "20일"], ["60d", "60일"], ["200d", "200일"]];
      secHtml = `<section class="sk-sec" id="skSec"><h4>🧭 섹터 워치 <span class="sub">업종 ETF의 시가총액 상위 종목에 들어 있어요 · 종목과 ETF 수익률 비교</span></h4>
        <div class="sk-tw"><table class="mem-table sk-cmp"><thead><tr><th></th>${PER.map(([, t]) => `<th class="num">${t}</th>`).join("")}</tr></thead><tbody>
        ${secs.map(({ s, x }) => `<tr class="me"><td><b>${esc(name)}</b></td>${PER.map(([k]) => `<td class="num"><span class="ret ${cls(x.ret && x.ret[k])}">${pct(x.ret && x.ret[k])}</span></td>`).join("")}</tr>
          <tr><td>${esc(s.name)} <small class="muted">${esc(s.etf)}</small></td>${PER.map(([k]) => { const v = s.periods && s.periods[k] ? s.periods[k].ret : null; return `<td class="num"><span class="ret ${cls(v)}">${pct(v)}</span></td>`; }).join("")}</tr>`).join("")}
        </tbody></table></div></section>`;
    }

    // 수급 (한국) — 표·순위는 바로, 누적 그래프는 차트 자료가 오면
    let supHtml = "";
    if (KR && (sup || rk.length)) {
      const row = (n, k) => `<tr><td><b>${n}</b></td>${["1", "5", "20", "60"].map((p) => `<td class="num"><span class="ret ${cls(sup[k + p])}">${eok(sup[k + p])}</span></td>`).join("")}</tr>`;
      const runs = sup ? [sup.fs ? `외국인 ${Math.abs(sup.fs)}일 연속 ${sup.fs > 0 ? "순매수" : "순매도"}` : "", sup.is ? `기관 ${Math.abs(sup.is)}일 연속 ${sup.is > 0 ? "순매수" : "순매도"}` : ""].filter(Boolean).join(" · ") : "";
      const rkHtml = rk.length ? `<div class="sk-rk">${rk.map((r) => `<span class="sk-bd ${r.side === "buy" ? "hot" : "no"}">${r.who} ${r.n === "1" ? "하루" : r.n + "일"} ${r.side === "buy" ? "순매수" : "순매도"} ${r.k}위 <small>${r.mk === "KOSPI" ? "코스피" : "코스닥"} · 시총 대비 ${pct(r.who === "외국인" ? r.r.fp : r.r.ip, 2)}${r.who === "외국인" && r.r.dh != null ? ` · 보유 ${r.r.hold?.toFixed(1)}% (${r.r.dh > 0 ? "+" : ""}${r.r.dh.toFixed(2)}%p)` : ""}</small></span>`).join("")}</div>` : "";
      supHtml = `<section class="sk-sec" id="skSup"><h4>💰 투자자별 수급 <span class="sub">억 원 · 순매수 수량 × 종가 추정${sup ? " · " + esc(sup.asof || S.basis_date) : ""}</span></h4>
        ${rk.length ? `<p class="sk-note sk-note-top">외국인·기관 보유 변화 카드(산업 강도 탭)의 상위 10 명단에 들어 있어요.</p>${rkHtml}` : ""}
        ${sup ? `<div class="sk-tw"><table class="mem-table"><thead><tr><th>투자자</th><th class="num">하루</th><th class="num">5일</th><th class="num">20일</th><th class="num">60일</th></tr></thead><tbody>${row("외국인", "f")}${row("기관", "i")}${row("개인", "p")}</tbody></table></div>
        <p class="sk-note">${[runs, sup.pct20 != null ? `20일 외국인+기관 순매수 = 시가총액의 ${pct(sup.pct20, 2)}` : "", sup.hold != null ? `외국인 지분율 ${sup.hold}%` : "", sup.blk && sup.blk.length ? `⚑ 블록거래일(${sup.blk.map(md).join(", ")})은 수급 강도 계산에서 뺐어요` : ""].filter(Boolean).join(" · ")}</p>` : ""}
        <div id="skFlowWrap" hidden><h4 class="sk-h5">누적 순매수 흐름 <span class="sub">첫날부터 매일 순매수를 더한 값(억 원) · 선이 오르면 계속 사는 중</span></h4>
          <div class="chart-legend" id="skLgFlow"></div><div id="skFlow" class="chart sm"></div>
          <div class="chart-legend" id="skLgHold"></div><div id="skHold" class="chart xs"></div></div>
      </section>`;
    }

    // 페어 (페어 탭)
    let prHtml = "";
    if (prs.length) {
      prHtml = `<section class="sk-sec" id="skPair"><h4>⚖️ 페어 <span class="sub">페어 탭에서 이 종목이 쓰이는 비교</span></h4><div class="sk-inds">${prs.map(({ g, p }) => `
        <div class="sk-ind sk-pair"><b>${esc(p.a)} ÷ ${esc(p.b)} <small class="muted">${esc(g.name)}</small></b><span>${esc(p.desc || "")}</span>
          <span>비율 20일 <b class="ret ${cls(p.chg20)}">${pct(p.chg20)}</b> · 60일 <b class="ret ${cls(p.chg60)}">${pct(p.chg60)}</b>${p.pos52 != null ? ` · 52주 범위 ${Math.round(p.pos52)}% 위치` : ""} → ${esc((p.chg20 ?? 0) >= 0 ? p.up : p.down)}</span></div>`).join("")}</div></section>`;
    }

    // 바깥 링크
    const L = window.__links;
    const links = KR ? [
      ["네이버 종합", L.naver(code, "total")],
      ["네이버 뉴스", L.naver(code, "news")],
      ["네이버 재무", L.naver(code, "finance/annual")],
      ["공시(DART)", `https://dart.fss.or.kr/dsab007/main.do?option=corp&textCrpNm=${encodeURIComponent(name)}`],
      ["TradingView 차트", L.tvChart(code, "KR")],
    ] : [
      ["TradingView 차트", L.tvChart(tick, "US")],
      ["Finviz", L.finviz(tick)],
      ["Yahoo 뉴스", L.yahooNews(tick)],
      ["SEC 공시", L.sec(tick)],
    ];

    const nav = [["skChartSec", "차트"], m && ["skRet", "수익률"], m && ["skTrend", "추세 점검"], m && ["skStat", "위험 관리"], hx && ["skHigh", "신고가"],
      supHtml && ["skSup", "수급"], inds.length && ["skInd", "산업"], secs.length && ["skSec", "섹터"], prs.length && ["skPair", "페어"], ["skLinks", "링크"]].filter(Boolean);
    $("#skNav", box).innerHTML = nav.map(([id, t]) => `<button type="button" data-go="${id}">${t}</button>`).join("");

    const none = !m && !hx?.list.length && !sup && !rk.length;
    $("#skBody", box).innerHTML = `
      ${badges.length ? `<div class="sk-bds">${badges.join("")}</div>` : ""}
      ${lines.length ? `<div class="sk-sum">${lines.map((l) => `<p>${l}</p>`).join("")}</div>` : ""}
      ${m && m.path ? `<p class="sk-path">무엇을 하는 회사인가: ${esc(m.path)}</p>` : ""}
      <section class="sk-sec" id="skChartSec">
        <div class="sk-ch-head"><h4>📈 주가 차트</h4><div class="seg small" id="skRange" role="group" aria-label="차트 기간">${RANGES.map(([k, t]) => `<button type="button" data-r="${k}" aria-pressed="${k === range}">${t}</button>`).join("")}</div></div>
        <div class="chart-legend sk-lg" id="skLgPrice"></div>
        <div id="skPrice" class="chart sk-price"><p class="sk-load">차트 불러오는 중…</p></div>
        <div id="skCmpWrap" hidden>
          <h4 class="sk-h5">산업·시장과 비교 <span class="sub">기간 시작 = 100</span></h4>
          <div class="sk-cap" id="skCapCmp"></div>
          <div class="chart-legend" id="skLgCmp"></div><div id="skCmp" class="chart sm"></div>
          <h4 class="sk-h5">RS선 <span class="sub" id="skRsSub">시장 지수 대비, 기간 시작 = 100 · 위로 갈수록 시장보다 강함</span></h4>
          <div class="chart-legend" id="skLgRs"></div><div id="skRs" class="chart xs"></div>
        </div>
      </section>
      ${m ? `<section class="sk-sec" id="skRet"><h4>수익률</h4>${retHtml}<div id="skRetCmp"></div></section>` : ""}
      ${m ? `<section class="sk-sec" id="skTrend"><h4>✅ 추세 점검 <span class="sub">미너비니 추세 템플릿 · 종가 기준</span></h4><div id="skChecks"><p class="sk-load">계산 중…</p></div></section>` : ""}
      ${m ? `<section class="sk-sec" id="skStat"><h4>🛡️ 상태와 위험 관리</h4>${statHtml}</section>` : ""}
      ${hxHtml}${supHtml}${indHtml}${secHtml}${prHtml}
      ${!m ? `<p class="sk-note">이 종목은 산업 강도판의 세부 산업(바구니)에 들어 있지 않아서 수익률·추세·RS 값이 없어요.${KR ? " 수급 표도 바구니 종목만 모아요." : ""}</p>` : ""}
      ${none ? `<p class="sk-none">이 판이 가진 정보가 많지 않아요. 아래 링크에서 더 보세요.</p>` : ""}
      <section class="sk-sec" id="skLinks"><h4>🔗 바깥에서 더 보기</h4><div class="sk-links">${links.map(([t, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${t} ↗</a>`).join("")}</div></section>`;
    $$(".sk-ind[data-ind]", box).forEach((b) => b.addEventListener("click", () => {
      const bd = window.__isBoard && window.__isBoard();
      if (!bd) return;
      close();
      if (window.__isMarket && window.__isMarket() !== market) return;
      bd.open(b.dataset.ind);
    }));
    $$(".sk-peer", box).forEach((b) => b.addEventListener("click", () => { if (!b.classList.contains("me")) open(b.dataset.code, market, b.dataset.name); }));
    return { code, key, tick, market, KR, m, inds, hx, d, name, money };
  }

  // ---------- 차트
  const hasLW = () => !!window.LightweightCharts;
  function baseChart(el, opts = {}) {
    const ch = window.LightweightCharts.createChart(el, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: css("--muted"), fontSize: 11, fontFamily: getComputedStyle(document.body).fontFamily },
      grid: { vertLines: { color: css("--grid") }, horzLines: { color: css("--grid") } },
      rightPriceScale: { borderColor: css("--line"), scaleMargins: { top: 0.08, bottom: 0.06 }, ...(opts.priceScale || {}) },
      timeScale: { borderColor: css("--line"), timeVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: { mode: 1 },
      handleScroll: { vertTouchDrag: false },
      localization: { locale: "ko-KR", priceFormatter: opts.fmt },
    });
    charts.push(ch);
    return ch;
  }
  const pts = (dates, vals, k0 = 0) => { const o = []; for (let k = k0; k < dates.length; k++) if (vals[k] != null) o.push({ time: dates[k], value: vals[k] }); return o; };
  function line(ch, dates, vals, color, width = 2, extra = {}, k0 = 0) {
    const s = ch.addLineSeries({ color, lineWidth: width, priceLineVisible: false, lastValueVisible: true, crosshairMarkerRadius: 4, ...extra });
    s.setData(pts(dates, vals, k0));
    return s;
  }
  function legend(el, items, ch, head) {
    const draw = (vals, t) => { el.innerHTML = (head ? `<span class="sk-lgd">${esc(head(t))}</span>` : "") + items.map((it, k) => `<span><i style="background:${it.c}${it.dash ? ";opacity:.7" : ""}"></i>${it.n}${vals && vals[k] != null ? ` <b class="tnum">${it.f(vals[k], t)}</b>` : ""}</span>`).join(""); };
    const last = () => draw(items.map((it) => it.last), null);
    last();
    ch.subscribeCrosshairMove((p) => {
      if (!p || !p.time) { last(); return; }
      draw(items.map((it) => { const v = p.seriesData.get(it.s); return v ? v.value : null; }), p.time);
    });
  }

  function drawCharts(ctx, X, SE) {
    const { key, KR, m, inds, hx, d } = ctx;
    const rec = X && X.s && X.s[key];
    ["#skPrice", "#skCmp", "#skRs", "#skFlow", "#skHold"].forEach((q) => { const e = $(q, box); if (e) e.innerHTML = ""; });
    if (!rec || !hasLW()) { fallback(ctx); return; }

    const dates = X.dates, n = dates.length, c = rec.c, v = rec.v || [];
    const kStart = Math.max(0, n - (RANGES.find(([k]) => k === range) || RANGES[2])[2]);
    const fmtP = (x) => KR ? Math.round(x).toLocaleString("ko-KR") : x >= 100 ? x.toFixed(1) : x.toFixed(2);
    const ma = { 20: sma(c, 20), 50: sma(c, 50), 150: sma(c, 150), 200: sma(c, 200) };
    const hi52 = rollMax(c, 252);
    const vma = sma(v.map((x) => x ?? null), 50);

    // 1) 주가 + 이동평균 + 거래량
    const el = $("#skPrice", box);
    const ch = baseChart(el, { fmt: fmtP, priceScale: { scaleMargins: { top: 0.06, bottom: 0.26 } } });
    const vs = ch.addHistogramSeries({ priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    ch.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    const up = css("--up"), dn = css("--down");
    const vd = [];
    for (let k = kStart; k < n; k++) if (v[k] != null) vd.push({ time: dates[k], value: v[k], color: (c[k] != null && c[k - 1] != null && c[k] < c[k - 1] ? dn : up) + "66" });
    vs.setData(vd);
    const vm = line(ch, dates, vma, css("--muted"), 1, { priceScaleId: "vol", lastValueVisible: false, lineStyle: 2, crosshairMarkerVisible: false }, kStart);
    const hiS = line(ch, dates, hi52, css("--good"), 1, { lineStyle: 2, lastValueVisible: false, crosshairMarkerVisible: false }, kStart);
    const m200 = line(ch, dates, ma[200], css("--ma200"), 1.5, { lastValueVisible: false }, kStart);
    const m150 = line(ch, dates, ma[150], css("--muted"), 1, { lastValueVisible: false, lineStyle: 1 }, kStart);
    const m50 = line(ch, dates, ma[50], css("--ma50"), 1.5, { lastValueVisible: false }, kStart);
    const m20 = line(ch, dates, ma[20], css("--ma20"), 1.2, { lastValueVisible: false }, kStart);
    const sp = line(ch, dates, c, css("--price"), 2, {}, kStart);
    // 52주 신고가 기록일(신고가 탭 자료) 표시
    if (hx && hx.list.length) {
      const inR = new Set(dates.filter((t, k) => k >= kStart && c[k] != null));
      sp.setMarkers(hx.list.filter((dd) => inR.has(dd)).map((dd) => ({ time: dd, position: "aboveBar", color: up, shape: "arrowDown", size: 0.6 })));
    }
    ch.timeScale().fitContent();
    const ix = {}; dates.forEach((t, k) => { ix[t] = k; });
    const chgAt = (t) => { const k = t ? ix[t] : lastIdx(c); return k > 0 && c[k] != null && c[k - 1] != null ? (c[k] / c[k - 1] - 1) * 100 : null; };
    const L = lastIdx(c), lv = (a) => a[L];
    legend($("#skLgPrice", box), [
      { n: "종가", c: css("--price"), s: sp, f: (x, t) => `${fmtP(x)} <em class="ret ${cls(chgAt(t))}">${pct(chgAt(t), 2)}</em>`, last: lv(c) },
      { n: "20일", c: css("--ma20"), s: m20, f: fmtP, last: lv(ma[20]) },
      { n: "50일", c: css("--ma50"), s: m50, f: fmtP, last: lv(ma[50]) },
      { n: "150일", c: css("--muted"), s: m150, f: fmtP, last: lv(ma[150]) },
      { n: "200일", c: css("--ma200"), s: m200, f: fmtP, last: lv(ma[200]) },
      { n: "52주 최고 종가", c: css("--good"), s: hiS, f: fmtP, last: lv(hi52), dash: 1 },
      { n: "거래량", c: up + "88", s: vs, f: (x, t) => { const k = t ? ix[t] : lastIdx(v); const r = vma[k] ? x / vma[k] : null; return `${volFmt(x)}${r ? ` <em class="${r >= 1.5 ? "up" : ""}">(${r.toFixed(1)}배)</em>` : ""}`; }, last: v[lastIdx(v)] },
    ], ch, (t) => t ? mdw(t) : "최근");
    if (!$(".sk-cap-note", box)) $(".sk-price", box).insertAdjacentHTML("afterend", `<p class="sk-cap sk-cap-note">굵은 선이 종가, 색 선이 이동평균(주황 20일·파랑 50일·회색 150일·보라 200일), 초록 점선이 52주 최고 종가예요. 아래 막대는 거래량이고 점선은 50일 평균 거래량이에요.${hx && hx.list.length ? " 빨간 ▼는 52주 신고가 탭에 기록된 날이에요." : ""} 차트를 누르거나 손가락으로 움직이면 그날 값이 위에 보여요.</p>`);

    // 2) 산업·시장과 비교 (기간 시작 = 100)
    const useB2 = rec.b && X.bench2;
    const bench = useB2 ? X.bench2 : X.bench, bName = useB2 ? X.bench_name2 : X.bench_name;
    const it0 = inds[0], ss = it0 && SE && SE.items && SE.items[it0.id];
    let ind = null;
    if (ss) { const pos = {}; SE.dates.forEach((t, k) => { pos[t] = k; }); ind = ffill(dates.map((t) => pos[t] != null ? ss.close[pos[t]] : null)); }
    const k0 = (() => { for (let k = kStart; k < n; k++) if (c[k] != null && bench[k] != null && (!ind || ind[k] != null)) return k; for (let k = kStart; k < n; k++) if (c[k] != null && bench[k] != null) return k; return -1; })();
    if (k0 >= 0) {
      $("#skCmpWrap", box).hidden = false;
      const norm = (a) => a && a[k0] != null ? a.map((x, k) => k < k0 || x == null ? null : x / a[k0] * 100) : null;
      const nS = norm(c), nB = norm(ffill(bench)), nI = norm(ind);
      const c2 = baseChart($("#skCmp", box), { fmt: (x) => x.toFixed(1) });
      const a1 = line(c2, dates, nS, css("--price"), 2, {}, k0);
      const a2 = nI ? line(c2, dates, nI, css("--ma20"), 1.6, { lastValueVisible: false }, k0) : null;
      const a3 = line(c2, dates, nB, css("--accent"), 1.6, { lastValueVisible: false }, k0);
      a1.createPriceLine({ price: 100, color: css("--line"), lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
      c2.timeScale().fitContent();
      const f1 = (x) => x.toFixed(1);
      legend($("#skLgCmp", box), [
        { n: esc(ctx.name), c: css("--price"), s: a1, f: f1, last: nS[lastIdx(nS)] },
        ...(a2 ? [{ n: `산업: ${esc(it0.name)}`, c: css("--ma20"), s: a2, f: f1, last: nI[lastIdx(nI)] }] : []),
        { n: esc(bName), c: css("--accent"), s: a3, f: f1, last: nB[lastIdx(nB)] },
      ], c2, (t) => t ? mdw(t) : "최근");
      const r = (a) => a ? a[lastIdx(a)] - 100 : null;
      const rs = r(nS), rb = r(nB), ri = r(nI);
      const lab = (RANGES.find(([k]) => k === range) || RANGES[2])[1];
      $("#skCapCmp", box).innerHTML = `${md(dates[k0])}부터 ${lab} — 종목 <b class="ret ${cls(rs)}">${pct(rs)}</b>${ri != null ? ` · 산업 <b class="ret ${cls(ri)}">${pct(ri)}</b>` : ""} · ${esc(bName)} <b class="ret ${cls(rb)}">${pct(rb)}</b> → 시장 대비 <b class="ret ${cls(rs - rb)}">${rs - rb > 0 ? "+" : ""}${(rs - rb).toFixed(1)}%p</b>${ri != null ? `, 산업 대비 <b class="ret ${cls(rs - ri)}">${rs - ri > 0 ? "+" : ""}${(rs - ri).toFixed(1)}%p</b>` : ""}`;
      // RS선 (종목 ÷ 시장, 시작 100) + 50일 평균
      const bf = ffill(bench);
      const rsl = c.map((x, k) => x != null && bf[k] ? x / bf[k] : null);
      const base = rsl[k0];
      const rsN = rsl.map((x) => x == null || !base ? null : x / base * 100);
      const rsM = sma(rsN, 50);
      const c3 = baseChart($("#skRs", box), { fmt: f1 });
      const r1 = line(c3, dates, rsN, css("--accent"), 2, {}, k0);
      const r2 = line(c3, dates, rsM, css("--ma20"), 1.3, { lastValueVisible: false }, k0);
      c3.timeScale().fitContent();
      $("#skRsSub", box).textContent = `${bName} 대비, 기간 시작 = 100 · 위로 갈수록 시장보다 강함`;
      legend($("#skLgRs", box), [
        { n: "RS선", c: css("--accent"), s: r1, f: f1, last: rsN[lastIdx(rsN)] },
        { n: "RS 50일 평균", c: css("--ma20"), s: r2, f: f1, last: rsM[lastIdx(rsM)] },
      ], c3);
      // 시간축 함께 움직이기
      const all = [ch, c2, c3];
      let syncing = false;
      all.forEach((x) => x.timeScale().subscribeVisibleTimeRangeChange((tr) => {
        if (!tr || syncing) return; syncing = true;
        all.forEach((o) => { if (o !== x) try { o.timeScale().setVisibleRange(tr); } catch (e) {} });
        syncing = false;
      }));
      // 기간 수익률 표: 종목·산업·시장
      const P = [["당일", 1], ["5일", 5], ["20일", 20], ["60일", 60], ["200일", 200]];
      const ret = (a, w) => { const L2 = lastIdx(a); return L2 - w >= 0 && a[L2] != null && a[L2 - w] != null ? (a[L2] / a[L2 - w] - 1) * 100 : null; };
      const sIndK = it0 ? { 1: it0.chg1, 5: it0.ret5, 20: it0.ret20, 60: it0.ret60, 200: it0.ret200 } : null;
      const rowR = (nm, f, me) => `<tr${me ? ' class="me"' : ""}><td>${nm}</td>${P.map(([, w]) => { const x = f(w); return `<td class="num"><span class="ret ${cls(x)}">${pct(x)}</span></td>`; }).join("")}</tr>`;
      const box2 = $("#skRetCmp", box);
      if (box2) box2.innerHTML = `<div class="sk-tw"><table class="mem-table sk-cmp"><thead><tr><th>같은 기간 비교</th>${P.map(([t]) => `<th class="num">${t}</th>`).join("")}</tr></thead><tbody>
        ${rowR(`<b>${esc(ctx.name)}</b>`, (w) => ret(c, w), true)}
        ${sIndK ? rowR(`산업: ${esc(it0.name)}`, (w) => sIndK[w]) : ""}
        ${rowR(esc(bName), (w) => ret(bf, w))}
        ${rowR("시장 대비 (%p)", (w) => { const a = ret(c, w), b = ret(bf, w); return a == null || b == null ? null : a - b; })}
      </tbody></table></div>`;
    }

    // 3) 추세 점검 (미너비니 추세 템플릿)
    const ck = $("#skChecks", box);
    if (ck) {
      const x = c[L], a50 = ma[50][L], a150 = ma[150][L], a200 = ma[200][L], a200p = L >= 20 ? ma[200][L - 20] : null;
      const w = c.slice(Math.max(0, L - 251), L + 1).filter((y) => y != null);
      const hi = Math.max(...w), lo = Math.min(...w);
      const T = [
        ["가격이 150일·200일선 위", a150 != null && a200 != null ? x > a150 && x > a200 : null, a200 ? `200일선 대비 ${pct((x / a200 - 1) * 100)}` : ""],
        ["150일선이 200일선 위", a150 != null && a200 != null ? a150 > a200 : null, ""],
        ["200일선이 한 달 전보다 위", a200 != null && a200p != null ? a200 > a200p : null, a200 && a200p ? `20거래일 새 ${pct((a200 / a200p - 1) * 100, 2)}` : ""],
        ["50일선이 150일·200일선 위", a50 != null && a150 != null && a200 != null ? a50 > a150 && a50 > a200 : null, ""],
        ["가격이 50일선 위", a50 != null ? x > a50 : null, a50 ? `50일선 대비 ${pct((x / a50 - 1) * 100)}` : ""],
        ["52주 저점보다 30% 이상 위", w.length > 60 ? x >= lo * 1.3 : null, `저점 대비 ${pct((x / lo - 1) * 100)}`],
        ["52주 고점에서 25% 이내", w.length > 60 ? x >= hi * 0.75 : null, `고점 대비 ${pct((x / hi - 1) * 100)}`],
        ["RS 지수 70 이상", m && m.rs_rating != null ? m.rs_rating >= 70 : null, m && m.rs_rating != null ? `RS ${m.rs_rating}` : ""],
      ];
      const ok = T.filter((t) => t[1] === true).length, known = T.filter((t) => t[1] != null).length;
      ck.innerHTML = `<p class="sk-score"><b class="${ok === known && known ? "ok" : ok >= known - 2 ? "" : "no"}">${ok}/${known}</b> 통과 <span class="muted">· 8개를 모두 통과하면 ‘2단계 상승 추세’의 교과서 모양이에요</span></p>
        <ul class="sk-checks">${T.map(([t, o, s]) => `<li class="${o == null ? "na" : o ? "ok" : "no"}"><i>${o == null ? "–" : o ? "✓" : "✕"}</i><span>${t}</span><em>${esc(s)}</em></li>`).join("")}</ul>`;
    }

    // 4) 수급 누적 흐름 (한국)
    const fl = KR && X.flows && X.flows.s && X.flows.s[key];
    if (fl) {
      $("#skFlowWrap", box).hidden = false;
      const fd = X.flows.dates;
      const cum = (a) => { let s = 0; return a.map((y) => (y == null ? null : (s += y, Math.round(s * 10) / 10))); };
      const F = cum(fl.f), I = cum(fl.i), Pp = cum(fl.p);
      const c4 = baseChart($("#skFlow", box), { fmt: (y) => eok(y) });
      const sf = line(c4, fd, F, css("--sup-f") || "#d12f2f", 2);
      const si = line(c4, fd, I, css("--sup-i") || "#2a78d6", 2);
      const sp2 = line(c4, fd, Pp, css("--sup-p") || "#898781", 1.5, { lineStyle: 2 });
      sf.createPriceLine({ price: 0, color: css("--line"), lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
      c4.timeScale().fitContent();
      legend($("#skLgFlow", box), [
        { n: "외국인", c: css("--sup-f"), s: sf, f: eok, last: F[lastIdx(F)] },
        { n: "기관", c: css("--sup-i"), s: si, f: eok, last: I[lastIdx(I)] },
        { n: "개인", c: css("--sup-p"), s: sp2, f: eok, last: Pp[lastIdx(Pp)], dash: 1 },
      ], c4, (t) => `${t ? mdw(t) : md(fd[0]) + "부터 누적"}`);
      let c5 = null;
      if (fl.h && fl.h.some((y) => y != null)) {
        c5 = baseChart($("#skHold", box), { fmt: (y) => y.toFixed(2) + "%" });
        const sh = line(c5, fd, fl.h, css("--sup-f"), 1.6);
        c5.timeScale().fitContent();
        const h0 = fl.h.find((y) => y != null), h1 = fl.h[lastIdx(fl.h)];
        legend($("#skLgHold", box), [{ n: `외국인 보유율 (${md(fd[0])} 대비 ${h1 - h0 > 0 ? "+" : ""}${(h1 - h0).toFixed(2)}%p)`, c: css("--sup-f"), s: sh, f: (y) => y.toFixed(2) + "%", last: h1 }], c5);
      } else { $("#skHold", box).hidden = true; $("#skLgHold", box).hidden = true; }
      const fs = [c4, c5].filter(Boolean);
      let sy = false;
      fs.forEach((x) => x.timeScale().subscribeVisibleTimeRangeChange((tr) => { if (!tr || sy) return; sy = true; fs.forEach((o) => { if (o !== x) try { o.timeScale().setVisibleRange(tr); } catch (e) {} }); sy = false; }));
    }
  }
  const volFmt = (x) => x >= 1e8 ? (x / 1e8).toFixed(1) + "억" : x >= 1e4 ? Math.round(x / 1e4).toLocaleString("ko-KR") + "만" : Math.round(x).toLocaleString("ko-KR");

  // 이 판에 가격 이력이 없는 종목: 한국은 네이버 차트 그림, 미국은 TradingView 차트(바깥 자료)
  function fallback(ctx) {
    const el = $("#skPrice", box);
    $("#skRange", box).hidden = true;
    const ck = $("#skChecks", box); if (ck) ck.innerHTML = `<p class="sk-none">차트 자료가 없어 계산하지 못했어요.</p>`;
    if (ctx.KR) {
      const KINDS = [["day", "일봉"], ["week", "주봉"], ["month", "월봉"]];
      const img = (k) => `https://ssl.pstatic.net/imgfinance/chart/item/candle/${k}/${encodeURIComponent(ctx.code)}.png?sidcode=${Date.now()}`;
      el.classList.add("sk-img");
      el.innerHTML = `<div class="seg small sk-imgseg" role="group" aria-label="차트 종류">${KINDS.map(([k, t], i) => `<button type="button" data-k="${k}" aria-pressed="${i === 0}">${t}</button>`).join("")}</div>
        <img src="${img("day")}" alt="${esc(ctx.name)} 캔들 차트(네이버)" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('p'),{className:'sk-none',textContent:'차트 그림을 불러오지 못했어요.'}))">
        <p class="sk-cap">이 종목은 산업 강도판 바구니에 없어서 네이버 증권 차트 그림으로 대신 보여 줘요(이동평균선 포함).</p>`;
      $$(".sk-imgseg button", el).forEach((b) => b.addEventListener("click", () => {
        $$(".sk-imgseg button", el).forEach((x) => x.setAttribute("aria-pressed", x === b));
        const im = $("img", el); if (im) im.src = img(b.dataset.k);
      }));
    } else {
      const sym = (window.__links && window.__links.tvSym(ctx.tick, "US")) || ctx.tick;
      const dark = root.dataset.theme === "dark" || (!root.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
      el.classList.add("sk-img");
      el.innerHTML = `<iframe class="sk-tv" title="${esc(ctx.name)} TradingView 차트" loading="lazy" src="https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(sym)}&interval=D&hidesidetoolbar=1&symboledit=0&saveimage=0&toolbarbg=f1f3f6&studies=%5B%22MASimple%40tv-basicstudies%22%5D&theme=${dark ? "dark" : "light"}&style=1&timezone=Asia%2FSeoul&locale=kr&range=12M"></iframe>
        <p class="sk-cap">이 종목은 산업 강도판 바구니에 없어서 TradingView 차트로 대신 보여 줘요.</p>`;
    }
  }

  // 다른 화면에서: <... data-stock="코드" data-sname="이름"> 을 누르면 열린다(문서 전체에 한 번만 건다)
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-stock]");
    if (!t || e.target.closest("a[href]")) return;
    e.preventDefault(); e.stopPropagation();
    open(t.dataset.stock, t.dataset.smarket || undefined, t.dataset.sname);
  }, true);

  // 산업 강도 탭 종목 이름 옆 🚀: 지금 52주 신고가 행진 중(마지막 기록일에 신고가)이면 연속 일수
  let HX = null;
  getJSON("highs.json").then((h) => { HX = h; }).catch(() => {});
  function highMark(code, market) {
    const hx = HX && highsOf(HX, market, code);
    if (!hx || !hx.run) return "";
    return `<span class="sk-hi" title="52주 신고가 ${hx.run >= 2 ? hx.run + "일 연속" : "(" + md(hx.days.at(-1)) + ")"} · 최근 ${hx.days.length}거래일 중 ${hx.list.length}일">🚀${hx.run >= 2 ? hx.run : ""}</span>`;
  }

  window.__stock = { open, highMark, close: () => box && !box.hidden && close() };
})();
