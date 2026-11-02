/* AI 시장 탭 아래 '반도체 가격' 카드 (2026-11-02 추가)
   데이터: docs/data/chip_prices.json — scripts/chip_prices.py 가 평일 12:40·16:40 KST에 만든다(.github/workflows/chip-prices.yml).
   메모리 현물가 = DRAMeXchange 첫 화면 공개 표를 하루 한 줄씩 쌓은 것(2026-11-02부터). 계약가 전망·CPU 인상 = 뉴스 자동 판독 + 수동 확인분.
   ai.js와 코드를 섞지 않는다. ai.js의 window.__ai(show·rerender·reload)에 얹어서 함께 움직인다. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const tipAttr = (t) => `data-tip="${esc(t)}"`;
  const ymd = (s) => { const [y, m, d] = s.split("-"); return `${y.slice(2)}.${+m}.${+d}`; };
  const md = (s) => { const [, m, d] = s.split("-"); return `${+m}/${+d}`; };
  const usd = (v) => v >= 1000 ? "$" + Math.round(v).toLocaleString() : v >= 100 ? "$" + v.toFixed(1) : "$" + v.toFixed(2);
  const sgn = (v, d = 1) => (v > 0 ? "+" : "") + v.toFixed(d);
  const st = { data: null, loading: null, pick: "dram/DDR5 16Gb (2Gx8) 4800/5600", grp: "dram", off: null, range: 365, ma: true };

  // 품목 이름을 쉬운 말로
  const NAME = {
    "dram/DDR5 16Gb (2Gx8) 4800/5600": ["DDR5 16Gb 칩", "정품 등급 · PC·서버용 최신 D램"],
    "dram/DDR5 16Gb (2Gx8) eTT": ["DDR5 16Gb 칩 (eTT)", "검사를 덜 거친 저가 등급"],
    "dram/DDR4 16Gb (2Gx8) 3200": ["DDR4 16Gb 칩", "정품 등급 · 구형 D램"],
    "dram/DDR4 16Gb (2Gx8) eTT": ["DDR4 16Gb 칩 (eTT)", "검사를 덜 거친 저가 등급"],
    "dram/DDR4 8Gb (1Gx8) 3200": ["DDR4 8Gb 칩", "정품 등급 · 구형 소용량"],
    "dram/DDR4 8Gb (1Gx8) eTT": ["DDR4 8Gb 칩 (eTT)", "검사를 덜 거친 저가 등급"],
    "dram/4Gb 512Mx8 1600/1866": ["DDR3 4Gb 칩", "가전·산업용 구형"],
    "module/DDR5 RDIMM 32GB 4800/5600": ["DDR5 서버 모듈 32GB", "RDIMM · 서버에 꽂는 메모리"],
    "module/DDR5 UDIMM 16GB 4800/5600": ["DDR5 PC 모듈 16GB", "UDIMM · PC용 메모리"],
    "module/DDR4 UDIMM 16GB 3200": ["DDR4 PC 모듈 16GB", "UDIMM · 구형 PC용"],
    "wafer/512Gb TLC": ["낸드 512Gb TLC (웨이퍼)", "SSD에 들어가는 저장용 칩"],
    "wafer/256Gb TLC": ["낸드 256Gb TLC (웨이퍼)", "저장용 칩"],
    "wafer/128Gb TLC": ["낸드 128Gb TLC (웨이퍼)", "저장용 칩"],
    "gddr/GDDR6 8Gb": ["GDDR6 8Gb", "그래픽카드용 D램"],
    "gddr/GDDR5 8Gb": ["GDDR5 8Gb", "그래픽카드용 구형 D램"],
  };
  const nm = (k, meta) => (NAME[k] || [meta ? meta.item : k.split("/")[1], ""])[0];
  const TILES = ["dram/DDR5 16Gb (2Gx8) 4800/5600", "dram/DDR4 16Gb (2Gx8) 3200", "module/DDR5 RDIMM 32GB 4800/5600", "wafer/512Gb TLC"];
  const GROUP = { dram: "D램 칩", module: "메모리 모듈", wafer: "낸드", gddr: "그래픽 D램", flash: "구형 낸드 칩" };
  const CO = { Intel: "var(--cp-intel)", AMD: "var(--cp-amd)", Qualcomm: "var(--cp-qc)", Arm: "var(--cp-arm)", "Intel·AMD": "var(--cp-both)" };
  const SEG = { server: "서버", pc: "PC", all: "전체" };

  function bindTip(el) {
    const tip = $("#tip");
    if (!tip || el._tip) return; el._tip = true;
    el.addEventListener("pointermove", (e) => {
      const c = e.target.closest("[data-tip]");
      if (!c) { tip.hidden = true; return; }
      tip.textContent = c.dataset.tip; tip.hidden = false;
      tip.style.left = Math.min(e.clientX + 12, innerWidth - tip.offsetWidth - 8) + "px"; tip.style.top = (e.clientY - 40) + "px";
    });
    el.addEventListener("pointerleave", () => { tip.hidden = true; });
  }
  const W = (el) => Math.max(280, Math.floor(el.clientWidth || 600));
  function niceStep(span, n) { const raw = span / n, p = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 2.5, 5, 10].map((k) => k * p).find((k) => raw <= k) || 10 * p; }

  // ---------- 메모리 현물가: 블룸버그식 여러 품목 계단선 + 오른쪽 축 + 끝값 꼬리표
  const SC = ["var(--cp-s1)", "var(--cp-s2)", "var(--cp-s3)", "var(--cp-s4)", "var(--cp-s5)", "var(--cp-s6)", "var(--cp-s7)"];
  const GTABS = [["dram", "D램 칩"], ["wafer", "낸드 웨이퍼"], ["module", "메모리 모듈"], ["gddr", "그래픽 D램"], ["flash", "구형 낸드 칩"]];
  const HIDE0 = /eTT|4Gb 512Mx8|SLC/;   // 처음엔 숨기는 품목(저가 등급, 구형)
  const RANGES = [["6M", 183], ["1Y", 365], ["2Y", 730], ["전체", 1e5]];
  function memChart(series, w) {
    const mobile = w < 520, H = Math.round(Math.max(260, Math.min(400, w * 0.48))), P = { l: 10, r: mobile ? 66 : 78, t: 12, b: 40 };
    const on = series.filter((s) => s.on && s.rows.length);
    if (!on.length) return "<p class='none'>보여 줄 품목을 하나 이상 골라 주세요.</p>";
    const tEnd = Math.max(...on.map((s) => Date.parse(s.rows.at(-1).d))), tMin = Math.min(...on.map((s) => Date.parse(s.rows[0].d)));
    let t0 = Math.max(tMin, tEnd - st.range * 864e5), t1 = tEnd + Math.max(3, (tEnd - t0) / 864e5 * 0.02) * 864e5;
    if (t1 - t0 < 20 * 864e5) t0 = t1 - 20 * 864e5;
    const vis = on.map((s) => ({ ...s, pts: s.rows.filter((r) => Date.parse(r.d) >= t0) })).map((s) => s.pts.length ? s : { ...s, pts: [s.rows.at(-1)] });
    const vals = vis.flatMap((s) => s.pts.map((r) => r.avg));
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const log = hi / Math.max(lo, 1e-9) > 6;
    const f = log ? Math.log10 : (v) => v;
    let a, b, ticks = [];
    if (log) { a = Math.floor(f(lo) * 4) / 4 - 0.05; b = Math.ceil(f(hi) * 4) / 4 + 0.05; for (let e = Math.floor(a); e <= b; e++) [1, 2, 5].forEach((m) => { const v = m * 10 ** e; if (f(v) >= a && f(v) <= b) ticks.push(v); }); }
    else { const stp = niceStep((hi - lo) || hi * 0.2 || 1, 5); a = Math.max(0, Math.floor((lo - stp * 0.2) / stp) * stp); b = Math.ceil((hi + stp * 0.2) / stp) * stp; for (let v = a; v <= b + 1e-9; v += stp) ticks.push(v); a = f(a); b = f(b); }
    const X = (t) => P.l + (t - t0) / (t1 - t0) * (w - P.l - P.r), Y = (v) => P.t + (1 - (f(v) - a) / (b - a)) * (H - P.t - P.b);
    let g = "";
    ticks.forEach((v) => { g += `<line class="ai-grid" x1="${P.l}" x2="${w - P.r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ai-tk" x="${w - P.r + 6}" y="${Y(v) + 3.5}">${usd(v)}</text>`; });
    // 가로축: 월 눈금 + 1월에 연도
    const days = (t1 - t0) / 864e5, stepM = days > 600 ? 3 : days > 300 ? (mobile ? 2 : 1) : 1;
    const d = new Date(t0); d.setDate(1); d.setMonth(d.getMonth() + 1); d.setHours(0, 0, 0, 0);
    while (+d <= t1) {
      const x = X(+d), m = d.getMonth();
      if (m % stepM === 0) {
        g += `<line class="ai-grid mid" x1="${x}" x2="${x}" y1="${P.t}" y2="${H - P.b}"/><text class="ai-tk" x="${x}" y="${H - P.b + 14}" text-anchor="middle">${m + 1}월</text>`;
        if (m === 0) g += `<line x1="${x}" x2="${x}" y1="${H - P.b}" y2="${H - 6}" stroke="var(--ink-2)" opacity=".5"/><text x="${x + 4}" y="${H - 6}" font-size="11" font-weight="700" fill="var(--ink-2)">${d.getFullYear()}</text>`;
      }
      d.setMonth(d.getMonth() + 1);
    }
    if (days <= 60) { const dd = new Date(t0); dd.setHours(0, 0, 0, 0); dd.setDate(dd.getDate() + 1); while (+dd <= t1) { if (dd.getDay() === 1) g += `<text class="ai-tk" x="${X(+dd)}" y="${H - P.b + 28}" text-anchor="middle">${dd.getMonth() + 1}/${dd.getDate()}</text>`; dd.setDate(dd.getDate() + 1); } }
    g += `<line class="cp-axis" x1="${P.l}" x2="${w - P.r}" y1="${H - P.b}" y2="${H - P.b}"/><line class="cp-axis" x1="${w - P.r}" x2="${w - P.r}" y1="${P.t}" y2="${H - P.b}"/>`;
    // 계단선(값이 바뀐 날 수직으로 꺾임) + 이동평균
    vis.forEach((s) => {
      const pts = s.pts;
      if (pts.length > 1) {
        let dd = `M${X(Date.parse(pts[0].d))},${Y(pts[0].avg)}`;
        for (let k = 1; k < pts.length; k++) dd += `H${X(Date.parse(pts[k].d))}V${Y(pts[k].avg)}`;
        g += `<path d="${dd}" fill="none" stroke="${s.c}" stroke-width="2.2" stroke-linejoin="round"/>`;
      } else g += `<circle cx="${X(Date.parse(pts[0].d))}" cy="${Y(pts[0].avg)}" r="4" fill="${s.c}"/>`;
      if (st.ma && s.rows.length >= 20) {
        const all = s.rows, ma = [];
        for (let k = 19; k < all.length; k++) if (Date.parse(all[k].d) >= t0) ma.push(`${X(Date.parse(all[k].d))},${Y(all.slice(k - 19, k + 1).reduce((q, x) => q + x.avg, 0) / 20)}`);
        if (ma.length > 1) g += `<polyline points="${ma.join(" ")}" fill="none" stroke="${s.c}" stroke-width="1.3" stroke-dasharray="4 3" opacity=".75"/>`;
      }
    });
    // 오른쪽 끝값 꼬리표(겹치면 위아래로 밀어냄)
    const tags = vis.map((s) => ({ s, y: Y(s.pts.at(-1).avg), v: s.pts.at(-1).avg })).sort((p, q) => p.y - q.y);
    for (let k = 1; k < tags.length; k++) if (tags[k].y - tags[k - 1].y < 17) tags[k].y = tags[k - 1].y + 17;
    const over = tags.length ? tags.at(-1).y - (H - P.b - 8) : 0;
    if (over > 0) tags.forEach((t) => (t.y -= over));
    tags.forEach(({ s, y, v }) => {
      const x = w - P.r + 1, tw = P.r - 4;
      g += `<path d="M${x},${y} l6,-8 h${tw - 6} v16 h-${tw - 6} z" fill="${s.c}"/><text x="${x + 8}" y="${y + 4}" font-size="11.5" font-weight="700" fill="#fff">${usd(v)}</text>`;
    });
    // 마우스 올리면 그날 값 전부
    const allD = [...new Set(vis.flatMap((s) => s.pts.map((r) => r.d)))].sort();
    allD.forEach((dt, k) => {
      const x = X(Date.parse(dt)), xn = k + 1 < allD.length ? X(Date.parse(allD[k + 1])) : w - P.r, xp = k ? X(Date.parse(allD[k - 1])) : P.l;
      const txt = `${ymd(dt)} · ` + vis.map((s) => { const r = [...s.pts].reverse().find((q) => q.d <= dt); return r ? `${s.name} ${usd(r.avg)}` : null; }).filter(Boolean).join(", ");
      g += `<rect class="cp-hov" x="${(xp + x) / 2}" y="${P.t}" width="${Math.max(1, (x + xn) / 2 - (xp + x) / 2)}" height="${H - P.t - P.b}" ${tipAttr(txt)}/>`;
    });
    if (log) g += `<text class="ai-tk" x="${P.l + 4}" y="${P.t + 10}">로그 눈금</text>`;
    return `<svg class="ai-svg" viewBox="0 0 ${w} ${H}" width="${w}" height="${H}" role="img" aria-label="메모리 현물가 추이">${g}</svg>`;
  }

  // ---------- CPU 인상 타임라인: 회사마다 한 줄, 사건마다 '서버 12%' 같은 이름표를 날짜 자리에 붙인다
  function cpuChart(ev, w) {
    const yr = new Date().getFullYear();
    const t0 = Date.parse(`${yr}-01-01`), t1 = Date.parse(`${yr}-12-31`);
    const list = ev.filter((e) => Date.parse(e.date) >= t0).sort((a, b) => a.date.localeCompare(b.date));
    const LANES = [["Intel", "인텔"], ["AMD", "AMD"], ["Intel·AMD", "인텔·AMD"], ["Qualcomm", "퀄컴"]].filter(([k]) => list.some((e) => e.company === k));
    list.filter((e) => !LANES.some(([k]) => k === e.company)).forEach((e) => { if (!LANES.some(([k]) => k === e.company)) LANES.push([e.company, e.company]); });
    const mobile = w < 520, LW = mobile ? 58 : 76, R = 10, RH = 26, FS = mobile ? 11 : 12;
    const X = (t) => LW + (t - t0) / (t1 - t0) * (w - LW - R);
    const label = (e) => `${e.segment === "all" ? "" : SEG[e.segment] + " "}${e.upto ? "최대 " : ""}${e.pct_lo === e.pct_hi ? +e.pct_hi : +e.pct_lo + "~" + +e.pct_hi}%${e.basis === "ytd" ? " 누적" : ""}`;
    const tw = (t) => [...t].reduce((s, ch) => s + (/[가-힣]/.test(ch) ? FS * 0.95 : FS * 0.6), 0) + 14;
    // 줄마다 이름표가 겹치지 않게 아래로 쌓는다
    let y = 6, body = "";
    const lanes = LANES.map(([k, name]) => {
      const rows = [], pills = [];
      list.filter((e) => e.company === k).forEach((e) => {
        const x = X(Date.parse(e.date)), t = label(e), wd = tw(t);
        let left = Math.min(Math.max(x - wd / 2, LW + 2), w - R - wd);
        let r = rows.findIndex((end) => left > end + 4);
        if (r < 0) { r = rows.length; rows.push(0); }
        rows[r] = left + wd;
        pills.push({ e, x, t, wd, left, r });
      });
      const h = Math.max(1, rows.length) * RH + 12, top = y; y += h;
      return { k, name, pills, top, h };
    });
    const H = y + 30;
    let g = "";
    // 줄 배경과 회사 이름
    lanes.forEach((L, i) => {
      if (i % 2 === 0) g += `<rect x="0" y="${L.top}" width="${w}" height="${L.h}" fill="var(--surface-2)" opacity=".55" rx="6"/>`;
      const two = mobile && L.name.includes("·"), nmv = two ? L.name.split("·") : [L.name];
      g += `<text x="8" y="${L.top + L.h / 2 + 4 - (two ? 7 : 0)}" font-size="${FS + 1}" font-weight="700" fill="${CO[L.k] || "var(--ink)"}">${nmv.map((t, i) => `<tspan x="8" dy="${i ? 15 : 0}">${esc(t)}${two && !i ? "·" : ""}</tspan>`).join("")}</text>`;
    });
    // 월 눈금(가로축)
    for (let m = 0; m < 12; m++) {
      const t = Date.parse(`${yr}-${String(m + 1).padStart(2, "0")}-01`), x = X(t);
      g += `<line class="ai-grid mid" x1="${x}" x2="${x}" y1="4" y2="${y}"/>`;
      if (!mobile || m % 2 === 0) g += `<text class="ai-tk" x="${X(t + 15 * 864e5)}" y="${y + 16}" text-anchor="middle">${m + 1}월</text>`;
    }
    g += `<line class="cp-axis" x1="${LW}" x2="${w - R}" y1="${y}" y2="${y}"/>`;
    // 오늘
    const xn = X(Date.now());
    g += `<line x1="${xn}" x2="${xn}" y1="4" y2="${y}" stroke="var(--ink-2)" stroke-width="1.2" stroke-dasharray="2 3"/><text x="${xn}" y="${y + 28}" font-size="10.5" fill="var(--ink-2)" text-anchor="middle">오늘</text>`;
    // 이름표
    lanes.forEach((L) => L.pills.forEach(({ e, x, t, wd, left, r }) => {
      const c = CO[e.company] || "var(--ink-2)", py = L.top + 6 + r * RH, done = e.kind !== "plan";
      g += `<g ${tipAttr(`${ymd(e.date)} · ${e.company} ${SEG[e.segment]} · ${rng(e)}${done ? " · 실시" : " · 예정·보도"} · ${e.title}`)} style="cursor:help">
        <line x1="${x}" x2="${x}" y1="${py + 20}" y2="${L.top + L.h}" stroke="${c}" stroke-width="1" opacity=".35"/>
        <rect x="${left}" y="${py}" width="${wd}" height="20" rx="10" fill="${done ? c : "var(--surface)"}" stroke="${c}" stroke-width="1.6" ${done ? "" : 'stroke-dasharray="4 2"'}/>
        <text x="${left + wd / 2}" y="${py + 14}" font-size="${FS}" font-weight="700" text-anchor="middle" fill="${done ? "#fff" : c}">${esc(t)}</text></g>`;
    }));
    return `<svg class="ai-svg" viewBox="0 0 ${w} ${H}" width="${w}" height="${H}" role="img" aria-label="CPU 가격 인상 타임라인">${g}</svg>`;
  }
  const rng = (e) => (e.upto ? "최대 " : "") + (e.pct_lo === e.pct_hi ? `${+e.pct_hi}%` : `${+e.pct_lo}~${+e.pct_hi}%`) + (e.basis === "ytd" ? " (연초 대비 누적)" : "");

  function render() {
    const d = st.data, box = $("#chipBody");
    if (!d || !box) return;
    bindTip(box);
    const mem = d.memory || {}, hist = mem.history || {}, items = mem.items || {}, src = d.sources || {};
    const bad = Object.entries(src).filter(([, v]) => !v.ok).map(([k]) => ({ dram: "메모리 현물가", contract: "계약가 전망", cpu: "CPU 기사" }[k] || k));
    if (!hist[st.pick]) st.pick = Object.keys(hist)[0];

    // 타일
    const tile = (k) => {
      const r = (hist[k] || []).at(-1); if (!r) return "";
      const first = hist[k][0], since = hist[k].length > 1 ? (r.avg / first.avg - 1) * 100 : null;
      return `<button class="tile ai-tile cp-tile${k === st.pick ? " on" : ""}" data-pick="${esc(k)}"><div class="k">${esc(nm(k, items[k]))}</div><div class="v">${usd(r.avg)}</div><div class="d">${ymd(r.d)} · 전일 대비 <b class="${r.chg > 0 ? "up" : r.chg < 0 ? "down" : ""}">${sgn(r.chg, 2)}%</b>${since != null ? ` · 기록 시작 대비 <b class="${since >= 0 ? "up" : "down"}">${sgn(since)}%</b>` : ""}</div></button>`;
    };
    const tiles = TILES.map(tile).join("");

    // 전체 품목 표
    const byG = {};
    Object.keys(hist).forEach((k) => { const g = k.split("/")[0]; (byG[g] = byG[g] || []).push(k); });
    const order = ["dram", "module", "wafer", "gddr", "flash"];
    const tbl = order.filter((g) => byG[g]).map((g) => byG[g].map((k, i) => {
      const r = hist[k].at(-1), n = NAME[k];
      return `<tr class="${k === st.pick ? "on" : ""}" data-pick="${esc(k)}"><td>${i === 0 ? `<b>${GROUP[g]}</b>` : ""}</td><td>${esc(nm(k, items[k]))}${n && n[1] ? `<small> ${esc(n[1])}</small>` : ""}</td><td class="num"><b>${usd(r.avg)}</b></td><td class="num ${r.chg > 0 ? "up" : r.chg < 0 ? "down" : ""}">${sgn(r.chg, 2)}%</td><td class="num muted">${usd(r.lo)} ~ ${usd(r.hi)}</td><td class="tnum muted">${md(r.d)}</td><td class="num muted">${hist[k].length}일</td></tr>`;
    }).join("")).join("");
    if (!st.off) st.off = new Set(Object.keys(hist).filter((k) => HIDE0.test(k)));
    const gKeys = Object.keys(hist).filter((k) => k.startsWith(st.grp + "/"));
    const series = gKeys.map((k, i) => ({ k, name: nm(k, items[k]), c: SC[i % SC.length], rows: hist[k], on: !st.off.has(k) }));
    const ago = (rows, n) => { const t = Date.parse(rows.at(-1).d) - n * 864e5; const r = [...rows].reverse().find((q) => Date.parse(q.d) <= t); return r ? (rows.at(-1).avg / r.avg - 1) * 100 : null; };
    const lg = series.map((x) => { const r = x.rows.at(-1), y1 = ago(x.rows, 365), m1 = ago(x.rows, 30);
      return `<button class="cp-lgb${x.on ? "" : " off"}" data-ser="${esc(x.k)}" style="--c:${x.c}"><i></i><span>${esc(x.name)}</span><b>${usd(r.avg)}</b>${m1 != null ? `<em class="${m1 >= 0 ? "up" : "down"}">1개월 ${sgn(m1)}%</em>` : ""}${y1 != null ? `<em class="${y1 >= 0 ? "up" : "down"}">1년 ${sgn(y1)}%</em>` : ""}</button>`; }).join("");
    const gtabs = GTABS.filter(([g]) => Object.keys(hist).some((k) => k.startsWith(g + "/"))).map(([g, t]) => `<button class="toggle" aria-pressed="${g === st.grp}" data-grp="${g}">${t}</button>`).join("");
    const rtabs = RANGES.map(([t, n]) => `<button class="toggle" aria-pressed="${n === st.range}" data-rng="${n}">${t}</button>`).join("");
    const maxLen = Math.max(0, ...series.map((x) => x.rows.length));
    const pr = hist[st.pick] || [], firstDay = Object.keys(hist).filter((k) => k.startsWith("dram/")).flatMap((k) => hist[k]).map((r) => r.d).sort()[0];

    // 계약가 전망
    const mc = (d.memory_contract || []).slice().sort((a, b) => (b.qtr || "").localeCompare(a.qtr || "") || b.date.localeCompare(a.date));
    const mmax = Math.max(20, ...mc.map((x) => Math.abs(x.pct_hi)));
    const mcRows = mc.slice(0, 10).map((x) => `<div class="cp-crow" ${tipAttr(x.title)}><span class="cp-q">${esc((x.qtr || "").replace(/^20(\d\d)Q(\d)$/, "$1년 $2분기") || "–")}</span><span class="cp-prod">${esc(x.product)}</span><span class="cp-cbar"><i style="left:${Math.min(x.pct_lo, x.pct_hi) / mmax * 100}%;width:${Math.max(1.5, Math.abs(x.pct_hi - x.pct_lo) / mmax * 100)}%;background:${x.pct_hi < 0 ? "var(--down)" : "var(--up)"}"></i></span><b class="num ${x.pct_hi < 0 ? "down" : "up"}">${x.pct_lo === x.pct_hi ? sgn(x.pct_hi, 0) : `${sgn(x.pct_lo, 0)}~${Math.abs(x.pct_hi)}`}%</b><a href="${esc(x.link)}" target="_blank" rel="noopener noreferrer">${esc(x.outlets[0])}${x.outlets.length > 1 ? ` 외 ${x.outlets.length - 1}` : ""} ↗</a></div>`).join("");

    // CPU
    const cpu = d.cpu || [];
    const cpuRows = cpu.slice(0, 16).map((e) => `<tr><td class="tnum">${ymd(e.date)}</td><td><span class="ai-dot" style="background:${CO[e.company] || "var(--ink-2)"}"></span>${esc(e.company)}</td><td>${SEG[e.segment]}</td><td class="num"><b class="up">${rng(e)}</b></td><td>${e.kind === "plan" ? '<span class="ai-ntag target">예정·보도</span>' : '<span class="cp-done">실시</span>'}</td><td class="cp-title" ${tipAttr(e.title)}>${esc(e.title)}</td><td><a href="${esc(e.link)}" target="_blank" rel="noopener noreferrer" ${tipAttr(e.outlets.join(", "))}>${esc(e.outlets[0])}${e.outlets.length > 1 ? ` 외 ${e.outlets.length - 1}` : ""} ↗</a></td></tr>`).join("");
    const yr = new Date().getFullYear();
    const thisYr = cpu.filter((e) => e.date.startsWith(String(yr)) && e.kind !== "plan" && e.basis !== "ytd");
    const nIntel = thisYr.filter((e) => e.company.includes("Intel")).length;

    box.innerHTML = `<section class="card cp-card">
      <div class="card-head wrap"><h2>반도체 가격 <span class="sub">메모리 현물가, 계약가 전망, CPU 가격 인상</span></h2></div>
      <p class="ai-meta">갱신 ${esc(d.updated_at)} · 평일 12:40·16:40 KST 자동 수집${bad.length ? ` · <b class="ai-bad">이번 수집 실패: ${bad.join(", ")} (지난 값 표시)</b>` : ""}</p>

      <h3 class="ai-h3">메모리 현물가 <span class="sub">DRAMeXchange 공개 시세 · 칩·모듈 한 개 값(달러)</span></h3>
      <div class="tiles ai-tiles">${tiles}</div>
      <div class="cp-ctl"><div class="cp-tabs">${gtabs}</div><div class="cp-tabs">${rtabs}<button class="toggle" aria-pressed="${st.ma}" data-ma="1">20일 이동평균</button></div></div>
      <div class="cp-lgs">${lg}</div>
      <div id="cpPrice"></div>
      <p class="cp-sub">품목 이름표를 누르면 선을 켜고 끌 수 있어요. 오른쪽 꼬리표는 마지막 값이에요. 선이 계단 모양인 것은 시세가 바뀐 날에만 값이 바뀌기 때문이에요.${maxLen < 20 ? " 이동평균은 기록이 20일 이상인 품목부터 보여요." : ""}</p>
      <div class="ai-tw"><table class="ai-rep cp-tbl"><thead><tr><th>분류</th><th>품목</th><th class="num">평균가</th><th class="num">전일 대비</th><th class="num">그날 범위</th><th>기준일</th><th class="num">기록</th></tr></thead><tbody>${tbl}</tbody></table></div>
      <p class="foot-note">현물가는 대리점·중개상 사이 즉석 거래 값이라 대형 고객이 분기마다 정하는 계약가보다 먼저 움직여요. DRAMeXchange는 표마다 갱신 주기가 달라서 D램 칩은 매일, 모듈과 낸드는 대개 주 1회 바뀌어요.</p>

      <h3 class="ai-h3">메모리 계약가 전망 <span class="sub">트렌드포스 발표 · 전 분기 대비 상승률</span></h3>
      ${mcRows ? `<div class="cp-crows">${mcRows}</div>` : "<p class='none'>아직 판독된 발표가 없어요.</p>"}
      <p class="foot-note">삼성전자, SK하이닉스, 마이크론의 실제 판매가는 이 계약가를 따라가요. 트렌드포스가 새 분기 전망을 내면 구글 뉴스에서 자동으로 읽어 추가해요.</p>

      <h3 class="ai-h3">CPU 가격 인상 타임라인 <span class="sub">인텔·AMD·퀄컴 인상 소식 · ${yr}년</span></h3>
      <div class="chart-legend"><span><i class="cp-pill on"></i>실제로 올림</span><span><i class="cp-pill"></i>올릴 예정·보도</span><span>이름표에 마우스를 올리거나 누르면 기사 내용이 보여요</span></div>
      <div id="cpCpu"></div>
      <p class="foot-note">CPU는 D램처럼 매일 공개되는 시세가 없어요. 인텔과 AMD가 값을 정해 고객사에 통보하는 구조라서, 가격 인상 기사로 흐름을 따라가요. 올해 확인된 인텔 인상(실시)만 <b>${nIntel}번</b>이에요. 이름표는 기사 날짜 자리에 붙고, 같은 회사 소식이 몰리면 아래로 쌓여요.</p>
      <div class="ai-tw"><table class="ai-rep cp-tbl"><thead><tr><th>날짜</th><th>회사</th><th>구분</th><th class="num">인상률</th><th>상태</th><th>내용</th><th>출처</th></tr></thead><tbody>${cpuRows}</tbody></table></div>
      <p class="foot-note">자동 판독 기준: 기사 제목에 회사, 'price·hike', 인상률(%)이 함께 있고, 같은 숫자를 두 곳 이상 또는 주요 매체 한 곳이 쓴 것만 채택해요. 제목에 숫자가 없던 큰 사건은 출처를 확인해 직접 넣었어요. 자료: <a href="https://www.dramexchange.com/" target="_blank" rel="noopener">DRAMeXchange</a>, <a href="https://www.trendforce.com/news/" target="_blank" rel="noopener">TrendForce</a>, 구글 뉴스.</p>
    </section>`;
    $("#cpPrice").innerHTML = memChart(series, W($("#cpPrice")));
    $("#cpCpu").innerHTML = cpuChart(cpu, W($("#cpCpu")));
    box.querySelectorAll("[data-pick]").forEach((el) => el.addEventListener("click", () => { st.pick = el.dataset.pick; st.grp = st.pick.split("/")[0]; st.off.delete(st.pick); render(); }));
    box.querySelectorAll("[data-grp]").forEach((el) => el.addEventListener("click", () => { st.grp = el.dataset.grp; render(); }));
    box.querySelectorAll("[data-rng]").forEach((el) => el.addEventListener("click", () => { st.range = +el.dataset.rng; render(); }));
    box.querySelectorAll("[data-ma]").forEach((el) => el.addEventListener("click", () => { st.ma = !st.ma; render(); }));
    box.querySelectorAll("[data-ser]").forEach((el) => el.addEventListener("click", () => { const k = el.dataset.ser; st.off.has(k) ? st.off.delete(k) : st.off.add(k); render(); }));
  }

  async function load(force) {
    if (!$("#chipBody")) return;
    if (!st.data || force) {
      if (!st.loading || force) st.loading = fetch("data/chip_prices.json?v=" + Date.now(), { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
      try { st.data = await st.loading; } catch (e) { st.loading = null; $("#chipBody").innerHTML = "<p class='ai-meta'>반도체 가격 자료를 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>"; return; }
    }
    render();
  }
  const visible = () => !$("#viewAi").hidden;
  let lastW = innerWidth, rz;
  addEventListener("resize", () => { if (innerWidth === lastW) return; lastW = innerWidth; clearTimeout(rz); rz = setTimeout(() => { if (st.data && visible()) render(); }, 200); });

  // ai.js 의 show·rerender·reload 에 얹는다
  const ai = window.__ai || {};
  window.__ai = {
    show: () => { ai.show && ai.show(); load(false); },
    rerender: () => { ai.rerender && ai.rerender(); if (st.data && visible()) render(); },
    reload: () => { ai.reload && ai.reload(); st.data = null; if (visible()) load(true); },
  };
  if (visible()) load(false);
})();
