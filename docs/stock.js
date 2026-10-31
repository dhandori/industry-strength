/* 종목 상세 창 (2026-10-27 추가) — 산업 강도 탭과 52주 신고가 탭이 같이 쓴다.
   종목 이름을 누르면 열린다: window.__stock.open(code, market)
   한 종목에 대해 이 판이 가진 정보를 한곳에 모은다.
   - 가격: 산업 강도 자료(data/{시장}.json)의 구성 종목 값 — 당일·5·20·60·200일 수익률, 52주 고점 대비, RS 지수, 50일선, 추세 상태
   - 속한 세부 산업과 그 안에서의 순위(같은 바구니 종목 비교)
   - 52주 신고가 기록: data/highs.json — 최근 기록 기간 중 신고가 낸 날, 연속 일수, 그날 등락률·시가총액
   - 수급(한국만): data/KR_supply.json — 외국인·기관·개인 순매수, 연속 매수일, 외국인 지분율
   다른 탭 코드는 건드리지 않는다. 산업 상세 서랍은 window.__isBoard().open 으로 연다. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pct = (v, d = 1) => v == null ? "–" : (v > 0 ? "+" : "") + v.toFixed(d) + "%";
  const cls = (v) => v == null ? "" : v > 0 ? "up" : v < 0 ? "down" : "";
  const md = (d) => d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : "–";
  const WD = "일월화수목금토";
  const mdw = (d) => `${md(d)}(${WD[new Date(d + "T00:00:00Z").getUTCDay()]})`;
  const eok = (v) => {
    if (v == null) return "–";
    const s = v > 0 ? "+" : v < 0 ? "-" : "", a = Math.abs(v);
    return s + (a >= 10000 ? (a / 10000).toFixed(1) + "조" : Math.round(a).toLocaleString("ko-KR") + "억");
  };
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

  // ---------- 자료 모으기
  async function board(market) {
    const b = window.__isBoard && window.__isBoard();
    if (b && b.data[market]) return b.data[market];
    try { return await getJSON(`${market}.json`); } catch (e) { return null; }
  }
  function findInBoard(d, code) {
    if (!d) return { m: null, inds: [] };
    const C = String(code).toUpperCase();
    let m = null; const inds = [];
    for (const it of d.items) for (const x of it.members || []) {
      if (x.missing) continue;
      if (String(x.code || "").toUpperCase() === C || String(x.ticker || "").toUpperCase() === C) { m = m || x; inds.push(it); }
    }
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

  // ---------- 창
  let box;
  function ensure() {
    if (box) return box;
    box = document.createElement("div");
    box.className = "sk";
    box.hidden = true;
    box.innerHTML = `<div class="sk-backdrop" data-skclose></div>
      <article class="sk-panel" role="dialog" aria-modal="true" aria-labelledby="skTitle">
        <header class="sk-head"><div class="sk-ht"><h3 id="skTitle"></h3><p class="meta" id="skSub"></p></div>
          <button class="icon-btn" data-skclose aria-label="닫기"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></header>
        <div class="sk-body" id="skBody"></div>
      </article>`;
    document.body.appendChild(box);
    $$("[data-skclose]", box).forEach((b) => b.addEventListener("click", close));
    addEventListener("keydown", (e) => { if (e.key === "Escape" && !box.hidden) { e.stopImmediatePropagation(); close(); } }, true);
    return box;
  }
  let prevOverflow = "";
  function close() { box.hidden = true; document.body.style.overflow = prevOverflow; }

  async function open(code, market, nameHint) {
    if (!code) return;
    market = market || (window.__isMarket ? window.__isMarket() : "KR");
    ensure();
    if (box.hidden) prevOverflow = document.body.style.overflow;
    box.hidden = false;
    document.body.style.overflow = "hidden";
    $("#skTitle", box).textContent = nameHint || code;
    $("#skSub", box).textContent = "불러오는 중…";
    $("#skBody", box).innerHTML = "";
    $(".sk-panel", box).scrollTop = 0;
    const token = (open._t = (open._t || 0) + 1);
    const [d, H, S] = await Promise.all([
      board(market),
      getJSON("highs.json").catch(() => null),
      market === "KR" ? getJSON("KR_supply.json").catch(() => null) : Promise.resolve(null),
    ]);
    if (token !== open._t) return;
    render(code, market, nameHint, d, H, S);
  }

  function render(code, market, nameHint, d, H, S) {
    const { m, inds } = findInBoard(d, code);
    const hx = highsOf(H, market, code);
    const sup = S && S.stocks ? S.stocks[String(code)] || null : null;
    const name = (m && m.name) || (hx && hx.info && hx.info[0]) || nameHint || code;
    const KR = market === "KR";
    const tick = (m && m.ticker) || code;
    const lastHit = hx && hx.list.length ? hx.hit[hx.list.at(-1)] : null;
    const close = m && m.close != null ? m.close : lastHit ? lastHit.close : null;
    const price = close == null ? "" : KR ? Math.round(close).toLocaleString("ko-KR") + "원" : "$" + close.toFixed(2);
    const mcap = lastHit ? lastHit.mcap : sup && sup.mcap != null ? sup.mcap : null;
    const capTxt = mcap == null ? "" : KR ? (mcap >= 10000 ? `${(mcap / 10000).toFixed(1)}조` : `${Math.round(mcap).toLocaleString("ko-KR")}억`) + " 원" : `${Math.round(mcap).toLocaleString("en-US")}억 달러`;
    $("#skTitle", box).textContent = name;
    $("#skSub", box).innerHTML = [esc(KR ? code : tick), price && `${price}${m && m.chg1 != null ? ` <b class="ret ${cls(m.chg1)}">${pct(m.chg1, 2)}</b>` : ""}`,
      capTxt && `시가총액 ${capTxt}`, d && m ? `${esc(d.basis_date)} 종가` : ""].filter(Boolean).join(" · ");

    // 한눈에: 이 종목의 상태를 한 줄씩
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
    if (inds.length) {
      const top = inds.slice().sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))[0];
      lines.push(`속한 산업 <b>${esc(top.name)}</b> ${top.rank ?? "–"}위 / ${d.n}${top.top ? " (상위 25%)" : ""}`);
    }

    // 수익률 막대
    const RET = [["당일", "chg1"], ["5일", "ret5"], ["20일", "ret20"], ["60일", "ret60"], ["200일", "ret200"]];
    const retMax = m ? Math.max(5, ...RET.map(([, k]) => Math.abs(m[k] ?? 0))) : 1;
    const retHtml = m ? `<div class="sk-rets">${RET.map(([l, k]) => {
      const v = m[k];
      return `<div class="sk-ret"><em>${l}</em><b class="ret ${cls(v)}">${pct(v)}</b><span class="sk-rbar"><i class="${v >= 0 ? "pos" : "neg"}" style="width:${v == null ? 0 : Math.min(50, Math.abs(v) / retMax * 50)}%"></i></span></div>`;
    }).join("")}</div>` : "";

    // 상태 칸
    const stat = [];
    if (m) {
      const sg = STAGE[m.stage] || ["", ""];
      if (m.stage) stat.push(["추세 상태", `<span class="stage ${sg[0]}">${esc(m.stage)}</span>`, sg[1]]);
      if (m.rs_rating != null) stat.push(["RS 지수 (1~99)", `<b class="rs-num ${m.rs_rating >= 80 ? "hi" : m.rs_rating < 40 ? "lo" : ""}">${m.rs_rating}</b>`, "1년 수익률을 시장 안 모든 종목과 비교한 백분위. 80 이상이면 주도주 후보예요."]);
      if (m.atr_pct != null) stat.push(["ATR(14일) 평균 변동폭", `<b>${m.atr == null ? "" : (KR ? Math.round(m.atr).toLocaleString("ko-KR") + "원" : "$" + m.atr.toFixed(2)) + " "}(${m.atr_pct.toFixed(1)}%)</b>`, `최근 14거래일 동안 하루에 보통 ${m.atr_pct.toFixed(1)}% 움직였어요(고가−저가, 전날 종가와의 갭 포함). 손절 폭·목표가를 잡는 기준으로 써요.`]);
      // 손절 기준 두 가지: −8% 한도(미너비니 최대 손절)와 2×ATR(그 종목의 보통 흔들림 밖). 종가를 매수가로 가정.
      if (m.close != null && m.close > 0) {
        const money = (v) => KR ? Math.round(v).toLocaleString("ko-KR") + "원" : "$" + v.toFixed(2);
        stat.push(["기준 손절 −8%", `<b>${money(m.close * 0.92)}</b>`, "종가를 매수가로 봤을 때 −8%. 어떤 종목이든 이 아래로는 들고 가지 않는 한도예요."]);
        if (m.atr != null && m.atr_pct != null) {
          const p = m.atr_pct * 2, over = p > 8, used = Math.min(p, 8);
          stat.push(["ATR 손절 (2×ATR)", `<b class="${over ? "no" : "ok"}">${money(m.close - m.atr * 2)} (−${p.toFixed(1)}%)</b>`, over ? "8%보다 넓어요 → 8% 한도에서 자르고, 변동성이 커서 비중을 줄이거나 더 좁은 자리에서만 사요." : "8% 안에 들어와요 → 이 폭을 손절로 쓰면 보통의 흔들림에는 안 털려요."]);
          // 실제로 쓸 손절: 2×ATR과 8% 중 좁은 쪽. 8% 한도가 하루 평균 변동폭의 몇 배인지도 함께 본다.
          stat.push(["적용 최대 손절폭", `<b class="ok">−${used.toFixed(1)}%</b> <small>${money(over ? m.close * 0.92 : m.close - m.atr * 2)}</small>`, over ? "2×ATR이 8%보다 넓어서 8% 한도로 잘랐어요." : "2×ATR이 8% 안이라 2×ATR 손절가를 그대로 써요."]);
          const capAtr = 8 / m.atr_pct, tight = capAtr < 1.5;
          stat.push(["8% = 몇 ATR", `<b class="${tight ? "sk-warn" : capAtr >= 2 ? "ok" : ""}">${capAtr.toFixed(1)} ATR</b>`, tight ? `8%가 하루 평균 흔들림의 ${capAtr.toFixed(1)}배뿐이라 평소 움직임에도 털리기 쉬워요. 매수를 미루거나 비중을 줄여요.` : capAtr >= 2 ? "8% 한도가 평소 흔들림보다 넉넉해요." : "8% 한도가 빠듯한 편이에요."]);
          stat.push(["계좌 위험 2% 기준 비중", `<b>${Math.round(200 / used)}%</b>`, `손절 폭 ${used.toFixed(1)}%로 한 번에 계좌의 2%만 잃도록 할 때 살 수 있는 최대 비중이에요.`]);
        }
      }
      if (m.dist_high != null) stat.push(["52주 고점 대비",`<b>${m.dist_high.toFixed(1)}%</b>`, m.dist_high >= -5 ? "고점 근처(신고가권)예요." : m.dist_high >= -15 ? "고점에서 크게 멀지 않아요." : "고점에서 꽤 내려와 있어요."]);
      if (m.above50 != null) stat.push(["50일선", m.above50 ? '<span class="ok">위</span>' : '<span class="no">아래</span>', m.above50 ? "중기 흐름 위에 있어요." : "중기 흐름 아래로 내려왔어요."]);
      if (m.rs_up != null) stat.push(["시장 대비", m.rs_up ? '<span class="ok">강함</span>' : '<span class="no">약함</span>', "시장 지수로 나눈 선(RS선)이 50일 평균 위인지예요."]);
    }
    const statHtml = stat.length ? `<div class="sk-stats">${stat.map(([k, v, h]) => `<div title="${esc(h)}"><div class="k">${k}</div><div class="v">${v}</div><div class="h">${esc(h)}</div></div>`).join("")}</div>` : "";

    // 52주 신고가 기록
    let hxHtml = "";
    if (hx) {
      const cells = hx.days.map((dd) => { const h = hx.hit[dd]; return `<span class="sk-hd${h ? " on" : ""}" title="${esc(mdw(dd))}${h ? ` · 신고가 · ${pct(h.chg, 2)}` : " · 신고가 아님"}"><i></i><em>${md(dd)}</em></span>`; }).join("");
      const rows = hx.list.slice().reverse().slice(0, 8).map((dd) => { const h = hx.hit[dd]; return `<tr><td>${mdw(dd)}</td><td class="num"><span class="ret ${cls(h.chg)}">${pct(h.chg, 2)}</span></td><td class="num">${h.close == null ? "–" : KR ? Math.round(h.close).toLocaleString("ko-KR") : h.close.toFixed(2)}</td></tr>`; }).join("");
      hxHtml = `<h4>52주 신고가 기록 <span class="sub">최근 ${hx.days.length}거래일 · 칸이 칠해진 날이 신고가</span></h4>
        <div class="sk-hstrip">${cells}</div>
        ${hx.list.length ? `<div class="sk-tw"><table class="mem-table sk-ht"><thead><tr><th>신고가 낸 날</th><th class="num">그날 등락률</th><th class="num">종가</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="sk-none">이 기간에는 52주 신고가를 내지 않았어요.</p>`}
        ${hx.info ? `<p class="sk-note">신고가 탭 업종: ${esc(hx.info[1])}${hx.info[2] && hx.info[2] !== hx.info[1] ? ` (${esc(hx.info[2])})` : ""}</p>` : ""}`;
    }

    // 속한 세부 산업 + 같은 바구니 비교
    let indHtml = "";
    if (inds.length) {
      indHtml = `<h4>속한 세부 산업 <span class="sub">누르면 산업 상세</span></h4><div class="sk-inds">${inds.map((it) => {
        const peers = (it.members || []).filter((x) => !x.missing && x.ret20 != null).sort((a, b) => b.ret20 - a.ret20);
        const pos = peers.findIndex((x) => x === m) + 1;
        const ch = it.rank_chg5;
        return `<button class="sk-ind" type="button" data-ind="${esc(it.id)}"><b>${esc(it.name)}</b><span>${esc(it.group)} · 종합 ${it.rank ?? "–"}위/${d.n}${ch ? ` <em class="${ch > 0 ? "up" : "down"}">${ch > 0 ? "▲" : "▼"}${Math.abs(ch)}</em>` : ""} · ${esc(it.stage || "")}</span>${pos ? `<span>바구니 ${peers.length}종목 중 20일 수익률 <b>${pos}위</b></span>` : ""}</button>`;
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
    }

    // 수급
    let supHtml = "";
    if (sup) {
      const row = (n, k) => `<tr><td><b>${n}</b></td>${["1", "5", "20", "60"].map((p) => `<td class="num"><span class="ret ${cls(sup[k + p])}">${eok(sup[k + p])}</span></td>`).join("")}</tr>`;
      const runs = [sup.fs ? `외국인 ${Math.abs(sup.fs)}일 연속 ${sup.fs > 0 ? "순매수" : "순매도"}` : "", sup.is ? `기관 ${Math.abs(sup.is)}일 연속 ${sup.is > 0 ? "순매수" : "순매도"}` : ""].filter(Boolean).join(" · ");
      supHtml = `<h4>투자자별 수급 <span class="sub">억 원 · 순매수 수량 × 종가 추정 · ${esc(sup.asof || S.basis_date)}</span></h4>
        <table class="mem-table"><thead><tr><th>투자자</th><th class="num">하루</th><th class="num">5일</th><th class="num">20일</th><th class="num">60일</th></tr></thead><tbody>${row("외국인", "f")}${row("기관", "i")}${row("개인", "p")}</tbody></table>
        <p class="sk-note">${[runs, sup.pct20 != null ? `20일 외국인+기관 순매수 = 시가총액의 ${pct(sup.pct20, 2)}` : "", sup.hold != null ? `외국인 지분율 ${sup.hold}%` : "", sup.blk && sup.blk.length ? `⚑ 블록거래일(${sup.blk.map(md).join(", ")})은 수급 강도 계산에서 뺐어요` : ""].filter(Boolean).join(" · ")}</p>`;
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

    const none = !m && !hx?.list.length && !sup;
    $("#skBody", box).innerHTML = `
      ${lines.length ? `<div class="sk-sum">${lines.map((l) => `<p>${l}</p>`).join("")}</div>` : ""}
      ${m && m.path ? `<p class="sk-path">무엇을 하는 회사인가: ${esc(m.path)}</p>` : ""}
      ${retHtml}${statHtml}${hxHtml}${indHtml}${supHtml}
      ${!m ? `<p class="sk-note">이 종목은 산업 강도판의 세부 산업(바구니)에 들어 있지 않아서 수익률·추세·RS 값이 없어요.${KR ? " 수급도 바구니 종목만 모아요." : ""}</p>` : ""}
      ${none ? `<p class="sk-none">이 판이 가진 정보가 없어요. 아래 링크에서 보세요.</p>` : ""}
      <h4>바깥에서 더 보기</h4><div class="sk-links">${links.map(([t, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${t} ↗</a>`).join("")}</div>`;
    $$(".sk-ind", box).forEach((b) => b.addEventListener("click", () => {
      const bd = window.__isBoard && window.__isBoard();
      if (!bd) return;
      close();
      if (window.__isMarket && window.__isMarket() !== market) return;
      bd.open(b.dataset.ind);
    }));
    $$(".sk-peer", box).forEach((b) => b.addEventListener("click", () => { if (!b.classList.contains("me")) open(b.dataset.code, market, b.dataset.name); }));
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

  window.__stock = { open, highMark, close: () => box && close() };
})();
