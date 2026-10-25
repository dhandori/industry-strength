/* 매크로 지수 탭 (2026-10-24 추가)
   데이터: 같은 dhandori.github.io 주소의 WAMO 저장소가 매일 아침 07:05 KST에 만드는 wamo_macro.json
   (비밀값 — 한국은행 ECOS·한투·텔레그램 — 이 그쪽에 있어 계산은 그쪽 자동 실행이 맡는다).
   산업 강도·52주 신고가 탭(app.js·highs.js)과 코드를 섞지 않는다. 공유하는 것은 테마 색뿐이다. */
(() => {
  const SRC = "/wamo-choochoo-dashboard/wamo_macro.json";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const LV = { 1: ["🔴", "위기"], 2: ["🟠", "경계"], 3: ["🟡", "주의"], 4: ["🔵", "관심"], 5: ["🟢", "정상"] };
  const col = (lv) => `var(--mx${lv || 0})`;
  const st = { data: null, loading: null };
  // 2026-10-25 쉬운 이름·설명 (WAMO 저장소 wamo_macro.py와 같은 문구 — 데이터가 옛 문구여도 화면은 이 문구로 보인다)
  const TXT = {
    kr_aa: ["우량 회사채 가산금리 (AA- − 국고채 3년)", "튼튼한 회사가 나라보다 돈을 빌릴 때 더 내는 이자예요. 이 차이가 벌어지면 회사들이 돈 빌리기 어려워졌다는 뜻이에요."],
    kr_bbb: ["비우량 회사채 가산금리 (BBB- − 국고채 3년)", "신용등급이 낮은 편인 회사가 나라보다 더 내는 이자예요. 돈줄이 막히기 시작하면 가장 먼저, 가장 크게 벌어져요."],
    kr_cpcd: ["기업 단기자금 금리차 (CP − CD 91일)", "회사가 3개월짜리로 급히 빌리는 돈(CP)의 이자에서 은행 단기 금리(CD)를 뺀 값이에요. 벌어지면 회사들의 당장 쓸 돈 사정이 나빠졌다는 신호예요."],
    kr_curve: ["한국 장단기 금리차 (국고채 10년 − 3년)", "10년 국채 금리에서 3년 국채 금리를 뺀 값이에요. 0 아래로 뒤집히면 경기 둔화 신호이고, 갑자기 크게 벌어져도 불안 신호예요."],
    us_hy: ["미국 하이일드 스프레드 (저신용 회사채)", "신용등급이 낮은 미국 회사가 국채보다 더 내는 이자예요. 위기가 오면 가장 먼저, 가장 빠르게 치솟는 대표 경보등이에요."],
    us_ig: ["미국 투자등급 스프레드 (우량 회사채)", "튼튼한 미국 회사가 국채보다 더 내는 이자예요. 하이일드보다 느리게 움직이지만, 이것까지 오르면 불안이 넓게 퍼졌다는 뜻이에요."],
    us_liq: ["미국 순유동성 (시장에 풀린 달러)", "연준이 푼 돈에서 정부 통장(TGA)과 역레포(RRP)에 묶인 돈을 뺀 값이에요. 시장에서 실제로 돌고 있는 돈이라 줄어들면 주식에 부담이에요."],
    us_curve: ["미국 장단기 금리차 (10년 − 2년)", "10년 국채 금리에서 2년 국채 금리를 뺀 값이에요. 0 아래로 뒤집히면 경기침체 예고이고, 뒤집혔다가 빠르게 다시 벌어질 때도 과거 침체 직전에 자주 나왔어요."],
    vix: ["VIX (미국 주식 공포지수)", "미국 주식이 앞으로 한 달 동안 얼마나 출렁일지 시장이 예상하는 값이에요. 20 아래면 평온, 30 위면 공포 구간이에요."],
    vix_ratio: ["VIX ÷ VIX3M (단기 공포 쏠림)", "한 달짜리 공포(VIX)를 석 달짜리 공포(VIX3M)로 나눈 값이에요. 1을 넘으면 먼 미래보다 지금 당장이 더 무섭다는 뜻이고, 급락장에서 나타나요."],
    move: ["MOVE (미국 채권 공포지수)", "미국 국채 금리가 앞으로 얼마나 출렁일지 예상하는 값이에요(채권판 VIX). 높으면 금리가 불안해서 주식과 채권 모두에 부담이에요."],
    vkospi: ["VKOSPI (한국 주식 공포지수)", "코스피200이 앞으로 한 달 동안 얼마나 출렁일지 예상하는 값이에요(한국판 VIX). 높을수록 한국 시장이 불안하다는 뜻이에요."],
    fng: ["CNN 공포탐욕지수", "미국 투자자들의 분위기를 0~100점으로 나타낸 값이에요. 25점 아래면 겁먹은 시장, 75점 위면 너무 들뜬(과열) 시장이에요."],
  };
  const nm = (r) => (TXT[r.key] || [])[0] || r.name;
  const short = (r) => nm(r).split(" (")[0];
  const hp = (r) => (TXT[r.key] || [])[1] || r.help;
  // 어느 쪽으로 움직이면 위험한지 — 카드 이름 옆에 꼬리표로 붙인다
  const DIR = { high: "📈 오를수록 위험", low: "📉 줄어들수록 위험", both: "↕ 너무 좁거나 넓으면 위험", fng: "📉 낮을수록 공포" };

  const num = (v, unit) => v == null ? "–" : unit === "x" ? v.toFixed(2)
    : Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : (+v.toFixed(1)).toLocaleString();

  function ma(vals, n) {
    const out = []; let s = 0;
    vals.forEach((v, i) => { s += v; if (i >= n) s -= vals[i - n]; out.push(i >= n - 1 ? s / n : null); });
    return out;
  }

  // 최근 약 2년 선 그래프 — 가로축(달)·세로축(값)·20일/60일 이동평균
  function chart(r) {
    const s = r.series || [];
    if (s.length < 15) return "";
    const small = innerWidth < 640, W = small ? 360 : 600, H = small ? 190 : 200, L = small ? 42 : 48, R = 10, T = 10, B = 26;
    const months = (Date.parse(s[s.length - 1][0]) - Date.parse(s[0][0])) / 2.63e9;
    const step = months > 15 ? (small ? 6 : 3) : (small ? 3 : 2);   // 2년치는 3개월(휴대폰 6개월) 간격으로 가로축 글자
    const ds = s.map((p) => p[0]), vs = s.map((p) => p[1]);
    const m20 = ma(vs, 20), m60 = ma(vs, 60);
    const all = vs.concat(m20.filter((v) => v != null), m60.filter((v) => v != null));
    let lo = Math.min(...all), hi = Math.max(...all);
    const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.05 || 1; lo -= pad; hi += pad;
    if (r.key === "fng") { lo = Math.max(0, lo); hi = Math.min(100, hi); }   // 공포탐욕은 0~100 밖으로 나가지 않게
    const x = (i) => L + (W - L - R) * i / (s.length - 1);
    const y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
    const path = (arr) => { let d = "", pen = false; arr.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1); pen = true; }); return d; };
    let g = "";
    for (let k = 0; k <= 4; k++) {
      const v = lo + (hi - lo) * k / 4, yy = y(v).toFixed(1);
      g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="var(--grid)"/><text x="${L - 6}" y="${+yy + 3.5}" text-anchor="end" font-size="11" fill="var(--muted)">${num(v, r.unit)}</text>`;
    }
    let xt = "", lastM = "";
    ds.forEach((d, i) => {
      const m = d.slice(0, 7);
      if (m === lastM) return;
      if (lastM && +d.slice(5, 7) % step === 1) {
        const xx = x(i).toFixed(1);
        xt += `<line x1="${xx}" x2="${xx}" y1="${H - B}" y2="${H - B + 4}" stroke="var(--muted)"/><text x="${xx}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--muted)">${d.slice(2, 4)}.${d.slice(5, 7)}</text>`;
      }
      lastM = m;
    });
    const refs = [];
    if (r.unit === "bp") refs.push(0);
    if (r.key === "vix") refs.push(20, 30);
    if (r.key === "vix_ratio") refs.push(1);
    if (r.key === "fng") refs.push(25, 75);
    const rf = refs.filter((v) => v > lo && v < hi).map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--mx2)" stroke-dasharray="2 3" opacity=".7"/>`).join("");
    const span = months >= 20 ? "최근 2년 흐름" : months >= 10 ? "최근 1년 흐름" : `최근 ${Math.max(1, Math.round(months))}개월 흐름`;
    return `<div class="mx-chart"><div class="mx-chart-t">${span} <span>${ds[0].slice(2, 7).replace("-", ".")} ~ ${ds[ds.length - 1].slice(2, 7).replace("-", ".")}</span></div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(nm(r))} 최근 추이">${g}${rf}
      <line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="var(--muted)"/><line x1="${L}" x2="${L}" y1="${T}" y2="${H - B}" stroke="var(--muted)"/>${xt}
      <path d="${path(m60)}" fill="none" stroke="var(--ma50)" stroke-width="1.6" stroke-dasharray="5 3"/>
      <path d="${path(m20)}" fill="none" stroke="var(--ma20)" stroke-width="1.6" stroke-dasharray="4 3"/>
      <path d="${path(vs)}" fill="none" stroke="var(--price)" stroke-width="1.8" stroke-linejoin="round"/>
      <circle cx="${x(s.length - 1)}" cy="${y(vs[vs.length - 1])}" r="4.5" fill="${col(r.level)}" stroke="var(--surface)" stroke-width="2"/></svg>
      <div class="chart-legend"><span><i style="background:var(--price)"></i>매일 값</span><span><i style="background:var(--ma20)"></i>20일 평균(약 1개월)</span><span><i style="background:var(--ma50)"></i>60일 평균(약 3개월)</span></div></div>`;
  }

  function chg(r) {
    if (r.change1m == null) return "";
    const worse = r.risk === "high" ? r.change1m > 0 : r.risk === "low" || r.risk === "fng" ? r.change1m < 0 : (r.speedZ ?? 0) > 0;
    const c = Math.abs(r.change1m) < 1e-9 ? "flat" : worse ? "worse" : "better";
    const word = c === "flat" ? "변화 없음" : worse ? "▲ 나빠짐" : "▼ 좋아짐";
    return `<span class="mx-chg ${c}"><small>한 달 전보다</small>${esc(r.changeText)} <em>${word}</em></span>`;
  }

  // 2026-10-25: 초록→빨강 그라데이션 대신 칸 5개(왼쪽 안전 → 오른쪽 위험). 지금 칸만 진하게, 나머지는 흐리게, 위에 '지금' 핀.
  function zoneBar(zones, idx, frac, endL, endR, pinText) {
    const n = zones.length, left = (idx + Math.max(0.06, Math.min(0.94, frac))) / n * 100;
    const boxes = zones.map((z, i) => `<div class="mx-zb-box${i === idx ? " on" : ""}" style="--c:${z.c}"><b>${z.e} ${z.t}</b><small>${z.r}</small></div>`).join("");
    return `<div class="mx-zb"><div class="mx-zb-ends"><span class="good">✅ ${endL}</span><span class="bad">${endR} ⛔</span></div>
      <div class="mx-zb-pinrow"><div class="mx-zb-pin" style="left:${left}%;--c:${zones[idx].c}"><span>${pinText}</span></div></div>
      <div class="mx-zb-row" style="grid-template-columns:repeat(${n},minmax(0,1fr))">${boxes}</div></div>`;
  }
  const RISK_ZONES = [[0, 50, 5], [50, 75, 4], [75, 90, 3], [90, 97, 2], [97, 100.0001, 1]];
  function pos(r) {
    if (r.riskPct == null) return "";
    const p = Math.max(0, Math.min(100, r.riskPct));
    const idx = RISK_ZONES.findIndex(([a, b]) => p >= a && p < b), [a, b] = RISK_ZONES[idx];
    const zones = RISK_ZONES.map(([lo, hi, lv]) => ({ c: col(lv), e: LV[lv][0], t: LV[lv][1], r: `${lo}~${Math.min(100, Math.round(hi))}%` }));
    const what = r.risk === "both"
      ? `최근 5년 중 지금보다 평범했던(덜 치우친) 날이 <b>${p.toFixed(0)}%</b>예요`
      : `최근 5년 중 지금보다 안전했던 날이 <b>${p.toFixed(0)}%</b>예요`;
    const note = r.speedBump ? `<div class="mx-zb-note">⚡ 위치만 보면 ${LV[RISK_ZONES[idx][2]][0]} ${LV[RISK_ZONES[idx][2]][1]}이지만, 최근 한 달 사이 평소보다 빠르게 나빠져서 ${r.speedBump}단계 올려 ${r.emoji} ${esc(r.label)}로 매겼어요.</div>` : "";
    return `<div class="mx-pos"><div class="mx-pos-l"><span>${what}</span></div>${zoneBar(zones, idx, (p - a) / (Math.min(100, b) - a), "안전", "위험", `지금 ${p.toFixed(0)}%`)}${note}</div>`;
  }

  function fng(r) {
    const c = r.compare || {}, p = Math.max(0, Math.min(100, r.value));
    const cell = (k, t) => `<div><b>${c[k] ?? "–"}</b><span>${t}</span></div>`;
    // 왼쪽 안전 → 오른쪽 위험으로 맞추려고 점수는 높은 쪽(탐욕)을 왼쪽에 둔다. 75 이상 과열은 따로 보라색.
    const FZ = [[75, 100.0001, 0, "⚠️", "과열", "var(--mxfg)"], [55, 75, 5], [40, 55, 4], [25, 40, 3], [10, 25, 2], [0, 10, 1]];
    const zones = FZ.map(([lo, hi, lv, e, t, cc]) => ({ c: cc || col(lv), e: e || LV[lv][0], t: t || LV[lv][1], r: `${Math.min(100, Math.round(hi))}~${lo}` }));
    const idx = FZ.findIndex(([a, b]) => p >= a && p < b);
    const lo = FZ[idx][0], hi = Math.min(100, FZ[idx][1]);
    return `<div class="mx-pos"><div class="mx-pos-l"><span>점수가 높으면 투자자들이 들뜬 상태, 낮으면 겁먹은 상태예요</span></div>${zoneBar(zones, idx, (hi - p) / (hi - lo), "탐욕(안심)", "공포(위험)", `지금 ${r.value}점`)}</div>
      <div class="mx-cmp"><div><b>${r.value}</b><span>오늘</span></div>${cell("prev", "어제")}${cell("week_ago", "1주 전")}${cell("month_ago", "한 달 전")}${cell("year_ago", "1년 전")}</div>
      ${r.crossCheck != null ? `<div class="mx-foot">다른 사이트(finhacker.cz) 값 ${r.crossCheck}점${r.crossCheck === r.value ? " · 같아요" : " · 조금 달라요(갱신 시각 차이)"}</div>` : ""}
      ${(r.series || []).length >= 15 ? chart(r) : `<div class="mx-foot">이 지표는 과거 값을 받을 수 없어 매일 쌓고 있어요. 약 3주 뒤부터 흐름 그래프가 나타나요.</div>`}`;
  }

  function card(r) {
    const c = col(r.level);
    const head = `<div class="mx-head"><div><div class="mx-name">${esc(nm(r))}</div>${DIR[r.risk] ? `<div class="mx-dir">${DIR[r.risk]}</div>` : ""}</div><span class="mx-chip" style="--c:${c}">${r.emoji} ${esc(r.label)}${r.overheat ? " · ⚠️과열" : ""}</span></div>`;
    if (!r.level) return `<article class="card mx-card" style="--c:${c}">${head}<div class="mx-empty">오늘은 자료를 받지 못했어요.</div><div class="mx-why">${esc(hp(r))}</div></article>`;
    const unit = r.unit && !["bp", "x", "점"].includes(r.unit) ? `<span class="u">${esc(r.unit)}</span>` : "";
    const zone = r.zone ? `<span class="mx-chip" style="--c:${c}">${esc(r.zone)}</span>` : "";
    return `<article class="card mx-card" style="--c:${c}">${head}
      <div class="mx-val"><b>${esc(r.valueText)}</b>${unit}${zone}${chg(r)}</div>
      ${r.key === "fng" ? fng(r) : pos(r) + chart(r)}
      <div class="mx-why"><b>무엇인가요?</b> ${esc(hp(r))}</div>
      <div class="mx-foot">자료 날짜 ${esc(r.date || "–")}${r.stale ? " · <b>오늘 새 자료를 못 받아 마지막 값을 보여 드려요</b>" : ""}</div></article>`;
  }

  // 2026-10-25 추가: VIX와 공포탐욕지수를 같은 '겁먹은 정도' 5칸에 나란히 놓고, 어긋나면 이유와 확인할 곳을 알려 준다.
  const TEMP = [["😌", "안심"], ["🙂", "평온"], ["😐", "조금 불안"], ["😟", "불안"], ["😱", "겁먹음"]];
  const TCOL = [5, 4, 3, 2, 1];
  const vixTemp = (v) => v < 15 ? 0 : v < 20 ? 1 : v < 25 ? 2 : v < 30 ? 3 : 4;
  const fngTemp = (v) => v >= 55 ? 0 : v >= 45 ? 1 : v >= 35 ? 2 : v >= 25 ? 3 : 4;
  const VIX_R = ["15 미만", "15~20", "20~25", "25~30", "30 이상"], FNG_R = ["55점 이상", "45~54", "35~44", "25~34", "25점 미만"];

  function duoInfo(d) {
    const vx = d.indicators.find((r) => r.key === "vix" && r.level), fg = d.indicators.find((r) => r.key === "fng" && r.level);
    if (!vx || !fg) return null;
    const a = vixTemp(vx.value), b = fngTemp(fg.value), gap = b - a;
    const kind = Math.abs(gap) <= 1 ? "same" : gap > 0 ? "fngMore" : "vixMore";
    // 공포탐욕지수 안의 VIX 항목은 VIX를 50일 평균과 비교한다 → 같은 계산을 여기서 해 보여 준다
    const s = (vx.series || []).map((p) => p[1]);
    const avg50 = s.length >= 50 ? s.slice(-50).reduce((x, y) => x + y, 0) / 50 : null;
    return { vx, fg, a, b, kind, avg50, ratio: d.indicators.find((r) => r.key === "vix_ratio" && r.level) };
  }

  function duo(d) {
    const o = duoInfo(d);
    if (!o) return "";
    const { vx, fg, a, b, kind, avg50, ratio } = o;
    const row = (title, val, t, ranges) => `<div class="mx-duo-row"><div class="mx-duo-l"><b>${title}</b><span>${val}</span></div>
      <div class="mx-duo-cells">${TEMP.map(([e, w], i) => `<div class="mx-duo-cell${i === t ? " on" : ""}" style="--c:${col(TCOL[i])}"><b>${e} ${w}</b><small>${ranges[i]}</small></div>`).join("")}</div></div>`;
    const head = { same: ["✅ 두 지표가 같은 방향이에요", "var(--mx5)"], fngMore: ["⚠️ 엇갈려요: 공포탐욕지수가 더 겁먹었어요", "var(--mx2)"], vixMore: ["⚠️ 엇갈려요: VIX가 더 겁먹었어요", "var(--mx2)"] }[kind];
    let body = "";
    if (kind === "same") {
      body = a >= 3 ? "둘 다 겁먹은 쪽이라 공포 신호가 겹쳐요. 두 지표가 함께 가리킬 때가 신호가 가장 강해요."
        : a <= 1 ? "둘 다 평온한 쪽이라 시장 분위기가 안정적이에요."
        : "둘 다 중간쯤이라 한쪽으로 뚜렷한 신호는 없어요.";
    } else if (kind === "fngMore") {
      body = `VIX(${vx.valueText})만 보면 크게 불안하지 않은데, 공포탐욕지수(${fg.value}점)는 겁먹은 쪽이에요. 이런 조합은 대개 <b>지수는 버티는데 종목 대부분이 약한 장</b>이거나, 125일 평균처럼 <b>느리게 움직이는 재료가 지난 하락을 아직 반영하고 있는</b> 경우예요.`;
    } else {
      body = `공포탐욕지수(${fg.value}점)는 덤덤한데 VIX(${vx.valueText})는 높아요. 이런 조합은 대개 실적 발표, 연준 회의, 선거 같은 <b>큰 일정을 앞두고 보험(옵션)을 미리 사 두는</b> 경우이거나, <b>급락이 막 시작돼</b> 느린 재료들이 아직 따라오지 못한 경우예요.`;
      if (ratio) body += ratio.value >= 1
        ? ` 지금 VIX÷VIX3M이 ${ratio.valueText}로 1을 넘어서, 앞날보다 '지금 당장'이 더 무서운 상태예요. 급락 초기 쪽에 가까워요.`
        : ` 지금 VIX÷VIX3M은 ${ratio.valueText}로 1 아래라, 당장의 충격보다는 앞으로의 일정에 대비하는 쪽에 가까워요.`;
    }
    const inside = avg50 == null ? "" : (() => {
      const pct = (vx.value / avg50 - 1) * 100, up = pct >= 0;
      return `<li>공포탐욕지수는 VIX를 그대로 쓰지 않고 <b>최근 50일 평균과 비교</b>해요. 지금 VIX(${vx.valueText})는 50일 평균 ${avg50.toFixed(1)}보다 <b>${Math.abs(pct).toFixed(0)}% ${up ? "높아서" : "낮아서"}</b>, 공포탐욕지수 안에서는 ${Math.abs(pct) < 5 ? "중립에 가깝게" : up ? "‘공포’ 쪽으로" : "‘안심’ 쪽으로"} 계산돼요.${up && a <= 1 ? " 숫자 자체는 평온해 보여도 평소보다는 올라 있다는 뜻이에요." : ""}</li>`;
    })();
    const check = kind === "fngMore"
      ? `<li>확인할 곳: <button class="mx-link" data-goview="highs">52주 신고가 탭</button>에서 미국 신고가 종목 수가 줄었는지, 몇몇 대형주만 버티고 있는지 보세요. 신고가 종목이 적은데 지수만 높다면 이 경우에 해당해요.</li>`
      : kind === "vixMore" ? `<li>확인할 곳: 이번 달 큰 일정(실적 발표, 연준 회의, 선거)이 있는지, 위의 VIX÷VIX3M 카드가 1을 넘는지 함께 보세요.</li>` : "";
    return `<article class="card mx-duo" style="--c:${head[1]}">
      <div class="mx-head"><div><div class="mx-name">VIX와 공포탐욕지수 함께 읽기</div><div class="mx-dir">두 지표를 같은 ‘겁먹은 정도’ 칸에 나란히 놓았어요. 오른쪽으로 갈수록 겁먹은 상태예요</div></div></div>
      <div class="mx-duo-v" style="color:${head[1]}">${head[0]}</div>
      ${row("VIX", vx.valueText, a, VIX_R)}${row("공포탐욕지수", `${fg.value}점`, b, FNG_R)}
      <p class="mx-duo-p">${body}</p>
      <ul class="mx-duo-ul">${inside}${check}</ul>
      <details class="mx-duo-more"><summary>왜 두 지표는 자주 어긋날까요? (5가지 이유)</summary>
        <ol>
          <li><b>VIX는 공포탐욕지수의 재료 7개 중 하나예요.</b> 비중이 약 14%라서 VIX가 크게 움직여도 나머지 6개가 조용하면 공포탐욕지수는 별로 안 움직여요.</li>
          <li><b>재는 방식이 달라요.</b> VIX는 그 숫자 자체(절대 수준)이고, 공포탐욕지수는 VIX를 최근 50일 평균과 비교해요. 같은 VIX 20이라도 14에서 올라온 20은 ‘공포’, 30에서 내려온 20은 ‘안심’으로 계산돼요.</li>
          <li><b>반응 속도가 달라요.</b> VIX는 옵션 가격에서 바로 나와 분 단위로 반응해요. 공포탐욕지수에는 125일 평균, 52주 신고가처럼 느린 재료가 섞여 있어서 급락 뒤 반등할 때는 VIX가 먼저 내려오고 공포탐욕지수는 한동안 ‘공포’에 머물러요. 급락 초기에는 반대로 VIX가 먼저 튀어요.</li>
          <li><b>지수는 오르는데 속이 약한 장에서 크게 갈려요.</b> 몇몇 대형주가 S&amp;P500을 끌어올리면 지수가 안정적이라 VIX는 낮아요. 하지만 신고가 강도와 시장 폭 재료는 ‘대부분 종목이 약하다’고 보고 공포탐욕지수를 끌어내려요.</li>
          <li><b>VIX에는 ‘일정 보험료’가 붙어요.</b> VIX는 앞으로 30일 동안의 출렁임 예상이라서, 분위기가 좋아도 실적 시즌이나 선거, 연준 회의를 앞두면 오를 수 있어요. 공포탐욕지수는 이런 일정 프리미엄을 거의 담지 않아요.</li>
        </ol>
        <div class="mx-duo-t"><b>공포탐욕지수의 재료 7개</b> (각각 0~100점으로 바꾼 뒤 똑같은 비중으로 평균)
          <table><tbody>
            <tr><td>주가 모멘텀</td><td>S&amp;P500이 125일 평균보다 얼마나 위에 있는지</td></tr>
            <tr><td>신고가 강도</td><td>52주 신고가 종목 수와 신저가 종목 수 비교</td></tr>
            <tr><td>시장 폭</td><td>오르는 종목 거래량과 내리는 종목 거래량 비교</td></tr>
            <tr><td>풋콜 비율</td><td>하락에 거는 옵션과 상승에 거는 옵션의 비율</td></tr>
            <tr><td>정크본드 수요</td><td>위험한 회사채와 안전한 국채의 금리 차이</td></tr>
            <tr><td>안전자산 수요</td><td>최근 20일 주식 수익률과 채권 수익률 비교</td></tr>
            <tr><td>변동성</td><td>VIX를 50일 평균과 비교</td></tr>
          </tbody></table></div>
        <p class="mx-foot">읽는 법: 두 지표가 같은 방향이면 신호가 강하고, 어긋나면 그 자체가 정보예요. VIX만 높으면 다가오는 일정에 대한 보험 수요, 공포탐욕지수만 낮으면 지수 겉모습과 달리 종목 대부분이 약한 장일 가능성이 커요.</p>
      </details></article>`;
  }

  function sentence(d) {
    const rows = d.indicators.filter((r) => r.level);
    const bad = rows.filter((r) => r.level <= 2), fast = rows.filter((r) => r.speedBump > 0);
    const out = [bad.length ? `지표 ${rows.length}개 중 ${bad.length}개가 🟠경계 이상이에요.` : `지표 ${rows.length}개 모두 🟠경계보다 아래예요.`];
    if (fast.length) out.push(`최근 한 달 사이 빠르게 나빠진 지표는 ${fast.map(short).join(", ")}예요.`);
    const f = rows.find((r) => r.key === "fng");
    if (f) out.push(`투자자 분위기는 '${f.zone}'(${f.value}점)이에요.`);
    const o = duoInfo(d);
    if (o && o.kind !== "same") out.push(o.kind === "fngMore" ? "VIX는 비교적 차분한데 공포탐욕지수는 더 겁먹어 두 지표가 엇갈려요(아래 ‘함께 읽기’ 카드 참고)." : "공포탐욕지수는 덤덤한데 VIX가 더 높아 두 지표가 엇갈려요(아래 ‘함께 읽기’ 카드 참고).");
    return out.join(" ");
  }

  function render() {
    const d = st.data, c = d.composite, t = new Date(d.asOf);
    $("#mxMeta").textContent = `마지막 갱신 ${t.getMonth() + 1}월 ${t.getDate()}일 ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")} · 지표 ${c.total}개 중 ${c.available}개 받음 · 매일 아침 7시쯤 자동으로 새로 고쳐져요`;
    // 왼쪽 안전 → 오른쪽 위험 (지표 카드의 칸 막대와 같은 방향)
    const steps = [5, 4, 3, 2, 1].map((lv) => `<div class="mx-step ${lv === c.level ? "on" : ""}" style="--c:${col(lv)}"><div class="n">${c.counts[lv] ?? 0}</div><div class="t">${LV[lv][0]} ${LV[lv][1]}</div><div class="mx-bar" style="opacity:${(c.counts[lv] ?? 0) ? .9 : .15}"></div></div>`).join("");
    const alarms = d.indicators.filter((r) => r.level && r.level <= 2).map((r) => `<span class="mx-chip" style="--c:${col(r.level)}">${r.emoji} ${esc(short(r))}</span>`).join("");
    let h = `<section class="mx-hero">
      <div class="card mx-verdict" style="--c:${col(c.level)}"><div class="k">오늘 시장 위험도 (지표 ${c.available}개 종합)</div>
        <div class="big"><b>${c.emoji} ${esc(c.label)}</b><span>5단계 중 ${c.level ?? "–"}단계 · 1단계가 가장 위험</span></div><p>${esc(sentence(d))}</p></div>
      <div class="card"><div class="mx-ladder">${steps}</div>${alarms ? `<div class="mx-alarms">${alarms}</div>` : ""}
        <p class="foot-note">칸 안 숫자는 그 단계에 있는 지표 개수예요. <b>오른쪽(🔴 위기)으로 갈수록 위험</b>해요. 아래 칩은 지금 🟠경계 이상인 지표예요. 단계는 '최근 5년과 비교한 위치'와 '최근 한 달 동안 얼마나 빨리 변했는지'를 함께 보고 정해요.</p></div></section>`;
    // 2026-10-25 재배치: 미국 지표를 먼저, 굵은 구분선 뒤에 한국 지표.
    // VKOSPI는 한국 변동성, CNN 공포탐욕지수는 미국 투자 심리로 각 나라 안에 넣는다(원본 group 값은 '변동성'·'심리'라 key로 나눈다).
    const market = (r) => r.key === "vkospi" || /^kr_/.test(r.key) || /^한국/.test(r.group) ? "KR" : "US";
    const sub = (r) => r.group === "변동성" ? "변동성" : r.group === "심리" ? "투자 심리" : "신용·금리·유동성";
    const SUBS = ["신용·금리·유동성", "변동성", "투자 심리"];
    const worstOf = (rows) => Math.min(6, ...rows.filter((r) => r.level).map((r) => r.level));
    [["US", "🇺🇸", "미국"], ["KR", "🇰🇷", "한국"]].forEach(([mk, flag, title], i) => {
      const rows = d.indicators.filter((r) => market(r) === mk);
      if (!rows.length) return;
      const w = worstOf(rows);
      h += `<section class="mx-market mx-${mk.toLowerCase()}${i ? " mx-after" : ""}" aria-label="${title} 지표">
        <div class="mx-market-h"><h2>${flag} ${title} 지표</h2><span class="sub">지표 ${rows.length}개${w <= 5 ? ` · 가장 위험한 지표: ${LV[w][0]} ${LV[w][1]}` : ""}</span></div>`;
      SUBS.forEach((s) => {
        const sr = rows.filter((r) => sub(r) === s);
        if (!sr.length) return;
        const sw = worstOf(sr);
        const label = mk === "KR" && s === "신용·금리·유동성" ? "신용·금리" : s;
        h += `<div class="mx-group-h"><h3>${label}</h3><span class="sub">${sr.length}개 지표${sw <= 5 ? ` · 가장 위험한 지표: ${LV[sw][0]} ${LV[sw][1]}` : ""}</span></div><div class="mx-grid">${sr.map(card).join("")}</div>`;
        if (mk === "US" && s === "투자 심리") h += duo(d);
      });
      h += `</section>`;
    });
    $("#mxBody").innerHTML = h;
    $("#mxBody").querySelectorAll("[data-goview]").forEach((b) => b.addEventListener("click", () => {
      const t = document.querySelector(`[data-view="${b.dataset.goview}"]`);
      if (t) { t.click(); scrollTo({ top: 0 }); }
    }));
  }

  async function load(force) {
    if (st.data && !force) return render();
    if (!st.loading) st.loading = fetch(SRC + "?v=" + Date.now(), { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
    try { st.data = await st.loading; render(); }
    catch (e) { $("#mxBody").innerHTML = `<div class="mx-empty">매크로 지수 자료를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</div>`; }
    finally { st.loading = null; }
  }

  window.__macro = { show: () => load(false), reload: () => { st.data = null; if (!$("#viewMacro").hidden) load(true); } };
})();
