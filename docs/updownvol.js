/* 매크로 탭 미국 '주가' 묶음에 붙는 상승·하락 거래량 10:1 카드 (2026-11-24)
   자료: data/updown_vol.json (scripts/updown_vol.py, update.yml 이 미국 마감 갱신 때)
   판정 기준은 scripts/updown_vol.py 머리말과 같다. 한쪽을 바꾸면 다른 쪽도 바꾼다.
   macro.js 는 미국 주가 묶음을 그릴 때 window.__ud.card() 만 부른다. 자료가 오면 매크로 탭을 다시 그린다. */
(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const col = (lv) => `var(--mx${lv || 0})`;
  const st = { j: null, sp: 120 };
  const SP = [[60, "60일"], [120, "6개월"], [250, "1년"], [750, "3년"]];
  const md = (d) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
  const ymd = (d) => `${d.slice(2, 4)}.${d.slice(5, 7)}.${d.slice(8, 10)}`;
  fetch("data/updown_vol.json?v=" + Date.now(), { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((j) => {
    if (!j || !j.markets || !j.markets.NYSE) return;
    st.j = j;
    window.__macro && window.__macro.rerender();
  }).catch(() => {});

  // 비율 표기: 상승이 많으면 "4.7 : 1", 하락이 많으면 "1 : 6.6"
  const ratioTxt = (u, w) => u >= w ? `${(w > 0 ? u / w : 99).toFixed(1)} : 1` : `1 : ${(u > 0 ? w / u : 99).toFixed(1)}`;
  const lr = (u, w) => Math.log10(Math.max(u, 0.01) / Math.max(w, 0.01));

  function verdict(m, win) {
    const s = m.state;
    if (s === "confirmed") return [5, "확인", `10:1 상승일이 ${md(m.first)}과 ${md(m.last)}에 나왔고(모두 ${m.count}번), 그 사이 10:1 하락일이 없었습니다. <b>강한 매수세가 한 번으로 끝나지 않고 다시 나왔다</b>는 뜻이라 미너비니 기준으로 수급이 돌아서는 신호입니다. 신호는 마지막 10:1 상승일 뒤 ${win}거래일(${m.daysLeft}거래일 남음)까지 유효로 봅니다.`];
    if (s === "first") return [4, "확인 대기", `${md(m.last)}에 10:1 상승일이 나왔습니다. 첫 번째는 과매도 반등이나 숏커버링일 수 있어서 아직 신호로 보지 않습니다. <b>${m.daysLeft}거래일 안에 10:1 하락일 없이 10:1 상승일이 한 번 더 나오면 확인</b>입니다.`];
    if (s === "down") return [2, "하락 10:1", `${md(m.last)}에 하락 거래량이 상승의 ${m.ratio}배인 10:1 하락일이 나왔습니다(${m.daysSince}거래일 전). 매도가 한쪽으로 쏠린 날이라, <b>새 10:1 상승일이 나올 때까지는 매수세 확인 신호가 없습니다</b>.`];
    return [0, "신호 없음", `최근 ${win}거래일 안에 10:1 상승일도 하락일도 없습니다. 어느 쪽으로도 거래량이 한꺼번에 쏠린 날이 없었다는 뜻입니다.`];
  }

  function chart(rows, conf) {
    const n = Math.min(st.sp, rows.length), s = rows.slice(-n);
    const small = innerWidth < 640, W = small ? 360 : 600, H = small ? 200 : 220, L = 40, R = 10, T = 10, B = 26;
    const CAP = Math.log10(30), y0 = T + (H - T - B) / 2;
    const y = (v) => y0 - (H - T - B) / 2 * Math.max(-1, Math.min(1, v / CAP));
    const bw = (W - L - R) / n, x = (i) => L + bw * i;
    let g = "";
    [[30, "30:1"], [10, "10:1"], [3, "3:1"], [1, "1:1"], [1 / 3, "1:3"], [0.1, "1:10"], [1 / 30, "1:30"]].forEach(([r, t]) => {
      const yy = y(Math.log10(r)).toFixed(1), key = r === 10 || r === 0.1;
      g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="${key ? (r > 1 ? "var(--mx5)" : "var(--mx1)") : "var(--grid)"}"${key ? ' stroke-dasharray="4 3"' : ""}/><text x="${L - 5}" y="${+yy + 4}" text-anchor="end" font-size="12" fill="${key ? (r > 1 ? "var(--mx5)" : "var(--mx1)") : "var(--muted)"}">${t}</text>`;
    });
    const cs = new Set(conf.flatMap((c) => [c.second]));
    s.forEach((r, i) => {
      const v = lr(r[1], r[2]), yy = y(v), hot = Math.abs(v) >= 1;
      const c = v > 0 ? "var(--mx5)" : "var(--mx1)";
      g += `<rect x="${(x(i) + bw * 0.12).toFixed(1)}" y="${Math.min(yy, y0).toFixed(1)}" width="${Math.max(0.8, bw * 0.76).toFixed(1)}" height="${Math.max(0.6, Math.abs(yy - y0)).toFixed(1)}" fill="${c}" opacity="${hot ? 1 : 0.35}"><title>${r[0]} ${ratioTxt(r[1], r[2])}</title></rect>`;
      if (cs.has(r[0])) g += `<text x="${(x(i) + bw / 2).toFixed(1)}" y="${T + 11}" text-anchor="middle" font-size="12" fill="var(--mx5)">★</text>`;
    });
    let xt = "", last = "";
    const every = n > 400 ? 6 : n > 150 ? 2 : 1;
    s.forEach((r, i) => {
      const key = r[0].slice(0, 7);
      if (key === last) return;
      const show = last && (+r[0].slice(5, 7) - 1) % (small ? every * 2 : every) === 0;
      last = key;
      if (show && n > 70) xt += `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="12" fill="var(--muted)">${r[0].slice(2, 4)}.${r[0].slice(5, 7)}</text>`;
    });
    if (n <= 70) for (let i = n - 1; i >= 0; i -= Math.ceil(n / (small ? 4 : 7))) xt += `<text x="${(x(i) + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="12" fill="var(--muted)">${md(s[i][0])}</text>`;
    const mini = `<span class="mx-mini" role="group" aria-label="이 그래프 기간">${SP.map(([k, t]) => `<button type="button" data-udsp="${k}" aria-pressed="${st.sp === k}">${t}</button>`).join("")}</span>`;
    return `<div class="mx-chart" id="udChart"><div class="pc-btns"><span></span>${mini}</div><div class="mx-chart-t">NYSE 하루 비율 · 최근 ${n}거래일 <span>${ymd(s[0][0])} ~ ${ymd(s.at(-1)[0])}</span></div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="NYSE 상승·하락 거래량 비율">${g}<line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="var(--muted)"/>${xt}</svg>
      <div class="chart-legend"><span><i style="background:var(--mx5)"></i>상승 거래량이 많은 날</span><span><i style="background:var(--mx1)"></i>하락 거래량이 많은 날</span><span>진한 막대 = 10:1 넘은 날 · ★ = 확인된 날</span></div></div>`;
  }

  function card() {
    const j = st.j;
    if (!j) return "";
    const m = j.markets.NYSE, q = j.markets.NASDAQ, win = (j.rule && j.rule.window) || 65;
    const r = m.rows.at(-1), lv = verdict(m, win);
    const qr = q && q.rows.at(-1);
    const evs = m.events.slice(-8).reverse();
    const conf = m.confirms.slice(-6).reverse();
    const ev = evs.map((e) => `<tr><td>${esc(e.d)}</td><td><span class="pc-sw" style="background:${e.k === "U" ? "var(--mx5)" : "var(--mx1)"}"></span><b>${e.k === "U" ? "10:1 상승" : "10:1 하락"}</b></td><td class="num">${e.k === "U" ? `${e.r} : 1` : `1 : ${e.r}`}</td></tr>`).join("");
    const cf = conf.map((c) => `<li>${esc(c.first)} → <b>${esc(c.second)}</b> (${c.gap}거래일 뒤)</li>`).join("");
    const nU = m.events.filter((e) => e.k === "U").length, nD = m.events.length - nU;
    return `<article class="card mx-card pc-card ud-card" style="--c:${col(lv[0])}">
      <div class="mx-head"><div><div class="mx-name">상승·하락 거래량 10:1 (NYSE 매수세 확인)</div><div class="mx-dir">📈 10:1 상승일이 하락일 없이 두 번 나오면 확인 · 미너비니</div></div><span class="mx-chip" style="--c:${col(lv[0])}">${lv[1]}</span></div>
      <div class="mx-val"><b>${ratioTxt(r[1], r[2])}</b><span class="ec-date">상승 : 하락 거래량 · ${md(r[0])}</span>${qr ? `<span class="mx-chg flat"><small>나스닥</small>${ratioTxt(qr[1], qr[2])}</span>` : ""}</div>
      <p class="pc-say">${lv[2]}</p>
      ${chart(m.rows, m.confirms)}
      <div class="pc-edu">
        <h4>무엇을 보나</h4>
        <p>그날 <b>오른 종목들의 거래량 합</b>과 <b>내린 종목들의 거래량 합</b>을 비교합니다. 종목 수가 아니라 거래량이라서, 큰돈이 한쪽으로 몰렸는지를 봅니다. 상승 거래량이 하락의 10배 이상이면 10:1 상승일, 반대면 10:1 하락일입니다.</p>
        <h4>왜 10:1인가</h4>
        <p>보통 날은 1:1에서 3:1 사이를 오갑니다. 10:1은 그날 거래된 주식의 90% 넘게가 오르는 종목에서 거래됐다는 뜻이라, 기관이 업종을 가리지 않고 한꺼번에 샀다는 얘기입니다. 1년에 몇 번 안 나오고, 대개 급락 직후에 몰려 나옵니다.</p>
        <h4>왜 두 번을 보나</h4>
        <p>크게 빠진 뒤에는 공매도한 쪽이 한꺼번에 되사고(숏커버링) 싸졌다고 본 단기 매수도 몰려서 10:1이 나오기 쉽습니다. 이런 매수는 하루이틀이면 끝나서 시장이 다시 밀리곤 합니다(2009년 3월 바닥 직전에도 몇 번 나왔습니다). 며칠 쉬어 가는 동안 10:1 하락일이 나오지 않고 압도적인 매수가 한 번 더 들어오면, 사려는 쪽이 계속 남아 있다는 증거라서 미너비니는 이때를 수요와 공급이 돌아서는 신호로 봅니다. 중간에 10:1 하락일이 끼면 파는 쪽도 아직 힘이 세다는 뜻이라 처음부터 다시 셉니다.</p>
        <h4>FTD와 다른 점</h4>
        <p>오닐의 FTD는 지수 하나의 가격과 거래량을 보고, 이 신호는 시장 전체에서 사는 쪽과 파는 쪽의 거래량 비율을 봅니다. 둘이 같은 시기에 나오면 서로 뒷받침이 됩니다.</p>
        <h4>쓰는 법과 주의할 점</h4>
        <ul>
          <li><b>바로 사라는 신호가 아닙니다.</b> 강한 매수가 이어진다는 확인이라, 실제 매수는 지수 3조건 회복이나 주도주 돌파가 같이 나올 때 합니다.</li>
          <li><b>확인 뒤에도 실패한 적이 있습니다.</b> 2007년 11월과 2011년 8월에는 확인이 나온 뒤 시장이 다시 밀렸습니다.</li>
          <li><b>확인이 없어도 바닥이 나오기도 합니다.</b> 2025년 4월 9일에는 70:1이 나왔지만 65거래일 안에 두 번째가 없어 확인은 없었는데, 시장은 그 뒤 크게 올랐습니다.</li>
        </ul>
        <h4>판정 기준</h4>
        <ul>
          <li><b>확인:</b> 첫 10:1 상승일 뒤 ${win}거래일(약 3개월) 안에 10:1 상승일이 한 번 더 나오고, 그 사이 10:1 하락일이 없으면 확인으로 봅니다.</li>
          <li><b>무효:</b> 10:1 하락일이 나오면 그때까지 센 상승일은 지우고 다시 셉니다.</li>
          <li>미너비니는 '10:1 하락일 없이 10:1 상승일이 두 번' 나오면 더 강한 신호라고 했지만 기간은 정하지 않았습니다. 그래서 같은 생각의 원조인 Zweig 의 'double 9-to-1'(3개월 안 두 번, 65거래일) 기간을 씁니다.</li>
          <li>판정은 NYSE 거래량으로 합니다. 나스닥은 참고로 위 숫자에만 보여 줍니다.</li>
        </ul>
        <h4>최근 10:1 날 (NYSE)</h4>
        <div class="ai-tw"><table class="mem-table pc-tbl"><thead><tr><th>날짜</th><th>구분</th><th class="num">비율</th></tr></thead><tbody>${ev}</tbody></table></div>
        <h4>지난 확인 사례 (최근 6번)</h4>
        <ul>${cf}</ul>
        <p class="muted">${m.rows[0][0].slice(0, 4)}년 이후 10:1 상승일 ${nU}번, 하락일 ${nD}번, 확인 ${m.confirms.length}번입니다. 확인은 2009년 3월, 2020년 4~6월, 2022년 7~10월처럼 큰 하락 뒤 바닥 근처에 몰려 나왔고, 2007년 11월, 2011년 8월처럼 하락 도중에 나왔다가 다시 밀린 때도 있습니다. 지수 추세와 같이 봐야 합니다.</p>
      </div>
      <div class="mx-foot">자료 TradingView NYSE 상승·하락 거래량(USI:UVOL·DVOL), 나스닥(UVOLQ·DVOLQ) · 마지막 ${esc(r[0])}</div></article>`;
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-udsp]");
    if (!b) return;
    st.sp = +b.dataset.udsp;
    const box = document.getElementById("udChart"), card0 = box && box.closest("article");
    if (!card0) return;
    const tmp = document.createElement("div"); tmp.innerHTML = card(); const nc = tmp.firstElementChild;
    if (nc) { nc.className = card0.className; card0.replaceWith(nc); }
  });

  window.__ud = { card };
})();
