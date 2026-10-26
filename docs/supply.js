/* 한국 수급(외국인·기관·개인 순매수) — 산업 강도 탭에 붙는 보조 정보 (2026-10-26)
   자료: data/KR_supply.json (scripts/supply_kr.py, 네이버 투자자별 매매동향 · 순매수 수량 × 종가 추정)
   판정은 여기서 최신 종합 강도와 합쳐 계산한다. 미국은 투자자별 매매가 공개되지 않아 보여 주지 않는다. */
(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const st = { data: null, loading: null, stamp: Date.now() };

  // 억 원 단위 숫자 → "+1,234억" / "-2.3조"
  const won = (v) => {
    if (v == null) return "–";
    const s = v > 0 ? "+" : v < 0 ? "-" : "", a = Math.abs(v);
    return s + (a >= 10000 ? (a / 10000).toFixed(a >= 100000 ? 0 : 1) + "조" : Math.round(a).toLocaleString("ko-KR") + "억");
  };
  const pct = (v, d = 2) => v == null ? "–" : (v > 0 ? "+" : "") + v.toFixed(d) + "%";
  const cls = (v) => v == null ? "" : v > 0 ? "up" : v < 0 ? "down" : "";
  const md = (d) => d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : "–";

  // 가격(종합 강도) × 수급(산업끼리 비교한 20일 수급 강도) 판정 4칸
  const J = {
    dong: { t: "동행 상승", e: "🔥", tag: "수급 동행", c: "up", help: "가격이 강하고(종합 강도 60점 이상이면서 상승 추세나 상승 전환 시도) 외국인·기관도 산업 상위 30% 안에서 사들이는 중이에요. 추세추종에서 가장 좋은 모양이에요." },
    itl: { t: "수급 이탈", e: "⚠️", tag: "수급 이탈", c: "warn", help: "가격은 강한데(종합 강도 60점 이상이면서 상승 추세나 상승 전환 시도) 외국인·기관은 20일 동안 팔고 있어요(산업 하위 30%). 개인 돈으로 버티는 상승일 수 있어 힘이 약해질 수 있어요." },
    mae: { t: "매집 의심", e: "👀", tag: "매집 의심", c: "watch", help: "가격은 약한데(종합 강도 40점 이하이거나 하락 추세) 외국인·기관이 꾸준히 사요(20일 수급 산업 상위 30%이면서 최근 5일도 순매수, 또는 5일 넘게 연속 순매수). 바로 사는 신호가 아니라, 가격이 돌아서는지 지켜볼 후보예요." },
    yak: { t: "동반 약세", e: "❄️", tag: null, c: "down", help: "가격도 약하고(종합 강도 40점 이하이거나 하락 추세) 외국인·기관도 팔아요(산업 하위 30%). 피하는 게 좋은 모양이에요." },
  };
  function judge(i) {
    const s = i.sup;
    if (!s || s.pct20 == null || i.score == null) return null;
    // 가격 강함: 점수만 높은 게 아니라 실제로 오르는 중(상승 추세·상승 전환 시도)이어야 한다.
    const rising = i.stage === "상승 추세" || i.stage === "상승 전환 시도";
    const strong = i.score >= 60 && rising, weak = !strong && (i.score <= 40 || i.stage === "하락 추세");
    const fin = s.rk20 >= 70 && s.pct20 > 0, fout = s.rk20 <= 30 && s.pct20 < 0;
    if (strong && fin) return "dong";
    if (strong && fout) return "itl";
    if (weak && ((fin && (s.pct5 ?? 0) > 0) || (s.run ?? 0) >= 5)) return "mae";
    if (weak && fout) return "yak";
    return null;
  }
  const chip = (k, small) => k ? `<span class="sup-j ${J[k].c}${small ? " sm" : ""}" title="${esc(J[k].help)}">${J[k].e} ${J[k].t}</span>` : "";
  const streak = (n, who) => !n || Math.abs(n) < 2 ? "" : `<span class="sup-run ${n > 0 ? "up" : "down"}">${who} ${Math.abs(n)}일째 ${n > 0 ? "매수" : "매도"}</span>`;

  async function get() {
    if (st.data) return st.data;
    if (!st.loading) st.loading = fetch(`data/KR_supply.json?v=${st.stamp}`, { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
    try { st.data = await st.loading; } finally { st.loading = null; }
    return st.data;
  }

  // 산업·종목에 수급을 붙이고 신호 꼬리표를 단다. 한국에서만.
  async function attach(d) {
    if (!d || d.market !== "KR" || d._sup) return;
    let S;
    try { S = await get(); } catch (e) { return; }
    if (!S || !S.industries) return;
    for (const i of d.items) {
      i.sup = S.industries[i.id] || null;
      i.sup20 = i.sup ? i.sup.pct20 : null;
      i.supJ = judge(i);
      const tag = i.supJ && J[i.supJ].tag;
      if (tag && !i.tags.includes(tag)) i.tags.push(tag);
      for (const m of i.members || []) m.sup = S.stocks[m.code] || null;
    }
    const ranked = d.items.filter((i) => i.sup20 != null).sort((a, b) => b.sup20 - a.sup20);
    ranked.forEach((i, k) => { i.supRank = k + 1; });
    d._supN = ranked.length;
    d._sup = S;
  }

  // ---------- 세부 산업 순위표의 '수급' 칸
  function tip(i) {
    const s = i.sup;
    if (!s) return "수급 자료 없음";
    return `20일 수급 강도 ${pct(s.pct20)} (산업 중 ${i.supRank ?? "–"}위) · 5일 ${pct(s.pct5)} · 20일 외국인 ${won(s.f20)}, 기관 ${won(s.i20)}, 개인 ${won(s.p20)} · 20일 동안 산 종목 ${s.buy20 ?? "–"}%`;
  }
  function cell(i) {
    const s = i.sup;
    if (!s || s.pct20 == null) return `<span class="rsub">–</span>`;
    return `<div class="sup-cell" title="${esc(tip(i))}"><b class="ret ${cls(s.pct20)}">${pct(s.pct20)}</b><span class="rsub">사는 종목 ${s.buy20 ?? "–"}%</span>${chip(i.supJ, true)}</div>`;
  }
  function card(i) {
    const s = i.sup;
    if (!s || s.pct20 == null) return "";
    return `<div class="rc5"><em>수급 20일</em><b class="ret ${cls(s.pct20)}">${pct(s.pct20)}</b><span class="rc-dist">외국인 <b class="ret ${cls(s.f20)}">${won(s.f20)}</b>, 기관 <b class="ret ${cls(s.i20)}">${won(s.i20)}</b>, 사는 종목 ${s.buy20 ?? "–"}%</span>${chip(i.supJ, true)}</div>`;
  }

  // ---------- 종목 칸 (RS 강한 종목 표, 상세 창 구성 종목 표)
  function stockCell(m) {
    const s = m.sup;
    if (!s || s.pct20 == null) return `<span class="rsub">–</span>`;
    return `<div class="sup-cell" title="20일 외국인 ${won(s.f20)}, 기관 ${won(s.i20)} · 시가총액 대비 ${pct(s.pct20)}${s.blk && s.blk.length ? " · 대량 블록거래일은 강도 계산에서 뺐어요" : ""}"><b class="ret ${cls(s.pct20)}">${pct(s.pct20)}</b>${streak(s.fs, "외") || streak(s.is, "기")}</div>`;
  }
  const memberHead = () => `<th class="num" title="외국인 최근 5거래일 순매수(억 원, 추정)">외국인 5일</th><th class="num" title="기관 최근 5거래일 순매수(억 원, 추정)">기관 5일</th>`;
  function memberCols(m) {
    const s = m.sup;
    if (!s) return `<td class="num"><span class="rsub">–</span></td><td class="num"><span class="rsub">–</span></td>`;
    const one = (v, run, who) => `<td class="num"><span class="ret ${cls(v)}">${won(v)}</span>${streak(run, who)}</td>`;
    return one(s.f5, s.fs, "") + one(s.i5, s.is, "");
  }
  const blockMark = (m) => m.sup && m.sup.blk && m.sup.blk.length ? `<span class="sup-blk" title="${m.sup.blk.map(md).join(", ")}에 기타법인과 큰 덩어리를 주고받은 거래(블록딜·지분 이동)가 있었어요. 시장에서 사 모은 돈이 아니라서 수급 강도 계산에서는 그날을 뺐어요.">⚑ 블록거래</span>` : "";

  // ---------- 오늘의 신호에 붙는 줄
  const signalRow = () => ({ title: "수급 신호", groups: [
    { t: "수급 동행", c: "var(--up)", help: J.dong.help },
    { t: "매집 의심", c: "var(--accent)", help: J.mae.help },
    { t: "수급 이탈", c: "var(--down)", help: J.itl.help },
  ] });

  // ---------- 상세 창
  function drawer(it, d) {
    const box = document.getElementById("dSupply");
    if (!box) return;
    const s = it.sup, S = d._sup;
    box.hidden = !(d.market === "KR" && s);
    if (box.hidden) return;
    const row = (name, k, extra = "") => `<tr${extra}><td><b>${name}</b></td>${["1", "5", "20", "60"].map((n) => {
      const v = k === "fi" ? (s["f" + n] == null || s["i" + n] == null ? null : s["f" + n] + s["i" + n]) : s[k + n];
      return `<td class="num"><span class="ret ${cls(v)}">${won(v)}</span></td>`;
    }).join("")}</tr>`;
    const j = it.supJ;
    const runTxt = s.run ? `외국인+기관 합계로 <b>${Math.abs(s.run)}일 연속 ${s.run > 0 ? "순매수" : "순매도"}</b>` : "";
    const nBuy = s.buy20 == null ? "–" : Math.round(s.buy20 * s.n / 100);
    const blk = (it.members || []).filter((m) => m.sup && m.sup.blk && m.sup.blk.length);
    document.getElementById("dSupHead").innerHTML = `
      <div class="sup-verdict ${j ? J[j].c : ""}">
        <div class="sv-l">${j ? `<b>${J[j].e} ${J[j].t}</b><span>${esc(J[j].help)}</span>` : `<b>뚜렷한 판정 없음</b><span>가격과 수급 중 하나가 중간이에요. 아래 숫자와 그래프로 흐름만 확인하세요.</span>`}</div>
        <div class="sv-r">
          <div><em>수급 강도 20일</em><b class="ret ${cls(s.pct20)}">${pct(s.pct20)}</b><small>산업 ${d._supN ?? "–"}개 중 ${it.supRank ?? "–"}위</small></div>
          <div><em>수급 강도 5일</em><b class="ret ${cls(s.pct5)}">${pct(s.pct5)}</b><small>최근 흐름</small></div>
          <div><em>20일 동안 산 종목</em><b>${nBuy} / ${s.n}</b><small>외국인+기관 순매수 종목</small></div>
        </div>
      </div>
      ${runTxt ? `<p class="sup-line">${runTxt}이에요.</p>` : ""}`;
    document.getElementById("dSupTable").innerHTML = `<table class="mem-table sup-table"><thead><tr><th>투자자</th><th class="num">${md(S.basis_date)} 하루</th><th class="num">5일</th><th class="num">20일</th><th class="num">60일</th></tr></thead><tbody>
      ${row("외국인", "f")}${row("기관", "i")}${row("외국인+기관", "fi", ' class="sum"')}${row("개인", "p")}</tbody></table>`;
    document.getElementById("dSupNote").innerHTML = `단위 억 원, 구성 종목 합계예요. 네이버 순매수 수량에 그날 종가를 곱한 추정치라 실제 금액과 몇 % 다를 수 있어요. 기준일 ${esc(S.basis_date)}.`
      + (blk.length ? ` <b>⚑ 블록거래</b>: ${blk.map((m) => `${esc(m.name)} ${m.sup.blk.map(md).join(", ")}`).join(" / ")}. 기타법인과 큰 덩어리를 주고받은 날이라 합계에는 들어 있지만 수급 강도 계산에서는 뺐어요.` : "");
    document.getElementById("dSupChart").innerHTML = `<p class="rsub">그래프 준비 중…</p>`;
  }

  // 위: 바구니 지수 + 50일선 / 아래: 외국인·기관·개인 누적 순매수. 날짜축을 같이 쓴다.
  function chart(it, d, series) {
    const el = document.getElementById("dSupChart");
    const S = d._sup, s = it.sup;
    if (!el || !S || !s || !s.daily) return;
    const dates = S.dates, n = dates.length;
    if (n < 10) { el.innerHTML = `<p class="rsub">기록이 ${n}거래일뿐이라 그래프는 조금 더 쌓인 뒤 보여 드려요.</p>`; return; }
    const ix = series ? new Map(series.dates.map((t, k) => [t, k])) : new Map();
    const sc = series && series.items[it.id];
    const px = dates.map((t) => { const k = ix.get(t); return sc && k != null ? sc.close[k] : null; });
    const pma = dates.map((t) => { const k = ix.get(t); return sc && k != null ? sc.ma50[k] : null; });
    const cum = (a) => { let c = 0; return a.map((v) => (c += v || 0)); };
    const F = cum(s.daily.f), I = cum(s.daily.i), P = cum(s.daily.p);
    const small = innerWidth < 640;
    const W = small ? 360 : 640, L = small ? 46 : 56, R = 10, T1 = 8, H1 = small ? 96 : 110, GAP = 26, H2 = small ? 130 : 150, B = 24;
    const T2 = T1 + H1 + GAP, H = T2 + H2 + B;
    const x = (k) => L + (W - L - R) * k / (n - 1);
    const rng = (arrs, padR = 0.08) => { const v = arrs.flat().filter((z) => z != null); let lo = Math.min(...v), hi = Math.max(...v); const p = (hi - lo) * padR || Math.abs(hi) * 0.05 || 1; return [lo - p, hi + p]; };
    const [plo, phi] = rng([px, pma]);
    const [clo0, chi0] = rng([F, I, P]);
    const clo = Math.min(clo0, 0), chi = Math.max(chi0, 0);
    const yP = (v) => T1 + H1 * (1 - (v - plo) / (phi - plo));
    const yC = (v) => T2 + H2 * (1 - (v - clo) / (chi - clo));
    const path = (arr, y) => { let p = "", pen = false; arr.forEach((v, k) => { if (v == null) { pen = false; return; } p += (pen ? "L" : "M") + x(k).toFixed(1) + "," + y(v).toFixed(1); pen = true; }); return p; };
    let g = "";
    for (let k = 0; k <= 3; k++) {
      const v = plo + (phi - plo) * k / 3, yy = yP(v).toFixed(1);
      g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="var(--grid)"/><text x="${L - 6}" y="${+yy + 3.5}" text-anchor="end" font-size="10.5" fill="var(--muted)">${v.toFixed(0)}</text>`;
    }
    // 아래 칸 눈금은 0을 지나는 깔끔한 숫자(100억, 500억, 1,000억 …)로
    const raw = (chi - clo) / 4, mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= raw) || raw;
    for (let v = Math.ceil(clo / step) * step; v <= chi + 1e-9; v += step) {
      const yy = yC(v).toFixed(1);
      g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="var(--grid)"/><text x="${L - 6}" y="${+yy + 3.5}" text-anchor="end" font-size="10.5" fill="var(--muted)">${Math.abs(v) < step / 1e6 ? "0" : won(v).replace("+", "")}</text>`;
    }
    let xt = "", lastM = "";
    dates.forEach((t, k) => {
      const m = t.slice(0, 7);
      if (m !== lastM && lastM) { const xx = x(k).toFixed(1); xt += `<line x1="${xx}" x2="${xx}" y1="${T1}" y2="${T2 + H2}" stroke="var(--grid)" stroke-dasharray="2 3"/><text x="${xx}" y="${H - 7}" text-anchor="middle" font-size="10.5" fill="var(--muted)">${+t.slice(5, 7)}월</text>`; }
      lastM = m;
    });
    const zero = yC(0).toFixed(1);
    const C = { f: "var(--sup-f)", i: "var(--sup-i)", p: "var(--sup-p)" };
    el.innerHTML = `<div class="chart-legend sup-lg" id="supLg"></div>
      <svg viewBox="0 0 ${W} ${H}" class="sup-svg" role="img" aria-label="${esc(it.name)} 바구니 지수와 투자자별 누적 순매수">
        ${g}${xt}
        <text x="${L}" y="${T1 + 10}" font-size="11" fill="var(--ink-2)" font-weight="700" dx="4">바구니 지수</text>
        <text x="${L}" y="${T2 + 10}" font-size="11" fill="var(--ink-2)" font-weight="700" dx="4">누적 순매수 (${md(dates[0])}부터)</text>
        <line x1="${L}" x2="${W - R}" y1="${zero}" y2="${zero}" stroke="var(--muted)" stroke-width="1"/>
        <line x1="${L}" x2="${L}" y1="${T1}" y2="${T1 + H1}" stroke="var(--muted)"/><line x1="${L}" x2="${L}" y1="${T2}" y2="${T2 + H2}" stroke="var(--muted)"/>
        <line x1="${L}" x2="${W - R}" y1="${T2 + H2}" y2="${T2 + H2}" stroke="var(--muted)"/>
        <path d="${path(pma, yP)}" fill="none" stroke="var(--ma50)" stroke-width="1.4" stroke-dasharray="5 3"/>
        <path d="${path(px, yP)}" fill="none" stroke="var(--price)" stroke-width="1.8"/>
        <path d="${path(P, yC)}" fill="none" stroke="${C.p}" stroke-width="1.5" stroke-dasharray="4 3"/>
        <path d="${path(I, yC)}" fill="none" stroke="${C.i}" stroke-width="2"/>
        <path d="${path(F, yC)}" fill="none" stroke="${C.f}" stroke-width="2"/>
        <line id="supCur" x1="0" x2="0" y1="${T1}" y2="${T2 + H2}" stroke="var(--ink-2)" stroke-width="1" opacity="0"/>
        <rect x="${L}" y="${T1}" width="${W - L - R}" height="${T2 + H2 - T1}" fill="transparent" id="supHit"/>
      </svg>`;
    const lg = el.querySelector("#supLg"), cur = el.querySelector("#supCur"), svg = el.querySelector("svg");
    const draw = (k) => {
      lg.innerHTML = `<span class="sup-date">${k == null ? "최근" : md(dates[k])}</span>`
        + `<span><i style="background:var(--price)"></i>지수 <b class="tnum">${(k == null ? px.filter((v) => v != null).at(-1) : px[k])?.toFixed(1) ?? "–"}</b></span>`
        + `<span><i style="background:var(--ma50)"></i>50일선</span>`
        + [["외국인", F, C.f], ["기관", I, C.i], ["개인", P, C.p]].map(([nm, a, c]) => `<span><i style="background:${c}"></i>${nm} <b class="tnum ret ${cls(a[k ?? n - 1])}">${won(a[k ?? n - 1])}</b></span>`).join("");
    };
    draw(null);
    const move = (e) => {
      const r = svg.getBoundingClientRect(), vx = (e.clientX - r.left) / r.width * W;
      const k = Math.max(0, Math.min(n - 1, Math.round((vx - L) / (W - L - R) * (n - 1))));
      cur.setAttribute("x1", x(k)); cur.setAttribute("x2", x(k)); cur.setAttribute("opacity", ".5"); draw(k);
    };
    const hit = el.querySelector("#supHit");
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", () => { cur.setAttribute("opacity", "0"); draw(null); });
  }

  const tableNote = (d) => d && d._sup ? ` <b>수급</b> 칸의 큰 숫자는 최근 20거래일 외국인+기관 순매수가 시가총액의 몇 %인지(구성 종목 평균), 작은 글씨는 그 기간에 외국인+기관이 순매수한 종목 비율이에요. 🔥⚠️👀❄️ 판정은 '읽는 법'의 수급 설명을 보세요. 수급 기준일 ${esc(d._sup.basis_date)}.` : "";

  window.__supply = {
    attach, judge, cell, card, stockCell, memberHead, memberCols, blockMark, signalRow, drawer, chart, tableNote,
    reload() { st.data = null; st.stamp = Date.now(); },
  };
})();
