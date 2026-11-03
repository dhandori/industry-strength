/* 매크로 탭 '투자 심리'에 붙는 풋콜레이시오 카드 (2026-11-04)
   자료: data/putcall.json — scripts/putcall.py 가 Cboe 일일 통계로 만든다(2006-11부터, 매일).
   macro.js 는 투자 심리 묶음을 그릴 때 window.__pc.card() 만 부른다. 자료가 오면 매크로 탭을 다시 그린다.
   판정은 10일 평균이 최근 5년 중 몇 % 위치인지로(풋이 많을수록 겁먹은 상태 — 극단은 흔히 역발상 신호). */
(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const col = (lv) => `var(--mx${lv || 0})`;
  const st = { d: null, sp: 200 };
  const SP = [[20, "20일"], [60, "60일"], [200, "200일"], [500, "2년"], [1260, "5년"], [0, "전체"]];
  const ma = (v, n) => v.map((_, i) => i < n - 1 ? null : v.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n);
  const md = (d) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;

  fetch("data/putcall.json?v=" + Date.now(), { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((j) => {
    if (!j || !j.equity || !j.equity.length) return;
    st.d = j;
    window.__macro && window.__macro.rerender();
  }).catch(() => {});

  function chart(E, M) {
    const n = st.sp && E.length > st.sp ? st.sp + 1 : E.length, off = E.length - n;
    const s = E.slice(off), m = M.slice(off);
    const small = innerWidth < 640, W = small ? 360 : 600, H = small ? 190 : 200, L = 40, R = 10, T = 10, B = 26;
    const vs = s.map((p) => p[1]), mv = m.filter((v) => v != null);
    // 연말 배당 거래 등으로 하루만 2배 넘게 튀는 날이 있어(2022년 말 등) 위쪽은 99.5% 값에서 잘라 그린다(그 날은 위 끝에 붙음)
    const srt = vs.slice().sort((a, b) => a - b), cap = srt[Math.floor((srt.length - 1) * 0.995)];
    let lo = Math.min(...vs, ...mv), hi = Math.max(cap, ...mv);
    const clipped = vs.some((v) => v > hi);
    const pad = (hi - lo) * 0.08 || 0.05; lo -= pad; hi += pad;
    const x = (i) => L + (W - L - R) * i / (s.length - 1), y = (v) => T + (H - T - B) * (1 - (Math.min(v, hi) - lo) / (hi - lo));
    const path = (a) => { let d = "", pen = false; a.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1); pen = true; }); return d; };
    let g = "";
    for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4, yy = y(v).toFixed(1); g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="var(--grid)"/><text x="${L - 6}" y="${+yy + 3.5}" text-anchor="end" font-size="11" fill="var(--muted)">${v.toFixed(2)}</text>`; }
    // 기준선: 최근 5년 10일 평균의 상위 10%(겁먹음)·하위 10%(들뜸)
    for (const [v, t] of [[st.hi, "겁먹음"], [st.lo, "들뜸"]]) if (v > lo && v < hi) g += `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--mx2)" stroke-dasharray="3 3" opacity=".8"/><text x="${W - R - 2}" y="${(y(v) - 3).toFixed(1)}" text-anchor="end" font-size="10.5" fill="var(--mx2)">${t} ${v.toFixed(2)}</text>`;
    const ds = s.map((p) => p[0]), yrs = (Date.parse(ds.at(-1)) - Date.parse(ds[0])) / 3.156e10;
    const tick = (i, t) => { const xx = x(i).toFixed(1), end = W - R - x(i) < 18; return `<line x1="${xx}" x2="${xx}" y1="${H - B}" y2="${H - B + 4}" stroke="var(--muted)"/><text x="${end ? W - R : xx}" y="${H - 8}" text-anchor="${end ? "end" : "middle"}" font-size="11" fill="var(--muted)">${t}</text>`; };
    let xt = "";
    if (s.length <= 80) { const k = Math.max(1, Math.ceil(s.length / (small ? 4 : 7))); for (let i = s.length - 1; i >= 0; i -= k) if (x(i) - L > 14) xt += tick(i, md(ds[i])); }
    else { const every = yrs > 12 ? 4 : yrs > 6 ? 2 : yrs > 2.5 ? 1 : 0; let last = "";
      ds.forEach((d, i) => { const key = every ? d.slice(0, 4) : d.slice(0, 7); if (key === last) return; const show = last && (every ? +d.slice(0, 4) % every === 0 : (+d.slice(5, 7) - 1) % (yrs > 1.2 ? (small ? 6 : 3) : (small ? 3 : 2)) === 0); last = key; if (show) xt += tick(i, every ? d.slice(0, 4) : `${d.slice(2, 4)}.${d.slice(5, 7)}`); }); }
    const mini = `<span class="mx-mini" role="group" aria-label="이 그래프 기간">${SP.map(([k, t]) => `<button type="button" data-pcsp="${k}" aria-pressed="${st.sp === k}">${t}</button>`).join("")}</span>`;
    const title = st.sp && n === st.sp + 1 ? (st.sp >= 500 ? `최근 ${Math.round(st.sp / 250)}년 흐름` : `최근 ${st.sp}거래일 흐름`) : `${ds[0].slice(0, 4)}년부터 흐름`;
    return `<div class="mx-chart" id="pcChart">${mini}<div class="mx-chart-t">${title} <span>${ds[0].slice(2).replace(/-/g, ".")} ~ ${ds.at(-1).slice(2).replace(/-/g, ".")}</span></div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="주식 풋콜레이시오 추이">${g}<line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="var(--muted)"/>${xt}
      <path d="${path(vs)}" fill="none" stroke="var(--muted)" stroke-width="${s.length > 600 ? 0.7 : 1.1}" opacity=".85"/>
      <path d="${path(m)}" fill="none" stroke="var(--price)" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="${x(s.length - 1)}" cy="${y(vs.at(-1))}" r="4" fill="${st.dot}" stroke="var(--surface)" stroke-width="2"/></svg>
      <div class="chart-legend"><span><i style="background:var(--muted)"></i>매일 값</span><span><i style="background:var(--price)"></i>10일 평균</span><span><i style="background:var(--mx2)"></i>최근 5년 10일 평균 상·하위 10%</span>${clipped ? `<span class="muted">유난히 튄 날은 위 끝에 붙여 그렸어요</span>` : ""}</div></div>`;
  }

  function card() {
    if (!st.d) return "";
    const E = st.d.equity, v = E.map((p) => p[1]), M = ma(v, 10);
    const last = E.at(-1), m10 = M.at(-1);
    // 최근 5년(약 1,260거래일) 10일 평균 분포에서 지금 위치
    const win = M.slice(-1260).filter((x) => x != null).sort((a, b) => a - b);
    const q = (p) => win[Math.min(win.length - 1, Math.floor(win.length * p))];
    st.hi = q(0.9); st.lo = q(0.1);
    const rank = Math.round(win.filter((x) => x <= m10).length / win.length * 100);
    const lv = rank >= 90 ? [2, "겁먹음(드문 수준)"] : rank >= 75 ? [3, "불안"] : rank > 25 ? [5, "보통"] : rank > 10 ? [4, "낙관"] : [3, "들뜸(탐욕)"];
    st.dot = col(lv[0]);
    const T = st.d.total || [], tl = T.at(-1);
    const prev = E.at(-2);
    const dv = prev ? last[1] - prev[1] : null;
    const dayRank = Math.round(v.slice(-1260).filter((x) => x <= last[1]).length / Math.min(1260, v.length) * 100);
    return `<article class="card mx-card" style="--c:${col(lv[0])}">
      <div class="mx-head"><div><div class="mx-name">주식 풋콜레이시오 (Cboe Equity Put/Call)</div><div class="mx-dir">📈 높을수록 겁먹음 · 극단은 역발상 신호</div></div><span class="mx-chip" style="--c:${col(lv[0])}">${lv[1]}</span></div>
      <div class="mx-val"><b>${last[1].toFixed(2)}</b><span class="ec-date">${md(last[0])}</span>${dv == null ? "" : `<span class="mx-chg ${Math.abs(dv) < 0.005 ? "flat" : dv > 0 ? "worse" : "better"}"><small>전날보다</small>${dv > 0 ? "+" : dv < 0 ? "−" : ""}${Math.abs(dv).toFixed(2)}</span>`}</div>
      <div class="ec-chs"><span class="ec-ch">10일 평균 <b>${m10.toFixed(2)}</b> · 최근 5년 중 지금보다 낮았던 때 <b>${rank}%</b></span><span class="ec-ch">오늘 값은 5년 중 ${dayRank}% 위치</span>${tl ? `<span class="ec-ch">전체 상품(지수·ETF 포함) ${tl[1].toFixed(2)}</span>` : ""}</div>
      ${chart(E, M)}
      <div class="mx-why"><b>무엇인가요?</b> 개별 주식 옵션에서 하락에 거는 풋 거래량을 상승에 거는 콜 거래량으로 나눈 값이에요. 높을수록 겁먹은 투자자가 많다는 뜻이고, 하루하루 출렁임이 커서 10일 평균으로 흐름을 봐요. 너무 높을 때(모두가 겁먹음)는 바닥, 너무 낮을 때(모두가 들뜸)는 고점 근처였던 경우가 많아 <b>반대로 읽는</b> 지표로 써요. 자료: Cboe Options 거래소 일일 통계(장 마감 뒤 공개). Barchart의 $CPCS 등 다른 사이트 값은 집계 범위가 달라 숫자가 조금 다를 수 있어요.</div>
      <div class="mx-foot">자료 날짜 ${esc(last[0])} · 2006년 11월부터</div></article>`;
  }

  // 그래프 기간 단추: 이 카드의 그래프만 다시 그린다
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pcsp]");
    if (!b || !st.d) return;
    st.sp = +b.dataset.pcsp;
    const box = document.getElementById("pcChart");
    if (!box) return;
    const v = st.d.equity.map((p) => p[1]);
    box.outerHTML = chart(st.d.equity, ma(v, 10));
  });

  window.__pc = { card };
})();
