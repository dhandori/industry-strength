/* 매크로 탭 '한국 시장 지표' 맨 위의 한국 공포탐욕지수 카드 (2026-11-04)
   자료: data/kr_fng.json — scripts/kr_fng.py 가 CNN 공포탐욕지수 방식을 한국 자료로 바꿔 매일 계산한다.
   macro.js 는 한국 지표를 그릴 때 window.__krfng.card() 만 부른다. 자료가 오면 매크로 탭을 다시 그린다. */
(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const st = { d: null, sp: 250 };
  const SP = [[60, "60일"], [120, "6개월"], [250, "1년"], [0, "전체"]];
  const md = (d) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
  fetch("data/kr_fng.json?v=" + Date.now(), { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((j) => {
    if (!j || !j.dates || !j.dates.length) return;
    st.d = j;
    window.__macro && window.__macro.rerender();
  }).catch(() => {});

  // CNN과 같은 다섯 구간
  const ZONE = [[25, "극단적 공포", "var(--fg1)"], [45, "공포", "var(--fg2)"], [55, "중립", "var(--fg3)"], [75, "탐욕", "var(--fg4)"], [101, "극단적 탐욕", "var(--fg5)"]];
  const zoneOf = (v) => ZONE.find((z) => v < z[0]);
  // 재료별 설명: 무엇을 재나 · 값 단위 · 높을 때 뜻
  const INFO = {
    mom: ["코스피가 125일(약 6개월) 평균선보다 몇 % 위에 있나", (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`, "평균선 위로 많이 올라 있을수록 탐욕"],
    str: ["52주 신고가 종목 수 − 신저가 종목 수 (코스피 보통주 중 %)", (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%p`, "신고가가 신저가보다 많을수록 탐욕"],
    brd: ["오른 종목에 몰린 거래대금 − 내린 종목 거래대금의 누적 흐름(맥클렐런 합산)", (v) => Math.round(v).toLocaleString(), "돈이 오르는 종목 쪽으로 몰릴수록 탐욕"],
    lev: ["레버리지 ETF 거래대금 ÷ (레버리지 + 인버스) · 최근 5일", (v) => `${v.toFixed(0)}%`, "개인이 상승 2배에 몰릴수록 탐욕, 인버스(하락 베팅)에 몰릴수록 공포 — 미국 풋콜레이시오의 한국판"],
    vol: ["VKOSPI(한국 공포지수)가 50일 평균보다 몇 % 높나", (v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`, "변동성이 평소보다 높을수록 공포"],
    safe: ["코스피 20일 수익률 − 국고채10년 ETF 20일 수익률", (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%p`, "주식이 채권보다 잘 나갈수록 탐욕, 채권(안전자산)으로 피할수록 공포"],
    junk: ["신용등급 낮은 회사채(BBB−)와 우량 회사채(AA−) 금리 차이", (v) => `${Math.round(v)}bp`, "벌어질수록 돈줄이 마르는 신호라 공포"],
    crd: ["신용융자(빚투) 잔고 20거래일 증가율", (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`, "빚내서 사는 돈이 빨리 늘수록 탐욕 — 한국에만 넣은 재료"],
  };

  function chart(D) {
    const sp = st.sp, N = D.dates.length, n = sp && N > sp ? sp : N, off = N - n;
    const ds = D.dates.slice(off), t = D.total.slice(off), kp = D.kospi.slice(off);
    const small = innerWidth < 640, W = small ? 360 : 600, H = small ? 210 : 230, L = 30, R = 44, T = 10, B = 26;
    const x = (i) => L + (W - L - R) * i / Math.max(1, n - 1), y = (v) => T + (H - T - B) * (1 - v / 100);
    const klo = Math.min(...kp), khi = Math.max(...kp), ky = (v) => T + (H - T - B) * (1 - (v - klo) / ((khi - klo) || 1));
    let g = "";
    // 바탕: 0~25 극단적 공포, 75~100 극단적 탐욕
    g += `<rect x="${L}" y="${y(25)}" width="${W - L - R}" height="${y(0) - y(25)}" fill="var(--fg1)" opacity=".1"/><rect x="${L}" y="${y(100)}" width="${W - L - R}" height="${y(75) - y(100)}" fill="var(--fg5)" opacity=".1"/>`;
    for (const v of [0, 25, 50, 75, 100]) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"${v === 50 ? ' stroke-dasharray="3 3"' : ""}/><text x="${L - 5}" y="${y(v) + 3.5}" text-anchor="end" font-size="11" fill="var(--muted)">${v}</text>`;
    g += `<text x="${L + 4}" y="${y(100) + 12}" font-size="10.5" font-weight="700" fill="var(--fg5)">극단적 탐욕</text><text x="${L + 4}" y="${y(0) - 4}" font-size="10.5" font-weight="700" fill="var(--fg1)">극단적 공포</text>`;
    // 오른쪽 눈금: 코스피
    for (const k of [0, 0.5, 1]) { const v = klo + (khi - klo) * k; g += `<text x="${W - R + 4}" y="${ky(v) + 3.5}" font-size="10.5" fill="var(--ma50)">${Math.round(v).toLocaleString()}</text>`; }
    const yrs = (Date.parse(ds.at(-1)) - Date.parse(ds[0])) / 3.156e10;
    const tick = (i, s) => { const xx = x(i).toFixed(1), end = W - R - x(i) < 18; return `<line x1="${xx}" x2="${xx}" y1="${H - B}" y2="${H - B + 4}" stroke="var(--muted)"/><text x="${end ? W - R : xx}" y="${H - 8}" text-anchor="${end ? "end" : "middle"}" font-size="11" fill="var(--muted)">${s}</text>`; };
    let xt = "";
    if (n <= 80) { const j = Math.max(1, Math.ceil(n / (small ? 4 : 7))); for (let i = n - 1; i >= 0; i -= j) if (x(i) - L > 14) xt += tick(i, md(ds[i])); }
    else { let last = ""; const stp = yrs > 1.6 ? (small ? 6 : 3) : (small ? 3 : 2); ds.forEach((d, i) => { const m = d.slice(0, 7); if (m === last) return; if (last && (+d.slice(5, 7) - 1) % stp === 0) xt += tick(i, `${d.slice(2, 4)}.${d.slice(5, 7)}`); last = m; }); }
    const path = (a, f) => { let d = "", pen = false; a.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? "L" : "M") + x(i).toFixed(1) + "," + f(v).toFixed(1); pen = true; }); return d; };
    const lastV = t.at(-1);
    const mini = `<span class="mx-mini" role="group" aria-label="이 그래프 기간">${SP.map(([k, s]) => `<button type="button" data-kfsp="${k}" aria-pressed="${sp === k}">${s}</button>`).join("")}</span>`;
    return `<div class="mx-chart" id="kfChart">${mini}<div class="mx-chart-t">${sp && N > sp ? `최근 ${SP.find((s) => s[0] === sp)[1]}` : `${ds[0].slice(0, 4)}년 ${+ds[0].slice(5, 7)}월부터`} <span>${ds[0].slice(2).replace(/-/g, ".")} ~ ${ds.at(-1).slice(2).replace(/-/g, ".")}</span></div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="한국 공포탐욕지수와 코스피">${g}<line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="var(--muted)"/>${xt}
      <path d="${path(kp, ky)}" fill="none" stroke="var(--ma50)" stroke-width="1.3" opacity=".75"/>
      <path d="${path(t, y)}" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/>
      ${lastV == null ? "" : `<circle cx="${x(n - 1)}" cy="${y(lastV)}" r="4.5" fill="${zoneOf(lastV)[2]}" stroke="var(--surface)" stroke-width="2"/>`}</svg>
      <div class="chart-legend"><span><i style="background:var(--ink)"></i>공포탐욕 점수(왼쪽 0~100)</span><span><i style="background:var(--ma50)"></i>코스피(오른쪽 눈금)</span></div></div>`;
  }

  // 지난 기록에서 '극단적 공포'(25 미만)가 처음 나온 날들과 그 뒤 20거래일 코스피 수익률 — 반대로 읽기가 실제로 맞았나
  function backtest(D) {
    const out = []; let last = -99;
    D.total.forEach((v, i) => {
      if (v == null || v >= 25 || i - last < 20) return;
      last = i;
      const j = Math.min(D.kospi.length - 1, i + 20);
      if (j - i < 10) return;
      out.push({ d: D.dates[i], v, r: (D.kospi[j] / D.kospi[i] - 1) * 100, full: j - i === 20 });
    });
    return out.slice(-6);
  }

  function card() {
    const D = st.d;
    if (!D) return "";
    const N = D.dates.length, i = N - 1, v = D.total[i];
    if (v == null) return "";
    const z = zoneOf(v);
    const ago = (k) => { const j = i - k; return j >= 0 && D.total[j] != null ? D.total[j] : null; };
    const cmp = [["어제", 1], ["1주 전", 5], ["1개월 전", 21], ["1년 전", 250]].map(([t, k]) => { const a = ago(k); return a == null ? "" : `<div><b style="color:${zoneOf(a)[2]}">${Math.round(a)}</b><span>${t}</span></div>`; }).join("");
    const say = v < 25 ? "투자자들이 <b>몹시 겁먹은</b> 상태예요. 모두가 팔고 싶어 할 때라, 역사적으로는 <b>바닥 근처</b>였던 경우가 많아 '반대로 사 볼' 후보 구간으로 봐요. 다만 급락이 더 이어질 수도 있으니 나눠서 접근하는 게 기본이에요."
      : v < 45 ? "<b>겁이 많은 쪽</b>이에요. 조심하는 분위기라 좋은 소식이 나오면 반등 여지가 있어요."
      : v < 55 ? "공포도 탐욕도 아닌 <b>중립</b>이에요. 심리가 한쪽으로 쏠리지 않았어요."
      : v < 75 ? "<b>들뜬 쪽</b>이에요. 추세가 좋을 땐 자연스럽지만, 더 달아오르는지 지켜볼 때예요."
      : "투자자들이 <b>몹시 들뜬(탐욕)</b> 상태예요. 모두가 사고 싶어 할 때라 역사적으로 <b>단기 고점 근처</b>였던 경우가 많아, 새로 사기보다 이익 관리를 생각해 볼 구간이에요.";
    const rows = D.comps.map((c) => {
      const raw = D.raw[c.key][i], sc = D.score[c.key][i], inf = INFO[c.key];
      if (sc == null) return `<li class="kf-c"><div class="kf-c1"><b>${esc(c.name)}</b><span class="muted">자료 모으는 중</span></div><p>${inf[0]}</p></li>`;
      const zz = zoneOf(sc);
      return `<li class="kf-c"><div class="kf-c1"><b>${esc(c.name)}</b><span class="kf-raw">${raw == null ? "–" : inf[1](raw)}</span><span class="kf-tag" style="--c:${zz[2]}">${zz[1]} ${Math.round(sc)}</span></div>
        <div class="kf-bar"><i style="left:${sc}%;background:${zz[2]}"></i></div><p>${inf[0]}. <span class="muted">${inf[2]}.</span></p></li>`;
    }).join("");
    const bt = backtest(D);
    const btTxt = bt.length ? `<h4>지난 기록: '극단적 공포'(25 미만)가 나온 뒤 코스피는?</h4><div class="ai-tw"><table class="mem-table kf-bt"><thead><tr><th>날짜</th><th class="num">점수</th><th class="num">20거래일 뒤 코스피</th></tr></thead><tbody>${bt.map((b) => `<tr><td>${b.d.slice(2).replace(/-/g, ".")}</td><td class="num">${Math.round(b.v)}</td><td class="num"><b class="${b.r >= 0 ? "up" : "down"}">${b.r >= 0 ? "+" : ""}${b.r.toFixed(1)}%</b>${b.full ? "" : ' <span class="muted">(아직 진행 중)</span>'}</td></tr>`).join("")}</tbody></table></div><p class="muted">같은 공포가 20거래일 안에 다시 나오면 한 번으로 셌어요. 기록이 짧아(${D.dates[0].slice(0, 4)}년부터) 참고용이에요.</p>` : "";
    return `<article class="card mx-card kf-card" style="--c:${z[2]}">
      <div class="mx-head"><div><div class="mx-name">한국 공포탐욕지수 (CNN 방식 한국판)</div><div class="mx-dir">0 = 극단적 공포 · 100 = 극단적 탐욕 · 재료 8가지 평균</div></div><span class="mx-chip" style="--c:${z[2]}">${z[1]}</span></div>
      <div class="mx-val"><b style="color:${z[2]}">${Math.round(v)}</b><span class="ec-date">${md(D.dates[i])} 장 마감 기준</span></div>
      <div class="kf-gauge"><div class="kf-g">${ZONE.map((zz, k) => `<span style="flex:${zz[0] - (k ? ZONE[k - 1][0] : 0) - (k === 4 ? 1 : 0)};background:${zz[2]}"></span>`).join("")}<i style="left:${v}%"></i></div><div class="kf-gl"><span>극단적 공포</span><span>공포</span><span>중립</span><span>탐욕</span><span>극단적 탐욕</span></div></div>
      ${cmp ? `<div class="mx-cmp">${cmp}</div>` : ""}
      <p class="pc-say" style="--c:${z[2]}">${say}</p>
      ${chart(D)}
      <h4 class="kf-h">재료 8가지 <span class="sub">막대가 오른쪽일수록 탐욕 · 각 점수 = 오늘 값이 최근 2년 중 어디쯤인지</span></h4>
      <ul class="kf-list">${rows}</ul>
      <div class="pc-edu">
        <h4>이게 뭔가요?</h4>
        <p>미국 CNN이 매일 발표하는 '공포탐욕지수'를 <b>한국 자료로 똑같은 방식</b>으로 만든 거예요. 시장 분위기를 보여 주는 재료 8가지를 각각 0~100점(0 = 극단적 공포, 100 = 극단적 탐욕)으로 바꾼 뒤 평균을 내요. 점수는 '오늘 값이 최근 2년 중 몇 % 위치인가'로 매겨요.</p>
        <h4>어떻게 써먹나요?</h4>
        <p>워런 버핏의 말처럼 <b>"남들이 겁낼 때 욕심내고, 남들이 욕심낼 때 겁내라"</b>를 숫자로 본 거예요. 25 아래(극단적 공포)는 바닥 근처, 75 위(극단적 탐욕)는 고점 근처였던 경우가 많아 <b>반대로</b> 읽어요. 그래프에서 검은 선(점수)과 파란 선(코스피)을 같이 보면, 점수가 바닥일 때 코스피도 저점이었는지 확인할 수 있어요.</p>
        ${btTxt}
        <h4>CNN 미국판과 다른 점</h4>
        <ul>
          <li>미국의 '풋콜레이시오'는 한국 옵션 자료를 공개로 받을 수 없어, <b>레버리지 대 인버스 ETF 거래대금 비율</b>로 바꿨어요. 한국 개인 투자자는 오를 것 같으면 레버리지, 내릴 것 같으면 인버스를 사서 심리가 잘 드러나요.</li>
          <li>한국만의 재료로 <b>빚투(신용융자) 증가 속도</b>를 더했어요.</li>
          <li>VKOSPI·회사채 금리차는 2024년 가을부터 모은 자료라, 그 전 점수는 나머지 재료로만 계산했어요.</li>
        </ul>
        <h4>주의할 점</h4>
        <ul>
          <li>심리 지표는 <b>언제 바뀔지</b>는 알려 주지 않아요. 극단적 공포가 몇 주씩 이어지며 더 빠지기도 해요. 추세(산업 강도 탭)와 같이 보세요.</li>
          <li>점수는 '최근 2년과 비교한' 상대값이에요. 2년 내내 오른 장이면 평범한 날도 공포 쪽으로 나올 수 있어요.</li>
        </ul>
      </div>
      <div class="mx-foot">자료: 네이버 증권(코스피·종목 일봉·ETF·신용융자) · 한국투자증권(VKOSPI) · 한국은행(회사채 금리) · 매일 장 마감 뒤 계산 · ${esc(D.updated_at)}</div></article>`;
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-kfsp]");
    if (!b || !st.d) return;
    st.sp = +b.dataset.kfsp;
    const box = document.getElementById("kfChart");
    if (box) box.outerHTML = chart(st.d);
  });

  window.__krfng = { card };
})();
