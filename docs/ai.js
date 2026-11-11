/* AI 시장 탭 (2026-10-26 추가)
   데이터: docs/data/ai_market.json — scripts/ai_market.py 가 매시 20분에 만든다(.github/workflows/ai-market.yml).
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
  const TYPE = { "Annualized run rate": "런레이트", "Annual recurring revenue (ARR)": "ARR", target: "연말 목표", s1: "S-1 공시 런레이트" };
  const CONF = { Confident: "확실", Likely: "유력", Speculative: "추측", Filed: "공시" };
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
    const dd = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;
    const fresh = (rv.news || []).filter((g) => CO[g.company] && g.metric === "run" && g.kind === "reported" && !g.superseded
      && !(rv.companies[g.company] || []).some((e) => Math.abs(e.usd - g.usd) <= 0.05 * g.usd && (dd(e.date, g.date) <= 30 || dd(e.report_date || e.date, g.date) <= 30))
      && (rv.companies[g.company] || []).every((e) => e.date < g.date));
    const all = series.flatMap((s) => s.pts).concat(sup, fresh);
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
    for (const x of fresh) {
      const col = CO[x.company].c, cx = X(x.date), cy = Y(x.usd), lr = (series.find((s) => s.c === x.company) || { pts: [] }).pts.at(-1);
      if (lr) lines += `<line x1="${X(lr.date).toFixed(1)}" y1="${Y(lr.usd).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${cy.toFixed(1)}" stroke="${col}" stroke-width="1.6" stroke-dasharray="1 3" stroke-linecap="round"/>`;
      dots += `<path d="M${cx.toFixed(1)} ${(cy - 6).toFixed(1)}l6 6-6 6-6-6z" fill="${col}" stroke="var(--surface)" stroke-width="1.5" ${tipAttr(`${x.company} · 기사 ${x.date} ${won(x.usd)} (${x.outlets.length}곳 보도, 미검증) · ${x.title}`)}/>`;
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

  // ---------- 1-1) 두 회사 합산 (2026-11-04): 보도 날짜가 서로 달라서, 각 회사 값을 보도 사이에서 로그 보간(꾸준한 비율 성장 가정)해
  // 같은 날짜로 맞춘 뒤 더한다. 아래 칠 = Anthropic, 그 위 = OpenAI, 위 테두리 = 합계.
  // 한 회사의 마지막 보도 뒤로는 그 회사 값을 마지막 보도값 그대로 두고 그 구간은 점선으로 표시한다.
  function sumChart(rv, W) {
    const P = { l: 46, r: 108, t: 14, b: 26 }, H = Math.round(Math.max(200, Math.min(280, W * 0.4)));
    const S = Object.fromEntries(Object.keys(CO).map((c) => [c, (rv.companies[c] || []).filter((x) => x.usd > 0).map((x) => [Date.parse(x.date), x.usd]).sort((a, b) => a[0] - b[0])]));
    const cs = Object.keys(CO);
    if (cs.some((c) => S[c].length < 2)) return "";
    const val = (c, t) => { const a = S[c]; if (t <= a[0][0]) return t < a[0][0] ? null : a[0][1]; if (t >= a.at(-1)[0]) return a.at(-1)[1];
      let i = a.findIndex((p) => p[0] >= t); const [t0, v0] = a[i - 1], [t1, v1] = a[i]; return Math.exp(Math.log(v0) + (Math.log(v1) - Math.log(v0)) * (t - t0) / (t1 - t0)); };
    const start = Math.max(Date.parse("2024-01-01"), ...cs.map((c) => S[c][0][0]));
    const lastReal = Math.min(...cs.map((c) => S[c].at(-1)[0])), end = Math.max(...cs.map((c) => S[c].at(-1)[0]));
    // 보도 날짜 + 2주 간격 점을 섞어 곡선이 매끄럽게
    const ts = new Set(cs.flatMap((c) => S[c].map((p) => p[0])).filter((t) => t >= start && t <= end));
    for (let t = start; t <= end; t += 14 * 864e5) ts.add(t);
    ts.add(end);
    const T = [...ts].sort((a, b) => a - b).map((t) => ({ t, a: val("Anthropic", t), o: val("OpenAI", t) })).filter((p) => p.a != null && p.o != null);
    if (T.length < 2) return "";
    const ymax = Math.ceil(Math.max(...T.map((p) => p.a + p.o)) / 1e9 / 10) * 10;
    const t0 = T[0].t, t1 = end + 20 * 864e5;
    const X = (t) => P.l + (t - t0) / (t1 - t0) * (W - P.l - P.r), Y = (v) => P.t + (1 - v / 1e9 / ymax) * (H - P.t - P.b);
    let g = "";
    const step = ymax <= 40 ? 10 : ymax <= 100 ? 20 : 50;
    for (let v = 0; v <= ymax; v += step) g += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v * 1e9)}" y2="${Y(v * 1e9)}" class="ai-grid"/><text x="${P.l - 6}" y="${Y(v * 1e9) + 4}" text-anchor="end" class="ai-tk">${v ? v * 10 + "억" : "0"}</text>`;
    for (const y of [2024, 2025, 2026, 2027]) { const x = X(Date.parse(`${y}-01-01`)); if (x >= P.l && x <= W - P.r) g += `<text x="${x}" y="${H - 8}" class="ai-tk" text-anchor="middle">${y}</text><line x1="${x}" x2="${x}" y1="${P.t}" y2="${H - P.b}" class="ai-grid"/>`; }
    const pt = (p, v) => `${X(p.t).toFixed(1)},${Y(v).toFixed(1)}`;
    const base = `${X(T.at(-1).t).toFixed(1)},${Y(0)} ${X(T[0].t).toFixed(1)},${Y(0)}`;
    const areaA = `<polygon points="${T.map((p) => pt(p, p.a)).join(" ")} ${base}" fill="var(--ai-a)" opacity=".55"/>`;
    const areaO = `<polygon points="${T.map((p) => pt(p, p.a + p.o)).join(" ")} ${[...T].reverse().map((p) => pt(p, p.a)).join(" ")}" fill="var(--ai-o)" opacity=".5"/>`;
    const real = T.filter((p) => p.t <= lastReal), tail = T.filter((p) => p.t >= lastReal);
    let top = `<polyline fill="none" stroke="var(--ink)" stroke-width="2.2" stroke-linejoin="round" points="${real.map((p) => pt(p, p.a + p.o)).join(" ")}"/>`;
    if (tail.length > 1) top += `<polyline fill="none" stroke="var(--ink)" stroke-width="2" stroke-dasharray="4 4" points="${tail.map((p) => pt(p, p.a + p.o)).join(" ")}"/>`;
    // 보도가 있던 날짜에만 손가락·마우스용 점
    const rep = new Set(cs.flatMap((c) => S[c].map((p) => p[0])));
    const dots = T.filter((p) => rep.has(p.t)).map((p) => { const d = new Date(p.t).toISOString().slice(0, 10);
      return `<circle cx="${X(p.t).toFixed(1)}" cy="${Y(p.a + p.o).toFixed(1)}" r="3.5" fill="var(--ink)" stroke="var(--surface)" stroke-width="1.5" ${tipAttr(`${d} 합계 약 ${won(p.a + p.o)} = Anthropic ${won(p.a)} + OpenAI ${won(p.o)}${p.t > lastReal ? " (한쪽은 마지막 보도값)" : ""}`)}/>`; }).join("");
    const L = T.at(-1), lx = X(L.t) + 8, ly = Y(L.a + L.o);
    const stale = cs.find((c) => S[c].at(-1)[0] < end);
    const labels = `<text x="${lx}" y="${ly + 1}" class="ai-end" fill="var(--ink)">합계 ${esc(won(L.a + L.o))}</text><text x="${lx}" y="${ly + 15}" class="ai-tk">${md(new Date(end).toISOString().slice(0, 10))} 기준</text>`
      + `<text x="${lx}" y="${Math.min(H - P.b - 4, Y(L.a / 2)) + 4}" class="ai-tk" fill="var(--ai-a)">Anthropic ${Math.round(L.a / (L.a + L.o) * 100)}%</text>`
      + `<text x="${lx}" y="${Math.max(ly + 32, Y(L.a + L.o / 2)) + 4}" class="ai-tk" fill="var(--ai-o)">OpenAI ${Math.round(L.o / (L.a + L.o) * 100)}%</text>`;
    const note = stale ? `<p class="foot-note">${esc(stale)}의 마지막 보도(${ymd(new Date(S[stale].at(-1)[0]).toISOString().slice(0, 10))}) 뒤로는 그 값을 그대로 더해서 <b>점선</b>으로 그렸어요.</p>` : "";
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="ai-svg" role="img" aria-label="Anthropic·OpenAI 런레이트 합산 추이">${g}${areaA}${areaO}${top}${dots}${labels}</svg>
      <div class="chart-legend"><span><i style="background:var(--ink)"></i>두 회사 합계</span><span><i style="background:var(--ai-a)"></i>Anthropic</span><span><i style="background:var(--ai-o)"></i>OpenAI</span></div>${note}`;
  }

  // ---------- 1-1b) 두 회사 분기 매출(나란한 막대) + 합계 (2026-11-11 사용자: OpenAI 분기 실적과 Anthropic 합산)
  function quarterChart(Q, W) {
    const A = Q.companies.Anthropic?.rows || [], O = Q.companies.OpenAI?.rows || [];
    const qs = [...new Set([...A, ...O].map((r) => r.q))].sort().slice(-6);
    if (qs.length < 2) return "";
    const a = Object.fromEntries(A.map((r) => [r.q, r])), o = Object.fromEntries(O.map((r) => [r.q, r]));
    const H = Math.round(Math.max(250, Math.min(330, W * 0.5))), P = { l: 50, r: 12, t: 26, b: 46 };
    const tot = qs.map((q) => (a[q]?.usd || 0) + (o[q]?.usd || 0));
    const vmax = Math.max(...tot) / 1e8, step = vmax > 300 ? 100 : vmax > 150 ? 50 : 25, ymax = Math.ceil(vmax / step) * step;
    const n = qs.length, bw = (W - P.l - P.r) / n, X = (i) => P.l + bw * (i + 0.5), Y = (v) => P.t + (1 - v / 1e8 / ymax) * (H - P.t - P.b);
    const narrow = W < 520;
    let g = "";
    for (let v = 0; v <= ymax; v += step) g += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v * 1e8)}" y2="${Y(v * 1e8)}" class="ai-grid"/><text x="${P.l - 6}" y="${Y(v * 1e8) + 4}" text-anchor="end" class="ai-tk">${v ? v.toLocaleString() + "억" : "0"}</text>`;
    let bars = "", line = [];
    qs.forEach((q, i) => {
      const w = bw * 0.34, x = X(i);
      [[a[q], "var(--ai-a)", -1, "Anthropic"], [o[q], "var(--ai-o)", 1, "OpenAI"]].forEach(([r, c, sd, nm]) => {
        if (!r) return;
        const x0 = x + (sd < 0 ? -w - 1 : 1), y = Y(r.usd);
        bars += `<rect x="${x0.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${(Y(0) - y).toFixed(1)}" rx="2" fill="${c}" ${tipAttr(`${nm} ${q} 매출 ${won(r.usd)}${r.qoq != null ? ` · 전분기 대비 ${r.qoq > 0 ? "+" : ""}${r.qoq.toFixed(0)}%` : ""} · ${r.src}`)}/>`;
        if (!narrow) bars += `<text x="${(x0 + w / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" class="ai-bv" style="font-size:10px">${Math.round(r.usd / 1e8)}</text>`;
      });
      if (a[q] && o[q]) line.push([x, Y(tot[i]), tot[i], q]);
      const [yy, qq] = q.split("Q");
      bars += `<text x="${x}" y="${H - P.b + 15}" text-anchor="middle" class="ai-tk">${narrow ? `${yy.slice(2)}.${qq}Q` : `${yy.slice(2)}년 ${qq}Q`}</text>`;
      const gr = [a[q]?.qoq, o[q]?.qoq].map((v) => v == null ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(0)}%`);
      bars += `<text x="${x}" y="${H - P.b + 30}" text-anchor="middle" class="ai-gr" style="font-size:${narrow ? 9 : 10.5}px"><tspan fill="var(--ai-a)">${gr[0]}</tspan> <tspan fill="var(--ai-o)">${gr[1]}</tspan></text>`;
    });
    let ln = "";
    if (line.length >= 2) ln = `<polyline fill="none" stroke="var(--ink)" stroke-width="2" stroke-dasharray="4 3" points="${line.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ")}"/>`;
    ln += line.map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="var(--ink)" ${tipAttr(`${p[3]} 두 회사 합계 ${won(p[2])} (기준이 달라 참고용)`)}/>`).join("");
    if (line.length) { const e = line.at(-1); ln += `<text x="${e[0] - 6}" y="${e[1] - 8}" text-anchor="end" class="ai-tk" style="font-weight:700;fill:var(--ink)">합계 ${won(e[2])}</text>`; }
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="ai-svg" role="img" aria-label="Anthropic·OpenAI 분기 매출과 합계">${g}${bars}${ln}</svg>`;
  }
  function quarterCard(Q, warns) {
    if (!Q || !Q.companies) return "";
    const pc = (v) => v == null ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(0)}%`;
    const box = (co) => {
      const rows = Q.companies[co]?.rows || [];
      const r = rows.at(-1);
      if (!r) return "";
      const hl = r.hl || {}, f = hl.facts || {};
      const auto = [f.qoq && `전분기 대비 ${f.qoq.value}% 성장(${esc(f.qoq.outlet)})`, f.enterprise && `기업 쪽: ‘${esc(f.enterprise.text)}’(${esc(f.enterprise.outlet)})`,
        f.loss && `손실 ${Math.round(+f.loss.value * 10).toLocaleString()}억 달러 보도(${esc(f.loss.outlet)})`, f.drivers && f.drivers.length && `보도에 나온 성장 동력: ${f.drivers.map(esc).join("·")}`].filter(Boolean);
      const facts = (r.facts || []).map(esc).concat(r.facts && r.facts.length ? [] : auto);
      const heads = (hl.heads || []).slice(0, 4).map((h) => `<li><a href="${esc(h.link)}" target="_blank" rel="noopener noreferrer">${esc(h.title)}</a> <span class="muted">${esc(h.outlet)} · ${ymd(h.date)}</span></li>`).join("");
      const prevQ = rows.at(-2);
      return `<div class="aq-co" style="--c:${CO[co].c}"><div class="aq-h"><span class="ai-dot" style="background:${CO[co].c}"></span><b>${co}</b> <span class="muted">${esc(r.q.replace("Q", "년 ").replace(/^(\d+)년 (\d)$/, "$1년 $2분기"))} · ${esc(r.src)}${r.date ? " · " + ymd(r.date) + " 보도" : ""}</span></div>
        <div class="aq-v"><b>${won(r.usd)}</b><span>전분기 대비 <b class="${(r.qoq ?? 0) >= 0 ? "up" : "down"}">${pc(r.qoq)}</b>${r.qoq_prev != null ? ` <small>(직전 분기 ${pc(r.qoq_prev)})</small>` : ""}${r.yoy != null ? ` · 전년 대비 <b>${pc(r.yoy)}</b>` : ""}</span></div>
        ${prevQ ? `<div class="aq-trend">${rows.slice(-4).map((x) => `${x.q.slice(2).replace("Q", ".")}Q ${Math.round(x.usd / 1e8)}억`).join(" → ")}</div>` : ""}
        ${facts.length ? `<ul class="aq-facts">${facts.map((x) => `<li>${x}</li>`).join("")}</ul>` : ""}
        ${heads ? `<details class="aq-heads"><summary>주요 보도 ${(hl.heads || []).length}건</summary><ul>${heads}</ul></details>` : ""}</div>`;
    };
    const C = Q.combined || [], c = C.at(-1);
    const rowsT = C.slice(-6).reverse().map((x) => `<tr><td>${esc(x.q)}</td><td class="num">${won(x.Anthropic)}</td><td class="num">${won(x.OpenAI)}</td><td class="num"><b>${won(x.usd)}</b></td><td class="num">${pc(x.qoq)}</td><td class="num">${x.a_share.toFixed(0)} : ${(100 - x.a_share).toFixed(0)}</td></tr>`).join("");
    const gap = (warns || []).filter((w) => w.kind === "gap");
    return `<section class="card ai-o-q">
      <div class="card-head wrap"><h2>AI 연구소 분기 실적 <span class="sub">Anthropic·OpenAI 분기 매출과 두 회사 합계</span></h2></div>
      ${gap.length ? `<div class="ai-warn aq-gap"><b>⚠️ 보도는 잡혔는데 표에 못 넣은 실적</b><ul>${gap.map((w) => `<li>${esc(w.msg)}</li>`).join("")}</ul></div>` : ""}
      ${c ? `<div class="aq-sum"><span>${esc(c.q)} 두 회사 합계</span><b>${won(c.usd)}</b><em>전분기 대비 ${pc(c.qoq)} · Anthropic ${c.a_share.toFixed(0)}% · OpenAI ${(100 - c.a_share).toFixed(0)}%</em></div>` : ""}
      <div class="chart-legend"><span><i style="background:var(--ai-a)"></i>Anthropic</span><span><i style="background:var(--ai-o)"></i>OpenAI</span><span><i style="background:var(--ink);height:3px"></i>두 회사 합계(참고)</span></div>
      <div id="aiQ"></div>
      <div class="aq-cos">${box("OpenAI")}${box("Anthropic")}</div>
      ${rowsT ? `<h3 class="ai-h3">분기별 합계 <span class="sub">억 달러 · 비중 = Anthropic : OpenAI</span></h3><div class="ai-tw"><table class="mem-table ai-rep"><thead><tr><th>분기</th><th class="num">Anthropic</th><th class="num">OpenAI</th><th class="num">합계</th><th class="num">합계 전분기 대비</th><th class="num">비중</th></tr></thead><tbody>${rowsT}</tbody></table></div>` : ""}
      <p class="foot-note">막대 아래 두 숫자는 회사별 전분기 대비 증가율(왼쪽 Anthropic, 오른쪽 OpenAI)이에요. 값은 S-1 공시가 있으면 공시, 없으면 여러 매체가 같이 보도한 숫자예요(‘확인된 보도’는 사람이 출처를 확인해 넣은 값, ‘기사 자동 판독’은 매일 구글 뉴스에서 읽은 값). <b>합계는 참고용</b>이에요. Anthropic은 클라우드 파트너 판매 <b>총액</b>, OpenAI는 <b>자기 몫</b>만 매출로 잡아서 그대로 더하면 Anthropic 쪽이 커 보여요. 새 분기 실적 보도가 나오면 1시간 안에 이 표와 텔레그램 알림에 반영돼요.</p>
    </section>`;
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
    let bars = "", vals = "";
    qs.forEach((q, i) => {
      const x = X(i), w = bw * 0.62, y = Y(q.usd), est = q.kind !== "reported";
      const prev = qs[i - 1], gr = prev ? (q.usd / prev.usd - 1) * 100 : null;
      const tt = `${q.q} 매출 ${won(q.usd)}${est ? " (추정)" : ""} · ${q.where}${gr != null ? ` · 전분기 대비 +${gr.toFixed(0)}%` : ""}`;
      bars += `<rect x="${(x - w / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${(Y(0) - y).toFixed(1)}" rx="2" fill="${est ? "url(#aiHatch)" : "var(--ai-a)"}" stroke="${est ? "var(--ai-a)" : "none"}" stroke-dasharray="${est ? "3 2" : ""}" ${tipAttr(tt)}/>`;
      if (!narrow || q.usd >= 3e9) vals += `<text x="${x}" y="${y - 5}" text-anchor="middle" class="ai-bv">${Math.round(q.usd / 1e8).toLocaleString()}${est ? "*" : ""}</text>`;
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
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="ai-svg" role="img" aria-label="Anthropic 분기 매출(S-1)">${g}${bars}${line}${vals}</svg>`;
  }

  // '오픈/클로즈드로 분류된 몫 중 오픈웨이트 비율'(미분류·10위 밖은 분모에서 뺀다).
  const openRatio = (o, c) => (o != null && c != null && o + c > 0 ? (o / (o + c)) * 100 : null);
  // ---------- 2) 오픈웨이트 vs 클로즈드(토큰·지출)
  // 오픈웨이트 vs 클로즈드 한 그래프: 위 줄 = 토큰(OpenRouter 주간, 모든 모델), 아래 줄 = 지출(Vercel 매일을 주 평균).
  // 줄마다 아래 청록이 오픈웨이트, 위 남색이 클로즈드(합 100%). 둘 다 '분류된 몫 중 비율'로 같은 기준이다.
  // 지출은 공개하는 곳이 Vercel뿐이라 그 값을 쓰고, 토큰은 더 넓게 세는 OpenRouter를 쓴다(2026-11-02 사용자: 중복 합치기).
  function costWeeks(vc, weeks) {
    const enough = (o, c) => o != null && c != null && o + c >= 30;   // 분류된 몫이 30% 미만인 날은 튄다(8월~9월 초)
    const days = (vc && vc.history || []).filter((h) => enough(h.open_cost, h.closed_cost));
    return weeks.map((w) => {
      const end = new Date(Date.parse(w + "T00:00:00Z") + 7 * 864e5).toISOString().slice(0, 10);
      const ds = days.filter((h) => h.day >= w && h.day < end);
      return ds.length ? { v: ds.reduce((t, h) => t + openRatio(h.open_cost, h.closed_cost), 0) / ds.length, n: ds.length } : null;
    });
  }
  // 월별 오픈웨이트 비중(2026-11-02 사용자: 시타델 그림처럼 막대 + 선, 축은 0~100% 하나).
  // 막대 = 토큰 비중(OpenRouter 주간을 달로 평균, 실측 주는 실측값), 선 = 지출 비중(Vercel 매일을 달로 평균).
  function openMonths(or, vc) {
    const act = Object.fromEntries((or.open_history || []).map((h) => [h.week, h.open_pct]));
    const M = {};
    const at = (k) => (M[k] = M[k] || { m: k, tok: [], cost: [] });
    for (const e of or.open_est || []) {
      const v = act[e.week] != null ? act[e.week] : e.open_pct;
      if (v != null) at(e.week.slice(0, 7)).tok.push({ v, partial: !!e.partial });
    }
    for (const h of (vc && vc.history) || []) {
      if (h.open_cost == null || h.closed_cost == null || h.open_cost + h.closed_cost < 30) continue;
      at(h.day.slice(0, 7)).cost.push(openRatio(h.open_cost, h.closed_cost));
    }
    const avg = (a) => (a.length ? a.reduce((t, x) => t + x, 0) / a.length : null);
    const ks = Object.keys(M).sort().slice(-13);
    const nowM = new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 7);   // 한국 날짜 기준 이번 달
    return ks.map((k) => {
      const full = M[k].tok.filter((x) => !x.partial);
      const tw = full.length ? full : M[k].tok;   // 진행 중인 주만 있는 달은 그 주 추정값
      return { m: k, tok: avg(tw.map((x) => x.v)), tn: tw.length, cost: avg(M[k].cost), cn: M[k].cost.length, partial: k >= nowM };
    });
  }
  function openChart(or, vc, W) {
    const ms = openMonths(or, vc);
    if (ms.length < 2) return "";
    const n = ms.length, P = { l: 36, r: 10, t: 22, b: 26 }, H = 260;
    const slot = (W - P.l - P.r) / n, bw = Math.min(34, slot * 0.58);
    const X = (i) => P.l + slot * (i + 0.5), Y = (v) => P.t + (1 - v / 100) * (H - P.t - P.b);
    const narrow = slot < 34;
    let g = "", s = "", lab = "", hit = "";
    for (const v of [0, 25, 50, 75, 100]) g += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}" class="ai-grid${v === 50 ? " mid" : ""}"/><text x="${P.l - 6}" y="${Y(v) + 4}" text-anchor="end" class="ai-tk">${v}%</text>`;
    ms.forEach((d, i) => {
      const yr = d.m.slice(2, 4), mo = +d.m.slice(5);
      const show = !narrow || i % 2 === n % 2 || i === n - 1;
      if (show) g += `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" class="ai-tk">${mo === 1 || i === 0 ? `${yr}.${mo}` : `${mo}월`}</text>`;
      if (d.tok == null) return;
      s += `<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${Y(d.tok).toFixed(1)}" width="${bw.toFixed(1)}" height="${(Y(0) - Y(d.tok)).toFixed(1)}" rx="3" class="ai-mbar-tok${d.partial ? " partial" : ""}"/>`;
      if (!narrow || i === n - 1) lab += `<text x="${X(i)}" y="${Y(d.tok) - 5}" text-anchor="middle" class="ai-mv tok">${Math.round(d.tok)}</text>`;
    });
    const cp = ms.map((d, i) => (d.cost == null ? null : [X(i), Y(d.cost), d])).filter(Boolean);
    if (cp.length >= 2) s += `<polyline fill="none" stroke="var(--ink)" stroke-width="2.4" stroke-linejoin="round" points="${cp.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}"/>`;
    cp.forEach(([x, y, d]) => {
      s += `<circle cx="${x}" cy="${y}" r="4.2" fill="${d.partial ? "var(--surface)" : "var(--ink)"}" stroke="var(--ink)" stroke-width="2"/>`;
      lab += `<text x="${x}" y="${y + 17}" text-anchor="middle" class="ai-mv cost">${Math.round(d.cost)}</text>`;
    });
    ms.forEach((d, i) => {
      const tt = `${d.m.slice(0, 4)}년 ${+d.m.slice(5)}월${d.partial ? "(진행 중)" : ""} · 오픈웨이트 토큰 비중 ${d.tok != null ? `${pct(d.tok)}(OpenRouter ${d.tn}주 평균)` : "자료 없음"} · 오픈웨이트 지출 비중 ${d.cost != null ? `${pct(d.cost)}(Vercel ${d.cn}일 평균)` : "자료 없음"}`;
      hit += `<rect x="${(X(i) - slot / 2).toFixed(1)}" y="${P.t}" width="${slot.toFixed(1)}" height="${H - P.t - P.b}" fill="transparent" ${tipAttr(tt)}/>`;
    });
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="ai-svg" role="img" aria-label="월별 오픈웨이트 비중: 토큰 막대, 지출 선">${g}${s}${lab}${hit}</svg>`;
  }

  function weekChart(or, vc, W) {   // 최근 16주 작은 그래프(2026-11-02 사용자: 월별 아래 주간 남기기)
    const est = (or.open_est || []).filter((e) => e.open_pct != null).slice(-16);
    if (est.length < 2) return "";
    const act = Object.fromEntries((or.open_history || []).map((h) => [h.week, h]));
    const cost = costWeeks(vc, est.map((e) => e.week));
    const n = est.length, P = { l: 36, r: 14, t: 8, b: 24 }, band = 58, gap = 22, H = P.t + band * 2 + gap + P.b;
    const X = (i) => P.l + (i / (n - 1)) * (W - P.l - P.r);
    const tokOf = (e) => (act[e.week] ? act[e.week].open_pct : e.open_pct);
    const bands = [
      { label: "토큰 비중 (OpenRouter)", pts: est.map((e, i) => (e.partial ? null : [i, tokOf(e)])) },
      { label: "지출 비중 (Vercel, 주 평균)", pts: cost.map((c, i) => (c ? [i, c.v] : null)) },
    ];
    let g = "", s = "";
    bands.forEach((bd, r) => {
      const top = P.t + r * (band + gap), Y = (v) => top + (1 - v / 100) * band;
      for (const v of [0, 100]) g += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}" class="ai-grid${v === 50 ? " mid" : ""}"/><text x="${P.l - 6}" y="${Y(v) + 4}" text-anchor="end" class="ai-tk">${v}%</text>`;
      const pts = bd.pts.filter(Boolean);
      g += `<text x="${P.l + 4}" y="${top + 13}" class="ai-tk ai-band-lb">${bd.label}</text>`;
      if (pts.length < 2) { g += `<text x="${(P.l + W - P.r) / 2}" y="${top + band / 2}" text-anchor="middle" class="ai-tk">자료 없음</text>`; return; }
      const line = pts.map(([i, v]) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
      const x0 = X(pts[0][0]), x1 = X(pts.at(-1)[0]);
      s += `<polygon points="${x0},${Y(100)} ${line} ${x1},${Y(100)}" class="ai-area-closed"/>`;
      s += `<polygon points="${x0},${Y(0)} ${line} ${x1},${Y(0)}" class="ai-area-open"/>`;
      s += `<polyline fill="none" stroke="var(--ai-open)" stroke-width="2.2" points="${line}"/>`;
      const last = pts.at(-1)[1];
      s += `<text x="${x1 - 4}" y="${Y(last) + 15}" text-anchor="end" class="ai-band-v open">${Math.round(last)}%</text>`;
      s += `<text x="${x1 - 4}" y="${Y(last) - 6}" text-anchor="end" class="ai-band-v closed">${Math.round(100 - last)}%</text>`;
      if (r === 0) est.forEach((e, i) => {   // 모델 단위 실측 주는 찬 점, 진행 중인 주는 점선 동그라미
        if (act[e.week]) s += `<circle cx="${X(i)}" cy="${Y(act[e.week].open_pct)}" r="4" fill="var(--ai-open)" stroke="var(--surface)" stroke-width="1.5"/>`;
        else if (e.partial) s += `<circle cx="${X(i)}" cy="${Y(e.open_pct)}" r="4" fill="var(--surface)" stroke="var(--ai-open)" stroke-dasharray="2 2" stroke-width="1.5"/>`;
      });
    });
    est.forEach((e, i) => { if ((i % 4 === 0 && X(n - 1) - X(i) >= 44) || i === n - 1) g += `<text x="${X(i)}" y="${H - 7}" text-anchor="${i === n - 1 ? "end" : i === 0 ? "start" : "middle"}" class="ai-tk">${md(e.week)}</text>`; });
    const bw = (W - P.l - P.r) / Math.max(1, n - 1);
    est.forEach((e, i) => {
      const a = act[e.week], c = cost[i], t = tokOf(e);
      const tt = `${md(e.week)} 주${e.partial ? "(진행 중)" : ""} · 오픈웨이트 대 클로즈드 · 토큰 비중 ${pct(t)} 대 ${pct(100 - t)}${a ? "(모델별 실측)" : "(회사별 추정)"}`
        + ` · 지출 비중 ${c ? `${pct(c.v)} 대 ${pct(100 - c.v)}(Vercel ${c.n}일 평균)` : "자료 없음"}`;
      s += `<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${P.t}" width="${bw.toFixed(1)}" height="${band * 2 + gap}" fill="transparent" ${tipAttr(tt)}/>`;
    });
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="ai-svg" role="img" aria-label="최근 16주 오픈웨이트 대 클로즈드: 토큰 비중과 지출 비중">${g}${s}</svg>`;
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
    const bad = Object.entries(src).filter(([, v]) => !v.ok).map(([k]) => ({ revenue: "매출", openrouter: "OpenRouter", vercel: "Vercel", news: "뉴스", sec: "SEC 상장 서류" }[k] || k));
    $("#aiMeta").innerHTML = `갱신 ${esc(d.updated_at)} · 매시 20분 자동 수집${bad.length ? ` · <b class="ai-bad">이번 수집 실패: ${bad.join(", ")} (지난 값 표시)</b>` : ""}`;
    const rv0 = d.revenue || { companies: {}, others: [] }, or = d.openrouter || {}, vc = d.vercel || null;
    // 상장 서류에 런레이트 금액이 실리면 그 회사 선의 마지막 점으로 넣는다(회사 공시라 가장 믿을 만함)
    const rv = { ...rv0, companies: { ...rv0.companies } };
    for (const [co, f] of Object.entries(rv0.filings || {})) {
      if (!f.run_rate || !CO[co]) continue;
      const pts = (rv.companies[co] || []).filter((x) => !(x.date === f.run_rate.date && x.type === "s1"));
      pts.push({ date: f.run_rate.date, usd: f.run_rate.usd, type: "s1", confidence: "Filed", report_date: (f.doc || "").replace(/^Form /, ""), source: f.url, note: "상장 서류(S-1) 공시 런레이트" });
      rv.companies[co] = pts.sort((a, b) => a.date.localeCompare(b.date));
    }
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
    // 지출 비중: 그래프와 같은 'Vercel 주 평균'의 마지막 주(전주와 비교), 토큰당 값 차이도 같은 주 Vercel 합으로
    const allW = (or.open_est || []).map((e) => e.week);
    const cw = costWeeks(vc, allW).map((c, i) => c && { ...c, week: allW[i], partial: (or.open_est[i] || {}).partial });
    const cHas = cw.filter(Boolean), cNow = cHas.at(-1), cPrev = cHas.at(-2);
    const dCost = cNow && cPrev ? cNow.v - cPrev.v : null;
    let mult = null;
    if (cNow) {
      const end = new Date(Date.parse(cNow.week + "T00:00:00Z") + 7 * 864e5).toISOString().slice(0, 10);
      const ds = (vc.history || []).filter((h) => h.day >= cNow.week && h.day < end && h.open_tokens > 0 && h.closed_tokens > 0);
      const sum = (k) => ds.reduce((t, h) => t + (h[k] || 0), 0);
      if (ds.length && sum("open_cost") > 0) mult = (sum("closed_cost") / sum("closed_tokens")) / (sum("open_cost") / sum("open_tokens"));
    }
    const chg = (d) => d == null ? "" : `<b class="${d >= 0 ? "up" : "down"}">${d >= 0 ? "▲" : "▼"}${Math.abs(d).toFixed(1)}%p</b>`;
    tiles += tile("오픈웨이트 비중", `<span class="ai-vs">토큰</span> <b style="color:var(--ai-open)">${pct(openNow)}</b>${cNow ? ` <span class="ai-vs">지출</span> <b style="color:var(--ai-open)">${pct(cNow.v)}</b>` : ""}`, `${lt.week ? md(lt.week) + " 주 · " : ""}토큰은 OpenRouter, 지출은 Vercel 기준`);

    // 매출 카드
    const sumNote = A && O ? `두 회사를 더하면 약 <b>${won(A.usd + O.usd)}</b>지만, 계산법(총액·순액)과 시점(${md(A.date)}·${md(O.date)})이 달라 참고용이에요.` : "";
    const supRows = (rv.supplements || []).filter((x) => CO[x.company]).map((x) => ({ c: x.company, date: x.date, usd: x.usd, type: "target", confidence: "회사 설명(보도)", report_date: x.report_date, source: x.source, note: x.note }));
    const recent = Object.keys(CO).flatMap((c) => (rv.companies[c] || []).map((x) => ({ c, ...x }))).concat(supRows).sort((a, b) => (b.date + b.report_date).localeCompare(a.date + a.report_date)).slice(0, 8);
    const repRows = recent.map((x) => `<tr><td class="tnum">${ymd(x.date)}${x.type === "target" ? " <small>(목표)</small>" : ""}</td><td><span class="ai-dot" style="background:${CO[x.c].c}"></span>${x.c}</td><td class="num"><b>${won(x.usd)}</b></td><td>${TYPE[x.type] || esc(x.type)}</td><td>${CONF[x.confidence] || esc(x.confidence || "–")}</td><td>${x.source ? `<a href="${esc(x.source)}" target="_blank" rel="noopener noreferrer" ${tipAttr(x.note || "")}>출처 ↗</a>` : "–"}</td></tr>`).join("");
    const NK = { run: "런레이트", quarter: "분기 매출" };
    const newsRows = (rv.news || []).filter((g) => CO[g.company]).slice(0, 10).map((g) => `<tr class="${g.superseded ? "ai-sup" : ""}"><td class="tnum">${ymd(g.date)}</td><td><span class="ai-dot" style="background:${CO[g.company].c}"></span>${g.company}</td><td class="num"><b>${won(g.usd)}</b></td><td>${g.quarter ? esc(g.quarter) + " " : ""}${NK[g.metric]}${g.kind === "target" ? ' <span class="ai-ntag target">전망</span>' : ""}${g.superseded ? ' <span class="ai-ntag">정정됨</span>' : ""}</td><td>${g.outlets.length}곳</td><td><a href="${esc(g.link)}" target="_blank" rel="noopener noreferrer" ${tipAttr(g.title + " · " + g.outlets.join(", "))}>${esc(g.outlets[0])} ↗</a></td></tr>`).join("");
    const others = (rv.others || []).slice(0, 8).map((x) => `<span class="ai-chip" ${tipAttr(`${x.company} · ${x.date} 기준 · ${TYPE[x.type] || x.type || "매출"}`)}>${esc(x.company)} <b>${won(x.usd)}</b><em>${ymd(x.date)}</em></span>`).join("");

    // S-1 분기 매출 카드
    let fHtml = "";
    const fa = (rv.filings || {}).Anthropic;
    if (fa && (fa.quarters || []).length >= 2) {
      const q = fa.quarters, lq = q.at(-1), rq = q.filter((x) => x.kind === "reported").at(-1);
      const nq = (rv.news || []).filter((g) => g.company === "Anthropic" && g.metric === "quarter" && g.quarter);
      const newsQ = nq.map((g) => { const f = q.find((x) => x.q === g.quarter); const tag = g.kind === "target" ? "전망" : f && f.kind === "reported" ? "공시와 비교" : "새 숫자";
        return `<li><b>${esc(g.quarter)} ${won(g.usd)}</b> <span class="ai-ntag ${g.kind}">${tag}</span> ${ymd(g.date)} · ${g.outlets.length}곳 보도${f ? ` (서류 ${won(f.usd)}${f.kind !== "reported" ? " 추정" : ""})` : ""} · <a href="${esc(g.link)}" target="_blank" rel="noopener noreferrer">${esc(g.outlets[0])} ↗</a></li>`; }).join("");
      const runBox = fa.run_rate ? `<div class="ai-run"><span>S-1 공시 런레이트</span><b>${won(fa.run_rate.usd)}</b><em>${ymd(fa.run_rate.date)} 기준 · 최근 28일 사용료 × 13 + 월 구독료 × 12</em></div>` : "";
      const hist = (fa.history || []).map((h) => `${h.form} ${ymd(h.filed)}`).join(" → ");
      const pend = (fa.pending || []).map((p) => `<li><b>${esc(p.what)}</b> ${esc(p.note)}</li>`).join("");
      const srcs = (fa.sources || []).map((x) => `<a href="${esc(x.u)}" target="_blank" rel="noopener">${esc(x.t)}</a>`).join(", ");
      fHtml = `<section class="card ai-o-file">
        <div class="card-head wrap"><h2>Anthropic 실제 분기 매출 <span class="sub">${esc(fa.doc)} · 감사받은 공시 숫자</span></h2></div>
        <div class="chart-legend"><span><i style="background:var(--ai-a)"></i>분기 매출(공시)</span><span><i class="ai-hatch"></i>추정(*)</span><span><i style="background:var(--ink-2);height:3px"></i>최근 4분기 합계</span></div>
        ${runBox}
        <div id="aiFile"></div>
        <p class="foot-note">막대 위 숫자 단위는 억 달러, 아래 %는 전분기 대비 증가율이에요. 마지막 공시 분기 ${esc(rq.q)} 매출 ${won(rq.usd)}를 4배 하면 연환산 약 <b>${won(rq.usd * 4)}</b>${lq.kind !== "reported" ? `, ${esc(lq.q)} 추정치 기준이면 약 <b>${won(lq.usd * 4)}</b>` : ""}예요. ${lq.kind !== "reported" ? `<b>*${esc(lq.q)}</b>는 ${esc(lq.where)}.` : ""} 매출 인식: ${esc(fa.basis)}.</p>
        ${newsQ ? `<h3 class="ai-h3">기사 보도 분기 매출 <span class="sub">구글 뉴스 자동 판독</span></h3><ul class="ai-nq">${newsQ}</ul>` : ""}
        ${pend ? `<div class="ai-warn"><b>수정 S-1에서 채워질 칸</b><ul class="ai-pend">${pend}</ul></div>` : ""}
        <p class="foot-note">자료: <a href="${esc(fa.url)}" target="_blank" rel="noopener">SEC EDGAR</a> · 정리 ${srcs}. ${fa.auto ? `SEC EDGAR에서 <b>매시간 자동 확인</b>해요. 수정 S-1이나 최종 투자설명서가 올라오면 다음 수집 때 바로 바뀌어요.${hist ? ` 반영된 서류: ${esc(hist)}.` : ""}` : "SEC 자동 수집이 실패해 수동 입력값을 보여 줘요."} 새 분기 숫자가 기사로 먼저 나오면 '기사 보도'에 자동으로 떠요.</p>
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
        const co = a === "others" ? "" : ` data-aco="${esc(a)}" role="button" tabindex="0"`;
        bar += `<i class="ai-seg ${kind}" style="flex:${p}"${co} ${tipAttr(tt + (co ? " · 누르면 회사 화면" : ""))}>${p >= 6 ? `<span>${esc(an(a))}</span>` : ""}</i>`;
        legend += `<span class="ai-lg ${kind}${co ? " ai-co" : ""}"${co} ${tipAttr(tt)}><i></i>${esc(an(a))} <b>${pct(p, 1)}</b></span>`;
      });
    }
    const tops = (lt.top_models || []).slice(0, 10);
    const tmax = Math.max(1, ...tops.map((m) => m.pct));
    const topRows = tops.map((m, i) => `<div class="ai-mrow"><span class="ai-rk">${i + 1}</span><span class="ai-mn"><button type="button" class="lnk ai-mlnk" data-aim="or" data-k="${esc(m.slug)}">${esc(m.name)}</button><small>${esc(an(m.author))}</small></span><span class="ai-tag ${m.cls}">${{ open: "오픈", closed: "클로즈드", unknown: "미분류" }[m.cls]}</span><span class="ai-mbar"><i class="${m.cls}" style="width:${m.pct / tmax * 100}%"></i></span><span class="num">${pct(m.pct)}</span></div>`).join("");

    // 지출 상위 모델(Vercel 하루): 돈을 많이 가져간 모델. 같은 날 토큰 비중을 이름 옆에 작게 붙여 '토큰당 값' 차이가 보이게 한다.
    let costRows = "";
    if (vc) {
      const wk = vc.week && vc.week.models && vc.week.models.length ? vc.week : null;   // 최근 7일 평균(없으면 하루)
      const cm = (wk ? wk.models : vc.models).filter((m) => m.cost).sort((x, y) => y.cost - x.cost).slice(0, 10);
      const cmax = Math.max(1, ...cm.map((m) => m.cost));
      costRows = cm.map((m, i) => `<div class="ai-mrow"><span class="ai-rk">${i + 1}</span><span class="ai-mn"><button type="button" class="lnk ai-mlnk" data-aim="vc" data-k="${esc(m.name)}">${esc(m.name)}</button><small>토큰 비중 ${m.tokens ? pct(m.tokens) : "10위 밖"}</small></span><span class="ai-tag ${m.cls}">${{ open: "오픈", closed: "클로즈드", unknown: "미분류" }[m.cls]}</span><span class="ai-mbar"><i class="${m.cls}" style="width:${m.cost / cmax * 100}%"></i></span><span class="num">${pct(m.cost)}</span></div>`).join("");
    }

    // 순위 변화 카드
    const rc = or.rank_chart || null;
    let rcHtml = "";
    if (rc && (rc.weeks || []).filter((w) => !w.partial).length >= 2) {
      const fw = rc.weeks.filter((w) => !w.partial), lastW = fw.at(-1), baseW = fw[Math.max(0, fw.length - 1 - rc.back)];
      const rs = (rc.risers || []).slice(0, RISE_COL.length), drops = droppedOut(rc);
      const tag = (c) => `<span class="ai-tag ${c}">${{ open: "오픈", closed: "클로즈드", unknown: "미분류" }[c] || "미분류"}</span>`;
      const chips = rs.map((r, i) => `<div class="ai-riser" style="--rc:${RISE_COL[i]}"><b>${esc(r.name)}</b>${tag(r.cls)}<span class="ai-rmove">${r.was ? r.was + "위" : "9위 밖"} → <b>${r.now}위</b></span><span class="ai-rpct">${r.pct_was != null ? pct(r.pct_was) + " → " : ""}${pct(r.pct)}</span></div>`).join("");
      rcHtml = `<section class="card ai-o-rank">
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
      <section class="card ai-o-rev">
        <div class="card-head wrap"><h2>AI 연구소 매출 런레이트 <span class="sub">연환산 매출 · 보도 시점 기준 점</span></h2></div>
        <div id="aiRev"></div>
        <h3 class="ai-h3">두 회사 합산 (Anthropic + OpenAI) <span class="sub">보도 날짜가 달라 사이 값은 보간 · 위 테두리 = 합계</span></h3>
        <div id="aiSum"></div>
        <div class="ai-warn"><b>두 회사 숫자를 그냥 비교·합산하면 안 돼요.</b> Anthropic은 아마존 같은 클라우드 파트너를 통한 판매의 <b>총액</b>을, OpenAI는 <b>자기 몫</b>만 매출로 잡아요. 그래서 같은 장사를 해도 Anthropic 쪽 숫자가 크게 나와요. ${sumNote}</div>
        <h3 class="ai-h3">최근 보도</h3>
        <div class="ai-tw"><table class="mem-table ai-rep"><thead><tr><th>기준일</th><th>회사</th><th class="num">연환산 매출</th><th>종류</th><th>신뢰도</th><th>출처</th></tr></thead><tbody>${repRows}</tbody></table></div>
        ${newsRows ? `<h3 class="ai-h3">기사에서 자동으로 잡은 숫자 <span class="sub">구글 뉴스 · 매일 판독</span></h3>
        <div class="ai-tw"><table class="mem-table ai-rep"><thead><tr><th>보도일</th><th>회사</th><th class="num">금액</th><th>종류</th><th>보도</th><th>기사</th></tr></thead><tbody>${newsRows}</tbody></table></div>
        <p class="foot-note">기사 제목에 나온 금액을 자동으로 읽은 값이라 <b>미검증</b>이에요. 같은 숫자를 두 곳 이상 쓰거나 주요 매체가 쓴 것만 남겼고, 나중에 정정 기사가 나온 숫자는 줄을 그었어요. 기준일은 실적 시점이 아니라 보도일이에요.</p>` : ""}
        ${others ? `<h3 class="ai-h3">다른 AI 회사 최근 매출</h3><div class="ai-chips">${others}</div>` : ""}
        <p class="foot-note">자료: <a href="https://epoch.ai/data/ai-companies" target="_blank" rel="noopener">Epoch AI, ‘Data on AI companies’</a>(CC BY 4.0). 언론 보도·회사 발표를 모은 표라 <b>새 보도가 날 때만</b> 점이 늘어요(최근엔 2~4주에 한 번). <b>속 빈 점과 점선</b>은 회사가 투자자에게 밝힌 연말 목표로 실제 실적이 아니에요. <b>마름모</b>는 Epoch에 아직 없는 새 기사 숫자(자동 판독)예요. 점에 손가락·마우스를 대면 원문 요약이 보여요. 런레이트 = 최근 한 달 매출 × 12, ARR = 반복 매출 연환산.</p>
      </section>
      ${quarterCard(rv.quarterly, d.warnings)}
      ${fHtml}
      ${rcHtml}
      <section class="card ai-o-oc">
        <div class="card-head wrap"><h2>오픈웨이트 vs 클로즈드 <span class="sub">토큰 비중은 OpenRouter, 지출 비중은 Vercel 기준</span></h2></div>
        <div class="ai-oc">
          <div class="ai-ock"><span>오픈웨이트 토큰 비중</span><b>${pct(openNow)}</b><small>OpenRouter · ${lt.week ? md(lt.week) + " 주" : ""}${dOpen != null ? " · 전주보다 " + chg(dOpen) : ""}</small></div>
          <div class="ai-ock"><span>오픈웨이트 지출 비중</span><b>${cNow ? pct(cNow.v) : "–"}</b><small>${cNow ? `Vercel · ${md(cNow.week)} 주${cNow.partial ? "(진행 중)" : ""} ${cNow.n}일 평균${dCost != null ? " · 전주보다 " + chg(dCost) : ""}` : "자료 없음"}</small></div>
          ${mult ? `<div class="ai-ock alt"><span>토큰당 가격</span><b>클로즈드가 ${mult.toFixed(1)}배</b><small>오픈웨이트보다 비쌈 · Vercel ${md(cNow.week)} 주 합계</small></div>` : ""}
        </div>
        <h3 class="ai-h3">월별 오픈웨이트 비중</h3>
        <div class="chart-legend"><span><i style="background:var(--ai-open)"></i>토큰 비중(막대, OpenRouter)</span><span><i style="background:var(--ink);height:3px"></i>지출 비중(선, Vercel)</span></div>
        <div id="aiOpen"></div>
        <p class="foot-note">두 값 모두 오픈웨이트와 클로즈드 모델의 몫만 더해 100%로 놓고, 그중 오픈웨이트가 차지한 비율이에요(미분류는 뺌). 막대는 그달 OpenRouter 주간 값의 평균, 선은 그달 Vercel 하루 값의 평균이에요. 흐린 막대와 속 빈 점은 아직 끝나지 않은 이번 달이에요. Vercel 자료는 2026년 9월 중순부터 쌓여서 선은 그때부터 그려져요. 그래프에 손가락이나 마우스를 대면 그달 두 값이 함께 보여요.</p>
        <h3 class="ai-h3">최근 16주 <span class="sub">주간 · 매주 월요일 마감</span></h3>
        <div class="chart-legend"><span class="ai-lg open"><i></i>오픈웨이트</span><span class="ai-lg closed"><i></i>클로즈드</span></div>
        <div id="aiWeek"></div>
        <p class="foot-note">주마다 오픈웨이트(아래 청록)와 클로즈드(위 남색)가 나눠 가진 비중이에요. 위 줄은 토큰(OpenRouter), 아래 줄은 지출(Vercel 그 주 평균)이에요. 찬 점은 모델별 실측값, 점선 동그라미는 아직 끝나지 않은 이번 주예요.</p>
        <div class="ai-two">
          <div><h3 class="ai-h3">토큰 비중 상위 모델 <span class="sub">OpenRouter · ${lt.week ? md(lt.week) + " 주" : ""}</span></h3>
            <div class="ai-mlist">${topRows}</div></div>
          ${costRows ? `<div><h3 class="ai-h3">지출 비중 상위 모델 <span class="sub">Vercel · ${vc.week && vc.week.models ? `${md(vc.week.from)}~${md(vc.week.to)} ${vc.week.n}일 평균` : md(vc.day) + " 하루"}</span></h3>
            <div class="ai-mlist">${costRows}</div></div>` : ""}
        </div>
        ${lw ? `<h3 class="ai-h3">회사별 토큰 점유율 <span class="sub">${md(lw.week)} 주 · 전체 ${(lw.total / 1e12).toFixed(0)}조 토큰</span></h3>
        <div class="ai-bar">${bar}</div><div class="ai-legend">${legend}</div>` : ""}
        <p class="foot-note"><b>읽는 법</b>: 오픈웨이트 모델은 값이 싸서 토큰 비중은 높아도 지출 비중은 낮아요. 클로즈드 모델은 그 반대예요. 오른쪽 목록은 하루 튐에 순위가 뒤집히지 않게 최근 7일 평균으로 줄 세웠고(그날 10위 밖이면 0으로 셈), 이름 옆의 ‘토큰 비중’도 같은 7일 Vercel 평균이에요. 회사별 막대는 그 회사 토큰의 절반 이상이 오픈웨이트면 청록, 아니면 남색, 기타·미분류는 회색이에요. 막대에 손가락이나 마우스를 대면 그 회사의 오픈웨이트 비율이 보여요.</p>
        <p class="foot-note">자료: 토큰 비중은 <a href="https://openrouter.ai/rankings" target="_blank" rel="noopener">OpenRouter Rankings</a>(모든 모델, 주간), 지출 비중은 <a href="https://vercel.com/ai-gateway/leaderboards" target="_blank" rel="noopener">Vercel AI Gateway</a>예요. 지출 비중을 공개하는 곳은 Vercel뿐이고, 매일 상위 10개 모델만 공개해서 한 주 평균을 썼어요. 분류된 몫이 30%가 안 되는 날은 뺐어요. 두 곳 모두 API로 쓰인 양이라 시장 전체가 아니라 <b>개발자들이 어떤 모델을 고르는지</b>를 보여 줘요. 오픈웨이트 여부는 Hugging Face에 가중치가 공개돼 있는지로 판단했어요(OpenRouter 미분류 ${pct(lt.pct && lt.pct.unknown)}).</p>
      </section>
      <section class="card ai-src" data-fold="closed">
        <div class="card-head"><h2>출처와 갱신 주기</h2></div>
        <div class="ai-tw"><table class="mem-table"><thead><tr><th>항목</th><th>출처</th><th>원자료 갱신</th><th>이 탭 반영</th></tr></thead><tbody>
          <tr><td>매출 런레이트</td><td><a href="https://epoch.ai/data/ai-companies" target="_blank" rel="noopener">Epoch AI</a></td><td>새 보도가 날 때(대개 2~4주에 한 번)</td><td>매시간 확인 · 새 보도는 텔레그램 알림</td></tr>
          <tr><td>기사 속 매출 숫자</td><td><a href="https://news.google.com/search?q=Anthropic%20OR%20OpenAI%20%22run%20rate%22" target="_blank" rel="noopener">구글 뉴스</a></td><td>기사 날 때</td><td>매시간 자동 판독(두 곳 이상·주요 매체·다른 매체 보도로 확인된 숫자만) · 새 분기 실적은 텔레그램 알림</td></tr>
          <tr><td>S-1 분기 매출</td><td><a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;CIK=2130357&amp;type=S-1" target="_blank" rel="noopener">SEC EDGAR</a></td><td>서류가 올라올 때</td><td>매시간 확인 · 새 서류면 자동 반영</td></tr>
          <tr><td>토큰 점유율</td><td><a href="https://openrouter.ai/rankings" target="_blank" rel="noopener">OpenRouter</a></td><td>주간(월요일 09:00 KST 마감)</td><td>매시간 확인 · 월요일에 주간 요약 알림</td></tr>
          <tr><td>지출 비중</td><td><a href="https://vercel.com/ai-gateway/leaderboards" target="_blank" rel="noopener">Vercel AI Gateway</a></td><td>매일</td><td>매일</td></tr>
        </tbody></table></div>
        <p class="foot-note">투자 판단의 참고 자료예요. 보도 수치는 회사마다 기준이 달라 직접 비교에 주의하세요.</p>
      </section>`;
    $("#aiRev").innerHTML = revenueChart(rv, width($("#aiRev")));
    $("#aiSum").innerHTML = sumChart(rv, width($("#aiSum")));
    $("#aiOpen").innerHTML = openChart(or, vc, width($("#aiOpen")));
    $("#aiWeek").innerHTML = weekChart(or, vc, width($("#aiWeek")));
    if ($("#aiFile")) $("#aiFile").innerHTML = filingChart(fa, width($("#aiFile")));
    if ($("#aiQ")) $("#aiQ").innerHTML = quarterChart(rv.quarterly, width($("#aiQ")));
    if ($("#aiRank")) $("#aiRank").innerHTML = rankChart(or.rank_chart, width($("#aiRank")));
    bindTip(box);
    if (!box._aim) { box._aim = true; box.addEventListener("click", (e) => {
      if (!st.data) return;
      const b = e.target.closest("[data-aim]"); if (b) return modelPop(b.dataset.aim, b.dataset.k);
      const c = e.target.closest("[data-aco]"); if (c) companyPop(c.dataset.aco);
    }); }
  }

  // ---------- 모델 팝업: 누른 모델의 토큰 비중(OpenRouter 주간)·토큰/지출 비중(Vercel 매일) 추이 (2026-11-02 사용자 요청)
  const norm = (x) => String(x || "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9.]+/g, " ").trim();
  function vcName(vc, name) {           // OpenRouter 이름 → Vercel 이름(같거나, Vercel 이름이 앞부분인 것 중 가장 긴 것)
    const n = norm(name), ks = Object.keys((vc && vc.model_hist) || {});
    return ks.find((k) => norm(k) === n) || ks.filter((k) => n.startsWith(norm(k) + " ")).sort((a, b) => b.length - a.length)[0] || null;
  }
  function orSlug(or, name) {           // Vercel 이름 → OpenRouter 모델(이름이 같으면 그것, 아니면 그 이름으로 시작하는 것 중 최근 비중이 큰 것)
    const n = norm(name), info = or.model_info || {}, H = or.model_hist || {};
    const ks = Object.keys(info).filter((k) => !k.endsWith(":free") && H[k]);
    const last = (k) => { const v = Object.entries(H[k]).sort().at(-1); return v ? [v[0], v[1]] : ["", 0]; };
    const pick = (arr) => arr.sort((a, b) => { const x = last(a), y = last(b); return x[0] !== y[0] ? (y[0] > x[0] ? 1 : -1) : y[1] - x[1]; })[0];
    return pick(ks.filter((k) => norm(info[k].name) === n)) || pick(ks.filter((k) => norm(info[k].name).startsWith(n + " "))) || null;
  }
  function trendChart(xs, series, W, H, xl) {
    const all = series.flatMap((sr) => sr.vals).filter((v) => v != null);
    if (!all.length) return `<p class="none">이 기간에 자료가 없어요.</p>`;
    const top = Math.max(5, Math.ceil(Math.max(...all) / 5) * 5), n = xs.length;
    const P = { l: 34, r: 12, t: 10, b: 24 }, X = (i) => P.l + (n === 1 ? 0.5 : i / (n - 1)) * (W - P.l - P.r), Y = (v) => P.t + (1 - v / top) * (H - P.t - P.b);
    let g = "", sv = "", hit = "";
    for (const v of [0, top / 2, top]) g += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}" class="ai-grid"/><text x="${P.l - 5}" y="${Y(v) + 4}" text-anchor="end" class="ai-tk">${+v.toFixed(1)}%</text>`;
    const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - P.l - P.r) / 62))));
    xs.forEach((x, i) => { if ((i % step === 0 && X(n - 1) - X(i) > 40) || i === n - 1) g += `<text x="${X(i)}" y="${H - 7}" text-anchor="${i === n - 1 ? "end" : "middle"}" class="ai-tk">${xl(x)}</text>`; });
    for (const sr of series) {
      let seg = [];
      const flush = () => { if (seg.length > 1) sv += `<polyline fill="none" stroke="${sr.color}" stroke-width="${sr.w || 2.2}" stroke-linejoin="round" points="${seg.join(" ")}"/>`; seg = []; };
      sr.vals.forEach((v, i) => { if (v == null) { flush(); return; } seg.push(`${X(i).toFixed(1)},${Y(v).toFixed(1)}`); });
      flush();
      sr.vals.forEach((v, i) => { if (v != null && (n <= (sr.w > 2.2 ? 30 : 60) || sr.vals[i - 1] == null || sr.vals[i + 1] == null)) sv += `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="${(n <= 60 ? 2.6 : 2) * (sr.w ? sr.w / 2.2 : 1)}" fill="${sr.color}"/>`; });
      const li = sr.vals.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0).at(-1);
      if (li != null && sr.lab !== false) sv += `<text x="${X(li) - 4}" y="${Y(sr.vals[li]) - 7}" text-anchor="end" class="ai-mv" style="fill:${sr.color}">${sr.vals[li].toFixed(1)}%</text>`;
    }
    const bw = (W - P.l - P.r) / Math.max(1, n - 1);
    xs.forEach((x, i) => {
      const t = `${x} · ` + series.filter((sr) => sr.vals[i] != null || sr.miss).map((sr) => `${sr.label} ${sr.vals[i] == null ? sr.miss : pct(sr.vals[i])}`).join(" · ");
      hit += `<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${P.t}" width="${bw.toFixed(1)}" height="${H - P.t - P.b}" fill="transparent" ${tipAttr(t)}/>`;
    });
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="ai-svg" role="img">${g}${sv}${hit}</svg>`;
  }
  // Vercel 모델 이름 → 회사(OpenRouter에서 같은 모델을 찾으면 그 회사, 없으면 이름 앞부분으로)
  const VC_CO = [[/^claude/i, "anthropic"], [/^(gpt|o\d|chatgpt|codex)/i, "openai"], [/^grok/i, "x-ai"], [/^glm/i, "z-ai"], [/^deepseek/i, "deepseek"],
    [/^kimi/i, "moonshotai"], [/^(gemini|gemma)/i, "google"], [/^qwen/i, "qwen"], [/^minimax/i, "minimax"], [/^hy\d/i, "tencent"], [/^step/i, "stepfun"],
    [/^mimo/i, "xiaomi"], [/^llama/i, "meta-llama"], [/^(mistral|devstral|codestral)/i, "mistralai"], [/^nemotron/i, "nvidia"]];
  function vcAuthor(or, name) {
    const sl = orSlug(or, name);
    if (sl) return sl.split("/")[0];
    const hit = VC_CO.find(([re]) => re.test(name));
    return hit ? hit[1] : null;
  }
  const trim = (xs, has, min) => { const f = xs.findIndex(has); return f < 0 ? xs : xs.slice(Math.max(0, Math.min(f - 1, xs.length - min))); };
  const LINE = ["#0f9488", "#4f5fd1", "#d2691e", "#7048c4", "#c2185b", "#2e7d32", "#8d6e63", "#0288d1"];
  const stat = (k, v, h) => `<div><div class="k">${k}</div><div class="v">${v}</div>${h ? `<div class="h">${h}</div>` : ""}</div>`;
  const tagOf = (cls) => cls ? `<span class="ai-tag ${cls}">${{ open: "오픈웨이트", closed: "클로즈드", unknown: "미분류" }[cls] || "미분류"}</span>` : "";

  let pop;
  function openPop() {
    if (!pop) {
      pop = document.createElement("div"); pop.className = "sk ai-pop"; pop.hidden = true;
      pop.innerHTML = `<div class="sk-backdrop" data-close></div><article class="sk-panel" role="dialog" aria-modal="true" aria-labelledby="aiPopT">
        <header class="sk-head"><div class="sk-ht"><h3 id="aiPopT"></h3><p class="meta" id="aiPopS"></p></div>
        <button class="icon-btn" data-close aria-label="닫기"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></header>
        <div class="ai-ptabs" id="aiPopTabs"></div>
        <div class="sk-body" id="aiPopB"></div></article>`;
      document.body.appendChild(pop);
      pop.addEventListener("click", (e) => {
        if (e.target.closest("[data-close]")) return closePop();
        const t = e.target.closest("[data-ptab]"); if (t) return pop._tabs[t.dataset.ptab]();
        const b = e.target.closest("[data-aim]"); if (b) return modelPop(b.dataset.aim, b.dataset.k);
      });
      addEventListener("keydown", (e) => { if (e.key === "Escape" && !pop.hidden) { e.stopImmediatePropagation(); closePop(); } }, true);
      bindTip(pop);
    }
    if (pop.hidden) { pop._ov = document.body.style.overflow; document.body.style.overflow = "hidden"; }
    pop.hidden = false;
    $(".sk-panel", pop).scrollTop = 0;
  }
  // 탭: 이 모델 / 회사 전체
  function setTabs(model, author, on) {
    const t = [];
    if (model) t.push(`<button type="button" data-ptab="m" class="${on === "m" ? "on" : ""}">이 모델</button>`);
    if (author) t.push(`<button type="button" data-ptab="c" class="${on === "c" ? "on" : ""}">${esc(an(author))} 전체</button>`);
    $("#aiPopTabs", pop).innerHTML = t.length > 1 ? t.join("") : "";
  }
  const popW = () => Math.max(260, Math.min(600, innerWidth) - 40);

  function modelPop(src, key) {
    const d = st.data, or = d.openrouter || {}, vc = d.vercel || null;
    const info = or.model_info || {};
    let slug, vname, name, author, cls;
    if (src === "or") {
      slug = key; const it = info[key] || (or.latest.top_models || []).find((m) => m.slug === key) || {};
      name = it.name || key; author = it.author || key.split("/")[0]; cls = it.cls; vname = vcName(vc, name);
    } else {
      vname = key; slug = orSlug(or, key);
      const vm = ((vc && vc.week && vc.week.models) || []).find((m) => m.name === key) || (vc.models || []).find((m) => m.name === key) || {};
      name = key; cls = vm.cls || (slug && info[slug] ? info[slug].cls : null); author = vcAuthor(or, key);
    }
    openPop();
    pop._tabs = { m: () => modelPop(src, key), c: () => companyPop(author, { src, key }) };
    setTabs(true, author, "m");
    $("#aiPopT", pop).textContent = name;
    $("#aiPopS", pop).innerHTML = [author ? esc(an(author)) : "", tagOf(cls)].filter(Boolean).join(" · ");
    const W = popW();

    const oh = (slug && (or.model_hist || {})[slug]) || {};
    const weeks = trim((or.open_est || []).filter((e) => !e.partial).map((e) => e.week), (w) => oh[w] != null, 8);
    const ov = weeks.map((w) => (oh[w] != null ? oh[w] : null));
    const oPts = weeks.map((w, i) => [w, ov[i]]).filter((x) => x[1] != null);
    const oLast = oPts.at(-1), oMax = oPts.length ? [...oPts].sort((a, b) => b[1] - a[1])[0] : null;
    const vh = (vname && vc && vc.model_hist && vc.model_hist[vname]) || {};
    const days = trim([...new Set(Object.values((vc && vc.model_hist) || {}).flatMap((o) => Object.keys(o)))].sort(), (x) => vh[x], 14);
    const vt = days.map((x) => (vh[x] ? vh[x][0] : null)), vco = days.map((x) => (vh[x] ? vh[x][1] : null));
    const vw = vname && vc && vc.week ? (vc.week.models || []).find((m) => m.name === vname) : null;
    const vr = vc && vc.week ? `${md(vc.week.from)}~${md(vc.week.to)} 평균` : "";

    let html = `<div class="sk-stats">
      ${stat("토큰 비중 · OpenRouter", oLast ? pct(oLast[1]) : "–", oLast ? `${md(oLast[0])} 주` : "상위권 기록 없음")}
      ${stat("최고 토큰 비중 · OpenRouter", oMax ? pct(oMax[1]) : "–", oMax ? `${md(oMax[0])} 주` : "")}
      ${stat("토큰 비중 · Vercel", vw ? pct(vw.tokens) : "–", vw ? vr : "상위 10위 기록 없음")}
      ${stat("지출 비중 · Vercel", vw ? pct(vw.cost) : "–", vw ? vr : "상위 10위 기록 없음")}
    </div>`;
    html += `<h4>토큰 비중 추이 <span class="sub">OpenRouter · 주간 · 전체 토큰 중 비중</span></h4>`;
    html += slug && oPts.length ? `<div class="chart-legend"><span><i style="background:var(--ai-tok)"></i>토큰 비중</span></div>${trendChart(weeks, [{ vals: ov, color: "var(--ai-tok)", label: "토큰 비중", miss: "상위권 밖(공개 안 됨)" }], W, 170, md)}`
      : `<p class="none">OpenRouter 상위권에 오른 기록이 없거나 같은 모델을 찾지 못했어요.</p>`;
    html += `<h4>토큰·지출 비중 추이 <span class="sub">Vercel · 매일 · 전체 중 비중</span></h4>`;
    html += vname && (vt.some((v) => v != null) || vco.some((v) => v != null))
      ? `<div class="chart-legend"><span><i style="background:var(--ai-tok)"></i>토큰 비중</span><span><i style="background:var(--ink);height:3px"></i>지출 비중</span></div>${trendChart(days, [{ vals: vt, color: "var(--ai-tok)", label: "토큰 비중", miss: "10위 밖" }, { vals: vco, color: "var(--ink)", label: "지출 비중", miss: "10위 밖" }], W, 190, md)}`
      : `<p class="none">Vercel 상위 10위에 오른 기록이 없거나 같은 모델을 찾지 못했어요.</p>`;
    html += `<p class="foot-note">OpenRouter는 주마다 상위 9개 모델만 1년치를 공개해서, 그 밖으로 밀린 주는 선이 끊겨요(이번 주부터는 상위 40개까지 쌓여요). Vercel은 매일 토큰·지출 각각 상위 10개만 공개해서 10위 밖인 날은 비어 있어요. 두 곳은 같은 모델도 이름이 조금 달라 이름으로 맞췄어요${src === "or" && vname && norm(vname) !== norm(name) ? `(Vercel ‘${esc(vname)}’)` : src === "vc" && slug && info[slug] && norm(info[slug].name) !== norm(name) ? `(OpenRouter ‘${esc(info[slug].name)}’)` : ""}.${author ? ` 위의 ‘${esc(an(author))} 전체’를 누르면 이 회사 모델을 모두 합친 추이와 모델별 추이가 보여요.` : ""}</p>`;
    $("#aiPopB", pop).innerHTML = html;
  }

  // 회사 화면: 회사 합계(굵은 선) + 모델별(가는 선)
  function companyPop(author, back) {
    if (!author) return;
    const d = st.data, or = d.openrouter || {}, vc = d.vercel || null, info = or.model_info || {}, H = or.model_hist || {};
    openPop();
    pop._tabs = back ? { m: () => modelPop(back.src, back.key), c: () => companyPop(author, back) } : { c: () => companyPop(author) };
    setTabs(!!back, author, "c");
    $("#aiPopT", pop).textContent = `${an(author)} 전체`;
    const W = popW();

    // OpenRouter: 회사 합계는 회사별 주간 합계(모든 모델)로 정확히, 모델별은 공개된 상위권 기록으로
    const fw = (or.weeks || []).filter((w) => !w.partial);
    const weeks = fw.map((w) => w.week);
    const coTok = fw.map((w) => (w.total && w.authors[author] != null ? w.authors[author] / w.total * 100 : null));
    const recent = new Set(weeks.slice(-13));
    const inYear = new Set(weeks);
    const slugs = Object.keys(info).filter((k) => info[k].author === author && !k.endsWith(":free") && H[k] && Object.keys(H[k]).some((w) => inYear.has(w)));
    const peak = (k) => Math.max(...Object.entries(H[k]).filter(([w]) => inYear.has(w)).map(([, v]) => v));
    slugs.sort((a, b) => peak(b) - peak(a));
    const showS = slugs.slice(0, LINE.length);
    const cPts = weeks.map((w, i) => [w, coTok[i]]).filter((x) => x[1] != null);
    const cLast = cPts.at(-1), cPrev = cPts.at(-2);
    const cls = { open: 0, closed: 0 };
    for (const k of slugs) if (info[k].cls in cls) cls[info[k].cls]++;
    $("#aiPopS", pop).innerHTML = [`최근 1년 OpenRouter 상위권에 든 모델 ${slugs.length}개`, or.author_open_ratio && or.author_open_ratio[author] != null ? `이 회사 토큰 중 오픈웨이트 ${Math.round(or.author_open_ratio[author] * 100)}%` : ""].filter(Boolean).join(" · ");

    // Vercel: 회사 모델(상위 10위 안)의 매일 합계 + 모델별
    const vnames = Object.keys((vc && vc.model_hist) || {}).filter((nm) => vcAuthor(or, nm) === author);
    const allDays = [...new Set(Object.values((vc && vc.model_hist) || {}).flatMap((o) => Object.keys(o)))].sort();
    const days = trim(allDays, (x) => vnames.some((nm) => vc.model_hist[nm][x]), 14);
    const sumOf = (i) => days.map((x) => { let t = 0, any = false; for (const nm of vnames) { const v = vc.model_hist[nm][x]; if (v && v[i] != null) { t += v[i]; any = true; } } return any ? t : null; });
    const vTok = sumOf(0), vCost = sumOf(1);
    const wk = (vc && vc.week && vc.week.models) || [];
    const vwk = wk.filter((m) => vnames.includes(m.name));
    const vSum = (k) => vwk.reduce((t, m) => t + (m[k] || 0), 0);
    const vr = vc && vc.week ? `${md(vc.week.from)}~${md(vc.week.to)} 평균` : "";
    const vOrder = [...vnames].sort((a, b) => ((wk.find((m) => m.name === b) || {}).cost || 0) - ((wk.find((m) => m.name === a) || {}).cost || 0)).slice(0, LINE.length);

    let html = `<div class="sk-stats">
      ${stat("토큰 비중 · OpenRouter", cLast ? pct(cLast[1]) : "–", cLast ? `${md(cLast[0])} 주${cPrev ? ` · 전주 ${pct(cPrev[1])}` : ""}` : "기록 없음")}
      ${stat("1년 전 토큰 비중 · OpenRouter", cPts.length ? pct(cPts[0][1]) : "–", cPts.length ? `${md(cPts[0][0])} 주` : "")}
      ${stat("토큰 비중 · Vercel", vwk.length ? pct(vSum("tokens")) : "–", vwk.length ? `${vr} · 상위 10위 안 모델 합` : "상위 10위 기록 없음")}
      ${stat("지출 비중 · Vercel", vwk.length ? pct(vSum("cost")) : "–", vwk.length ? `${vr} · 상위 10위 안 모델 합` : "상위 10위 기록 없음")}
    </div>`;
    const leg = (arr) => `<div class="chart-legend ai-plg">${arr.map(([c, t, w]) => `<span><i style="background:${c};height:${w || 3}px"></i>${esc(t)}</span>`).join("")}</div>`;
    html += `<h4>토큰 비중 추이 <span class="sub">OpenRouter · 주간 · 전체 토큰 중 비중</span></h4>`;
    html += cPts.length ? leg([["var(--ink)", "회사 합계(모든 모델)", 4], ...showS.map((k, i) => [LINE[i], info[k].name])])
      + trendChart(weeks, [{ vals: coTok, color: "var(--ink)", label: "회사 합계", w: 3.2, miss: "" },
          ...showS.map((k, i) => ({ vals: weeks.map((w) => (H[k][w] != null ? H[k][w] : null)), color: LINE[i], label: info[k].name, w: 1.6, lab: false }))], W, 220, md)
      : `<p class="none">OpenRouter 회사별 기록에 이 회사가 없어요.</p>`;
    html += `<h4>지출 비중 추이 <span class="sub">Vercel · 매일 · 전체 지출 중 비중</span></h4>`;
    html += vnames.length ? leg([["var(--ink)", "회사 합계(상위 10위 안 모델)", 4], ...vOrder.map((nm, i) => [LINE[i], nm])])
      + trendChart(days, [{ vals: vCost, color: "var(--ink)", label: "회사 합계", w: 3.2, miss: "" },
          ...vOrder.map((nm, i) => ({ vals: days.map((x) => (vc.model_hist[nm][x] ? vc.model_hist[nm][x][1] : null)), color: LINE[i], label: nm, w: 1.6, lab: false }))], W, 200, md)
      : `<p class="none">Vercel 상위 10위에 오른 이 회사 모델이 없어요.</p>`;
    html += `<h4>토큰 비중 추이 <span class="sub">Vercel · 매일 · 전체 토큰 중 비중</span></h4>`;
    html += vnames.length ? trendChart(days, [{ vals: vTok, color: "var(--ink)", label: "회사 합계", w: 3.2, miss: "" },
          ...vOrder.map((nm, i) => ({ vals: days.map((x) => (vc.model_hist[nm][x] ? vc.model_hist[nm][x][0] : null)), color: LINE[i], label: nm, w: 1.6, lab: false }))], W, 180, md)
      : `<p class="none">Vercel 상위 10위에 오른 이 회사 모델이 없어요.</p>`;

    // 모델별 표: OpenRouter 모델 + 짝 없는 Vercel 모델
    const used = new Set();
    const rows = slugs.map((k) => {
      const vn = vcName(vc, info[k].name); if (vn) used.add(vn);
      const vm = vn ? wk.find((m) => m.name === vn) : null;
      const lw = Object.entries(H[k]).sort().at(-1);
      return { name: info[k].name, cls: info[k].cls, aim: "or", key: k, or: lw && recent.has(lw[0]) ? lw[1] : null, orw: lw ? lw[0] : null, vt: vm ? vm.tokens : null, vc: vm ? vm.cost : null };
    }).concat(vnames.filter((nm) => !used.has(nm)).map((nm) => {
      const vm = wk.find((m) => m.name === nm);
      return { name: nm, cls: vm ? vm.cls : null, aim: "vc", key: nm, or: null, vt: vm ? vm.tokens : null, vc: vm ? vm.cost : null };
    }));
    rows.sort((a, b) => (b.vc || 0) + (b.or || 0) - ((a.vc || 0) + (a.or || 0)));
    html += `<h4>모델별 <span class="sub">이름을 누르면 그 모델 화면</span></h4>
      <div class="ai-tw"><table class="mem-table ai-cot"><thead><tr><th>모델</th><th class="num">토큰 · OpenRouter</th><th class="num">토큰 · Vercel</th><th class="num">지출 · Vercel</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td><button type="button" class="lnk ai-mlnk" data-aim="${r.aim}" data-k="${esc(r.key)}">${esc(r.name)}</button> ${tagOf(r.cls)}</td><td class="num">${r.or != null ? `${pct(r.or)}<small> ${md(r.orw)}</small>` : "–"}</td><td class="num">${r.vt ? pct(r.vt) : "10위 밖"}</td><td class="num">${r.vc ? pct(r.vc) : "10위 밖"}</td></tr>`).join("")}
      </tbody></table></div>`;
    html += `<p class="foot-note">OpenRouter 회사 합계는 그 회사 모든 모델의 토큰을 더한 값이라 빠짐이 없어요. 모델별 선은 상위권(1년치는 상위 9개, 이번 주부터 상위 40개)에 든 주만 그려져서 합이 회사 합계보다 작아요. Vercel은 매일 상위 10개 모델만 공개해서 회사 합계도 그 안에 든 모델만 더한 값이에요. 표의 Vercel 숫자는 ${esc(vr)}, OpenRouter 숫자는 옆에 적은 주의 값이에요(최근 13주 안에 상위권이 아니면 –). Vercel ‘10위 밖’은 그 7일 동안 상위 10위에 든 날이 없다는 뜻이에요..</p>`;
    $("#aiPopB", pop).innerHTML = html;
  }
  function closePop() { pop.hidden = true; document.body.style.overflow = pop._ov || ""; $("#tip") && ($("#tip").hidden = true); }

  let rz, lastW = innerWidth;
  addEventListener("resize", () => { if (innerWidth === lastW) return; lastW = innerWidth; clearTimeout(rz); rz = setTimeout(() => { if (st.data && !$("#viewAi").hidden) render(); }, 200); });
  window.__ai = { show: () => load(false), rerender: () => { if (st.data && !$("#viewAi").hidden) render(); }, reload: () => { st.data = null; if (!$("#viewAi").hidden) load(true); } };
})();
