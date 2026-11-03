/* AI 시장 탭 아래 'AI 인프라 수요' 카드 (2026-11-03 추가: 토큰 총량 누적, 지출, GPU 단가)
   데이터: docs/data/ai_infra.json — scripts/ai_infra.py 가 매일 09:40·12:40 KST에 만든다(.github/workflows/ai-infra.yml).
   토큰 = OpenRouter 주간 합계(월요일 09:00 KST 마감), 지출 = 빅테크 설비투자(SEC 분기 공시) + OpenRouter 지출 추정(정가 x 토큰),
   GPU = Vast.ai 공개 마켓 중앙값 + RunPod 공개 정가(매일 한 줄씩 쌓음).
   ai.js·chips.js와 코드를 섞지 않는다. window.__ai(show·rerender·reload)에 얹어서 함께 움직인다. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const tipAttr = (t) => `data-tip="${esc(t)}"`;
  const ymd = (s) => { const [y, m, d] = s.split("-"); return `${y.slice(2)}.${+m}.${+d}`; };
  const md = (s) => { const [, m, d] = s.split("-"); return `${+m}/${+d}`; };
  const sgn = (v, d = 0) => (v > 0 ? "+" : "") + v.toFixed(d);
  // 토큰 수: 조(10^12)·경(10^16) / 달러: 억·조 달러
  const tok = (v) => v >= 1e16 ? `${(v / 1e16).toFixed(2)}경` : v >= 1e12 ? `${(v / 1e12).toLocaleString(undefined, { maximumFractionDigits: v >= 1e14 ? 0 : 1 })}조` : `${Math.round(v / 1e8).toLocaleString()}억`;
  const dol = (v) => v >= 1e12 ? `${(v / 1e12).toFixed(2)}조 달러` : v >= 1e9 ? `${Math.round(v / 1e8).toLocaleString()}억 달러` : v >= 1e8 ? `${(v / 1e8).toFixed(1)}억 달러` : `${Math.round(v / 1e4).toLocaleString()}만 달러`;
  const bn = (v) => `$${(v / 1e9).toFixed(v >= 1e11 ? 0 : 1)}B`;
  const hr = (v) => v == null ? "–" : `$${v.toFixed(2)}`;
  const st = { data: null, loading: null, tlog: false, crange: "5y", gpuOff: new Set(["A100"]) };
  const CO = [["Amazon", "아마존", "var(--cp-s2)"], ["Alphabet", "구글", "var(--cp-s3)"], ["Microsoft", "마이크로소프트", "var(--cp-s1)"], ["Meta", "메타", "var(--cp-s4)"], ["Oracle", "오라클", "var(--cp-s5)"]];
  const GPU = [["B300", "var(--cp-s5)"], ["B200", "var(--cp-s4)"], ["H200", "var(--cp-s2)"], ["H100", "var(--cp-s1)"], ["A100", "var(--cp-s6)"]];

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
  function yScale(lo, hi, log) {          // 눈금 목록과 변환 함수
    if (log) {
      const a = Math.log10(lo) - 0.08, b = Math.log10(hi) + 0.08, ticks = [];
      for (let e = Math.floor(a); e <= b; e++) [1, 2, 5].forEach((m) => { const v = m * 10 ** e; if (Math.log10(v) >= a && Math.log10(v) <= b) ticks.push(v); });
      return { ticks, f: (v) => (Math.log10(Math.max(v, 10 ** a)) - a) / (b - a) };
    }
    const stp = niceStep(hi || 1, 5), top = Math.ceil(hi * 1.08 / stp) * stp, ticks = [];
    for (let v = 0; v <= top + 1e-9; v += stp) ticks.push(v);
    return { ticks, f: (v) => v / top };
  }
  const ma = (vals, n) => vals.map((_, i) => i + 1 < n ? null : vals.slice(i + 1 - n, i + 1).reduce((s, v) => s + v, 0) / n);

  // ---------- 막대 + 이동평균선 (주간 토큰, 분기 설비투자, 주간 지출이 같은 틀)
  // cats: [{label, sub(연도 표시), stack:[{v,c,name}], faded, tip}], line: [값|null], fmt: 눈금 글자
  function barChart(cats, w, o) {
    const mobile = w < 520, H = o.H || Math.round(Math.max(230, Math.min(330, w * 0.42))), P = { l: 8, r: mobile ? 52 : 62, t: 14, b: 40 };
    const tot = cats.map((c) => c.stack.reduce((s, x) => s + x.v, 0));
    const vals = [...tot, ...(o.line || []).filter((v) => v != null)].filter((v) => v > 0);
    if (!vals.length) return "<p class='none'>아직 자료가 없어요.</p>";
    const S = yScale(Math.min(...vals), Math.max(...vals), o.log);
    const iw = w - P.l - P.r, bw = iw / cats.length, Y = (v) => P.t + (1 - S.f(v)) * (H - P.t - P.b);
    let g = "";
    S.ticks.forEach((v) => { g += `<line class="ai-grid" x1="${P.l}" x2="${w - P.r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ai-tk" x="${w - P.r + 6}" y="${Y(v) + 3.5}">${o.fmt(v)}</text>`; });
    const every = Math.max(1, Math.ceil(cats.length / (mobile ? 6 : 12) / (o.tickEvery || 1)) * (o.tickEvery || 1));
    cats.forEach((c, i) => {
      const x = P.l + i * bw, gap = Math.min(bw * 0.22, 6);
      let base = o.log ? null : 0;
      c.stack.forEach((s, k) => {
        if (o.log) {   // 로그 눈금에서는 합계 막대 하나만
          if (k) return;
          const y = Y(tot[i]);
          g += `<rect x="${x + gap / 2}" y="${y}" width="${Math.max(1, bw - gap)}" height="${H - P.b - y}" fill="${s.c}" opacity="${c.faded ? 0.35 : 0.85}" rx="1.5"/>`;
          return;
        }
        const y0 = Y(base), y1 = Y(base + s.v);
        g += `<rect x="${x + gap / 2}" y="${y1}" width="${Math.max(1, bw - gap)}" height="${Math.max(0, y0 - y1)}" fill="${s.c}" opacity="${c.faded ? 0.35 : 0.88}"/>`;
        base += s.v;
      });
      if (c.label && (o.sparse || i % every === 0 || c.sub)) g += `<text class="ai-tk" x="${x + bw / 2}" y="${H - P.b + 14}" text-anchor="middle">${esc(c.label)}</text>`;
      if (c.sub) g += `<line x1="${x}" x2="${x}" y1="${H - P.b}" y2="${H - 6}" stroke="var(--ink-2)" opacity=".5"/><text x="${x + 4}" y="${H - 6}" font-size="11" font-weight="700" fill="var(--ink-2)">${esc(c.sub)}</text>`;
      g += `<rect class="cp-hov" x="${x}" y="${P.t}" width="${bw}" height="${H - P.t - P.b}" ${tipAttr(c.tip)}/>`;
    });
    if (o.line) {
      const pts = o.line.map((v, i) => v == null ? null : `${P.l + (i + 0.5) * bw},${Y(v)}`).filter(Boolean);
      if (pts.length > 1) g += `<polyline points="${pts.join(" ")}" fill="none" stroke="var(--ink)" stroke-width="2.2" stroke-dasharray="${o.lineDash || "0"}" stroke-linejoin="round" pointer-events="none"/>`;
    }
    g += `<line class="cp-axis" x1="${P.l}" x2="${w - P.r}" y1="${H - P.b}" y2="${H - P.b}"/><line class="cp-axis" x1="${w - P.r}" x2="${w - P.r}" y1="${P.t}" y2="${H - P.b}"/>`;
    if (o.log) g += `<text class="ai-tk" x="${P.l + 4}" y="${P.t + 10}">로그 눈금</text>`;
    // 마지막 값 꼬리표
    const lv = tot[tot.length - 1 - (cats.at(-1).faded ? 1 : 0)];
    if (lv) { const y = Y(lv), x = w - P.r + 1, tw = P.r - 4; g += `<path d="M${x},${y} l6,-8 h${tw - 6} v16 h-${tw - 6} z" fill="var(--ink)"/><text x="${x + 8}" y="${y + 4}" font-size="11" font-weight="700" fill="var(--surface)">${o.fmt(lv)}</text>`; }
    return `<svg class="ai-svg" viewBox="0 0 ${w} ${H}" width="${w}" height="${H}" role="img" aria-label="${esc(o.aria)}">${g}</svg>`;
  }

  // ---------- 누적 토큰: 면적 그래프
  function cumChart(weeks, w) {
    const mobile = w < 520, H = Math.round(Math.max(200, Math.min(280, w * 0.34))), P = { l: 8, r: mobile ? 56 : 66, t: 14, b: 40 };
    const S = yScale(0, weeks.at(-1).cum, false), n = weeks.length;
    const X = (i) => P.l + (n > 1 ? i / (n - 1) : 0.5) * (w - P.l - P.r), Y = (v) => P.t + (1 - S.f(v)) * (H - P.t - P.b);
    let g = "";
    S.ticks.forEach((v) => { g += `<line class="ai-grid" x1="${P.l}" x2="${w - P.r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ai-tk" x="${w - P.r + 6}" y="${Y(v) + 3.5}">${tok(v)}</text>`; });
    const pts = weeks.map((h, i) => `${X(i)},${Y(h.cum)}`);
    g += `<path d="M${X(0)},${Y(0)} L${pts.join(" L")} L${X(n - 1)},${Y(0)} Z" fill="color-mix(in srgb, var(--ai-tok) 22%, transparent)"/><polyline points="${pts.join(" ")}" fill="none" stroke="var(--ai-tok)" stroke-width="2.4"/>`;
    let lastM = -1;
    weeks.forEach((h, i) => {
      const m = +h.week.slice(5, 7);
      if (m !== lastM) { if (lastM !== -1 && (!mobile || m % 2 === 1)) g += `<text class="ai-tk" x="${X(i)}" y="${H - P.b + 14}" text-anchor="middle">${m}월</text>`; if (m === 1) g += `<text x="${X(i) + 4}" y="${H - 6}" font-size="11" font-weight="700" fill="var(--ink-2)">${h.week.slice(0, 4)}</text>`; lastM = m; }
      const xp = i ? (X(i - 1) + X(i)) / 2 : P.l, xn = i < n - 1 ? (X(i) + X(i + 1)) / 2 : w - P.r;
      g += `<rect class="cp-hov" x="${xp}" y="${P.t}" width="${xn - xp}" height="${H - P.t - P.b}" ${tipAttr(`${ymd(h.week)} 주까지 누적 ${tok(h.cum)} 토큰 · 그 주 ${tok(h.total)}`)}/>`;
    });
    const y = Y(weeks.at(-1).cum), x = w - P.r + 1, tw = P.r - 4;
    g += `<line class="cp-axis" x1="${P.l}" x2="${w - P.r}" y1="${H - P.b}" y2="${H - P.b}"/><line class="cp-axis" x1="${w - P.r}" x2="${w - P.r}" y1="${P.t}" y2="${H - P.b}"/>`;
    g += `<path d="M${x},${y} l6,-8 h${tw - 6} v16 h-${tw - 6} z" fill="var(--ai-tok)"/><text x="${x + 8}" y="${y + 4}" font-size="11" font-weight="700" fill="#fff">${tok(weeks.at(-1).cum)}</text>`;
    return `<svg class="ai-svg" viewBox="0 0 ${w} ${H}" width="${w}" height="${H}" role="img" aria-label="OpenRouter 누적 토큰">${g}</svg>`;
  }

  // ---------- GPU 임대료: 날짜별 선(모델마다) + 7일 이동평균
  function gpuChart(days, w) {
    const mobile = w < 520, H = Math.round(Math.max(240, Math.min(340, w * 0.42))), P = { l: 8, r: mobile ? 76 : 82, t: 14, b: 40 };
    const on = GPU.filter(([k]) => !st.gpuOff.has(k)).map(([k, c]) => ({ k, c, pts: days.map((d) => ({ d: d.d, v: d.vast?.[k]?.med })).filter((p) => p.v) })).filter((s) => s.pts.length);
    if (!on.length) return "<p class='none'>보여 줄 GPU를 하나 이상 골라 주세요.</p>";
    const all = on.flatMap((s) => s.pts.map((p) => p.v)), S = yScale(0, Math.max(...all), false);
    const t1 = Date.parse(days.at(-1).d), t0 = Math.min(Date.parse(days[0].d), t1 - 13 * 864e5), tEnd = t1 + 864e5;
    const X = (d) => P.l + (Date.parse(d) - t0) / (tEnd - t0) * (w - P.l - P.r), Y = (v) => P.t + (1 - S.f(v)) * (H - P.t - P.b);
    let g = "";
    S.ticks.forEach((v) => { g += `<line class="ai-grid" x1="${P.l}" x2="${w - P.r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ai-tk" x="${w - P.r + 6}" y="${Y(v) + 3.5}">$${v}</text>`; });
    const span = (tEnd - t0) / 864e5, dd = new Date(t0); dd.setHours(0, 0, 0, 0);
    while (+dd <= tEnd) {
      const iso = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}-${String(dd.getDate()).padStart(2, "0")}`;
      if (span <= 70 ? dd.getDay() === 1 : dd.getDate() === 1) g += `<text class="ai-tk" x="${X(iso)}" y="${H - P.b + 14}" text-anchor="middle">${span <= 70 ? md(iso) : dd.getMonth() + 1 + "월"}</text>`;
      dd.setDate(dd.getDate() + 1);
    }
    on.forEach((s) => {
      if (s.pts.length > 1) g += `<polyline points="${s.pts.map((p) => `${X(p.d)},${Y(p.v)}`).join(" ")}" fill="none" stroke="${s.c}" stroke-width="2.2" stroke-linejoin="round"/>`;
      s.pts.forEach((p) => { g += `<circle cx="${X(p.d)}" cy="${Y(p.v)}" r="${s.pts.length > 30 ? 0 : 3.2}" fill="${s.c}"/>`; });
      if (s.pts.length >= 7) {
        const m = ma(s.pts.map((p) => p.v), 7);
        const pts = s.pts.map((p, i) => m[i] == null ? null : `${X(p.d)},${Y(m[i])}`).filter(Boolean);
        if (pts.length > 1) g += `<polyline points="${pts.join(" ")}" fill="none" stroke="${s.c}" stroke-width="1.3" stroke-dasharray="4 3" opacity=".75"/>`;
      }
    });
    const tags = on.map((s) => ({ s, v: s.pts.at(-1).v, y: Y(s.pts.at(-1).v) })).sort((a, b) => a.y - b.y);
    for (let k = 1; k < tags.length; k++) if (tags[k].y - tags[k - 1].y < 17) tags[k].y = tags[k - 1].y + 17;
    const over = tags.length ? tags.at(-1).y - (H - P.b - 8) : 0;
    if (over > 0) tags.forEach((t) => (t.y -= over));
    tags.forEach(({ s, v, y }) => { const x = w - P.r + 1, tw = P.r - 4; g += `<path d="M${x},${y} l6,-8 h${tw - 6} v16 h-${tw - 6} z" fill="${s.c}"/><text x="${x + 8}" y="${y + 4}" font-size="11" font-weight="700" fill="#fff">${s.k} ${hr(v).slice(1)}</text>`; });
    days.forEach((d, i) => {
      const x = X(d.d), xp = i ? (X(days[i - 1].d) + x) / 2 : P.l, xn = i < days.length - 1 ? (x + X(days[i + 1].d)) / 2 : w - P.r;
      g += `<rect class="cp-hov" x="${xp}" y="${P.t}" width="${Math.max(2, xn - xp)}" height="${H - P.t - P.b}" ${tipAttr(`${ymd(d.d)} · ` + on.map((s) => d.vast?.[s.k]?.med ? `${s.k} ${hr(d.vast[s.k].med)}` : null).filter(Boolean).join(", "))}/>`;
    });
    g += `<line class="cp-axis" x1="${P.l}" x2="${w - P.r}" y1="${H - P.b}" y2="${H - P.b}"/><line class="cp-axis" x1="${w - P.r}" x2="${w - P.r}" y1="${P.t}" y2="${H - P.b}"/>`;
    return `<svg class="ai-svg" viewBox="0 0 ${w} ${H}" width="${w}" height="${H}" role="img" aria-label="GPU 시간당 임대료 추이">${g}</svg>`;
  }

  function render() {
    const d = st.data, box = $("#infraBody");
    if (!d || !box) return;
    bindTip(box);
    const src = d.sources || {}, NAMES = { tokens: "토큰 총량", spend: "지출 추정", capex: "설비투자", gpu: "GPU 임대료" };
    const bad = Object.entries(src).filter(([, v]) => !v.ok).map(([k]) => NAMES[k] || k);

    // 토큰
    const tw = (d.tokens?.weeks || []);
    const done = tw.filter((h) => !h.partial), last = done.at(-1), first = done[0];
    const mult = last && first ? last.total / first.total : null, weeksSpan = last && first ? Math.round((Date.parse(last.week) - Date.parse(first.week)) / 6048e5) : 0;
    const prev4 = done.length > 4 ? done.at(-5) : null;
    const tCats = tw.map((h, i) => ({ label: md(h.week), sub: i && h.week.slice(0, 4) !== tw[i - 1].week.slice(0, 4) ? h.week.slice(0, 4) : "", faded: h.partial,
      stack: [{ v: h.total, c: "var(--ai-tok)" }], tip: `${ymd(h.week)} 주 · ${tok(h.total)} 토큰${h.partial ? " (진행 중, 아직 덜 쌓임)" : ""}` }));
    const tLine = ma(tw.map((h) => h.total), 4).map((v, i) => tw[i].partial ? null : v);

    // 설비투자
    const cx = d.capex || {}, ctot = (cx.total || []).filter((t) => t.n === CO.length);
    const cFrom = st.crange === "all" ? "" : `${new Date().getFullYear() - (st.crange === "5y" ? 5 : 3)}Q`;
    const cShow = ctot.filter((t) => t.q >= cFrom);
    const cLast = ctot.at(-1), cYoY = ctot.length > 4 ? (cLast.usd / ctot.at(-5).usd - 1) * 100 : null;
    const c4 = ma(ctot.map((t) => t.usd), 4), c4map = Object.fromEntries(ctot.map((t, i) => [t.q, c4[i]]));
    const ann = ctot.length >= 4 ? ctot.slice(-4).reduce((s, t) => s + t.usd, 0) : null;
    const cCats = cShow.map((t, i) => ({ label: t.q.endsWith("Q1") ? `${t.q.slice(0, 4)}` : "", sub: "",
      stack: CO.map(([k, , c]) => ({ v: cx.companies?.[k]?.[t.q]?.usd || 0, c })),
      tip: `${t.q.slice(0, 4)}년 ${t.q.slice(-1)}분기 · 합계 ${bn(t.usd)} · ` + CO.map(([k, n]) => `${n} ${bn(cx.companies?.[k]?.[t.q]?.usd || 0)}`).join(", ") }));
    const cTbl = CO.map(([k, n, c]) => {
      const s = cx.companies?.[k] || {}, qs = Object.keys(s).sort(), q = qs.at(-1), v = s[q]?.usd, y = s[qs.at(-5)]?.usd;
      return `<tr><td><span class="ai-dot" style="background:${c}"></span>${n}</td><td class="tnum">${q ? `${q.slice(2, 4)}년 ${q.slice(-1)}분기` : "–"}</td><td class="num"><b>${v ? bn(v) : "–"}</b></td><td class="num ${v && y ? (v >= y ? "up" : "down") : ""}">${v && y ? sgn((v / y - 1) * 100) + "%" : "–"}</td><td class="num muted">${qs.length >= 4 ? bn(qs.slice(-4).reduce((a, k2) => a + s[k2].usd, 0)) : "–"}</td><td class="tnum muted">${s[q]?.filed ? ymd(s[q].filed) : ""}</td></tr>`;
    }).join("");

    // 지출 추정
    const sp = d.spend || {}, sw = sp.weeks || [], sl = sw.at(-1) || sp.latest_seen || {};
    const sCats = sw.map((h) => ({ label: md(h.week), sub: "", stack: [{ v: h.usd, c: "var(--ai-cost)" }], tip: `${ymd(h.week)} 주 · 추정 ${dol(h.usd)} · 100만 토큰당 $${h.usd_per_m}${h.approx ? " (근사값)" : ""}` }));
    const sTop = (sl.top || []).slice(0, 8).map((t, i) => `<tr><td class="num muted">${i + 1}</td><td>${esc(t.name)}</td><td class="num"><b>${dol(t.usd)}</b></td><td class="num muted">${sl.usd ? (t.usd / sl.usd * 100).toFixed(1) + "%" : ""}</td><td class="num muted">${tok(t.tokens)}</td><td class="num muted">$${(t.usd / t.tokens * 1e6).toFixed(2)}</td></tr>`).join("");

    // GPU
    const gd = d.gpu?.days || [], gl = gd.at(-1) || {}, g0 = gd[0] || {};
    const gRows = GPU.slice().reverse().map(([k, c]) => {
      const v = gl.vast?.[k] || {}, r = gl.runpod?.[k] || {}, v0 = g0.vast?.[k]?.med;
      const ch = gd.length > 1 && v.med && v0 ? (v.med / v0 - 1) * 100 : null;
      return `<tr><td><span class="ai-dot" style="background:${c}"></span><b>${k}</b></td><td class="num"><b>${hr(v.med)}</b></td><td class="num muted">${v.p25 ? `${hr(v.p25)} ~ ${hr(v.p75)}` : "–"}</td><td class="num muted">${v.gpus ? v.gpus.toLocaleString() + "장" : "매물 없음"}</td><td class="num">${hr(r.secure)}</td><td class="num muted">${hr(r.community)}</td>${gd.length > 1 ? `<td class="num ${ch == null ? "" : ch >= 0 ? "up" : "down"}">${ch == null ? "–" : sgn(ch, 1) + "%"}</td>` : ""}</tr>`;
    }).join("");
    const gBtns = GPU.slice().reverse().map(([k, c]) => `<button class="cp-lgb${st.gpuOff.has(k) ? " off" : ""}" data-gpu="${k}" style="--c:${c}"><i></i><span>${k}</span><b>${hr(gl.vast?.[k]?.med)}</b></button>`).join("");
    const h100 = gl.vast?.H100?.med;

    const tile = (k, v, sub) => `<div class="tile ai-tile"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${sub}</div></div>`;
    box.innerHTML = `<section class="card in-card">
      <div class="card-head wrap"><h2>AI 인프라 수요 <span class="sub">토큰 총량, 지출, GPU 단가</span></h2></div>
      <p class="ai-meta">갱신 ${esc(d.updated_at)} · 매일 09:40·12:40 KST 자동 수집${bad.length ? ` · <b class="ai-bad">이번 수집 실패: ${bad.join(", ")} (지난 값 표시)</b>` : ""}</p>
      <div class="tiles ai-tiles">
        ${last ? tile("지난주 토큰 (OpenRouter)", tok(last.total), `${ymd(last.week)} 주${mult ? ` · ${weeksSpan}주 전의 <b class="up">${mult.toFixed(1)}배</b>` : ""}`) : ""}
        ${last ? tile("누적 토큰", tok(last.cum), `${first ? ymd(first.week) : ""}부터 ${done.length}주 합계`) : ""}
        ${cLast ? tile("빅테크 5사 설비투자", bn(cLast.usd), `${cLast.q.slice(2, 4)}년 ${cLast.q.slice(-1)}분기${cYoY != null ? ` · 1년 전보다 <b class="${cYoY >= 0 ? "up" : "down"}">${sgn(cYoY)}%</b>` : ""}`) : ""}
        ${h100 ? tile("H100 시간당 임대료", hr(h100), `Vast 시장 중앙값 · RunPod 정가 ${hr(gl.runpod?.H100?.secure)}`) : ""}
      </div>

      <h3 class="ai-h3">주간 토큰 총량 <span class="sub">OpenRouter를 거친 입력+출력 토큰 · 주 단위</span></h3>
      <div class="cp-ctl"><div class="chart-legend"><span><i style="background:var(--ai-tok)"></i>그 주 합계</span><span><i style="background:var(--ink);height:3px"></i>4주 이동평균</span><span><i style="background:var(--ai-tok);opacity:.35"></i>진행 중인 주</span></div>
        <div class="cp-tabs"><button class="toggle" aria-pressed="${st.tlog}" data-tlog="1">로그 눈금</button></div></div>
      <div id="inTok"></div>
      <p class="cp-sub">${prev4 && last ? `4주 전(${ymd(prev4.week)} 주 ${tok(prev4.total)})보다 <b class="${last.total >= prev4.total ? "up" : "down"}">${sgn((last.total / prev4.total - 1) * 100)}%</b>예요. ` : ""}로그 눈금을 켜면 같은 배수로 늘어난 구간이 같은 높이로 보여서, 증가 속도가 빨라지는지 느려지는지 읽기 쉬워요.</p>
      <h3 class="ai-h3">누적 토큰 <span class="sub">기록을 시작한 주부터 마감된 주를 모두 더한 값</span></h3>
      <div id="inCum"></div>
      <p class="foot-note">OpenRouter는 여러 AI 모델을 한 창구에서 파는 중개 서비스라, 여기 숫자는 시장 전체가 아니라 그중 한 조각이에요. 오픈AI·구글·앤트로픽이 자기 API로 직접 판 양은 빠져 있고, 값싼 중국 모델 비중이 높아요. 그래도 같은 기준으로 매주 재기 때문에 수요가 늘어나는 속도를 보기에는 좋은 지표예요. 1조는 10<sup>12</sup>, 1경은 10<sup>16</sup>이에요.</p>

      <h3 class="ai-h3">빅테크 설비투자 <span class="sub">아마존, 구글, 마이크로소프트, 메타, 오라클 · 분기별 현금 지출</span></h3>
      <div class="cp-ctl"><div class="chart-legend">${CO.map(([, n, c]) => `<span><i style="background:${c}"></i>${n}</span>`).join("")}<span><i style="background:var(--ink);height:3px"></i>4분기 이동평균(합계)</span></div>
        <div class="cp-tabs">${[["3y", "3년"], ["5y", "5년"], ["all", "전체"]].map(([k, t]) => `<button class="toggle" aria-pressed="${st.crange === k}" data-cr="${k}">${t}</button>`).join("")}</div></div>
      <div id="inCap"></div>
      <p class="cp-sub">${ann ? `최근 4개 분기를 더하면 <b>${dol(ann)}</b>예요. ` : ""}데이터센터, 서버, GPU를 사는 데 쓴 돈이라 AI 칩 수요를 가장 직접 보여 줘요.</p>
      <div class="ai-tw"><table class="ai-rep cp-tbl"><thead><tr><th>회사</th><th>최근 분기</th><th class="num">설비투자</th><th class="num">1년 전 대비</th><th class="num">최근 4분기 합</th><th>공시일</th></tr></thead><tbody>${cTbl}</tbody></table></div>
      <p class="foot-note">SEC에 낸 분기·연간 보고서의 현금흐름표 '유형자산 취득' 금액이에요(아마존은 '생산 자산 취득'). 분기 보고서는 연초부터 쌓인 값이라 앞 분기를 빼서 분기 값을 구했어요. 마이크로소프트와 오라클은 회계연도가 달라서 분기 끝 날짜에 가장 가까운 달력 분기로 맞췄어요. 리스로 빌린 데이터센터는 이 금액에 들어가지 않아서 실제 투자 규모는 더 커요.</p>

      <h3 class="ai-h3">토큰 지출 추정 <span class="sub">OpenRouter 주간 · 모델별 토큰 × 정가</span></h3>
      ${sl.usd ? `<div class="ai-run"><span>${sl.week ? `${ymd(sl.week)} 주` : "최근 7일"} 추정 지출</span><b>${dol(sl.usd)}</b><em>유료 토큰 100만 개당 평균 $${sl.usd_per_m}${sl.approx ? " · 월요일 확정 전 근사값" : ""}</em></div>` : ""}
      ${sw.length > 1 ? `<div id="inSpend"></div>` : `<p class="cp-sub">지출 추정은 2026년 11월 첫 주부터 쌓기 시작했어요. 매주 월요일 09:40에 지난주 값이 한 칸씩 늘어나고, 4주가 모이면 이동평균선도 그려요.</p>`}
      <div class="ai-tw"><table class="ai-rep cp-tbl"><thead><tr><th class="num">#</th><th>모델</th><th class="num">추정 지출</th><th class="num">비중</th><th class="num">토큰</th><th class="num">100만 토큰당</th></tr></thead><tbody>${sTop}</tbody></table></div>
      <p class="foot-note">OpenRouter는 금액 합계를 공개하지 않아요. 그래서 모델마다 그 주 입력·출력·캐시 토큰에 OpenRouter 정가를 곱해 더했어요. 무료판은 0원으로 쳤고, 대량 할인이나 개인 키(BYOK) 정산 차이는 반영하지 못해서 실제 금액과는 차이가 있어요. 토큰은 값싼 모델이 많이 쓰지만, 돈은 비싼 상위 모델에 몰린다는 점을 같이 보면 좋아요.</p>

      <h3 class="ai-h3">GPU 시간당 임대료 <span class="sub">GPU 1장을 1시간 빌리는 값(달러)</span></h3>
      <div class="cp-lgs">${gBtns}</div>
      <div id="inGpu"></div>
      <p class="cp-sub">${gd.length < 7 ? `GPU 임대료는 공개된 과거 기록이 없어서 ${ymd(g0.d || "2026-11-03")}부터 매일 한 줄씩 쌓고 있어요. 7일이 모이면 이동평균(점선)도 그려요. ` : "점선은 7일 이동평균이에요. "}이름표를 누르면 선을 켜고 끌 수 있어요.</p>
      <div class="ai-tw"><table class="ai-rep cp-tbl"><thead><tr><th>GPU</th><th class="num">시장 중앙값</th><th class="num">중간 50% 범위</th><th class="num">빌릴 수 있는 수</th><th class="num">RunPod 정가</th><th class="num">RunPod 커뮤니티</th>${gd.length > 1 ? `<th class="num">기록 시작 대비</th>` : ""}</tr></thead><tbody>${gRows}</tbody></table></div>
      <p class="foot-note">시장 중앙값은 Vast.ai 공개 마켓에서 지금 빌릴 수 있는 매물의 1장당 값을 GPU 수로 가중해 가운데 값을 잡은 거예요. 개인과 소형 업체가 내놓은 매물이 많아 대형 클라우드 정가보다 싸게 나와요. 빌릴 수 있는 수가 줄면서 값이 오르면 공급이 빠듯하다는 신호예요. RunPod 정가는 회사가 공개한 정찰가라 자주 바뀌지 않지만, 바뀌면 가격 인상이 확정됐다는 뜻이에요. 참고로 공개 보도 기준 H100 1년 계약가는 2025년 10월 시간당 1.70달러에서 2026년 3월 2.35달러로 약 40% 올랐어요(SemiAnalysis).</p>
      <p class="foot-note">자료: <a href="https://openrouter.ai/rankings" target="_blank" rel="noopener">OpenRouter</a>(CC BY 4.0), <a href="https://www.sec.gov/edgar" target="_blank" rel="noopener">SEC EDGAR</a>, <a href="https://vast.ai/" target="_blank" rel="noopener">Vast.ai</a>, <a href="https://www.runpod.io/pricing" target="_blank" rel="noopener">RunPod</a>. 투자 판단의 참고 자료예요.</p>
    </section>`;
    if (tw.length) $("#inTok").innerHTML = barChart(tCats, W($("#inTok")), { line: tLine, log: st.tlog, fmt: tok, aria: "OpenRouter 주간 토큰 총량" });
    if (done.length) $("#inCum").innerHTML = cumChart(done, W($("#inCum")));
    if (cShow.length) $("#inCap").innerHTML = barChart(cCats, W($("#inCap")), { line: cShow.map((t) => c4map[t.q]), lineDash: "5 3", fmt: (v) => bn(v), aria: "빅테크 5사 분기 설비투자", sparse: true });
    if ($("#inSpend")) $("#inSpend").innerHTML = barChart(sCats, W($("#inSpend")), { line: ma(sw.map((h) => h.usd), 4), fmt: (v) => `$${Math.round(v / 1e6)}M`, aria: "OpenRouter 주간 지출 추정", H: 220 });
    if (gd.length) $("#inGpu").innerHTML = gpuChart(gd, W($("#inGpu")));
    box.querySelectorAll("[data-tlog]").forEach((el) => el.addEventListener("click", () => { st.tlog = !st.tlog; render(); }));
    box.querySelectorAll("[data-cr]").forEach((el) => el.addEventListener("click", () => { st.crange = el.dataset.cr; render(); }));
    box.querySelectorAll("[data-gpu]").forEach((el) => el.addEventListener("click", () => { const k = el.dataset.gpu; st.gpuOff.has(k) ? st.gpuOff.delete(k) : st.gpuOff.add(k); render(); }));
  }

  async function load(force) {
    if (!$("#infraBody")) return;
    if (!st.data || force) {
      if (!st.loading || force) st.loading = fetch("data/ai_infra.json?v=" + Date.now(), { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
      try { st.data = await st.loading; } catch (e) { st.loading = null; $("#infraBody").innerHTML = "<p class='ai-meta'>AI 인프라 수요 자료를 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>"; return; }
    }
    render();
  }
  const visible = () => !$("#viewAi").hidden;
  let lastW = innerWidth, rz;
  addEventListener("resize", () => { if (innerWidth === lastW) return; lastW = innerWidth; clearTimeout(rz); rz = setTimeout(() => { if (st.data && visible()) render(); }, 200); });

  const ai = window.__ai || {};
  window.__ai = {
    show: () => { ai.show && ai.show(); load(false); },
    rerender: () => { ai.rerender && ai.rerender(); if (st.data && visible()) render(); },
    reload: () => { ai.reload && ai.reload(); st.data = null; if (visible()) load(true); },
  };
  if (visible()) load(false);
})();
