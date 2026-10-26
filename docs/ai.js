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
  const TYPE = { "Annualized run rate": "런레이트", "Annual recurring revenue (ARR)": "ARR" };
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
    const all = series.flatMap((s) => s.pts);
    if (!all.length) return "<p class='none'>매출 자료가 없어요.</p>";
    const t0 = Date.parse("2024-01-01"), t1 = Math.max(...all.map((x) => Date.parse(x.date))) + 20 * 864e5;
    const ymax = Math.ceil(Math.max(...all.map((x) => x.usd)) / 1e9 / 10) * 10;
    const X = (d) => P.l + ((Date.parse(d) - t0) / (t1 - t0)) * (W - P.l - P.r);
    const Y = (v) => P.t + (1 - v / 1e9 / ymax) * (H - P.t - P.b);
    let g = "";
    for (let v = 0; v <= ymax; v += ymax <= 40 ? 10 : 20) g += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v * 1e9)}" y2="${Y(v * 1e9)}" class="ai-grid"/><text x="${P.l - 6}" y="${Y(v * 1e9) + 4}" text-anchor="end" class="ai-tk">${v ? v * 10 + "억" : "0"}</text>`;
    for (const y of [2024, 2025, 2026]) { const x = X(`${y}-01-01`); if (x >= P.l) g += `<text x="${x}" y="${H - 8}" class="ai-tk" text-anchor="middle">${y}</text><line x1="${x}" x2="${x}" y1="${P.t}" y2="${H - P.b}" class="ai-grid"/>`; }
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
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 30) ends[i].y = ends[i - 1].y + 30;
    for (const e of ends) labels += `<text x="${e.x + 8}" y="${e.y + 1}" class="ai-end" fill="${e.col}">${esc(e.t)}</text><text x="${e.x + 8}" y="${e.y + 15}" class="ai-tk">${e.d} 기준</text>`;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="ai-svg" role="img" aria-label="OpenAI·Anthropic 런레이트 추이">${g}${lines}${dots}${labels}</svg>`;
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
    const recent = Object.keys(CO).flatMap((c) => (rv.companies[c] || []).map((x) => ({ c, ...x }))).sort((a, b) => (b.date + b.report_date).localeCompare(a.date + a.report_date)).slice(0, 8);
    const repRows = recent.map((x) => `<tr><td class="tnum">${ymd(x.date)}</td><td><span class="ai-dot" style="background:${CO[x.c].c}"></span>${x.c}</td><td class="num"><b>${won(x.usd)}</b></td><td>${TYPE[x.type] || esc(x.type)}</td><td>${CONF[x.confidence] || esc(x.confidence || "–")}</td><td>${x.source ? `<a href="${esc(x.source)}" target="_blank" rel="noopener noreferrer" ${tipAttr(x.note || "")}>출처 ↗</a>` : "–"}</td></tr>`).join("");
    const others = (rv.others || []).slice(0, 8).map((x) => `<span class="ai-chip" ${tipAttr(`${x.company} · ${x.date} 기준 · ${TYPE[x.type] || x.type || "매출"}`)}>${esc(x.company)} <b>${won(x.usd)}</b><em>${ymd(x.date)}</em></span>`).join("");

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

    box.innerHTML = `
      <section class="tiles ai-tiles">${tiles}</section>
      <section class="card">
        <div class="card-head wrap"><h2>AI 연구소 매출 런레이트 <span class="sub">연환산 매출 · 보도 시점 기준 점</span></h2></div>
        <div id="aiRev"></div>
        <div class="ai-warn"><b>두 회사 숫자를 그냥 비교·합산하면 안 돼요.</b> Anthropic은 아마존 같은 클라우드 파트너를 통한 판매의 <b>총액</b>을, OpenAI는 <b>자기 몫</b>만 매출로 잡아요. 그래서 같은 장사를 해도 Anthropic 쪽 숫자가 크게 나와요. ${sumNote}</div>
        <h3 class="ai-h3">최근 보도</h3>
        <div class="ai-tw"><table class="mem-table ai-rep"><thead><tr><th>기준일</th><th>회사</th><th class="num">연환산 매출</th><th>종류</th><th>신뢰도</th><th>출처</th></tr></thead><tbody>${repRows}</tbody></table></div>
        ${others ? `<h3 class="ai-h3">다른 AI 회사 최근 매출</h3><div class="ai-chips">${others}</div>` : ""}
        <p class="foot-note">자료: <a href="https://epoch.ai/data/ai-companies" target="_blank" rel="noopener">Epoch AI, ‘Data on AI companies’</a>(CC BY 4.0). 언론 보도·회사 발표를 모은 표라 <b>새 보도가 날 때만</b> 점이 늘어요(최근엔 2~4주에 한 번). 점에 손가락·마우스를 대면 원문 요약이 보여요. 런레이트 = 최근 한 달 매출 × 12, ARR = 반복 매출 연환산.</p>
      </section>
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
    bindTip(box);
  }

  let rz, lastW = innerWidth;
  addEventListener("resize", () => { if (innerWidth === lastW) return; lastW = innerWidth; clearTimeout(rz); rz = setTimeout(() => { if (st.data && !$("#viewAi").hidden) render(); }, 200); });
  window.__ai = { show: () => load(false), rerender: () => { if (st.data && !$("#viewAi").hidden) render(); }, reload: () => { st.data = null; if (!$("#viewAi").hidden) load(true); } };
})();
