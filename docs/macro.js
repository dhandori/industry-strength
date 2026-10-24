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

  const num = (v, unit) => v == null ? "–" : unit === "x" ? v.toFixed(2)
    : Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : (+v.toFixed(1)).toLocaleString();

  function ma(vals, n) {
    const out = []; let s = 0;
    vals.forEach((v, i) => { s += v; if (i >= n) s -= vals[i - n]; out.push(i >= n - 1 ? s / n : null); });
    return out;
  }

  // 최근 약 1년 선 그래프 — 가로축(달)·세로축(값)·20일/60일 이동평균
  function chart(r) {
    const s = r.series || [];
    if (s.length < 15) return "";
    const small = innerWidth < 640, W = small ? 360 : 600, H = small ? 190 : 200, L = small ? 42 : 48, R = 10, T = 10, B = 26;
    const step = small ? 3 : 2;   // 좁은 화면은 가로축 글자를 3개월 간격으로
    const ds = s.map((p) => p[0]), vs = s.map((p) => p[1]);
    const m20 = ma(vs, 20), m60 = ma(vs, 60);
    const all = vs.concat(m20.filter((v) => v != null), m60.filter((v) => v != null));
    let lo = Math.min(...all), hi = Math.max(...all);
    const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.05 || 1; lo -= pad; hi += pad;
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
    return `<div class="mx-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(r.name)} 최근 1년 추이">${g}${rf}
      <line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="var(--muted)"/><line x1="${L}" x2="${L}" y1="${T}" y2="${H - B}" stroke="var(--muted)"/>${xt}
      <path d="${path(m60)}" fill="none" stroke="var(--ma50)" stroke-width="1.6" stroke-dasharray="5 3"/>
      <path d="${path(m20)}" fill="none" stroke="var(--ma20)" stroke-width="1.6" stroke-dasharray="4 3"/>
      <path d="${path(vs)}" fill="none" stroke="var(--price)" stroke-width="1.8" stroke-linejoin="round"/>
      <circle cx="${x(s.length - 1)}" cy="${y(vs[vs.length - 1])}" r="4.5" fill="${col(r.level)}" stroke="var(--surface)" stroke-width="2"/></svg>
      <div class="chart-legend"><span><i style="background:var(--price)"></i>값</span><span><i style="background:var(--ma20)"></i>20일 평균(약 1개월)</span><span><i style="background:var(--ma50)"></i>60일 평균(약 3개월)</span></div></div>`;
  }

  function chg(r) {
    if (r.change1m == null) return "";
    const worse = r.risk === "high" ? r.change1m > 0 : r.risk === "low" || r.risk === "fng" ? r.change1m < 0 : (r.speedZ ?? 0) > 0;
    const c = Math.abs(r.change1m) < 1e-9 ? "flat" : worse ? "worse" : "better";
    return `<span class="mx-chg ${c}"><small>1개월</small>${esc(r.changeText)}</span>`;
  }

  function pos(r) {
    if (r.riskPct == null) return "";
    const p = Math.max(0, Math.min(100, r.riskPct));
    const what = r.risk === "both" ? "5년 중간값에서 떨어진 정도" : "최근 5년 중 위험한 쪽 위치";
    return `<div class="mx-pos"><div class="mx-pos-l"><span>${what}</span><span><b>${p.toFixed(0)}%</b>${r.speedBump ? ` · 빠른 악화 +${r.speedBump}단계` : ""}</span></div>
      <div class="mx-track"><div class="mx-mark" style="left:${p}%"></div></div>
      <div class="mx-ticks"><span style="left:50%">50</span><span style="left:75%">75</span><span style="left:90%">90</span><span style="left:97%">97</span></div></div>`;
  }

  function fng(r) {
    const c = r.compare || {}, p = Math.max(0, Math.min(100, r.value));
    const cell = (k, t) => `<div><b>${c[k] ?? "–"}</b><span>${t}</span></div>`;
    return `<div class="mx-pos"><div class="mx-track fg"><div class="mx-mark" style="left:${p}%"></div></div>
      <div class="mx-ticks"><span style="left:10%">10</span><span style="left:25%">25</span><span style="left:40%">40</span><span style="left:55%">55</span><span style="left:75%">75</span></div></div>
      <div class="mx-cmp"><div><b>${r.value}</b><span>오늘</span></div>${cell("prev", "전일")}${cell("week_ago", "1주 전")}${cell("month_ago", "1개월 전")}${cell("year_ago", "1년 전")}</div>
      ${r.crossCheck != null ? `<div class="mx-foot">교차 확인(finhacker.cz) ${r.crossCheck}${r.crossCheck === r.value ? " · 일치" : " · 차이 있음"}</div>` : ""}
      ${(r.series || []).length >= 15 ? chart(r) : `<div class="mx-foot">추이 그래프는 매일 값이 쌓이면(약 3주 뒤) 나타나요.</div>`}`;
  }

  function card(r) {
    const c = col(r.level);
    const head = `<div class="mx-head"><div class="mx-name">${esc(r.name)}</div><span class="mx-chip" style="--c:${c}">${r.emoji} ${esc(r.label)}${r.overheat ? " · ⚠️과열" : ""}</span></div>`;
    if (!r.level) return `<article class="card mx-card" style="--c:${c}">${head}<div class="mx-empty">오늘은 자료를 받지 못했어요.</div><div class="mx-why">${esc(r.help)}</div></article>`;
    const unit = r.unit && !["bp", "x", "점"].includes(r.unit) ? `<span class="u">${esc(r.unit)}</span>` : "";
    const zone = r.zone ? `<span class="mx-chip" style="--c:${c}">${esc(r.zone)}</span>` : "";
    return `<article class="card mx-card" style="--c:${c}">${head}
      <div class="mx-val"><b>${esc(r.valueText)}</b>${unit}${zone}${chg(r)}</div>
      ${r.key === "fng" ? fng(r) : pos(r) + chart(r)}
      <div class="mx-why">${esc(r.help)}</div>
      <div class="mx-foot">기준일 ${esc(r.date || "–")}${r.stale ? " · <b>오늘 새 자료를 못 받아 이전 값을 보여 드려요</b>" : ""}</div></article>`;
  }

  function sentence(d) {
    const rows = d.indicators.filter((r) => r.level);
    const bad = rows.filter((r) => r.level <= 2), fast = rows.filter((r) => r.speedBump > 0);
    const out = [bad.length ? `${rows.length}개 지표 중 ${bad.length}개가 경계 이상이에요.` : `${rows.length}개 지표 모두 경계 아래예요.`];
    if (fast.length) out.push(`${fast.map((r) => r.name).join(", ")}은(는) 최근 1개월 사이 평소보다 빠르게 나빠졌어요.`);
    const f = rows.find((r) => r.key === "fng");
    if (f) out.push(`투자 심리는 ${f.zone}(${f.value})이에요.`);
    return out.join(" ");
  }

  function render() {
    const d = st.data, c = d.composite, t = new Date(d.asOf);
    $("#mxMeta").textContent = `갱신 ${t.getMonth() + 1}월 ${t.getDate()}일 ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")} KST · 지표 ${c.available}/${c.total} · 매일 아침 07시대 자동 갱신`;
    const steps = [1, 2, 3, 4, 5].map((lv) => `<div class="mx-step ${lv === c.level ? "on" : ""}" style="--c:${col(lv)}"><div class="n">${c.counts[lv] ?? 0}</div><div class="t">${LV[lv][0]} ${lv} ${LV[lv][1]}</div><div class="mx-bar" style="opacity:${(c.counts[lv] ?? 0) ? .9 : .15}"></div></div>`).join("");
    const alarms = d.indicators.filter((r) => r.level && r.level <= 2).map((r) => `<span class="mx-chip" style="--c:${col(r.level)}">${r.emoji} ${esc(r.name)}</span>`).join("");
    let h = `<section class="mx-hero">
      <div class="card mx-verdict" style="--c:${col(c.level)}"><div class="k">오늘의 종합 위험 단계</div>
        <div class="big"><b>${c.level ?? "–"}</b><span>단계 · ${esc(c.label)} ${c.emoji}</span></div><p>${esc(sentence(d))}</p></div>
      <div class="card"><div class="mx-ladder">${steps}</div>${alarms ? `<div class="mx-alarms">${alarms}</div>` : ""}
        <p class="foot-note">숫자는 단계별 지표 개수예요. 1단계(위기)에 가까울수록 위험해요. 단계는 최근 5년 중 위치와 1개월 변화 속도를 함께 보고 정해요.</p></div></section>`;
    const groups = [["한국", ["한국 신용", "한국 금리"]], ["미국", ["미국 신용", "미국 금리", "미국 유동성"]], ["변동성", ["변동성"]], ["투자 심리", ["심리"]]];
    groups.forEach(([title, names]) => {
      const rows = d.indicators.filter((r) => names.includes(r.group));
      if (!rows.length) return;
      const worst = Math.min(6, ...rows.filter((r) => r.level).map((r) => r.level));
      h += `<div class="mx-group-h"><h2>${title}</h2><span class="sub">${rows.length}개 지표${worst <= 5 ? ` · 가장 나쁜 단계 ${LV[worst][0]} ${LV[worst][1]}` : ""}</span></div><div class="mx-grid">${rows.map(card).join("")}</div>`;
    });
    $("#mxBody").innerHTML = h;
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
