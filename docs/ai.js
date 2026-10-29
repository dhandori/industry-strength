/* AI 시장 탭 (2026-10-26 추가)
   데이터: docs/data/ai_market.json — scripts/ai_market.py 가 매일 09:20·12:20 KST에 만든다(.github/workflows/ai-market.yml).
   매출 = Epoch AI(새 보도가 날 때만 늘어남), 토큰 = OpenRouter(주간, 월요일 마감), 토큰 vs 지출 = Vercel AI Gateway(매일).
   다른 탭(app.js·highs.js·macro.js)과 코드를 섞지 않는다. 공유하는 것은 테마 색과 #tip 뿐이다. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const st = { data: null, loading: null };
  const md = (s) => { const [y, m, d] = s.split("-"); return `${+m}/${+d}`; };
  const ymd = (s) => { const [y, m, d] = s.split("-"); return `${y.slice(2)}.${+m}.${+d}`; };
  const won = (usd) => usd >= 1e12 ? `${(usd / 1e12).toFixed(2).replace(/\.?0+$/, "")}조 달러` : `${Math.round(usd / 1e8).toLocaleString()}억 달러`;
  const pct = (v, d = 1) => v == null ? "–" : v.toFixed(d) + "%";
  const TYPE = { "Annualized run rate": "런레이트", "Annual recurring revenue (ARR)": "ARR", target: "연말 목표" };
  const CONF = { Confident: "확실", Likely: "유력", Speculative: "추측" };
  const CO = { Anthropic: { c: "var(--ai-a)", basis: "총액 방식", help: "아마존 등 클라우드 파트너를 통해 판 금액 전체를 매출로 잡아요." },
    OpenAI: { c: "var(--ai-o)", basis: "순액 방식", help: "클라우드 파트너 판매분은 자기 몫만 매출로 잡아요." } };
  const AUTHOR = { deepseek: "DeepSeek", openai: "OpenAI", anthropic: "Anthropic", google: "Google", "x-ai": "xAI", "z-ai": "Z.ai", qwen: "Qwen",
    minimax: "MiniMax", moonshotai: "Moonshot", tencent: "Tencent", nvidia: "NVIDIA", xiaomi: "Xiaomi", stepfun: "StepFun", mistralai: "Mistral",
    "meta-llama": "Meta", typesafe: "Typesafe", others: "기타" };
  const an = (a) => AUTHOR[a] || a;

  async function load(force) {
    const box = $("#aiBody");
    if (!st.data || force) {
      if (!st.loading || force) st.loading = fetch("data/ai_market.json?v=" + Date.now(), { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
      try { st.data = await st.loading; } catch (e) { st.loading = null; $("#aiMeta").textContent = "AI 시장 자료를 불러오지 못했어요. 잠시 후 새로고침해 주세요."; box.innerHTML = ""; return; }
    }
    render();
  }

  // ---------- 작은 SVG 도구
  function width(el, min = 280) { return Math.max(min, Math.floor(el.clientWidth || 600)); }
  const tipAttr = (t) => `data-tip="${esc(t)}"`;
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

  // ---------- 1) 매출 런레이트 선 그래프
  function revenueChart(rv, W) {
    const H = Math.round(Math.max(220, Math.min(320, W * 0.45)));
    const P = { l: 46, r: 92, t: 14, b: 26 };
    const series = Object.keys(CO).map((c) => ({ c, pts: (rv.companies[c] || []).filter((x) => x.date >= "2024-01-01") }));
    const sup = (rv.supplements || []).filter((x) => CO[x.company]);
    const all = series.flatMap((s) => s.pts).concat(sup);
    if (!all.length) return "<p class='none'>매출 자료가 없어요.</p>";
    const t0 = Date.parse("2024-01-01"), t1 = Math.max(...all.map((x) => Date.parse(x.date))) + 20 * 864e5;
    const ymax = Math.ceil(Math.max(...all.map((x) => x.usd)) / 1e9 / 10) * 10;
    const X = (d) => P.l + ((Date.parse(d) - t0) / (t1 - t0)) * (W - P.l - P.r);
    const Y = (v) => P.t + (1 - v / 1e9 / ymax) * (H - P.t - P.b);
    let g = "";
    for (let v = 0; v <= ymax; v += ymax <= 40 ? 10 : 20) g += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v * 1e9)}" y2="${Y(v * 1e9)}" class="ai-grid"/><text x="${P.l - 6}" y="${Y(v * 1e9) + 4}" text-anchor="end" class="ai-tk">${v ? v * 10 + "억" : "0"}</text>`;
    for (const y of [2024, 2025, 2026, 2027]) { const x = X(`${y}-01-01`); if (x >= P.l && x <= W - P.r) g += `<text x="${x}" y="${H - 8}" class="ai-tk" text-anchor="middle">${y}</text><line x1="${x}" x2="${x}" y1="${P.t}" y2="${H - P.b}" class="ai-grid"/>`; }
    let lines = "", dots = "", labels = "";
    const ends = [];
    for (const s of series) {
      if (!s.pts.length) continue;
      const col = CO[s.c].c;
      lines += `<polyline fill="none" stroke="${col}" stroke-width="2.4" stroke-linejoin="round" points="${s.pts.map((p) => `${X(p.date).toFixed(1)},${Y(p.usd).toFixed(1)}`).join(" ")}"/>`;
      dots += s.pts.map((p) => `<circle cx="${X(p.date).toFixed(1)}" cy="${Y(p.usd).toFixed(1)}" r="4" fill="${col}" stroke="var(--surface)" stroke-width="1.5" ${tipAttr(`${s.c} · ${p.date} 기준 ${won(p.usd)} (${TYPE[p.type] || p.type}, ${CONF[p.confidence] || p.confidence || "–"}) · 보도 ${p.report_date || "–"}`)}/>`).join("");
      const last = s.pts.at(-1);
      ends.push({ c: s.c, col, x: X(last.date), y: Y(last.usd), t: `${s.c} ${won(last.usd)}`, d: md(last.date) });
    }
    // 보충 점(회사가 투자자에게 밝힌 연말 목표 등): 마지막 실제 점에서 점선으로 잇고 속 빈 동그라미
    const sends = [];
    for (const x of sup) {
      const col = CO[x.company].c, lastReal = (series.find((s) => s.c === x.company) || { pts: [] }).pts.at(-1);
      if (lastReal) lines += `<line x1="${X(lastReal.date).toFixed(1)}" y1="${Y(lastReal.usd).toFixed(1)}" x2="${X(x.date).toFixed(1)}" y2="${Y(x.usd).toFixed(1)}" stroke="${col}" stroke-width="1.6" stroke-dasharray="4 4" opacity="0.8"/>`;
      dots += `<circle cx="${X(x.date).toFixed(1)}" cy="${Y(x.usd).toFixed(1)}" r="4.5" fill="var(--surface)" stroke="${col}" stroke-width="2" ${tipAttr(`${x.company} · ${x.label} ${won(x.usd)} · 보도 ${x.report_date} · ${x.note}`)}/>`;
      sends.push({ col, x: X(x.date), y: Y(x.usd), t: `목표 ${won(x.usd)}`, d: x.company });
    }
    const near = (a, b) => Math.abs(a.x - b.x) < 150;
    const allL = [...sends.map((e) => ({ e, s: 1 })), ...ends.map((e) => ({ e, s: 0 }))].sort((a, b) => a.e.y - b.e.y);
    for (let i = 1; i < allL.length; i++) for (let j = 0; j < i; j++) if (near(allL[i].e, allL[j].e) && allL[i].e.y - allL[j].e.y < 30) allL[i].e.y = allL[j].e.y + 30;
    for (const e of sends) labels += `<text x="${e.x + 8}" y="${e.y + 1}" class="ai-end" fill="${e.col}" opacity="0.85">${esc(e.t)}</text><text x="${e.x + 8}" y="${e.y + 15}" class="ai-tk">${e.d} 연말</text>`;
    if (!sends.length) { ends.sort((a, b) => a.y - b.y); for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 30) ends[i].y = ends[i - 1].y + 30; }
    for (const e of ends) labels += `<text x="${e.x + 8}" y="${e.y + 1}" class="ai-end" fill="${e.col}">${esc(e.t)}</text><text x="${e.x + 8}" y="${e.y + 15}" class="ai-tk">${e.d} 기준</text>`;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="ai-svg" role="img" aria-label="OpenAI·Anthropic 런레이트 추이">${g}${lines}${dots}${labels}</svg>`;
  }

  // ---------- 1-2) S-1 실제 분기 매출 막대 + 최근 4분기 합계 선
  function filingChart(f, W) {
    const qs = f.quarters || [];
    if (qs.length < 2) return "";
    const ttm = qs.map((q, i) => i >= 3 ? qs.slice(i - 3, i + 1).reduce((a, b) => a + b.usd, 0) : null);
    const H = Math.round(Math.max(240, Math.min(320, W * 0.48)));
    const P = { l: 50, r: 14, t: 24, b: 44 };
    const vmax = Math.max(...qs.map((q) => q.usd), ...ttm.filter((v) => v)) / 1e8;
    const step = vmax > 300 ? 100 : vmax > 150 ? 50 : 25, ymax = Math.ceil(vmax / step) * step;
    const n = qs.length, bw = (W - P.l - P.r) / n;
    const X = (i) => P.l + bw * (i + 0.5), Y = (v) => P.t + (1 - v / 1e8 / ymax) * (H - P.t - P.b);
    let g = `<defs><pattern id="aiHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="color-mix(in srgb, var(--ai-a) 18%, transparent)"/><line x1="0" y1="0" x2="0" y2="6" stroke="var(--ai-a)" stroke-width="2"/></pattern></defs>`;
    for (let v = 0; v <= ymax; v += step) g += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v * 1e8)}" y2="${Y(v * 1e8)}" class="ai-grid"/><text x="${P.l - 6}" y="${Y(v * 1e8) + 4}" text-anchor="end" class="ai-tk">${v ? v.toLocaleString() + "억" : "0"}</text>`;
    const narrow = W < 520;
    let bars = "";
    qs.forEach((q, i) => {
      const x = X(i), w = bw * 0.62, y = Y(q.usd), est = q.kind !== "reported";
      const prev = qs[i - 1], gr = prev ? (q.usd / prev.usd - 1) * 100 : null;
      const tt = `${q.q} 매출 ${won(q.usd)}${est ? " (추정)" : ""} · ${q.where}${gr != null ? ` · 전분기 대비 +${gr.toFixed(0)}%` : ""}`;
      bars += `<rect x="${(x - w / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${(Y(0) - y).toFixed(1)}" rx="2" fill="${est ? "url(#aiHatch)" : "var(--ai-a)"}" stroke="${est ? "var(--ai-a)" : "none"}" stroke-dasharray="${est ? "3 2" : ""}" ${tipAttr(tt)}/>`;
      if (!narrow || q.usd >= 3e9) bars += `<text x="${x}" y="${y - 5}" text-anchor="middle" class="ai-bv">${Math.round(q.usd / 1e8).toLocaleString()}${est ? "*" : ""}</text>`;
      const [yy, qq] = q.q.split("Q");
      bars += `<text x="${x}" y="${H - P.b + 15}" text-anchor="middle" class="ai-tk">${narrow ? `${yy.slice(2)}.${qq}Q` : `${yy.slice(2)}년 ${qq}Q`}</text>`;
      if (gr != null) bars += `<text x="${x}" y="${H - P.b + 30}" text-anchor="middle" class="ai-gr"${narrow ? ' style="font-size:9px"' : ""}>${narrow ? "" : "+"}${gr.toFixed(0)}%</text>`;
    });
    const tp = ttm.map((v, i) => v ? [X(i), Y(v), v, qs[i]] : null).filter(Boolean);
    let line = "";
    if (tp.length >= 2) {
      line = `<polyline fill="none" stroke="var(--ink-2)" stroke-width="2.2" stroke-linejoin="round" points="${tp.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ")}"/>`;
      line += tp.map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="${p[3].kind !== "reported" ? "var(--surface)" : "var(--ink-2)"}" stroke="var(--ink-2)" stroke-width="1.5" ${tipAttr(`${p[3].q}까지 최근 4분기 합계 ${won(p[2])}${p[3].kind !== "reported" ? " (3분기 추정 포함)" : ""}`)}/>`).join("");
      const e = tp.at(-1);
      line += `<text x="${e[0] - 6}" y="${e[1] - 8}" text-anchor="end" class="ai-tk" style="font-weight:700;fill:var(--ink-2)">4분기 합계 ${won(e[2])}</text>`;
    }
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="ai-svg" role="img" aria-label="Anthropic 분기 매출(S-1)">${g}${bars}${line}</svg>`;
  }

  // ---------- 2) 오픈웨이트 토큰 비중 선 그래프
  function openChart(or, W) {
    const H = 200, P = { l: 36, r: 14, t: 12, b: 24 };
    const est = (or.open_est || []).filter((e) => e.open_pct != null);
    if (est.length < 2) return "";
    const act = Object.fromEntries((or.open_history || []).map((h) => [h.week, h]));
    const n = est.length, X = (i) => P.l + (i / (n - 1)) * (W - P.l - P.r), Y = (v) => P.t + (1 - v / 100) * (H - P.t - P.b);
    let g = "";
    for (const v of [0, 25, 50, 75, 100]) g += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}" class="ai-grid${v === 50 ? " mid" : ""}"/><text x="${P.l - 6}" y="${Y(v) + 4}" text-anchor="end" class="ai-tk">${v}%</text>`;
    est.forEach((e, i) => { if (i % 8 === 0 || i === n - 1) g += `<text x="${X(i)}" y="${H - 7}" text-anchor="middle" class="ai-tk">${md(e.week)}</text>`; });
    const full = est.filter((e) => !e.partial);
    const path = (arr) => arr.map((e) => `${X(est.indexOf(e)).toFixed(1)},${Y(e.open_pct).toFixed(1)}`).join(" ");
    let s = `<polygon points="${X(0)},${Y(0)} ${path(full)} ${X(est.indexOf(full.at(-1)))},${Y(0)}" class="ai-area"/>`;
    s += `<polyline fill="none" stroke="var(--ai-open)" stroke-width="2.2" points="${path(full)}"/>`;
    est.forEach((e, i) => {
      const a = act[e.week];
      const tt = `${e.week} 주 · 오픈웨이트 ${pct(a ? a.open_pct : e.open_pct)}${a ? " (모델 단위 실측)" : " (회사별 추정)"}${e.partial ? " · 진행 중인 주" : ""}`;
      if (a) s += `<circle cx="${X(i)}" cy="${Y(a.open_pct)}" r="5" fill="var(--ai-open)" stroke="var(--surface)" stroke-width="2" ${tipAttr(tt)}/>`;
      else s += `<circle cx="${X(i)}" cy="${Y(e.open_pct)}" r="${e.partial ? 4 : 7}" fill="${e.partial ? "var(--surface)" : "transparent"}" stroke="${e.partial ? "var(--ai-open)" : "none"}" stroke-dasharray="2 2" stroke-width="1.5" ${tipAttr(tt)}/>`;
    });
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="ai-svg" role="img" aria-label="오픈웨이트 토큰 비중 추이">${g}${s}</svg>`;
  }

  // ---------- 3) 상위 모델 순위 변화(범프 차트): 최근 13주, 1~9위 + '9위 밖'
  const RISE_COL = ["#e4572e", "#0f9488", "#7048c4", "#d99a00", "#2a78d6", "#c2185b"];
  // 최근 back주 안에 상위 9개였는데 지금은 빠진 모델(가장 최근 순위)
  function droppedOut(rc) {
    const fw = (rc.weeks || []).filter((w) => !w.partial);
    if (fw.length < 2) return [];
    const now = new Set(fw.at(-1).models.map((m) => m.slug)), out = new Map();
    for (const w of fw.slice(-1 - rc.back, -1)) for (const m of w.models) if (!now.has(m.slug)) out.set(m.slug, { slug: m.slug, rank: m.rank, week: w.week });
    return [...out.values()].sort((a, b) => a.rank - b.rank);
  }
  const RANK_WEEKS = 8;   // 그래프는 최근 8주만(더 길면 모델 교체가 잦아 선이 엉킨다)
  function rankChart(rc, W) {
    const weeks = (rc.weeks || []).filter((w) => !w.partial).slice(-RANK_WEEKS);
    if (weeks.length < 2) return "";
    const last = weeks.at(-1), info = rc.info || {};
    const riseIdx = Object.fromEntries((rc.risers || []).slice(0, RISE_COL.length).map((r, i) => [r.slug, i]));
    const OUT = 10, narrow = W < 520;
    const P = { l: 34, r: Math.round(Math.min(230, W * (narrow ? 0.46 : 0.34))), t: 10, b: 24 };
    const H = P.t + P.b + OUT * (narrow ? 25 : 28);
    const n = weeks.length, X = (i) => P.l + (i / (n - 1)) * (W - P.l - P.r), Y = (r) => P.t + (r - 0.5) * ((H - P.t - P.b) / OUT);
    const rankOf = (w, s) => { const m = w.models.find((x) => x.slug === s); return m || null; };
    let g = "";
    for (let r = 1; r <= OUT; r++) g += `<text x="${P.l - 8}" y="${Y(r) + 4}" text-anchor="end" class="ai-tk">${r === OUT ? "밖" : r + "위"}</text>`;
    g += `<line x1="${P.l}" x2="${W - P.r}" y1="${(Y(9) + Y(10)) / 2}" y2="${(Y(9) + Y(10)) / 2}" class="ai-grid mid"/>`;
    weeks.forEach((w, i) => { if ((n - 1 - i) % (narrow ? 3 : 1) === 0) g += `<text x="${X(i)}" y="${H - 7}" text-anchor="middle" class="ai-tk">${md(w.week)}</text>`; });
    // 지금 상위 9개는 굵게, 최근 몇 주 사이 상위권에서 밀려난 모델만 옅은 점선으로(오래전 것까지 그리면 선이 엉킨다)
    const now = last.models.map((m) => m.slug);
    const gone = droppedOut(rc).map((d) => d.slug);
    const lineOf = (s, col, wd, op, dash) => {
      const pts = weeks.map((w, i) => { const m = rankOf(w, s); return [X(i), Y(m ? m.rank : OUT), m]; });
      // 처음 9위 안에 든 주 바로 전부터 그린다(그 전은 '밖'이 계속 이어져 겹치기만 함)
      const first = pts.findIndex((p) => p[2]);
      const seg = pts.slice(Math.max(0, first - 1));
      const nm = (info[s] || {}).name || s;
      return `<polyline fill="none" stroke="${col}" stroke-width="${wd}" stroke-opacity="${op}" stroke-linejoin="round" stroke-linecap="round"${dash ? ' stroke-dasharray="4 4"' : ""} points="${seg.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ")}"/>`
        + seg.filter((p) => p[2]).map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${wd + 1.2}" fill="${col}" fill-opacity="${op}" stroke="var(--surface)" stroke-width="1.2" ${tipAttr(`${nm} · ${weeks[pts.indexOf(p)].week} 주 · ${p[2].rank}위 · 전체 토큰의 ${pct(p[2].pct)}`)}/>`).join("");
    };
    let s = gone.map((x) => lineOf(x, "var(--muted)", 1.6, 0.7, true)).join("");
    const order = [...now].sort((a, b) => (a in riseIdx) - (b in riseIdx));   // 뜨는 모델을 맨 위에 그린다
    for (const x of order) s += x in riseIdx ? lineOf(x, RISE_COL[riseIdx[x]], 3, 1) : lineOf(x, "var(--ink-2)", 1.8, 0.55);
    // 오른쪽 이름표
    const maxCh = Math.floor((P.r - 14) / 7.2);
    const cut = (t) => t.length > maxCh ? t.slice(0, maxCh - 1) + "…" : t;
    let lb = "";
    for (const m of last.models) {
      const ri = riseIdx[m.slug], it = info[m.slug] || {};
      const col = ri == null ? "var(--ink-2)" : RISE_COL[ri];
      lb += `<text x="${W - P.r + 8}" y="${Y(m.rank) + 4}" class="ai-rl${ri == null ? "" : " up"}" fill="${col}" ${tipAttr(`${it.name} · ${pct(m.pct)} · ${{ open: "오픈웨이트", closed: "클로즈드" }[it.cls] || "미분류"}`)}>${esc(cut(it.name || m.slug))}</text>`;
    }
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="ai-svg" role="img" aria-label="상위 모델 순위 변화">${g}${s}${lb}</svg>`;
  }

  // ---------- 화면
  function render() {
    const d = st.data, box = $("#aiBody");
    if (!d) return;
    const src = d.sources || {};
    const bad = Object.entries(src).filter(([, v]) => !v.ok).map(([k]) => ({ revenue: "매출", openrouter: "OpenRouter", vercel: "Vercel" }[k] || k));
    $("#aiMeta").innerHTML = `갱신 ${esc(d.updated_at)} · 매일 09:20·12:20 KST 자동 수집${bad.length ? ` · <b class="ai-bad">이번 수집 실패: ${bad.join(", ")} (지난 값 표시)</b>` : ""}`;
    const rv = d.revenue || { companies: {}, others: [] }, or = d.openrouter || {}, vc = d.vercel || null;
    const lastOf = (c) => (rv.companies[c] || []).at(-1);
    const A = lastOf("Anthropic"), O = lastOf("OpenAI");
    const lt = or.latest || {};
    const cl = (lt.pct && (lt.pct.open + lt.pct.closed)) || 0;
    const openNow = cl ? lt.pct.open / cl * 100 : null;
    const est = (or.open_est || []).filter((e) => !e.partial);
    const prevW = est.length >= 2 ? est[est.length - 2] : null;
    const prevAct = (or.open_history || []).filter((h) => h.week < lt.week).at(-1);
    const prevOpen = prevAct ? prevAct.open_pct : prevW ? prevW.open_pct : null;
    const dOpen = openNow != null && prevOpen != null ? openNow - prevOpen : null;

    const tile = (k, v, sub, c) => `<div class="tile ai-tile" style="--c:${c || "var(--ink)"}"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${sub}</div></div>`;
    const coTile = (c, x) => x ? tile(`${c} 런레이트`, `<b style="color:${CO[c].c}">${won(x.usd)}</b>`, `${ymd(x.date)} 기준 · <span class="ai-basis" ${tipAttr(CO[c].help)}>${CO[c].basis}</span>`) : "";
    let tiles = coTile("Anthropic", A) + coTile("OpenAI", O);
    tiles += tile("오픈웨이트 토큰 비중", `<b style="color:var(--ai-open)">${pct(openNow)}</b>`, `OpenRouter ${lt.week ? md(lt.week) + " 주" : ""}${dOpen != null ? ` · 전주 대비 <b class="${dOpen >= 0 ? "up" : "down"}">${dOpen >= 0 ? "▲" : "▼"}${Math.abs(dOpen).toFixed(1)}%p</b>` : ""}`);
    if (vc) tiles += tile("오픈웨이트: 토큰 vs 지출", `<b style="color:var(--ai-open)">${pct(vc.share.tokens.open, 0)}</b><span class="ai-vs">vs</span><b>${pct(vc.share.cost.open, 0)}</b>`, `Vercel 상위 10개 모델 · ${md(vc.day)}`);

    // 매출 카드
    const sumNote = A && O ? `두 회사를 더하면 약 <b>${won(A.usd + O.usd)}</b>지만, 계산법(총액·순액)과 시점(${md(A.date)}·${md(O.date)})이 달라 참고용이에요.` : "";
    const supRows = (rv.supplements || []).filter((x) => CO[x.company]).map((x) => ({ c: x.company, date: x.date, usd: x.usd, type: "target", confidence: "회사 설명(보도)", report_date: x.report_date, source: x.source, note: x.note }));
    const recent = Object.keys(CO).flatMap((c) => (rv.companies[c] || []).map((x) => ({ c, ...x }))).concat(supRows).sort((a, b) => (b.date + b.report_date).localeCompare(a.date + a.report_date)).slice(0, 8);
    const repRows = recent.map((x) => `<tr><td class="tnum">${ymd(x.date)}${x.type === "target" ? " <small>(목표)</small>" : ""}</td><td><span class="ai-dot" style="background:${CO[x.c].c}"></span>${x.c}</td><td class="num"><b>${won(x.usd)}</b></td><td>${TYPE[x.type] || esc(x.type)}</td><td>${CONF[x.confidence] || esc(x.confidence || "–")}</td><td>${x.source ? `<a href="${esc(x.source)}" target="_blank" rel="noopener noreferrer" ${tipAttr(x.note || "")}>출처 ↗</a>` : "–"}</td></tr>`).join("");
    const others = (rv.others || []).slice(0, 8).map((x) => `<span class="ai-chip" ${tipAttr(`${x.company} · ${x.date} 기준 · ${TYPE[x.type] || x.type || "매출"}`)}>${esc(x.company)} <b>${won(x.usd)}</b><em>${ymd(x.date)}</em></span>`).join("");

    // S-1 분기 매출 카드
    let fHtml = "";
    const fa = (rv.filings || {}).Anthropic;
    if (fa && (fa.quarters || []).length >= 2) {
      const q = fa.quarters, lq = q.at(-1), rq = q.filter((x) => x.kind === "reported").at(-1);
      const pend = (fa.pending || []).map((p) => `<li><b>${esc(p.what)}</b> ${esc(p.note)}</li>`).join("");
      const srcs = (fa.sources || []).map((x) => `<a href="${esc(x.u)}" target="_blank" rel="noopener">${esc(x.t)}</a>`).join(", ");
      fHtml = `<section class="card">
        <div class="card-head wrap"><h2>Anthropic 실제 분기 매출 <span class="sub">${esc(fa.doc)} · 감사받은 공시 숫자</span></h2></div>
        <div class="chart-legend"><span><i style="background:var(--ai-a)"></i>분기 매출(공시)</span><span><i class="ai-hatch"></i>추정(*)</span><span><i style="background:var(--ink-2);height:3px"></i>최근 4분기 합계</span></div>
        <div id="aiFile"></div>
        <p class="foot-note">막대 위 숫자 단위는 억 달러, 아래 %는 전분기 대비 증가율이에요. 마지막 공시 분기 ${esc(rq.q)} 매출 ${won(rq.usd)}를 4배 하면 연환산 약 <b>${won(rq.usd * 4)}</b>${lq.kind !== "reported" ? `, ${esc(lq.q)} 추정치 기준이면 약 <b>${won(lq.usd * 4)}</b>` : ""}예요. ${lq.kind !== "reported" ? `<b>*${esc(lq.q)}</b>는 ${esc(lq.where)}.` : ""} 매출 인식: ${esc(fa.basis)}.</p>
        ${pend ? `<div class="ai-warn"><b>수정 S-1에서 채워질 칸</b><ul class="ai-pend">${pend}</ul></div>` : ""}
        <p class="foot-note">자료: <a href="${esc(fa.url)}" target="_blank" rel="noopener">SEC EDGAR</a> · 정리 ${srcs}. 이 카드는 사람이 config/ai_revenue_manual.json을 고쳐서 갱신해요.</p>
      </section>`;
    }

    // OpenRouter 카드
    const full = (or.weeks || []).filter((w) => !w.partial);
    const lw = full.at(-1);
    const ratio = or.author_open_ratio || {};
    let bar = "", legend = "";
    if (lw) {
      const ents = Object.entries(lw.authors).sort((a, b) => (a[0] === "others") - (b[0] === "others") || b[1] - a[1]);
      ents.forEach(([a, t]) => {
        const p = t / lw.total * 100, r = ratio[a];
        const kind = a === "others" ? "other" : r == null ? "other" : r >= 0.5 ? "open" : "closed";
        const tt = `${an(a)} · ${pct(p)}${r != null && a !== "others" ? ` · 이 회사 토큰 중 오픈웨이트 ${Math.round(r * 100)}%` : ""}`;
        bar += `<i class="ai-seg ${kind}" style="flex:${p}" ${tipAttr(tt)}>${p >= 6 ? `<span>${esc(an(a))}</span>` : ""}</i>`;
        legend += `<span class="ai-lg ${kind}" ${tipAttr(tt)}><i></i>${esc(an(a))} <b>${pct(p, 1)}</b></span>`;
      });
    }
    const tops = (lt.top_models || []).slice(0, 10);
    const tmax = Math.max(1, ...tops.map((m) => m.pct));
    const topRows = tops.map((m, i) => `<div class="ai-mrow"><span class="ai-rk">${i + 1}</span><span class="ai-mn"><b>${esc(m.name)}</b><small>${esc(an(m.author))}</small></span><span class="ai-tag ${m.cls}">${{ open: "오픈", closed: "클로즈드", unknown: "미분류" }[m.cls]}</span><span class="ai-mbar"><i class="${m.cls}" style="width:${m.pct / tmax * 100}%"></i></span><span class="num">${pct(m.pct)}</span></div>`).join("");

    // Vercel 카드
    let vcHtml = "";
    if (vc) {
      const s = vc.share;
      const rows = vc.models.slice(0, 14).map((m) => {
        const tag = { open: "오픈", closed: "클로즈드", unknown: "미분류" }[m.cls];
        return `<div class="ai-vrow"><span class="ai-mn"><b>${esc(m.name)}</b><span class="ai-tag ${m.cls}">${tag}</span></span>
          <span class="ai-pair"><span class="ai-pb tok"><i style="width:${(m.tokens || 0) * 2.5}%"></i><em>${m.tokens == null ? "10위 밖" : pct(m.tokens)}</em></span>
          <span class="ai-pb cost"><i style="width:${(m.cost || 0) * 2.5}%"></i><em>${m.cost == null ? "10위 밖" : pct(m.cost)}</em></span></span></div>`;
      }).join("");
      vcHtml = `<section class="card"><div class="card-head wrap"><h2>토큰 비중 vs 지출 비중 <span class="sub">Vercel AI Gateway · ${esc(vc.day)} 하루 · 상위 10개 모델</span></h2></div>
        <div class="ai-split">
          <div class="ai-kv"><span>오픈웨이트</span><b class="tok">토큰 ${pct(s.tokens.open)}</b><b class="cost">지출 ${pct(s.cost.open)}</b></div>
          <div class="ai-kv"><span>클로즈드</span><b class="tok">토큰 ${pct(s.tokens.closed)}</b><b class="cost">지출 ${pct(s.cost.closed)}</b></div>
          <div class="ai-kv muted"><span>미분류</span><b class="tok">토큰 ${pct(s.tokens.unknown)}</b><b class="cost">지출 ${pct(s.cost.unknown)}</b></div>
        </div>
        <div class="chart-legend"><span><i style="background:var(--ai-tok)"></i>토큰 비중</span><span><i style="background:var(--ai-cost)"></i>지출 비중</span></div>
        <div class="ai-vlist">${rows}</div>
        <p class="foot-note">같은 모델이라도 <b>토큰 비중</b>과 <b>돈(지출) 비중</b>은 크게 달라요. 싼 오픈웨이트 모델은 토큰을 많이 처리해도 돈은 적게 가져가고, 비싼 클로즈드 모델은 반대예요. Vercel은 날마다 상위 10개 모델만 공개해서 합이 100%가 아니에요(이날 토큰 ${pct(s.tokens.top10, 0)}, 지출 ${pct(s.cost.top10, 0)}).</p></section>`;
    }

    // 순위 변화 카드
    const rc = or.rank_chart || null;
    let rcHtml = "";
    if (rc && (rc.weeks || []).filter((w) => !w.partial).length >= 2) {
      const fw = rc.weeks.filter((w) => !w.partial), lastW = fw.at(-1), baseW = fw[Math.max(0, fw.length - 1 - rc.back)];
      const rs = (rc.risers || []).slice(0, RISE_COL.length), drops = droppedOut(rc);
      const tag = (c) => `<span class="ai-tag ${c}">${{ open: "오픈", closed: "클로즈드", unknown: "미분류" }[c] || "미분류"}</span>`;
      const chips = rs.map((r, i) => `<div class="ai-riser" style="--rc:${RISE_COL[i]}"><b>${esc(r.name)}</b>${tag(r.cls)}<span class="ai-rmove">${r.was ? r.was + "위" : "9위 밖"} → <b>${r.now}위</b></span><span class="ai-rpct">${r.pct_was != null ? pct(r.pct_was) + " → " : ""}${pct(r.pct)}</span></div>`).join("");
      rcHtml = `<section class="card">
        <div class="card-head wrap"><h2>누가 치고 올라오나 <span class="sub">OpenRouter 상위 모델 순위 · 최근 ${Math.min(RANK_WEEKS, fw.length)}주</span></h2></div>
        <div id="aiRank"></div>
        <h3 class="ai-h3">${md(baseW.week)} 주 → ${md(lastW.week)} 주(${rc.back}주 사이) 순위가 오른 모델</h3>
        ${chips ? `<div class="ai-risers">${chips}</div>` : `<p class="none">4주 전보다 순위가 오른 모델이 없어요.</p>`}
        ${drops.length ? `<p class="ai-drops"><b>밀려난 모델</b> ${drops.map((x) => `${esc((rc.info[x.slug] || {}).name || x.slug)} <span>(${md(x.week)} 주 ${x.rank}위 → 밖)</span>`).join(" · ")}</p>` : ""}
        <p class="foot-note">OpenRouter가 주마다 공개하는 <b>상위 9개 모델</b>의 순위예요(10위부터는 ‘기타’로 묶여 공개되지 않아서 맨 아래 ‘밖’ 줄로 그렸어요). <b>색 굵은 선</b> = ${rc.back}주 전보다 순위가 오른 모델, 회색 선 = 지금 상위 9개 중 나머지, 점선 = 최근 ${rc.back}주 사이 상위 9개에서 밀려난 모델. 무료판(무료)은 OpenRouter가 따로 세서 따로 보여요. 점에 손가락·마우스를 대면 그 주 비중이 보여요.</p>
      </section>`;
    }

    box.innerHTML = `
      <section class="tiles ai-tiles">${tiles}</section>
      <section class="card">
        <div class="card-head wrap"><h2>AI 연구소 매출 런레이트 <span class="sub">연환산 매출 · 보도 시점 기준 점</span></h2></div>
        <div id="aiRev"></div>
        <div class="ai-warn"><b>두 회사 숫자를 그냥 비교·합산하면 안 돼요.</b> Anthropic은 아마존 같은 클라우드 파트너를 통한 판매의 <b>총액</b>을, OpenAI는 <b>자기 몫</b>만 매출로 잡아요. 그래서 같은 장사를 해도 Anthropic 쪽 숫자가 크게 나와요. ${sumNote}</div>
        <h3 class="ai-h3">최근 보도</h3>
        <div class="ai-tw"><table class="mem-table ai-rep"><thead><tr><th>기준일</th><th>회사</th><th class="num">연환산 매출</th><th>종류</th><th>신뢰도</th><th>출처</th></tr></thead><tbody>${repRows}</tbody></table></div>
        ${others ? `<h3 class="ai-h3">다른 AI 회사 최근 매출</h3><div class="ai-chips">${others}</div>` : ""}
        <p class="foot-note">자료: <a href="https://epoch.ai/data/ai-companies" target="_blank" rel="noopener">Epoch AI, ‘Data on AI companies’</a>(CC BY 4.0). 언론 보도·회사 발표를 모은 표라 <b>새 보도가 날 때만</b> 점이 늘어요(최근엔 2~4주에 한 번). <b>속 빈 점과 점선</b>은 Epoch에 아직 없는 최신 보도(회사가 투자자에게 밝힌 연말 목표)로, 실제 실적이 아니에요. 점에 손가락·마우스를 대면 원문 요약이 보여요. 런레이트 = 최근 한 달 매출 × 12, ARR = 반복 매출 연환산.</p>
      </section>
      ${fHtml}
      ${rcHtml}
      <section class="card">
        <div class="card-head wrap"><h2>오픈웨이트 vs 클로즈드 토큰 비중 <span class="sub">OpenRouter · 주간(월요일 마감)</span></h2></div>
        <div id="aiOpen"></div>
        <p class="foot-note">선 = 분류된 토큰 중 오픈웨이트(가중치 공개) 모델 비율. <b>찬 점</b>은 모델 하나하나를 분류한 실측(이 탭을 만든 주부터 쌓여요), 선은 회사별 오픈웨이트 비중을 최근 주 기준으로 환산한 추정이에요. 점선 동그라미는 아직 진행 중인 이번 주예요.</p>
        ${lw ? `<h3 class="ai-h3">회사별 토큰 점유율 <span class="sub">${md(lw.week)} 주 · 전체 ${(lw.total / 1e12).toFixed(0)}조 토큰</span></h3>
        <div class="ai-bar">${bar}</div><div class="ai-legend">${legend}</div>
        <p class="foot-note">청록 = 주로 오픈웨이트 모델을 내는 회사, 남색 = 주로 클로즈드 모델 회사, 회색 = 기타·미분류. 칸에 손가락·마우스를 대면 그 회사 토큰 중 오픈웨이트 비율이 보여요.</p>` : ""}
        <h3 class="ai-h3">많이 쓰인 모델 <span class="sub">${lt.week ? md(lt.week) + " 주" : ""} · 전체 토큰 대비</span></h3>
        <div class="ai-mlist">${topRows}</div>
        <p class="foot-note">자료: <a href="https://openrouter.ai/rankings" target="_blank" rel="noopener">OpenRouter Rankings</a>. OpenRouter를 거친 토큰만 센 값이라 시장 전체가 아니라 <b>개발자들이 API로 고르는 경향</b>을 보여 줘요. 오픈웨이트 판정은 OpenRouter 모델 목록에 Hugging Face 가중치 주소가 있는지로 했어요(미분류 ${pct(lt.pct && lt.pct.unknown)}).</p>
      </section>
      ${vcHtml}
      <section class="card ai-src">
        <div class="card-head"><h2>출처와 갱신 주기</h2></div>
        <div class="ai-tw"><table class="mem-table"><thead><tr><th>항목</th><th>출처</th><th>원자료 갱신</th><th>이 탭 반영</th></tr></thead><tbody>
          <tr><td>매출 런레이트</td><td><a href="https://epoch.ai/data/ai-companies" target="_blank" rel="noopener">Epoch AI</a></td><td>새 보도가 날 때(대개 2~4주에 한 번)</td><td>매일 확인 · 새 보도는 텔레그램 알림</td></tr>
          <tr><td>토큰 점유율</td><td><a href="https://openrouter.ai/rankings" target="_blank" rel="noopener">OpenRouter</a></td><td>주간(월요일 09:00 KST 마감)</td><td>매일 확인 · 월요일에 주간 요약 알림</td></tr>
          <tr><td>토큰 vs 지출</td><td><a href="https://vercel.com/ai-gateway/leaderboards" target="_blank" rel="noopener">Vercel AI Gateway</a></td><td>매일</td><td>매일</td></tr>
        </tbody></table></div>
        <p class="foot-note">투자 판단의 참고 자료예요. 보도 수치는 회사마다 기준이 달라 직접 비교에 주의하세요.</p>
      </section>`;
    $("#aiRev").innerHTML = revenueChart(rv, width($("#aiRev")));
    $("#aiOpen").innerHTML = openChart(or, width($("#aiOpen")));
    if ($("#aiFile")) $("#aiFile").innerHTML = filingChart(fa, width($("#aiFile")));
    if ($("#aiRank")) $("#aiRank").innerHTML = rankChart(or.rank_chart, width($("#aiRank")));
    bindTip(box);
  }

  let rz, lastW = innerWidth;
  addEventListener("resize", () => { if (innerWidth === lastW) return; lastW = innerWidth; clearTimeout(rz); rz = setTimeout(() => { if (st.data && !$("#viewAi").hidden) render(); }, 200); });
  window.__ai = { show: () => load(false), rerender: () => { if (st.data && !$("#viewAi").hidden) render(); }, reload: () => { st.data = null; if (!$("#viewAi").hidden) load(true); } };
})();
