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
  const st = { data: null, loading: null, pick: "dram/DDR5 16Gb (2Gx8) 4800/5600" };

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

  // ---------- 메모리 현물가 선 그래프 (평균가 선 + 그날 최고·최저 띠 + 20일 이동평균)
  function priceChart(rows, w) {
    const H = Math.round(Math.max(220, Math.min(300, w * 0.42))), P = { l: 54, r: 16, t: 14, b: 28 };
    if (!rows.length) return "<p class='none'>아직 기록이 없어요.</p>";
    const ts = rows.map((r) => Date.parse(r.d));
    let t0 = Math.min(...ts), t1 = Math.max(...ts);
    if (t1 - t0 < 14 * 864e5) { t0 -= 7 * 864e5; t1 += 7 * 864e5; }   // 기록이 짧으면 앞뒤로 여유
    const lo = Math.min(...rows.map((r) => r.lo)), hi = Math.max(...rows.map((r) => r.hi));
    const step = niceStep((hi - lo) || hi * 0.2 || 1, 4);
    const y0 = Math.max(0, Math.floor((lo - step * 0.3) / step) * step), y1 = Math.ceil((hi + step * 0.3) / step) * step;
    const X = (t) => P.l + (t - t0) / (t1 - t0) * (w - P.l - P.r), Y = (v) => P.t + (1 - (v - y0) / (y1 - y0)) * (H - P.t - P.b);
    let g = "";
    for (let v = y0; v <= y1 + 1e-9; v += step) g += `<line class="ai-grid" x1="${P.l}" x2="${w - P.r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ai-tk" x="${P.l - 6}" y="${Y(v) + 3.5}" text-anchor="end">${usd(v)}</text>`;
    // 가로축: 월 단위(기록이 짧으면 주 단위)
    const days = (t1 - t0) / 864e5, ticks = [];
    const d = new Date(t0); d.setHours(0, 0, 0, 0);
    if (days > 90) { d.setDate(1); d.setMonth(d.getMonth() + 1); while (+d <= t1) { ticks.push(+d); d.setMonth(d.getMonth() + (days > 400 ? 3 : 1)); } }
    else { const gap = days > 40 ? 14 : 7; d.setDate(d.getDate() + 1); while (+d <= t1) { ticks.push(+d); d.setDate(d.getDate() + gap); } }
    ticks.forEach((t) => { const dt = new Date(t); g += `<line class="ai-grid mid" x1="${X(t)}" x2="${X(t)}" y1="${P.t}" y2="${H - P.b}"/><text class="ai-tk" x="${X(t)}" y="${H - 8}" text-anchor="middle">${days > 90 ? `${String(dt.getFullYear()).slice(2)}.${dt.getMonth() + 1}` : `${dt.getMonth() + 1}/${dt.getDate()}`}</text>`; });
    g += `<line class="cp-axis" x1="${P.l}" x2="${w - P.r}" y1="${H - P.b}" y2="${H - P.b}"/><line class="cp-axis" x1="${P.l}" x2="${P.l}" y1="${P.t}" y2="${H - P.b}"/>`;
    const pts = rows.map((r) => [X(Date.parse(r.d)), r]);
    if (rows.length > 1) {
      const band = pts.map(([x, r]) => `${x},${Y(r.hi)}`).join(" ") + " " + pts.slice().reverse().map(([x, r]) => `${x},${Y(r.lo)}`).join(" ");
      g += `<polygon class="cp-band" points="${band}"/>`;
      g += `<polyline class="cp-line" points="${pts.map(([x, r]) => `${x},${Y(r.avg)}`).join(" ")}"/>`;
    } else {
      const [x, r] = pts[0];
      g += `<line class="cp-range" x1="${x}" x2="${x}" y1="${Y(r.hi)}" y2="${Y(r.lo)}"/>`;
    }
    // 20일 이동평균(기록 20개 이상일 때)
    if (rows.length >= 20) {
      const ma = rows.map((r, i) => i < 19 ? null : rows.slice(i - 19, i + 1).reduce((s, x) => s + x.avg, 0) / 20);
      g += `<polyline class="cp-ma" points="${pts.map(([x], i) => ma[i] == null ? null : `${x},${Y(ma[i])}`).filter(Boolean).join(" ")}"/>`;
    }
    g += pts.map(([x, r]) => `<circle class="cp-dot" cx="${x}" cy="${Y(r.avg)}" r="${rows.length > 60 ? 0 : 3.2}"/><rect x="${x - 6}" y="${P.t}" width="12" height="${H - P.t - P.b}" fill="transparent" ${tipAttr(`${ymd(r.d)} · 평균 ${usd(r.avg)} (그날 최고 ${usd(r.hi)}, 최저 ${usd(r.lo)}) · 전일 대비 ${sgn(r.chg, 2)}%`)}/>`).join("");
    return `<svg class="ai-svg" viewBox="0 0 ${w} ${H}" width="${w}" height="${H}" role="img" aria-label="메모리 현물가 추이">${g}</svg>`;
  }

  // ---------- CPU 인상 타임라인 (가로 = 날짜, 세로 = 인상률, 세로 막대 = 범위)
  function cpuChart(ev, w) {
    const H = Math.round(Math.max(240, Math.min(320, w * 0.45))), P = { l: 40, r: 16, t: 14, b: 28 };
    const yr = new Date().getFullYear();
    const t0 = Date.parse(`${yr}-01-01`), t1 = Date.now() + 10 * 864e5;
    const list = ev.filter((e) => Date.parse(e.date) >= t0);
    const ymax = Math.max(25, Math.ceil(Math.max(...list.map((e) => e.pct_hi)) / 10) * 10);
    const X = (t) => P.l + (t - t0) / (t1 - t0) * (w - P.l - P.r), Y = (v) => P.t + (1 - v / ymax) * (H - P.t - P.b);
    let g = "";
    for (let v = 0; v <= ymax; v += ymax > 30 ? 10 : 5) g += `<line class="ai-grid" x1="${P.l}" x2="${w - P.r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ai-tk" x="${P.l - 6}" y="${Y(v) + 3.5}" text-anchor="end">${v}%</text>`;
    for (let m = 0; m < 12; m++) { const t = Date.parse(`${yr}-${String(m + 1).padStart(2, "0")}-01`); if (t > t1) break; g += `<line class="ai-grid mid" x1="${X(t)}" x2="${X(t)}" y1="${P.t}" y2="${H - P.b}"/><text class="ai-tk" x="${X(t) + 2}" y="${H - 8}">${m + 1}월</text>`; }
    g += `<line class="cp-axis" x1="${P.l}" x2="${w - P.r}" y1="${H - P.b}" y2="${H - P.b}"/><line class="cp-axis" x1="${P.l}" x2="${P.l}" y1="${P.t}" y2="${H - P.b}"/>`;
    const sh = (seg, x, y, c, fill) => {
      const f = fill ? c : "var(--surface)", a = `fill="${f}" stroke="${c}" stroke-width="2"`;
      if (seg === "server") return `<circle cx="${x}" cy="${y}" r="6" ${a}/>`;
      if (seg === "pc") return `<rect x="${x - 5.5}" y="${y - 5.5}" width="11" height="11" rx="1.5" ${a}/>`;
      return `<path d="M${x} ${y - 7} L${x + 7} ${y} L${x} ${y + 7} L${x - 7} ${y} Z" ${a}/>`;
    };
    list.slice().reverse().forEach((e) => {
      const x = X(Date.parse(e.date)), c = CO[e.company] || "var(--ink-2)", ym = Y((e.pct_lo + e.pct_hi) / 2);
      if (e.pct_hi > e.pct_lo) g += `<line x1="${x}" x2="${x}" y1="${Y(e.pct_hi)}" y2="${Y(e.pct_lo)}" stroke="${c}" stroke-width="3" stroke-linecap="round" opacity=".45"/>`;
      g += `<g ${tipAttr(`${ymd(e.date)} · ${e.company} ${SEG[e.segment]} · ${rng(e)}${e.kind === "plan" ? " (예정·보도)" : ""} · ${e.title}`)}>${sh(e.segment, x, ym, c, e.kind !== "plan")}</g>`;
    });
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
      <div class="cp-chart-head"><b>${esc(nm(st.pick, items[st.pick]))}</b><span class="muted">${esc((NAME[st.pick] || ["", ""])[1])}</span></div>
      <div class="chart-legend"><span><i style="background:var(--cp-mem);height:3px"></i>평균가</span><span><i class="cp-lg-band"></i>그날 최고~최저 범위</span><span><i style="background:var(--ink-2);height:2px;border-top:2px dashed var(--ink-2);background:none"></i>20일 이동평균 (기록 20일부터)</span></div>
      <div id="cpPrice"></div>
      ${pr.length < 20 ? `<p class="ai-warn">현물가 과거 이력은 DRAMeXchange 회원만 볼 수 있어서, ${firstDay ? ymd(firstDay) : "오늘"}부터 매일 한 줄씩 쌓고 있어요. 그래프는 날이 갈수록 길어지고, 20일이 쌓이면 이동평균선이 나타나요. 위 카드나 아래 표의 품목을 누르면 그래프가 바뀌어요.</p>` : ""}
      <div class="ai-tw"><table class="ai-rep cp-tbl"><thead><tr><th>분류</th><th>품목</th><th class="num">평균가</th><th class="num">전일 대비</th><th class="num">그날 범위</th><th>기준일</th><th class="num">기록</th></tr></thead><tbody>${tbl}</tbody></table></div>
      <p class="foot-note">현물가는 대리점·중개상 사이 즉석 거래 값이라 대형 고객이 분기마다 정하는 계약가보다 먼저 움직여요. DRAMeXchange는 표마다 갱신 주기가 달라서 D램 칩은 매일, 모듈과 낸드는 대개 주 1회 바뀌어요.</p>

      <h3 class="ai-h3">메모리 계약가 전망 <span class="sub">트렌드포스 발표 · 전 분기 대비 상승률</span></h3>
      ${mcRows ? `<div class="cp-crows">${mcRows}</div>` : "<p class='none'>아직 판독된 발표가 없어요.</p>"}
      <p class="foot-note">삼성전자, SK하이닉스, 마이크론의 실제 판매가는 이 계약가를 따라가요. 트렌드포스가 새 분기 전망을 내면 구글 뉴스에서 자동으로 읽어 추가해요.</p>

      <h3 class="ai-h3">CPU 가격 인상 타임라인 <span class="sub">인텔·AMD·퀄컴 인상 소식 · ${yr}년</span></h3>
      <div class="chart-legend"><span><i style="background:var(--cp-intel);height:8px;width:8px;border-radius:50%"></i>인텔</span><span><i style="background:var(--cp-amd);height:8px;width:8px;border-radius:50%"></i>AMD</span><span><i style="background:var(--cp-qc);height:8px;width:8px;border-radius:50%"></i>퀄컴</span><span><i style="background:var(--cp-both);height:8px;width:8px;border-radius:50%"></i>인텔·AMD 함께</span><span>● 서버, ■ PC, ◆ 전체</span><span>색 채움 = 실시, 빈 모양 = 예정·보도</span></div>
      <div id="cpCpu"></div>
      <p class="foot-note">CPU는 D램처럼 매일 공개되는 시세가 없어요. 인텔과 AMD가 값을 정해 고객사에 통보하는 구조라서, 가격 인상 기사로 흐름을 따라가요. 올해 확인된 인텔 인상(실시)만 <b>${nIntel}번</b>이에요. 세로 막대는 '10~20%'처럼 범위로 보도된 경우예요.</p>
      <div class="ai-tw"><table class="ai-rep cp-tbl"><thead><tr><th>날짜</th><th>회사</th><th>구분</th><th class="num">인상률</th><th>상태</th><th>내용</th><th>출처</th></tr></thead><tbody>${cpuRows}</tbody></table></div>
      <p class="foot-note">자동 판독 기준: 기사 제목에 회사, 'price·hike', 인상률(%)이 함께 있고, 같은 숫자를 두 곳 이상 또는 주요 매체 한 곳이 쓴 것만 채택해요. 제목에 숫자가 없던 큰 사건은 출처를 확인해 직접 넣었어요. 자료: <a href="https://www.dramexchange.com/" target="_blank" rel="noopener">DRAMeXchange</a>, <a href="https://www.trendforce.com/news/" target="_blank" rel="noopener">TrendForce</a>, 구글 뉴스.</p>
    </section>`;
    $("#cpPrice").innerHTML = priceChart(pr, W($("#cpPrice")));
    $("#cpCpu").innerHTML = cpuChart(cpu, W($("#cpCpu")));
    box.querySelectorAll("[data-pick]").forEach((el) => el.addEventListener("click", () => { st.pick = el.dataset.pick; render(); }));
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
