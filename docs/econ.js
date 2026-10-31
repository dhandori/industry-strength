/* 매크로 탭 '미국 물가·고용(고통지수)' 묶음 (2026-10-27 추가)
   자료: data/us_econ.json — scripts/us_econ.py 가 FRED 공개 자료로 만든다(.github/workflows/us-econ.yml).
   매크로 탭에서 '미국'을 골랐을 때만 #mxEcon 에 그린다. macro.js 는 render 끝에 window.__econ.render(시장) 만 부른다.
   2026-10-30: 고통지수는 경기 묶음의 첫 카드(맨 위에 따로 두니 튀어서 옮김). */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const col = (lv) => `var(--mx${lv || 0})`;
  const st = { data: null, loading: null, span: 60 };
  const SPANS = [[24, "2년"], [60, "5년"], [120, "10년"], [0, "전체"]];
  try { const v = localStorage.getItem("ec-span"); if (v != null && SPANS.some(([n]) => n === +v)) st.span = +v; } catch (e) {}
  const ym = (d) => `${d.slice(2, 4)}.${d.slice(5, 7)}`;
  const ymK = (d) => `${+d.slice(0, 4)}년 ${+d.slice(5, 7)}월`;
  const mdK = (d) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;

  // 지표 설명: 이름, 무엇인가, 단위 표시, 상태 판정(값 → [단계, 꼬리표]), 기준선, 막대 그래프 여부
  const MAN = (v) => v >= 1e6 ? `${(v / 1e4).toFixed(1)}만` : `${(v / 1e4).toFixed(1)}만`;
  const DEF = {
    cpi: { n: "소비자물가 상승률 (CPI, 전년 대비)", g: "물가", f: (v) => v.toFixed(1) + "%", ref: [2],
      why: "장바구니 물가가 1년 전보다 몇 % 올랐는지예요. 연준 목표는 2% 근처예요. 높을수록 금리를 내리기 어려워요.",
      lv: (v) => v <= 2.5 ? [5, "목표 근처"] : v <= 3.5 ? [3, "목표보다 높음"] : v <= 5 ? [2, "높음"] : [1, "매우 높음"], extra: (x) => `최근 3개월 연율 ${x.toFixed(1)}%` },
    core_cpi: { n: "근원 소비자물가 (식품·에너지 뺀 CPI)", g: "물가", f: (v) => v.toFixed(1) + "%", ref: [2],
      why: "값이 크게 출렁이는 식품·에너지를 뺀 물가예요. 물가의 '바닥 흐름'이라 연준이 더 눈여겨봐요.",
      lv: (v) => v <= 2.5 ? [5, "목표 근처"] : v <= 3.5 ? [3, "목표보다 높음"] : v <= 5 ? [2, "높음"] : [1, "매우 높음"], extra: (x) => `최근 3개월 연율 ${x.toFixed(1)}%` },
    core_pce: { n: "근원 PCE 물가 (연준 기준 물가)", g: "물가", f: (v) => v.toFixed(1) + "%", ref: [2],
      why: "연준이 2% 목표를 잴 때 공식으로 쓰는 물가예요. CPI보다 한 달쯤 늦게 나와요.",
      lv: (v) => v <= 2.3 ? [5, "목표 근처"] : v <= 3 ? [3, "목표보다 높음"] : v <= 4 ? [2, "높음"] : [1, "매우 높음"], extra: (x) => `최근 3개월 연율 ${x.toFixed(1)}%` },
    breakeven: { n: "10년 기대인플레이션 (BEI)", g: "물가", f: (v) => v.toFixed(2) + "%", ref: [2], daily: true,
      why: "채권시장이 앞으로 10년 동안 평균 몇 % 물가 상승을 예상하는지예요. 2~2.5%면 '물가 기대가 묶여 있다'고 봐요.",
      lv: (v) => v <= 2.5 ? [5, "안정"] : v <= 2.8 ? [3, "조금 높음"] : [2, "높음"] },
    unrate: { n: "실업률", g: "고용", f: (v) => v.toFixed(1) + "%", ref: [],
      why: "일하고 싶은데 일자리가 없는 사람 비율이에요. 수준보다 '최근 1년 최저에서 얼마나 올랐는지'가 경기침체 신호로 더 중요해요(아래 삼의 법칙).",
      lv: () => null },
    sahm: { n: "삼의 법칙 (경기침체 경보)", g: "고용", f: (v) => v.toFixed(2) + "%p", ref: [0.5],
      why: "실업률 3개월 평균이 지난 1년 중 가장 낮았던 때보다 몇 %p 올랐는지예요. 0.5 이상이면 과거엔 거의 늘 경기침체가 시작됐어요.",
      lv: (v) => v < 0.3 ? [5, "안전"] : v < 0.5 ? [3, "경계 근접"] : [1, "침체 신호"] },
    payrolls: { n: "비농업 고용 증감 (한 달 새 늘어난 일자리)", g: "고용", f: (v) => `${v >= 0 ? "+" : ""}${(v / 10).toFixed(1)}만 명`, ref: [0], bars: true,
      why: "한 달 동안 미국 일자리가 몇 개 늘었는지예요(농업 제외). 꾸준히 10만 개 넘게 늘면 탄탄, 0 아래면 일자리가 줄어드는 거예요.",
      lv: (v, i) => { const a = i.extra; return a > 100 ? [5, "탄탄"] : a > 30 ? [4, "둔화"] : a > 0 ? [3, "많이 둔화"] : [1, "감소"]; }, extra: (x) => `최근 3개월 평균 ${x >= 0 ? "+" : ""}${(x / 10).toFixed(1)}만 명` },
    claims: { n: "신규 실업수당 청구 (주간)", g: "고용", f: (v) => `${MAN(v)} 건`, ref: [], daily: true,
      why: "한 주 동안 새로 실업수당을 신청한 사람 수예요. 해고가 늘면 가장 먼저 오르는 숫자예요. 4주 평균으로 흐름을 봐요.",
      lv: (v, i) => { const a = i.extra; return a < 230000 ? [5, "낮음(해고 적음)"] : a < 270000 ? [4, "보통"] : a < 320000 ? [3, "늘어나는 중"] : [2, "높음"]; }, extra: (x) => `4주 평균 ${MAN(x)} 건` },
    cont_claims: { n: "계속 실업수당 청구 (주간)", g: "고용", f: (v) => `${MAN(v)} 명`, ref: [], daily: true,
      why: "실업수당을 계속 받고 있는 사람 수예요. 오르면 잃은 일자리를 다시 찾기 어려워졌다는 뜻이에요.",
      lv: (v, i) => { const y = i.year_ago ? v / i.year_ago - 1 : 0; return y > 0.15 ? [2, "1년 새 크게 늘어남"] : y > 0.05 ? [3, "늘어나는 중"] : [5, "안정"]; } },
    vu: { n: "구인 건수 ÷ 실업자 수", g: "고용", f: (v) => v.toFixed(2) + "배", ref: [1],
      why: "빈 일자리가 실업자 한 명당 몇 개인지예요. 1보다 크면 일자리가 사람보다 많아 임금이 오르기 쉬워요. 1 아래로 내려가면 노동시장이 식는 중이에요.",
      lv: (v) => v >= 1.2 ? [4, "빡빡(임금 압력)"] : v >= 1 ? [5, "균형"] : v >= 0.8 ? [3, "식는 중"] : [2, "약함"] },
  };

  // ---------- 그래프 (월별·주별·일별 공통)
  function chart(series, opt) {
    let s = series;
    if (opt.days) {
      // 거래일 기준: 매일 자료는 마지막 N+1개, 매주 자료는 N거래일 ≈ N×7/5 달력일
      if (opt.weekly) { const e = new Date(s.at(-1)[0] + "T00:00:00Z"); e.setUTCDate(e.getUTCDate() - Math.round(opt.days * 7 / 5)); const from = e.toISOString().slice(0, 10); s = s.filter((p) => p[0] >= from); }
      else s = s.slice(-(opt.days + 1));
    }
    if (opt.months) { const end = s.at(-1)[0]; const y = +end.slice(0, 4), m = +end.slice(5, 7) - opt.months; const from = `${y + Math.floor((m - 1) / 12)}-${String(((m - 1) % 12 + 12) % 12 + 1).padStart(2, "0")}-01`; s = s.filter((p) => p[0] >= from); }
    if (s.length < 2) return "";
    const small = innerWidth < 640, W = small ? 360 : (opt.W || 600), H = opt.h || (small ? 170 : 180), L = small ? 40 : 46, R = 10, T = 10, B = 24;
    const lines = opt.lines || [{ v: s.map((p) => p[1]), c: "var(--price)", w: 1.8 }];
    if (opt.lines) lines.forEach((ln) => { ln.v = ln.v.slice(-s.length); });
    const vals = lines.flatMap((ln) => ln.v).concat(opt.ref || []).filter((v) => v != null);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (opt.bars) lo = Math.min(lo, 0);
    const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
    const x = (i) => L + (W - L - R) * i / (s.length - 1), y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
    let g = "";
    for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4, yy = y(v).toFixed(1); g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="var(--grid)"/><text x="${L - 6}" y="${+yy + 3.5}" text-anchor="end" font-size="11" fill="var(--muted)">${opt.ax(v)}</text>`; }
    if (opt.zone != null && opt.zone < hi) g += `<rect x="${L}" y="${T}" width="${W - L - R}" height="${Math.max(0, y(opt.zone) - T).toFixed(1)}" fill="var(--mx1)" opacity=".07"/>`;   // 위험 구간 칠하기
    (opt.ref || []).filter((v) => v > lo && v < hi).forEach((v) => { g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${opt.refC || "var(--mx2)"}" stroke-dasharray="3 3"/>`; });
    // 가로축: 기간 길이에 맞춰 해(年) 또는 달
    const span = (Date.parse(s.at(-1)[0]) - Date.parse(s[0][0])) / 3.156e10;
    const every = span > 40 ? 10 : span > 15 ? 5 : span > 6 ? 2 : span > 2.5 ? 1 : 0;
    let xt = "", last = "";
    const tk = (i, t) => { const xx = x(i).toFixed(1), end = W - R - x(i) < 18; return `<line x1="${xx}" x2="${xx}" y1="${H - B}" y2="${H - B + 4}" stroke="var(--muted)"/><text x="${end ? W - R : xx}" y="${H - 7}" text-anchor="${end ? "end" : "middle"}" font-size="11" fill="var(--muted)">${t}</text>`; };
    // 반년이 안 되는 짧은 기간(20·60거래일 등): 날짜(월/일) 눈금을 끝에서부터 고르게
    if (span < 0.5) { const st2 = Math.max(1, Math.ceil(s.length / (small ? 4 : 6))); for (let i = s.length - 1; i >= 0; i -= st2) if (x(i) - L > 14) xt += tk(i, `${+s[i][0].slice(5, 7)}/${+s[i][0].slice(8, 10)}`); }
    else s.forEach((p, i) => {
      const yr = +p[0].slice(0, 4), mo = +p[0].slice(5, 7);
      const key = every ? String(yr) : p[0].slice(0, 7);
      if (key === last) return;
      const show = every ? (last && yr % every === 0) : (last && mo % (small ? 6 : 3) === 1);
      last = key;
      if (!show) return;
      const xx = x(i).toFixed(1);
      xt += `<line x1="${xx}" x2="${xx}" y1="${H - B}" y2="${H - B + 4}" stroke="var(--muted)"/><text x="${xx}" y="${H - 7}" text-anchor="middle" font-size="11" fill="var(--muted)">${every ? yr : ym(p[0])}</text>`;
    });
    let body = "";
    if (opt.bars) {
      const bw = Math.max(1, (W - L - R) / s.length - 1);
      body = s.map((p, i) => `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${Math.min(y(p[1]), y(0)).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.abs(y(p[1]) - y(0)).toFixed(1)}" fill="${p[1] >= 0 ? "var(--up)" : "var(--down)"}" opacity=".75"/>`).join("");
      if (opt.avg) body += `<path d="${opt.avg.slice(-s.length).map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1)).join("")}" fill="none" stroke="var(--ink)" stroke-width="1.6"/>`;
    }
    for (const ln of lines.slice(opt.bars ? 1 : 0)) {
      let d = "", pen = false;
      ln.v.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1); pen = true; });
      body += `<path d="${d}" fill="none" stroke="${ln.c}" stroke-width="${ln.w || 1.6}"${ln.dash ? ` stroke-dasharray="${ln.dash}"` : ""} stroke-linejoin="round"/>`;
    }
    // 표시할 점(예: 과거 고점) [날짜, 값, 글자]
    (opt.marks || []).forEach(([d, v, t, below]) => {
      const i = s.findIndex((p) => p[0] === d);
      if (i < 0) return;
      const xx = x(i), yy = y(v), right = xx > W - 60;
      body += `<circle cx="${xx.toFixed(1)}" cy="${yy.toFixed(1)}" r="3.5" fill="var(--mx1)" stroke="var(--surface)" stroke-width="1.5"/><text x="${(xx + (right ? -6 : 0)).toFixed(1)}" y="${(below ? yy + 16 : yy - 7).toFixed(1)}" text-anchor="${right ? "end" : "middle"}" font-size="10.5" font-weight="700" fill="var(--mx1)" paint-order="stroke" stroke="var(--surface)" stroke-width="3">${esc(t)}</text>`;
    });
    const lv = lines[0].v.at(-1);
    if (!opt.bars && lv != null) body += `<circle cx="${x(s.length - 1)}" cy="${y(lv)}" r="4.5" fill="${opt.dot || "var(--price)"}" stroke="var(--surface)" stroke-width="2"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" role="img">${g}<line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="var(--muted)"/>${xt}${body}</svg>`;
  }
  // 그래프마다 기간 단추 (2026-10-31). 매일·매주 자료 = 20·60·200거래일 + 2년·전체, 매월 자료 = 1년·2년·5년·10년·전체
  // (매월 자료는 한 달에 점 하나라 20·60거래일로는 그릴 게 없다). 위쪽 '그래프 기간' 버튼을 누르면 모두 그 기간으로 돌아간다.
  const DSP = [[20, "20일"], [60, "60일"], [200, "200일"], ["m24", "2년"], ["m0", "전체"]];
  const MSP = [["m12", "1년"], ["m24", "2년"], ["m60", "5년"], ["m120", "10년"], ["m0", "전체"]];
  st.cs = {};
  const spOf = (key, daily, def) => st.cs[key] ?? def ?? (daily ? (st.span === 24 ? "m24" : "m0") : `m${st.span}`);
  const spOpt = (key, daily, def) => { const v = spOf(key, daily, def); return typeof v === "number" ? { days: v } : { months: +v.slice(1) }; };
  const pick = (key, daily, def) => { const v = spOf(key, daily, def); return `<span class="mx-mini" role="group" aria-label="이 그래프 기간">${(daily ? DSP : MSP).map(([n, t]) => `<button type="button" data-ecs="${key}" data-v="${n}" aria-pressed="${v === n}">${t}</button>`).join("")}</span>`; };

  // ---------- 카드
  function card(i) {
    const D = DEF[i.key];
    const lv = D.lv(i.value, i);
    const dateTxt = D.daily ? `${mdK(i.date)}` : ymK(i.date);
    const ch = i.prev == null ? "" : (() => {
      const dv = i.value - i.prev;
      if (i.key === "payrolls") return "";
      // 변화 폭: %는 %p로, 나머지는 같은 단위로
      const amt = D.f(Math.abs(dv)).replace(/^[+-]/, "").replace(/%$/, "%p").replace(/%p p$/, "%p");
      return `<span class="ec-ch">${D.daily ? "직전 대비" : "전월 대비"} <b class="${dv > 0 ? "up" : dv < 0 ? "down" : ""}">${dv > 0 ? "▲" : dv < 0 ? "▼" : ""}${dv === 0 ? "변화 없음" : amt}</b></span>`;
    })();
    const ya = i.year_ago == null || i.key === "payrolls" ? "" : `<span class="ec-ch">1년 전 ${D.f(i.year_ago)}</span>`;
    const ex = D.extra && i.extra != null ? `<span class="ec-ch">${D.extra(i.extra)}</span>` : "";
    let avg = null;
    if (i.key === "payrolls") { const v = i.series.map((p) => p[1]); avg = v.map((_, k) => k < 2 ? null : (v[k] + v[k - 1] + v[k - 2]) / 3); }
    if (i.key === "claims") { const v = i.series.map((p) => p[1]); avg = v.map((_, k) => k < 3 ? null : (v[k] + v[k - 1] + v[k - 2] + v[k - 3]) / 4); }
    const ax = i.key === "claims" || i.key === "cont_claims" ? (v) => (v / 1e4).toFixed(0) + "만" : i.key === "payrolls" ? (v) => (v / 10).toFixed(0) + "만" : (v) => v.toFixed(i.key === "vu" || i.key === "sahm" ? 1 : 1);
    const wk = i.key === "claims" || i.key === "cont_claims";
    const svg = chart(i.series, { ...spOpt(i.key, D.daily), weekly: wk, ref: D.ref, ax, bars: D.bars, avg: D.bars ? avg : null, dot: lv ? col(lv[0]) : null,
      lines: !D.bars && avg ? [{ v: i.series.map((p) => p[1]), c: "var(--muted)", w: 1.2 }, { v: avg, c: "var(--price)", w: 2 }] : D.bars ? [{ v: i.series.map((p) => p[1]) }] : null });
    const legend = i.key === "claims" ? `<div class="chart-legend"><span><i style="background:var(--muted)"></i>매주 값</span><span><i style="background:var(--price)"></i>4주 평균</span>${D.ref.length ? "" : ""}</div>`
      : i.key === "payrolls" ? `<div class="chart-legend"><span><i style="background:var(--up)"></i>늘어난 달</span><span><i style="background:var(--down)"></i>줄어든 달</span><span><i style="background:var(--ink)"></i>3개월 평균</span></div>`
      : D.ref.length ? `<div class="chart-legend"><span><i style="background:var(--mx2)"></i>기준선 ${D.ref.map((r) => i.key === "sahm" ? r + "%p(침체 신호)" : i.key === "vu" ? r + "배" : r + "%(연준 목표)").join(", ")}</span></div>` : "";
    return `<article class="card mx-card ec-card" style="--c:${lv ? col(lv[0]) : "var(--line)"}">
      <div class="mx-head"><div><div class="mx-name">${esc(D.n)}</div></div>${lv ? `<span class="mx-chip" style="--c:${col(lv[0])}">${esc(lv[1])}</span>` : ""}</div>
      <div class="mx-val"><b>${D.f(i.value)}</b><span class="ec-date">${dateTxt}</span></div>
      <div class="ec-chs">${ch}${ex}${ya}</div>
      <div class="mx-chart">${pick(i.key, D.daily)}${svg}${legend}</div>
      <div class="mx-why"><b>무엇인가요?</b> ${esc(D.why)}</div></article>`;
  }

  function hero(m) {
    const lv = m.value < 7 ? [5, "낮음"] : m.value < 10 ? [4, "보통"] : m.value < 13 ? [3, "높음"] : m.value < 17 ? [2, "매우 높음"] : [1, "극심"];
    const s = m.series, ago3 = s.length > 3 ? s[s.length - 4][1] : null;
    const dir = ago3 == null ? "" : m.value > ago3 + 0.2 ? `석 달 전(${ago3.toFixed(1)})보다 <b class="up">올라가는 중</b>` : m.value < ago3 - 0.2 ? `석 달 전(${ago3.toFixed(1)})보다 <b class="down">내려가는 중</b>` : `석 달 전(${ago3.toFixed(1)})과 비슷`;
    const cpiS = (st.data.indicators.find((x) => x.key === "cpi") || {}).series || [];
    const unS = (st.data.indicators.find((x) => x.key === "unrate") || {}).series || [];
    const months = spOpt("misery", false).months;
    // 물가·실업률 선은 날짜로 맞춰 붙인다(두 자료는 2014년부터만 있어서 '전체'에서는 고통지수만)
    const cm = Object.fromEntries(cpiS), um = Object.fromEntries(unS);
    const sub = s.filter((p) => p[0] >= (cpiS[0] || [""])[0]);
    const lines = months && cpiS.length
      ? [{ v: sub.map((p) => p[1]), c: "var(--price)", w: 2.4 }, { v: sub.map((p) => cm[p[0]] ?? null), c: "var(--ma20)", w: 1.4, dash: "4 3" }, { v: sub.map((p) => um[p[0]] ?? null), c: "var(--ma50)", w: 1.4, dash: "4 3" }]
      : null;
    const svg = chart(lines ? sub : s, { months, ref: [m.avg], refC: "var(--muted)", ax: (v) => v.toFixed(0), dot: col(lv[0]), lines, h: innerWidth < 640 ? 190 : 210 });
    // 2026-10-30: 맨 위 따로 튀던 큰 카드 → 경기 묶음 첫 카드(다른 지표 카드와 같은 모양, 접으면 값·구성만)
    return `<article class="card mx-card ec-hero" style="--c:${col(lv[0])}">
      <div class="mx-head"><div><div class="mx-name">미국 고통지수 (Misery Index)</div><div class="mx-dir">물가상승률 + 실업률 · 높을수록 체감 경기 나쁨</div></div><span class="mx-chip" style="--c:${col(lv[0])}">${lv[1]}</span></div>
      <div class="mx-val"><b>${m.value.toFixed(1)}</b><span class="ec-date">${ymK(m.date)}</span><span class="ec-formula">= 물가 <b>${m.cpi.toFixed(1)}%</b> + 실업 <b>${m.unrate.toFixed(1)}%</b></span></div>
      <div class="ec-hero-b">
        <div class="ec-hero-l"><p>${dir}. 1948년 이후 지금보다 낮았던 달이 <b>${m.pct_rank}%</b>예요. 역대 평균 ${m.avg.toFixed(1)}, 최근 5년 ${m.five_lo.toFixed(1)}~${m.five_hi.toFixed(1)}, 가장 높았던 때는 ${ymK(m.peak[0])} ${m.peak[1].toFixed(1)}이에요.</p>
          <p class="ec-why"><b>무엇인가요?</b> 물가가 오르는 고통과 일자리를 잃는 고통을 더한 숫자예요. 높을수록 사람들이 체감하는 경기가 나쁘고, 소비·선거·정책에 압력이 커져요. 10을 넘으면 높은 편, 7 아래면 편한 편으로 봐요.</p></div>
        <div class="ec-hero-r"><div class="mx-chart">${pick("misery", false)}${svg}<div class="chart-legend"><span><i style="background:var(--price)"></i>고통지수</span>${lines ? `<span><i style="background:var(--ma20)"></i>물가상승률</span><span><i style="background:var(--ma50)"></i>실업률</span>` : ""}<span><i style="background:var(--muted)"></i>역대 평균 ${m.avg.toFixed(1)}</span></div></div></div>
      </div>
    </article>`;
  }

  // ---------- 미국 국채 금리 2년·10년·30년 (매일)
  const TR = [["2년", "var(--ma20)", "연준 기준금리 예상을 가장 잘 따라가요. 내리면 시장이 금리 인하를 기대하는 중이에요."],
    ["10년", "var(--price)", "주택담보대출·회사채 금리의 기준이 되는 대표 금리예요. 오르면 주식(특히 성장주) 값에 부담이에요."],
    ["30년", "var(--ma200)", "가장 긴 국채 금리예요. 나라 빚·장기 물가에 대한 걱정이 크면 많이 올라요."]];
  function treasury(t) {
    if (!t || !t.series || t.series.length < 30) return "";
    const s = t.series, f = (v) => v == null ? "–" : v.toFixed(2) + "%";
    const bp = (a, b) => { if (a == null || b == null) return `<span class="muted">–</span>`; const v = Math.round((a - b) * 100); return `<b class="${v > 0 ? "up" : v < 0 ? "down" : ""}">${v > 0 ? "+" : ""}${v}bp</b>`; };
    const row = (k) => `<tr><td><i class="ec-dot" style="background:${TR[k][1]}"></i><b>${TR[k][0]}</b></td><td class="num"><b>${f(t.now[k])}</b></td>
      <td class="num">${bp(t.now[k], t.w1 && t.w1[k + 1])}</td><td class="num">${bp(t.now[k], t.m1 && t.m1[k + 1])}</td><td class="num">${bp(t.now[k], t.y1 && t.y1[k + 1])}</td></tr>`;
    const svg = chart(s.map((r) => [r[0], r[2]]), { ...spOpt("treasury", true), ax: (v) => v.toFixed(1), h: innerWidth < 640 ? 200 : 230,
      lines: [{ v: s.map((r) => r[2]), c: TR[1][1], w: 2 }, { v: s.map((r) => r[1]), c: TR[0][1], w: 1.6 }, { v: s.map((r) => r[3]), c: TR[2][1], w: 1.6 }] });
    const sp = (a, b) => Math.round((a - b) * 100);
    const c102 = sp(t.now[1], t.now[0]), c3010 = sp(t.now[2], t.now[1]);
    const curve = c102 < 0 ? `10년이 2년보다 <b>${-c102}bp 낮아요(역전)</b> — 과거엔 경기침체 앞에서 자주 나왔어요.` : `10년이 2년보다 <b>${c102}bp 높아요</b>${c102 < 30 ? "(거의 평평)" : ""}.`;
    return `<article class="card mx-card ec-tr" style="--c:var(--accent)">
      <div class="mx-head"><div><div class="mx-name">미국 국채 금리 (2년·10년·30년)</div></div><span class="ec-date">${+t.date.slice(5, 7)}/${+t.date.slice(8, 10)} 기준</span></div>
      <div class="ec-tr-grid">
        <div><table class="mem-table ec-tr-t"><thead><tr><th>만기</th><th class="num">지금</th><th class="num">1주</th><th class="num">1개월</th><th class="num">1년</th></tr></thead><tbody>${[0, 1, 2].map(row).join("")}</tbody></table>
          <p class="ec-tr-note">${curve} 30년은 10년보다 ${c3010}bp 높아요. 표의 1주·1개월·1년은 그때보다 얼마나 올랐는지(bp = 0.01%p)예요.</p></div>
        <div class="mx-chart">${pick("treasury", true)}${svg}<div class="chart-legend">${[1, 0, 2].map((k) => `<span><i style="background:${TR[k][1]}"></i>${TR[k][0]}</span>`).join("")}</div></div>
      </div>
      <div class="mx-why"><b>무엇인가요?</b> 미국 정부가 2년·10년·30년 동안 돈을 빌릴 때 내는 이자예요. ${TR.map(([n, , w]) => `<b>${n}</b>: ${w}`).join(" ")}</div></article>`;
  }

  // ---------- 빚투(신용융자 잔고 증가율) — FINRA, 매월
  const MPEAK = { "1998": "LTCM 위기", "2000": "닷컴 버블 정점", "2007": "금융위기 직전", "2010": "유럽 위기", "2021": "2022 하락장 앞" };
  function margin(m) {
    if (!m || !m.series || m.series.length < 24) return "";
    const p12 = m.peak12, pk = p12[1], v = m.value;
    const peakOut = pk >= 40 && v <= pk - 10 && m.falls >= 2;
    const lv = peakOut ? [1, "피크아웃 경고"] : v >= 50 ? [2, "과열(역대 고점권)"] : v >= 30 ? [3, "높음"] : v >= 0 ? [5, "보통"] : [4, "빚 줄이는 중"];
    const won = (x) => x >= 1e6 ? `${(x / 1e6).toFixed(2)}조 달러` : `${Math.round(x / 1e3).toLocaleString()}억 달러`;
    const lvl = m.level ? `${won(m.level)}${m.level_year_ago ? ` (1년 전 ${won(m.level_year_ago)})` : ""}` : "";
    const peaks = (m.past_peaks || []).filter((p) => p[0] !== p12[0]);
    const marks = peaks.map((p) => [p[0], p[1], p[0].slice(0, 4)]);
    if (pk >= 40) marks.push([p12[0], pk, `이번 ${pk.toFixed(0)}%`, true]);
    const svg = chart(m.series, { ...spOpt("margin", false, "m0"), ref: [0, 50], zone: 50, ax: (x) => x.toFixed(0) + "%", dot: col(lv[0]), marks, W: 1000, h: innerWidth < 640 ? 210 : 300 });
    const story = peakOut
      ? `증가율이 ${ymK(p12[0])} <b>${pk.toFixed(0)}%</b>로 정점을 찍고 <b>${m.falls}개월 연속 내려와</b> 지금 ${v.toFixed(0)}%예요. 과거엔 이렇게 <b>정점에서 꺾일 때</b>가 주가 고점 신호였던 경우가 많았어요.`
      : v >= 50 ? `빚을 내 주식을 사는 돈이 1년 새 ${v.toFixed(0)}% 늘었어요. 역대 고점권(50% 이상)이라, 여기서 증가율이 꺾이기 시작하면 고점 신호로 봐요.`
      : `빚투 증가율 ${v.toFixed(0)}%. 50%를 넘었다가 꺾이는지가 핵심이에요.`;
    return `<article class="card mx-card ec-mg" style="--c:${col(lv[0])}">
      <div class="mx-head"><div><div class="mx-name">미국 빚투 (신용융자 잔고, 전년 대비 증가율)</div><div class="mx-dir">📈 50% 넘었다가 꺾이면 위험</div></div><span class="mx-chip" style="--c:${col(lv[0])}">${lv[1]}</span></div>
      <div class="mx-val"><b>${v.toFixed(1)}%</b><span class="ec-date">${ymK(m.date)}</span></div>
      <div class="ec-chs"><span class="ec-ch">최근 12개월 최고 <b>${pk.toFixed(1)}%</b>(${ym(p12[0])}) → 지금 <b>${v.toFixed(1)}%</b></span>${m.falls ? `<span class="ec-ch"><b class="down">${m.falls}개월 연속 둔화</b></span>` : ""}<span class="ec-ch">1998년 이후 지금보다 낮았던 달 ${m.pct_rank}%</span>${lvl ? `<span class="ec-ch">잔고 ${lvl}</span>` : ""}</div>
      <p class="ec-story">${story}</p>
      <div class="mx-chart">${pick("margin", false, "m0")}<div class="mx-chart-t">1998년부터 흐름 <span>빨간 칠 = 50% 넘는 과열 구간 · 빨간 점 = 과거 큰 고점</span></div>${svg}</div>
      ${peaks.length ? `<div class="ec-peaks">${peaks.map((p) => `<span><b>${p[0].slice(0, 4)}.${+p[0].slice(5, 7)}</b> ${p[1].toFixed(0)}%${MPEAK[p[0].slice(0, 4)] ? ` · ${MPEAK[p[0].slice(0, 4)]}` : ""}</span>`).join("")}</div>` : ""}
      <div class="mx-why"><b>무엇인가요?</b> 미국 증권사 고객들이 증권사에서 돈을 빌려 주식을 산 금액(신용융자 잔고)이 1년 전보다 몇 % 늘었는지예요. 빚투가 빠르게 늘면 시장이 들뜬 상태이고, 증가세가 정점에서 꺾이면 더 사 줄 돈이 줄어들어 고점 신호가 되곤 했어요. 자료: FINRA 신용거래 통계(매월, 다음 달 셋째 주쯤 발표).</div></article>`;
  }

  // ---------- 빚투 보조: 투자자 순신용, 빚투 ÷ GDP (미국, 매월)
  function miniCard(o) {
    return `<article class="card mx-card" style="--c:${col(o.lv[0])}">
      <div class="mx-head"><div><div class="mx-name">${esc(o.n)}</div>${o.dir ? `<div class="mx-dir">${o.dir}</div>` : ""}</div><span class="mx-chip" style="--c:${col(o.lv[0])}">${esc(o.lv[1])}</span></div>
      <div class="mx-val"><b>${o.v}</b><span class="ec-date">${o.date}</span></div>
      <div class="ec-chs">${o.chs.map((c) => `<span class="ec-ch">${c}</span>`).join("")}</div>
      <div class="mx-chart">${o.pick || ""}${o.title ? `<div class="mx-chart-t">${o.title}</div>` : ""}${o.svg}${o.legend || ""}</div>
      <div class="mx-why"><b>무엇인가요?</b> ${o.why}</div></article>`;
  }
  function marginExtra(m) {
    const out = [];
    const nc = m.net_credit || [];
    if (nc.length > 24) {
      const v = nc.at(-1)[1], low = nc.reduce((a, p) => (p[1] < a[1] ? p : a));
      const lower = Math.round(nc.filter((p) => p[1] < v).length / nc.length * 100);   // 지금보다 빚이 더 많았던 달 비율
      const lv = lower <= 3 ? [1, "역대 최저권(빚 최대)"] : lower <= 15 ? [2, "빚이 현금보다 크게 많음"] : lower <= 40 ? [3, "빚 많은 편"] : [5, "보통"];
      const jo = (x) => `${x < 0 ? "−" : "+"}${(Math.abs(x) / 1000).toFixed(2)}조 달러`;
      out.push(miniCard({ n: "투자자 순신용 (여유 현금 − 빚투)", dir: "📉 낮을수록(음수 클수록) 위험", lv, v: jo(v), date: ymK(nc.at(-1)[0]),
        chs: [`${nc[0][0].slice(0, 4)}년 이후 지금보다 낮았던 달 ${lower}%`, `가장 낮았던 때 ${ym(low[0])} ${jo(low[1])}`],
        pick: pick("netcredit", false, "m0"), svg: chart(nc, { ...spOpt("netcredit", false, "m0"), ref: [0], ax: (x) => (x / 1000).toFixed(1) + "조", dot: col(lv[0]), W: 600 }), title: `${nc[0][0].slice(0, 4)}년부터 흐름(FINRA가 여유 현금을 이때부터 공개)`,
        why: "투자자들이 증권계좌에 넣어 둔 여유 현금에서 신용융자(빚)를 뺀 값이에요. 0보다 아래로 깊이 내려갈수록 현금보다 빚이 많다는 뜻이라, 시장이 흔들릴 때 반대매매로 더 크게 떨어질 수 있어요. 자료: FINRA." }));
    }
    const gr = m.gdp_ratio || [];
    if (gr.length > 24) {
      const v = gr.at(-1)[1], hi = gr.reduce((a, p) => (p[1] > a[1] ? p : a));
      const rank = Math.round(gr.filter((p) => p[1] <= v).length / gr.length * 100);
      const lv = rank >= 97 ? [1, "역대 최고권"] : rank >= 85 ? [2, "매우 높음"] : rank >= 65 ? [3, "높음"] : [5, "보통"];
      const marks = (m.past_peaks || []).map((p) => { const g = gr.find((x) => x[0] === p[0]); return g ? [g[0], g[1], g[0].slice(0, 4)] : null; }).filter(Boolean);
      out.push(miniCard({ n: "빚투 ÷ 미국 GDP", dir: "📈 오를수록 위험", lv, v: v.toFixed(2) + "%", date: ymK(gr.at(-1)[0]),
        chs: [`1998년 이후 지금보다 낮았던 달 ${rank}%`, `가장 높았던 때 ${ym(hi[0])} ${hi[1].toFixed(2)}%`],
        pick: pick("gdpratio", false, "m0"), svg: chart(gr, { ...spOpt("gdpratio", false, "m0"), ax: (x) => x.toFixed(1) + "%", dot: col(lv[0]), marks, W: 600 }), title: "1998년부터 흐름 · 빨간 점 = 빚투 증가율이 고점이던 때",
        why: "신용융자 잔고를 미국 경제 규모(명목 GDP)로 나눈 값이에요. 물가·경제가 커지면 빚 금액도 자연히 커지니, 경제 규모에 비해 빚투가 얼마나 큰지로 과열을 봐요. 자료: FINRA·FRED(GDP, 분기)." }));
    }
    return out.length ? `<div class="mx-grid">${out.join("")}</div>` : "";
  }

  // ---------- 한국 빚투: 신용거래융자 잔고·고객예탁금 (네이버 증권, 매일)
  function krCredit(k) {
    const S = k.series || [];
    if (S.length < 300) return "";
    const dates = S.map((r) => r[0]);
    const idxBefore = (cut) => { let lo = 0, hi = dates.length - 1, a = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (dates[mid] <= cut) { a = mid; lo = mid + 1; } else hi = mid - 1; } return a; };
    const yo = [];   // 2010년부터(2000년대 중반은 잔고가 작아 증가율이 수백~천 %로 튀어 그림을 망친다)
    S.forEach((r) => { const d = new Date(r[0] + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - 365); const j = idxBefore(d.toISOString().slice(0, 10)); if (j >= 0 && S[j][1] && r[0] >= "2010-01-01") yo.push([r[0], Math.round((r[1] / S[j][1] - 1) * 1000) / 10]); });
    const yoRank = Math.round(yo.filter((p) => p[1] <= k.yoy).length / yo.length * 100);
    const ratio = S.map((r) => [r[0], Math.round(r[1] / r[2] * 1000) / 10]);
    const jo = (x) => `${(x / 10000).toFixed(1)}조`;
    const chg = (a, b, t) => { if (!b) return ""; const dv = a - b[1], pc = (a / b[1] - 1) * 100; return `${t} <b class="${dv > 0 ? "up" : dv < 0 ? "down" : ""}">${dv > 0 ? "+" : dv < 0 ? "−" : ""}${Math.abs(dv) >= 10000 ? (Math.abs(dv) / 10000).toFixed(1) + "조" : Math.round(Math.abs(dv)).toLocaleString() + "억"} (${pc > 0 ? "+" : ""}${pc.toFixed(1)}%)</b>`; };
    const pk = k.yoy_peak12, fromAth = (k.credit / k.ath[1] - 1) * 100;
    const peakOut = pk && pk[1] >= 40 && k.yoy <= pk[1] - 15 && fromAth <= -10;
    const lv = peakOut ? [1, "피크아웃(빚투 줄어드는 중)"] : k.yoy >= 50 ? [2, "과열"] : k.yoy >= 25 ? [3, "높음"] : k.yoy >= 0 ? [5, "보통"] : [4, "빚 줄이는 중"];
    // 과거 큰 고점(전년 대비 60% 이상, 앞뒤 약 반년 중 최고)
    const marks = [];
    yo.forEach((p, i) => { if (p[1] >= 60 && p[1] === Math.max(...yo.slice(Math.max(0, i - 120), i + 121).map((x) => x[1])) && !marks.some((m) => m[0].slice(0, 4) === p[0].slice(0, 4))) marks.push([p[0], p[1], p[0].slice(0, 4)]); });
    const story = peakOut
      ? `빚투 잔고가 ${ymK(k.ath[0])} <b>${jo(k.ath[1])}</b>로 사상 최고를 찍은 뒤 <b>${Math.abs(fromAth).toFixed(0)}% 줄었어요</b>. 1년 전 대비 증가율도 ${ymK(pk[0])} ${pk[1].toFixed(0)}%에서 지금 ${k.yoy.toFixed(0)}%로 꺾였어요. 빚투가 정점에서 꺾일 때는 개인 매수 힘이 약해지는 구간이었던 경우가 많아요.`
      : k.yoy >= 50 ? `빚투가 1년 새 ${k.yoy.toFixed(0)}% 늘었어요. 과열 구간이라, 여기서 증가율이 꺾이면 고점 신호로 봐요.`
      : `빚투 잔고 ${jo(k.credit)}, 1년 전보다 ${k.yoy.toFixed(0)}% 많아요.`;
    const lvSvg = chart(S.map((r) => [r[0], r[1]]), { ...spOpt("kr_credit", true), ax: (x) => (x / 10000).toFixed(0) + "조", dot: col(lv[0]), W: 1000, h: innerWidth < 640 ? 200 : 260,
      lines: [{ v: S.map((r) => r[1]), c: "var(--price)", w: 2 }, { v: S.map((r) => r[2] * 0.25), c: "var(--ma50)", w: 1.3, dash: "4 3" }] });
    const yoSvg = chart(yo, { ...spOpt("kr_yoy", true, "m0"), ref: [0, 50], zone: 50, ax: (x) => x.toFixed(0) + "%", dot: col(lv[0]), marks, W: 600 });
    const rtSvg = chart(ratio, { ...spOpt("kr_ratio", true), ax: (x) => x.toFixed(0) + "%", dot: "var(--price)", W: 600 });
    const rr = ratio.map((p) => p[1]), rRank = Math.round(rr.filter((v) => v <= k.ratio).length / rr.length * 100);
    return `<section class="mx-market ec-sec ec-kr" aria-label="한국 빚투">
      <div class="mx-market-h"><h2>🇰🇷 빚투 (신용거래융자)</h2><span class="sub">네이버 증권 증시자금동향 · ${esc(k.date)} 기준 · 2002년부터 매일</span></div>
      <div class="mx-span"><span>그래프 기간</span><div class="seg small" role="group" aria-label="빚투 그래프 기간">${SPANS.map(([n, t]) => `<button type="button" data-ecspan="${n}" aria-pressed="${st.span === n}">${t}</button>`).join("")}</div></div>
      <article class="card mx-card ec-mg" style="--c:${col(lv[0])}">
        <div class="mx-head"><div><div class="mx-name">한국 신용거래융자 잔고 (빚내서 산 주식 금액)</div><div class="mx-dir">📈 크게 늘다가 꺾이면 위험</div></div><span class="mx-chip" style="--c:${col(lv[0])}">${lv[1]}</span></div>
        <div class="mx-val"><b>${jo(k.credit)} 원</b><span class="ec-date">${+k.date.slice(5, 7)}/${+k.date.slice(8, 10)}</span></div>
        <div class="ec-chs"><span class="ec-ch">${chg(k.credit, k.w1, "1주")}</span><span class="ec-ch">${chg(k.credit, k.m1, "1개월")}</span><span class="ec-ch">${chg(k.credit, k.y1, "1년")}</span><span class="ec-ch">사상 최고 ${jo(k.ath[1])}(${ym(k.ath[0])}) 대비 <b class="${fromAth < 0 ? "down" : "up"}">${fromAth.toFixed(1)}%</b></span></div>
        <p class="ec-story">${story}</p>
        <div class="mx-chart">${pick("kr_credit", true)}<div class="mx-chart-t">신용융자 잔고와 고객예탁금 <span>예탁금은 ¼로 줄여 같은 눈금에 그렸어요</span></div>${lvSvg}
          <div class="chart-legend"><span><i style="background:var(--price)"></i>신용융자 잔고</span><span><i style="background:var(--ma50)"></i>고객예탁금 × ¼ (지금 ${jo(k.deposit)})</span></div></div>
        <div class="mx-why"><b>무엇인가요?</b> 개인이 증권사에서 돈을 빌려 산 주식 금액(신용거래융자 잔고)이에요. 빚투가 빠르게 늘면 시장이 들뜬 상태이고, 주가가 떨어지면 반대매매(강제 처분)로 하락이 커질 수 있어요. 고객예탁금은 주식을 사려고 증권계좌에 넣어 둔 현금이에요.</div>
      </article>
      <div class="mx-grid">
        ${miniCard({ n: "한국 빚투 증가율 (1년 전 대비)", dir: "📈 50% 넘었다가 꺾이면 위험", lv, v: (k.yoy > 0 ? "+" : "") + k.yoy.toFixed(1) + "%", date: `${+k.date.slice(5, 7)}/${+k.date.slice(8, 10)}`,
          chs: [pk ? `최근 1년 최고 ${pk[1].toFixed(0)}%(${ym(pk[0])})` : "", `2010년 이후 지금보다 낮았던 날 ${yoRank}%`].filter(Boolean),
          pick: pick("kr_yoy", true, "m0"), svg: yoSvg, title: "2010년부터 흐름 · 빨간 칠 = 50% 넘는 과열", why: "신용융자 잔고가 1년 전보다 몇 % 늘었는지예요. 미국 빚투 증가율과 같은 방식으로, 정점을 찍고 꺾일 때를 고점 신호로 봐요." })}
        ${miniCard({ n: "신용융자 ÷ 고객예탁금", dir: "📈 오를수록 빚 비중 큼", lv: rRank >= 90 ? [2, "빚 비중 높음"] : rRank >= 70 ? [3, "높은 편"] : [5, "보통"], v: k.ratio.toFixed(1) + "%", date: `${+k.date.slice(5, 7)}/${+k.date.slice(8, 10)}`,
          chs: [`2002년 이후 지금보다 낮았던 날 ${rRank}%`, `예탁금 ${jo(k.deposit)} · 1년 전 ${k.y1 ? jo(k.y1[2]) : "–"}`],
          pick: pick("kr_ratio", true), svg: rtSvg, title: "", why: "주식 살 현금(예탁금)에 비해 빚(신용융자)이 얼마나 되는지예요. 높을수록 빚에 기대 오른 시장이라 충격에 약해요. 예탁금이 줄면서 비율이 오르면 더 조심할 신호예요." })}
      </div>
    </section>`;
  }

  function render(market) {
    const box = $("#mxEcon"), top = $("#mxTop");
    if (!box) return;
    if (top) top.innerHTML = "";
    if (market !== "US") {
      if (!st.kr) { loadKR(); box.innerHTML = ""; return; }
      box.innerHTML = krCredit(st.kr);
      bindSpan(box, market);
      return;
    }
    if (!st.data) { load(); return; }
    const d = st.data, I = Object.fromEntries(d.indicators.map((i) => [i.key, i]));
    const grp = (g) => d.indicators.filter((i) => DEF[i.key] && DEF[i.key].g === g).map(card).join("");
    // 2026-10-30 순서 정비: 경기(물가·고용·국채 금리)와 빚투를 따로 묶는다. 화면 순서는 macro.css 의 order 가 정한다
    // (고통지수 → 시장 위험도 → 경기 → 시장 지표 → 빚투). 그래프 기간 버튼은 두 묶음에 같이 둔다.
    const spanBar = (lab) => `<div class="mx-span"><span>그래프 기간</span><div class="seg small" role="group" aria-label="${lab} 그래프 기간">${SPANS.map(([n, t]) => `<button type="button" data-ecspan="${n}" aria-pressed="${st.span === n}">${t}</button>`).join("")}</div><span class="sub">모든 그래프에 같이 적용 · 그래프마다 붙은 버튼은 그 그래프만(매일 자료 20·60·200일은 거래일)</span></div>`;
    box.innerHTML = `<section class="mx-market mx-us ec-sec ec-a" aria-label="미국 경기">
      <div class="mx-market-h"><h2>🇺🇸 경기 (물가·고용·금리)</h2><span class="sub">고통지수를 이루는 물가·실업과 국채 금리 · FRED 자료 · 갱신 ${esc(d.updated_at)}</span></div>
      ${spanBar("경기")}
      <div class="mx-group-h"><h3>고통지수</h3><span class="sub">물가와 실업을 한 숫자로 · 매월</span></div>${hero(d.misery)}
      <div class="mx-group-h"><h3>물가 (인플레이션)</h3><span class="sub">연준 목표 2% 대비</span></div><div class="mx-grid">${grp("물가")}</div>
      <div class="mx-group-h"><h3>고용 (실업)</h3><span class="sub">일자리가 식는지 보는 지표</span></div><div class="mx-grid">${grp("고용")}</div>
      <div class="mx-group-h"><h3>금리 (미국 국채)</h3><span class="sub">매일 · 그래프 기간 버튼 적용</span></div>${treasury(d.treasury)}
      <p class="foot-note">자료: 세인트루이스 연준 FRED (DGS2·DGS10·DGS30·CPIAUCSL·CPILFESL·PCEPILFE·T10YIE·UNRATE·SAHMREALTIME·PAYEMS·ICSA·CCSA·JTSJOL·UNEMPLOY). 발표 주기: CPI 매월 중순, 고용보고서(실업률·일자리) 매월 첫 금요일, PCE 매월 말, 구인 건수 매월 초, 실업수당 청구 매주 목요일, 기대인플레·국채 금리 매일 — 모두 한국 시간 밤 9시 반~10시 반에 나오고 이 판은 매일 밤 11시 20분·아침 7시 20분에 반영해요. 고통지수 = CPI 전년 대비 상승률 + 실업률(같은 달).</p>
    </section>${d.margin ? `<section class="mx-market mx-us ec-sec ec-b" aria-label="미국 빚투">
      <div class="mx-market-h"><h2>🇺🇸 빚투 (신용융자)</h2><span class="sub">빚내서 산 주식이 너무 많은지 · 고점 신호 · 매월 · FINRA 신용거래 통계</span></div>
      ${spanBar("빚투")}
      ${margin(d.margin)}${marginExtra(d.margin)}
    </section>` : ""}`;
    bindSpan(box, market);
  }

  function bindSpan(box, market) {
    $$("[data-ecs]", box).forEach((b) => b.addEventListener("click", () => {
      const v = b.dataset.v;
      st.cs[b.dataset.ecs] = /^\d+$/.test(v) ? +v : v;
      const y = scrollY; render(market); scrollTo({ top: y });
    }));
    $$("[data-ecspan]", box).forEach((b) => b.addEventListener("click", () => {
      st.span = +b.dataset.ecspan; st.cs = {};
      try { localStorage.setItem("ec-span", st.span); } catch (e) {}
      const y = scrollY; render(market); scrollTo({ top: y });
    }));
  }
  async function loadKR() {
    if (st.krLoading) return;
    st.krLoading = true;
    try { const r = await fetch("data/kr_credit.json?v=" + Date.now(), { cache: "no-store" }); if (r.ok) st.kr = await r.json(); } catch (e) {}
    st.krLoading = false;
    if (st.kr) render((window.__isMarket && window.__isMarket()) || "KR");
  }
  async function load() {
    if (!st.loading) st.loading = fetch("data/us_econ.json?v=" + Date.now(), { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
    try { st.data = await st.loading; } catch (e) { const b = $("#mxEcon"); if (b) b.innerHTML = `<div class="mx-empty">미국 물가·고용 자료를 불러오지 못했어요.</div>`; return; } finally { st.loading = null; }
    render((window.__isMarket && window.__isMarket()) || "KR");
  }

  window.__econ = { render, reload: () => { st.data = null; st.kr = null; } };
})();
