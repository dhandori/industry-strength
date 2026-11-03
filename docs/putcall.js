/* 매크로 탭 '투자 심리'에 붙는 풋콜레이시오 카드 (2026-11-04)
   자료 두 가지(scripts/putcall_occ.py · scripts/putcall.py, us-econ.yml이 매일)
   - data/putcall_occ.json : 미국 옵션 거래소 20곳 전체(OCC 집계)의 개별 주식 풋콜 — 기본, 최근 2년(+매일 쌓임)
                             Barchart $CPCS 같은 '시장 전체' 흐름에 가깝다
   - data/putcall.json     : Cboe 거래소 한 곳의 공식 주식 풋콜 — 2006년부터라 장기 비교용
   macro.js 는 투자 심리 묶음을 그릴 때 window.__pc.card() 만 부른다. 자료가 오면 매크로 탭을 다시 그린다.
   판정은 10일 평균이 그 자료 기간(미국 전체 2년 · Cboe 5년) 중 몇 % 위치인지로. */
(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const col = (lv) => `var(--mx${lv || 0})`;
  const st = { us: null, cb: null, src: "us", sp: { us: 0, cb: 1260 } };
  const SP = { us: [[20, "20일"], [60, "60일"], [200, "200일"], [0, "2년 전체"]], cb: [[200, "200일"], [500, "2년"], [1260, "5년"], [0, "2006년~"]] };
  const ma = (v, n) => v.map((_, i) => i < n - 1 ? null : v.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n);
  const md = (d) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
  const ymd = (d) => `${d.slice(0, 4)}년 ${+d.slice(5, 7)}월`;
  const load = (u, k, f) => fetch(u + "?v=" + Date.now(), { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((j) => {
    const s = j && f(j);
    if (!s || s.length < 30) return;
    st[k] = s;
    window.__macro && window.__macro.rerender();
  }).catch(() => {});
  load("data/putcall_occ.json", "us", (j) => j.stock);
  load("data/putcall.json", "cb", (j) => j.equity);

  // 한 자료의 판정 재료: 10일 평균, 기간 중 위치, 상·하위 10%/25% 경계
  function stats(E, win) {
    const v = E.map((p) => p[1]), M = ma(v, 10);
    const w = M.slice(-win).filter((x) => x != null).sort((a, b) => a - b);
    const q = (p) => w[Math.min(w.length - 1, Math.floor(w.length * p))];
    const m10 = M.at(-1), rank = Math.round(w.filter((x) => x <= m10).length / w.length * 100);
    return { v, M, m10, rank, q10: q(0.1), q25: q(0.25), q50: q(0.5), q75: q(0.75), q90: q(0.9) };
  }
  const levelOf = (rank) => rank >= 90 ? [2, "겁먹음(드문 수준)"] : rank >= 75 ? [3, "불안"] : rank > 25 ? [5, "보통"] : rank > 10 ? [4, "낙관"] : [3, "들뜸(탐욕)"];
  const sayOf = (rank) => rank >= 90 ? "옵션 투자자들이 <b>하락에 크게 대비</b>하는 드문 상태예요. 역사적으로 이런 때는 겁이 너무 많아 <b>바닥 근처</b>였던 경우가 많았어요(역발상 매수 관심 구간). 다만 하락장 한가운데서도 나오니, 지수가 다시 오르기 시작하는지 함께 보세요."
    : rank >= 75 ? "평소보다 <b>하락 대비(풋)가 많은</b> 조심스러운 분위기예요. 겁이 조금 많은 쪽이라, 시장이 버티면 오히려 반등 재료가 되곤 해요."
    : rank > 25 ? "풋과 콜이 <b>평소 비율</b>이에요. 투자 심리가 한쪽으로 쏠리지 않은 보통 상태예요."
    : rank > 10 ? "상승에 거는 콜이 평소보다 많아 <b>낙관적인</b> 분위기예요. 추세가 좋을 땐 자연스럽지만, 들뜸이 더 심해지는지 지켜볼 때예요."
    : "모두가 상승에만 베팅하는 <b>들뜬(탐욕) 상태</b>예요. 역사적으로 이런 때는 단기 <b>고점 근처</b>였던 경우가 많아, 새로 사기보다 이익 관리를 생각해 볼 구간이에요.";

  function chart(E, S, k) {
    const sp = st.sp[k], n = sp && E.length > sp ? sp + 1 : E.length, off = E.length - n;
    const s = E.slice(off), m = S.M.slice(off);
    const small = innerWidth < 640, W = small ? 360 : 600, H = small ? 200 : 210, L = 40, R = 10, T = 10, B = 26;
    const vs = s.map((p) => p[1]), mv = m.filter((v) => v != null);
    // 연말 배당 거래 등으로 하루만 2배 넘게 튀는 날이 있어 위쪽은 99.5% 값에서 잘라 그린다(그 날은 위 끝에 붙음)
    const srt = vs.slice().sort((a, b) => a - b), cap = srt[Math.floor((srt.length - 1) * 0.995)];
    let lo = Math.min(...vs, ...mv, S.q10), hi = Math.max(cap, ...mv, S.q90);
    const clipped = vs.some((v) => v > hi);
    const pad = (hi - lo) * 0.06 || 0.05; lo -= pad; hi += pad;
    const x = (i) => L + (W - L - R) * i / Math.max(1, s.length - 1), y = (v) => T + (H - T - B) * (1 - (Math.min(v, hi) - lo) / (hi - lo));
    const path = (a) => { let d = "", pen = false; a.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1); pen = true; }); return d; };
    // 바탕 띠: 위 10% = 겁먹음(빨강), 아래 10% = 들뜸(주황)
    let g = `<rect x="${L}" y="${T}" width="${W - L - R}" height="${Math.max(0, y(S.q90) - T).toFixed(1)}" fill="var(--mx2)" opacity=".09"/>
      <rect x="${L}" y="${y(S.q10).toFixed(1)}" width="${W - L - R}" height="${Math.max(0, H - B - y(S.q10)).toFixed(1)}" fill="var(--mx3)" opacity=".12"/>`;
    for (let i = 0; i <= 4; i++) { const v = lo + (hi - lo) * i / 4, yy = y(v).toFixed(1); g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="var(--grid)"/><text x="${L - 6}" y="${+yy + 3.5}" text-anchor="end" font-size="11" fill="var(--muted)">${v.toFixed(2)}</text>`; }
    g += `<text x="${W - R - 4}" y="${T + 13}" text-anchor="end" font-size="10.5" font-weight="700" fill="var(--mx2)">겁먹음 구간 ${S.q90.toFixed(2)}↑</text><text x="${W - R - 4}" y="${H - B - 5}" text-anchor="end" font-size="10.5" font-weight="700" fill="var(--mx3)">들뜸 구간 ${S.q10.toFixed(2)}↓</text>`;
    const ds = s.map((p) => p[0]), yrs = (Date.parse(ds.at(-1)) - Date.parse(ds[0])) / 3.156e10;
    const tick = (i, t) => { const xx = x(i).toFixed(1), end = W - R - x(i) < 18; return `<line x1="${xx}" x2="${xx}" y1="${H - B}" y2="${H - B + 4}" stroke="var(--muted)"/><text x="${end ? W - R : xx}" y="${H - 8}" text-anchor="${end ? "end" : "middle"}" font-size="11" fill="var(--muted)">${t}</text>`; };
    let xt = "";
    if (s.length <= 80) { const j = Math.max(1, Math.ceil(s.length / (small ? 4 : 7))); for (let i = s.length - 1; i >= 0; i -= j) if (x(i) - L > 14) xt += tick(i, md(ds[i])); }
    else { const every = yrs > 12 ? 4 : yrs > 6 ? 2 : yrs > 2.5 ? 1 : 0; let last = "";
      ds.forEach((d, i) => { const key = every ? d.slice(0, 4) : d.slice(0, 7); if (key === last) return; const show = last && (every ? +d.slice(0, 4) % every === 0 : (+d.slice(5, 7) - 1) % (yrs > 1.2 ? (small ? 6 : 3) : (small ? 3 : 2)) === 0); last = key; if (show) xt += tick(i, every ? d.slice(0, 4) : `${d.slice(2, 4)}.${d.slice(5, 7)}`); }); }
    const srcB = `<span class="mx-mini pc-src" role="group" aria-label="자료">${[["us", "미국 전체"], ["cb", "Cboe 장기"]].filter(([kk]) => st[kk]).map(([kk, t]) => `<button type="button" data-pcsrc="${kk}" aria-pressed="${k === kk}">${t}</button>`).join("")}</span>`;
    const mini = `<span class="mx-mini" role="group" aria-label="이 그래프 기간">${SP[k].map(([kk, t]) => `<button type="button" data-pcsp="${kk}" aria-pressed="${sp === kk}">${t}</button>`).join("")}</span>`;
    const title = (k === "us" ? "미국 전체 거래소" : "Cboe 거래소") + " · " + (sp && n === sp + 1 ? (sp >= 500 ? `최근 ${Math.round(sp / 250)}년` : `최근 ${sp}거래일`) : `${ds[0].slice(0, 4)}년부터`);
    return `<div class="mx-chart" id="pcChart"><div class="pc-btns">${srcB}${mini}</div><div class="mx-chart-t">${title} <span>${ds[0].slice(2).replace(/-/g, ".")} ~ ${ds.at(-1).slice(2).replace(/-/g, ".")}</span></div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="주식 풋콜레이시오 추이">${g}<line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="var(--muted)"/>${xt}
      <path d="${path(vs)}" fill="none" stroke="var(--muted)" stroke-width="${s.length > 600 ? 0.7 : 1.1}" opacity=".8"/>
      <path d="${path(m)}" fill="none" stroke="var(--price)" stroke-width="2.2" stroke-linejoin="round"/>
      <circle cx="${x(s.length - 1)}" cy="${y(S.M.at(-1))}" r="4.5" fill="${col(levelOf(S.rank)[0])}" stroke="var(--surface)" stroke-width="2"/></svg>
      <div class="chart-legend"><span><i style="background:var(--muted)"></i>매일 값</span><span><i style="background:var(--price)"></i>10일 평균(판정 기준)</span>${clipped ? `<span class="muted">유난히 튄 날은 위 끝에 붙여 그렸어요</span>` : ""}</div></div>`;
  }

  // Cboe 장기 자료에서 10일 평균이 가장 높았던 때(서로 반년 넘게 떨어진 상위 4번) — "겁먹음이 이 정도였을 때"의 예
  function peaks() {
    if (!st.cb) return "";
    const E = st.cb.filter((p) => p[0] >= "2010-01-01"), M = ma(E.map((p) => p[1]), 10), out = [];
    const idx = M.map((v, i) => [v, i]).filter(([v]) => v != null).sort((a, b) => b[0] - a[0]);
    for (const [v, i] of idx) { if (out.length >= 4) break; if (out.every((o) => Math.abs(o.i - i) > 125)) out.push({ v, i, d: E[i][0] }); }
    return out.sort((a, b) => a.d.localeCompare(b.d)).map((o) => `${ymd(o.d)} ${o.v.toFixed(2)}`).join(" · ");
  }

  function card() {
    const k = st.src === "us" && st.us ? "us" : st.cb ? "cb" : null;
    if (!k) return "";
    const E = st[k], S = stats(E, k === "us" ? 600 : 1260), lv = levelOf(S.rank);
    const last = E.at(-1), prev = E.at(-2), dv = prev ? last[1] - prev[1] : null;
    const base = k === "us" ? "최근 2년" : "최근 5년";
    const other = k === "us" ? st.cb && st.cb.at(-1) : st.us && st.us.at(-1);
    const otherTxt = other ? (k === "us" ? `Cboe 한 곳만 세면 ${other[1].toFixed(2)}(${md(other[0])})` : `미국 전체로 세면 ${other[1].toFixed(2)}(${md(other[0])})`) : "";
    const pk = peaks();
    const row = (c, t, r, d) => `<tr><td><span class="pc-sw" style="background:${c}"></span><b>${t}</b></td><td class="num">${r}</td><td>${d}</td></tr>`;
    return `<article class="card mx-card pc-card" style="--c:${col(lv[0])}">
      <div class="mx-head"><div><div class="mx-name">주식 풋콜레이시오 (옵션 시장의 겁먹은 정도)</div><div class="mx-dir">📈 높을수록 겁먹음 · 너무 높거나 낮으면 반대로 읽기</div></div><span class="mx-chip" style="--c:${col(lv[0])}">${lv[1]}</span></div>
      <div class="mx-val"><b>${S.m10.toFixed(2)}</b><span class="ec-date">10일 평균 · ${md(last[0])}</span><span class="mx-chg flat"><small>그날 하루</small>${last[1].toFixed(2)}${dv == null ? "" : ` (${dv > 0 ? "+" : dv < 0 ? "−" : ""}${Math.abs(dv).toFixed(2)})`}</span></div>
      <p class="pc-say">${sayOf(S.rank)} <span class="muted">(${base} 중 지금보다 낮았던 때 ${S.rank}%)</span></p>
      ${chart(E, S, k)}
      <div class="pc-edu">
        <h4>이게 뭔가요? — 3줄 요약</h4>
        <ol>
          <li><b>콜 옵션</b> = 주가가 <b>오르면</b> 돈을 버는 표, <b>풋 옵션</b> = 주가가 <b>내리면</b> 돈을 버는 표(하락 보험)예요.</li>
          <li><b>풋콜레이시오 = 풋 거래량 ÷ 콜 거래량.</b> 0.6이면 콜 10장 거래될 때 풋이 6장 거래됐다는 뜻이에요. 1을 넘으면 풋이 더 많아요.</li>
          <li>숫자가 <b>오르면 겁먹은 사람이 늘어난 것</b>, 내리면 들뜬 사람이 늘어난 거예요.</li>
        </ol>
        <h4>어떻게 써먹나요? — 반대로 읽기</h4>
        <p>군중은 바닥에서 가장 겁먹고, 꼭대기에서 가장 들떠요. 그래서 풋콜은 <b>극단일 때 반대로</b> 읽어요. 아주 높으면(모두 하락 대비) 팔 사람이 이미 다 팔아 바닥 근처인 경우가 많았고, 아주 낮으면(모두 상승 베팅) 살 사람이 이미 다 사서 고점 근처인 경우가 많았어요.${pk ? ` Cboe 기록으로 10일 평균이 가장 높았던 때는 <b>${pk}</b>예요(대부분 급락장 한가운데나 막바지).` : ""}</p>
        <h4>숫자 기준 (${k === "us" ? "미국 전체 거래소" : "Cboe"} · 10일 평균 · ${base} 기준)</h4>
        <div class="ai-tw"><table class="mem-table pc-tbl"><thead><tr><th>상태</th><th class="num">10일 평균</th><th>뜻</th></tr></thead><tbody>
          ${row("var(--mx2)", "겁먹음", `${S.q90.toFixed(2)} 이상`, "상위 10% · 바닥 신호 후보")}
          ${row("var(--mx3)", "불안", `${S.q75.toFixed(2)}~${S.q90.toFixed(2)}`, "조심스러운 분위기")}
          ${row("var(--mx5)", "보통", `${S.q25.toFixed(2)}~${S.q75.toFixed(2)}`, "쏠림 없음")}
          ${row("var(--mx4)", "낙관", `${S.q10.toFixed(2)}~${S.q25.toFixed(2)}`, "상승 베팅 많음")}
          ${row("var(--mx3)", "들뜸", `${S.q10.toFixed(2)} 이하`, "하위 10% · 고점 경계")}
        </tbody></table></div>
        <h4>주의할 점</h4>
        <ul>
          <li><b>하루 값은 많이 출렁여요</b>(만기일·배당일에 튀기도 해요). 그래서 판정은 <b>10일 평균</b>으로 해요.</li>
          <li><b>이것만으로 사고팔면 안 돼요.</b> 하락장 한가운데서도 '겁먹음'이 몇 주씩 이어질 수 있어요. 지수 추세·VIX·공포탐욕지수와 같이 보세요.</li>
          <li><b>사이트마다 숫자가 달라요.</b> 미국엔 옵션 거래소가 20곳쯤 있어요. 여기 기본값은 <b>20곳 전체</b>를 OCC(미국 옵션 청산소) 자료로 합친 값이라 Barchart $CPCS 같은 시장 전체 흐름에 가까워요. 'Cboe 장기' 단추는 Cboe 거래소 <b>한 곳</b>의 공식값으로, 숫자는 조금 낮게 나오지만 2006년부터 있어 긴 비교에 좋아요.${otherTxt ? ` 지금 ${otherTxt}.` : ""}</li>
          <li>지수·ETF 옵션은 기관의 헤지(보험)가 많아 심리와 상관없이 늘 풋이 많아요. 그래서 <b>개별 주식 옵션만</b> 따로 봐요.</li>
        </ul>
      </div>
      <div class="mx-foot">자료 ${k === "us" ? "OCC 일별 거래량(미국 옵션 거래소 전체, 하루 늦게 공개)" : "Cboe 일일 통계"} · 마지막 ${esc(last[0])}</div></article>`;
  }

  const redraw = () => { const box = document.getElementById("pcChart"); if (!box) return; const card0 = box.closest("article"); if (!card0) return;
    const tmp = document.createElement("div"); tmp.innerHTML = card(); const nc = tmp.firstElementChild; if (!nc) return;
    nc.className = card0.className; card0.replaceWith(nc); };
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pcsp], [data-pcsrc]");
    if (!b) return;
    if (b.dataset.pcsrc) st.src = b.dataset.pcsrc; else st.sp[st.src === "us" && st.us ? "us" : "cb"] = +b.dataset.pcsp;
    redraw();
  });

  window.__pc = { card };
})();
