/* 페어 트레이딩 탭 (2026-10-26 추가)
   데이터: docs/data/pairs.json — scripts/pairs.py 가 시장 흐름판 갱신 때 함께 만든다. 목록·해설 문구는 config/pairs.json.
   비율 = A ÷ B (오르면 A가 B보다 강함). 종가끼리의 비율만 쓴다.
   다른 탭과 코드를 섞지 않는다. 공유하는 것은 테마 색뿐이다. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const st = { data: null, loading: null, open: null, days: 130 };
  const NS = "http://www.w3.org/2000/svg";
  const md = (s) => { const [, m, d] = s.split("-"); return `${+m}/${+d}`; };
  const sgn = (v, d = 1, u = "%") => v == null ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(d)}${u}`;
  const cls = (v) => v == null ? "" : v > 0 ? "up" : v < 0 ? "down" : "";
  const tk = (t) => t.replace(/^\^KQ11$/, "코스닥").replace(/^\^KS11$/, "코스피");
  const fmtR = (v) => v == null ? "–" : v >= 100 ? v.toFixed(1) : v >= 1 ? v.toFixed(3) : v.toFixed(4);

  async function load(force) {
    if (!st.data || force) {
      if (!st.loading || force) st.loading = fetch("data/pairs.json?v=" + Date.now(), { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
      try { st.data = await st.loading; } catch (e) {
        st.loading = null;
        $("#pairsMeta").textContent = "페어 자료가 아직 없어요. 다음 자동 갱신(한국장·미국장 마감 후) 때 채워져요.";
        $("#pairsBody").innerHTML = ""; return;
      }
    }
    render();
  }

  // ---------- 해석 문장
  // 추세는 비율과 50·200일선의 순서로, 극단은 RSI·Z점수로 판단한다. 같은 규칙을 카드와 큰 차트가 함께 쓴다.
  function verdict(p) {
    const t = p.trend?.[1];
    const head = t === "up" ? `${p.a_name} 쪽이 더 강한 흐름` : t === "down" ? `${p.b_name} 쪽이 더 강한 흐름` : "뚜렷한 우위 없이 엇갈리는 중";
    const ext = [];
    if (p.rsi != null && p.rsi <= 30) ext.push(`${p.a_name} 쪽이 단기로 너무 빨리 밀림`);
    else if (p.rsi != null && p.rsi >= 70) ext.push(`${p.a_name} 쪽이 단기로 너무 빨리 앞서감`);
    if (p.z != null && Math.abs(p.z) >= 2) ext.push("평소 범위를 벗어남");
    if (p.roc_pct != null && p.roc_pct <= 5) ext.push("5개월 상대 낙폭이 과거 바닥권");
    else if (p.roc_pct != null && p.roc_pct >= 95) ext.push("5개월 상대 상승이 과거 천장권");
    return { head, ext: ext.join(" · "), tone: t || "flat" };
  }
  function readings(p) {
    const out = [];
    const t = p.trend?.[1];
    out.push(t === "up" ? `<b>추세</b> 비율이 50일선과 200일선 위에 차례로 놓여 있어요 → <b>${esc(p.a_name)}</b> 우위가 이어지는 중. 뜻: ${esc(p.up)}.`
      : t === "down" ? `<b>추세</b> 비율이 50일선과 200일선 아래에 차례로 놓여 있어요 → <b>${esc(p.b_name)}</b> 우위가 이어지는 중. 뜻: ${esc(p.down)}.`
      : `<b>추세</b> 비율이 50일선·200일선 사이에서 엇갈려요(200일선 ${p.above200 ? "위" : "아래"}). 아직 어느 쪽 우위로 굳었다고 보기 어려워요.`);
    if (p.rsi != null) out.push(p.rsi <= 30 ? `<b>RSI ${p.rsi}</b> 30 이하 · 최근 2~3주 동안 ${esc(p.a_name)} 쪽이 너무 빨리 밀렸어요. 짧은 되돌림이 자주 나오는 자리지만, 추세가 강하면 더 내려가기도 해요.`
      : p.rsi >= 70 ? `<b>RSI ${p.rsi}</b> 70 이상 · 최근 2~3주 동안 ${esc(p.a_name)} 쪽이 너무 빨리 앞서갔어요. 쉬어 가는 경우가 많지만, 추세 초입엔 더 오르기도 해요.`
      : `<b>RSI ${p.rsi}</b> 30~70 사이 · 단기 과열이나 침체는 아니에요.`);
    if (p.z != null) out.push(Math.abs(p.z) >= 2 ? `<b>Z점수 ${sgn(p.z, 2, "")}</b> 최근 60일 평균에서 표준편차 ${Math.abs(p.z).toFixed(1)}개만큼 ${p.z < 0 ? "아래" : "위"} · 평소 범위를 벗어난 드문 자리라 평균 쪽으로 되돌아올지 지켜볼 만해요.`
      : `<b>Z점수 ${sgn(p.z, 2, "")}</b> 평소 범위(±2) 안이에요.`);
    if (p.roc100 != null) {
      const yrs = p.roc_years ? `지난 ${p.roc_years}년` : "받아 둔 기간";
      out.push(p.roc_pct == null ? `<b>100일 ROC ${sgn(p.roc100)}</b> 약 5개월 전보다 비율이 이만큼 달라졌어요. 과거 자료가 2년이 안 돼 바닥권·천장권은 아직 따지지 않아요.`
        : p.roc_pct <= 5 ? `<b>100일 ROC ${sgn(p.roc100)}</b> 약 5개월 동안 ${esc(p.a_name)} 쪽이 이만큼 뒤처졌어요. ${yrs} 중 하위 <b>${Math.max(0.1, p.roc_pct).toFixed(1)}%</b> 자리라 과거 바닥선(${sgn(p.roc_lo)}) 아래예요. 예전엔 이런 자리에서 상대 약세가 끝나 가는 경우가 많았지만, 바로 반등한다는 뜻은 아니에요. ROC가 다시 바닥선 위로 올라오는지 확인하세요.`
        : p.roc_pct >= 95 ? `<b>100일 ROC ${sgn(p.roc100)}</b> 약 5개월 동안 ${esc(p.a_name)} 쪽이 이만큼 앞서갔어요. ${yrs} 중 상위 <b>${(100 - p.roc_pct).toFixed(1)}%</b> 자리라 과거 천장선(${sgn(p.roc_hi)}) 위예요. 쏠림이 강해 쉬어 갈 수 있는 자리예요.`
        : `<b>100일 ROC ${sgn(p.roc100)}</b> ${yrs} 중 ${Math.round(p.roc_pct)}% 위치 · 과거 바닥선(${sgn(p.roc_lo)})과 천장선(${sgn(p.roc_hi)}) 사이라 중기로 쏠린 자리는 아니에요.`);
    }
    if (p.pos52 != null) out.push(`<b>1년 범위</b> 최저 0% ~ 최고 100% 중 <b>${Math.round(p.pos52)}%</b> 위치 · 1년 최고 비율보다 ${Math.abs(p.dist_hi ?? 0).toFixed(1)}% 아래.`);
    return out;
  }

  // ---------- 그림
  function svg(w, h, cls) { const s = document.createElementNS(NS, "svg"); s.setAttribute("viewBox", `0 0 ${w} ${h}`); if (cls) s.setAttribute("class", cls); return s; }
  function add(p, tag, attrs, text) { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text != null) n.textContent = text; p.append(n); return n; }
  const pts = (vals, x, y) => vals.map((v, k) => v == null ? null : `${x(k).toFixed(1)},${y(v).toFixed(1)}`).filter(Boolean).join(" ");

  // 게이지: 값 위치에 점, 극단 구간은 색칠. 숫자는 위에 그대로.
  function gauge(label, text, v, min, max, zones, tone) {
    const pos = v == null ? null : Math.max(0, Math.min(100, (v - min) / (max - min) * 100));
    const z = zones.map(([a, b, c]) => `<i class="gz ${c}" style="left:${(a - min) / (max - min) * 100}%;width:${(b - a) / (max - min) * 100}%"></i>`).join("");
    return `<div class="pr-g"><div class="pr-gt"><em>${label}</em><b class="${tone || ""}">${text}</b></div><div class="pr-gb">${z}${pos == null ? "" : `<s style="left:${pos}%"></s>`}</div></div>`;
  }

  // 카드 안 작은 선: 최근 120거래일 비율 + 50일선, 오른쪽에 위·아래 방향 뜻
  function spark(p) {
    const s = p.series, n = s.dates.length, k0 = Math.max(0, n - 120), r = s.ratio.slice(k0), m = s.ma50.slice(k0);
    const W = 300, H = 66, vals = [...r, ...m].filter((v) => v != null);
    const lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.08 || hi * 0.01;
    const x = (k) => 2 + k / Math.max(1, r.length - 1) * (W - 6), y = (v) => 4 + (1 - (v - lo + pad) / (hi - lo + 2 * pad)) * (H - 8);
    const el = svg(W, H, "pr-spark");
    const area = `${x(0)},${H} ${pts(r, x, y)} ${x(r.length - 1)},${H}`;
    add(el, "polygon", { points: area, class: `pr-area ${p.trend?.[1] || "flat"}` });
    add(el, "polyline", { points: pts(m, x, y), class: "pr-ma50" });
    add(el, "polyline", { points: pts(r, x, y), class: "pr-ratio" });
    add(el, "circle", { cx: x(r.length - 1), cy: y(r.at(-1)), r: 3, class: "pr-dot" });
    return el;
  }

  // 큰 차트: 비율 + 20·50·200일선 + 52주 고저선, 아래 RSI(30·70선). 마우스·손가락을 대면 그날 값.
  function bigChart(p) {
    const s = p.series, n = s.dates.length, k0 = Math.max(0, n - st.days);
    const sl = (a) => a.slice(k0), D = sl(s.dates), R = sl(s.ratio), M20 = sl(s.ma20), M50 = sl(s.ma50), M200 = sl(s.ma200), RSI = sl(s.rsi);
    const ROC = s.roc100 ? sl(s.roc100) : null;   // 2026-11-11 전 자료엔 없다
    const narrow = innerWidth < 700, W = narrow ? 360 : 760, top = narrow ? 230 : 300, gap = 26, rsiH = narrow ? 80 : 96, rocH = ROC ? (narrow ? 80 : 96) : 0;
    const H = top + gap + rsiH + (ROC ? gap + rocH : 0) + 22, L = 6, Rp = narrow ? 52 : 62, pw = W - L - Rp;
    const vals = [...R, ...M20, ...M50, ...M200, s.hi52, s.lo52].filter((v) => v != null);
    let lo = Math.min(...vals), hi = Math.max(...vals); const pad = (hi - lo) * 0.06 || hi * 0.01; lo -= pad; hi += pad;
    const x = (k) => L + k / Math.max(1, D.length - 1) * pw, y = (v) => 8 + (1 - (v - lo) / (hi - lo)) * (top - 16);
    const ry0 = top + gap, ry = (v) => ry0 + (1 - v / 100) * rsiH;
    const el = svg(W, H, "pr-big");
    for (let i = 0; i <= 4; i++) { const v = lo + (hi - lo) * i / 4; add(el, "line", { x1: L, x2: L + pw, y1: y(v), y2: y(v), class: "pr-gl" }); add(el, "text", { x: W - Rp + 6, y: y(v) + 4, class: "pr-axis" }, fmtR(v)); }
    for (const [v, c, t] of [[s.hi52, "pr-hi", "52주 고점"], [s.lo52, "pr-lo", "52주 저점"]]) if (v != null && v >= lo && v <= hi) {
      add(el, "line", { x1: L, x2: L + pw, y1: y(v), y2: y(v), class: c }); add(el, "text", { x: L + pw - 4, y: y(v) - 4, "text-anchor": "end", class: `pr-axis ${c}-t` }, t);
    }
    // 위·아래 방향 뜻(왼쪽 위·아래 모서리)
    add(el, "text", { x: L + 4, y: 20, class: "pr-dir up" }, `↑ ${p.a_name} 강세`);
    add(el, "text", { x: L + 4, y: top - 8, class: "pr-dir down" }, `↓ ${p.b_name} 강세`);
    add(el, "polyline", { points: pts(M200, x, y), class: "pr-m200" });
    add(el, "polyline", { points: pts(M50, x, y), class: "pr-m50" });
    add(el, "polyline", { points: pts(M20, x, y), class: "pr-m20" });
    add(el, "polyline", { points: pts(R, x, y), class: "pr-ratio big" });
    add(el, "circle", { cx: x(R.length - 1), cy: y(R.at(-1)), r: 3.5, class: "pr-dot" });
    // RSI
    add(el, "rect", { x: L, y: ry(100), width: pw, height: ry(70) - ry(100), class: "pr-rsi-hot" });
    add(el, "rect", { x: L, y: ry(30), width: pw, height: ry(0) - ry(30), class: "pr-rsi-cold" });
    for (const v of [30, 50, 70]) { add(el, "line", { x1: L, x2: L + pw, y1: ry(v), y2: ry(v), class: v === 50 ? "pr-gl" : "pr-rsi-lv" }); add(el, "text", { x: W - Rp + 6, y: ry(v) + 4, class: "pr-axis" }, v); }
    add(el, "text", { x: L + 2, y: ry0 - 7, class: "pr-axis strong" }, `비율 RSI(14) ${RSI.at(-1) ?? "–"} · 70 위 과열 / 30 아래 침체`);
    add(el, "polyline", { points: pts(RSI, x, ry), class: "pr-rsi" });
    // 100일 ROC: 0선, 과거 바닥선(하위 5%)·천장선(상위 5%)
    let oy = null, bottom = ry(0);
    if (ROC) {
      const oy0 = ry(0) + gap, lv = [p.roc_lo, p.roc_hi].filter((v) => v != null);
      const ov = [...ROC, ...lv, 0].filter((v) => v != null);
      let olo = Math.min(...ov), ohi = Math.max(...ov); const op = (ohi - olo) * 0.08 || 1; olo -= op; ohi += op;
      oy = (v) => oy0 + (1 - (v - olo) / (ohi - olo)) * rocH; bottom = oy0 + rocH;
      if (p.roc_lo != null) add(el, "rect", { x: L, y: oy(p.roc_lo), width: pw, height: Math.max(0, oy(olo) - oy(p.roc_lo)), class: "pr-rsi-cold" });
      if (p.roc_hi != null) add(el, "rect", { x: L, y: oy(ohi), width: pw, height: Math.max(0, oy(p.roc_hi) - oy(ohi)), class: "pr-rsi-hot" });
      add(el, "line", { x1: L, x2: L + pw, y1: oy(0), y2: oy(0), class: "pr-gl" }); add(el, "text", { x: W - Rp + 6, y: oy(0) + 4, class: "pr-axis" }, "0%");
      for (const v of lv) { add(el, "line", { x1: L, x2: L + pw, y1: oy(v), y2: oy(v), class: "pr-rsi-lv" }); add(el, "text", { x: W - Rp + 6, y: oy(v) + 4, class: "pr-axis" }, sgn(v, 0)); }
      add(el, "text", { x: L + 2, y: oy0 - 7, class: "pr-axis strong" }, `100일 ROC ${sgn(ROC.at(-1))} · 색 구간 = 과거 하위·상위 5%`);
      add(el, "polyline", { points: pts(ROC, x, oy), class: "pr-rsi" });
    }
    // 날짜 축
    const ticks = narrow ? 3 : 6;
    for (let i = 0; i < ticks; i++) { const k = Math.round(i * (D.length - 1) / (ticks - 1)); add(el, "text", { x: x(k), y: H - 4, class: "pr-axis", "text-anchor": i === 0 ? "start" : i === ticks - 1 ? "end" : "middle" }, md(D[k])); }
    // 마우스 읽기
    const cross = add(el, "line", { y1: 4, y2: bottom, class: "pr-cross", visibility: "hidden" });
    const hit = add(el, "rect", { x: L, y: 0, width: pw, height: bottom, fill: "transparent" });
    const wrap = document.createElement("div"); wrap.className = "pr-chart";
    const tip = document.createElement("div"); tip.className = "pr-tip"; tip.hidden = true;
    const show = (e) => {
      const b = el.getBoundingClientRect(), px = (e.clientX - b.left) / b.width * W;
      const k = Math.max(0, Math.min(D.length - 1, Math.round((px - L) / pw * (D.length - 1))));
      cross.setAttribute("x1", x(k)); cross.setAttribute("x2", x(k)); cross.setAttribute("visibility", "visible");
      tip.innerHTML = `<b>${D[k]}</b><span>비율 ${fmtR(R[k])}</span><span>20일선 ${fmtR(M20[k])}</span><span>50일선 ${fmtR(M50[k])}</span><span>200일선 ${fmtR(M200[k])}</span><span>RSI ${RSI[k] ?? "–"}</span>${ROC ? `<span>100일 ROC ${sgn(ROC[k])}</span>` : ""}`;
      tip.hidden = false;
      const left = x(k) / W * b.width; tip.style.left = `${left > b.width * 0.6 ? left - tip.offsetWidth - 10 : left + 10}px`;
    };
    hit.addEventListener("pointermove", show); hit.addEventListener("pointerdown", show);
    hit.addEventListener("pointerleave", () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); });
    wrap.append(el, tip);
    return wrap;
  }

  // ---------- 카드·상세
  const chip = ([t, c]) => `<span class="pr-chip ${c}">${esc(t)}</span>`;
  function card(p) {
    const name = `${esc(tk(p.a))} / ${esc(tk(p.b))}`;
    if (!p.series) return `<div class="pr-card off"><div class="pr-h"><b>${name}</b></div><p class="pr-desc">${esc(p.desc)}</p><p class="pr-none">자료를 받지 못했어요. 다음 갱신 때 다시 시도해요.</p></div>`;
    const v = verdict(p);
    const rsiTone = p.rsi == null ? "" : p.rsi <= 30 ? "down" : p.rsi >= 70 ? "up" : "";
    const zTone = p.z == null ? "" : p.z <= -2 ? "down" : p.z >= 2 ? "up" : "";
    const gauges = gauge("RSI", p.rsi ?? "–", p.rsi, 0, 100, [[0, 30, "lo"], [70, 100, "hi"]], rsiTone)
      + gauge("Z점수", p.z == null ? "–" : sgn(p.z, 2, ""), p.z == null ? null : Math.max(-3, Math.min(3, p.z)), -3, 3, [[-3, -2, "lo"], [2, 3, "hi"]], zTone)
      + gauge("1년 범위 위치", p.pos52 == null ? "–" : Math.round(p.pos52) + "%", p.pos52, 0, 100, [[0, 10, "lo"], [90, 100, "hi"]], "")
      + gauge("100일 ROC", sgn(p.roc100), p.roc_pct, 0, 100, [[0, 5, "lo"], [95, 100, "hi"]], p.roc_pct == null ? "" : p.roc_pct <= 5 ? "down" : p.roc_pct >= 95 ? "up" : "");
    return `<button class="pr-card t-${v.tone}${st.open === p.id ? " open" : ""}" type="button" data-id="${p.id}" aria-expanded="${st.open === p.id}">
      <div class="pr-h"><b>${name}</b><span class="pr-names">${esc(p.a_name)} ÷ ${esc(p.b_name)}</span>${p.ok ? "" : '<span class="pr-chip flat">지난 값</span>'}
        <span class="pr-big20"><em>20일</em><b class="${cls(p.chg20)}">${sgn(p.chg20)}</b></span></div>
      <p class="pr-desc">${esc(p.desc)}</p>
      <p class="pr-verdict ${v.tone}">${esc(v.head)}${v.ext ? `<span> · ${esc(v.ext)}</span>` : ""}</p>
      <div class="pr-sp"><div class="pr-spwrap"></div><div class="pr-dirs"><span class="up">↑ ${esc(p.a_name)} 강세</span><span class="down">↓ ${esc(p.b_name)} 강세</span></div></div>
      <div class="pr-gauges">${gauges}</div>
      ${(p.flags || []).length ? `<div class="pr-chips">${p.flags.map(chip).join("")}</div>` : ""}
    </button>`;
  }

  function detail(p) {
    const d = document.createElement("div"); d.className = "pr-detail";
    const legs = `같은 20거래일 ${esc(tk(p.a))} <b class="ret ${cls(p.a_ret20)}">${sgn(p.a_ret20)}</b> · ${esc(tk(p.b))} <b class="ret ${cls(p.b_ret20)}">${sgn(p.b_ret20)}</b>`;
    d.innerHTML = `<div class="pr-dhead"><div><b>${esc(tk(p.a))} ÷ ${esc(tk(p.b))}</b> <span class="pr-names">${p.basis_date} 종가 · 비율 ${fmtR(p.ratio)}</span><div class="pr-legs">${legs}</div></div>
      <div class="seg small pr-days"><button data-d="130" aria-pressed="${st.days === 130}">6개월</button><button data-d="260" aria-pressed="${st.days === 260}">1년</button></div></div>
      <div class="pr-mean"><div class="up"><b>↑ 비율이 오르면</b>${esc(p.up)}</div><div class="down"><b>↓ 비율이 내리면</b>${esc(p.down)}</div></div>
      ${aboutBox(p)}
      <div class="pr-read"><b>지금 읽기</b><ul>${readings(p).map((t) => `<li>${t}</li>`).join("")}</ul></div>
      <div class="pr-legend"><span><i class="k-ratio"></i>비율</span><span><i class="k-m20"></i>20일선</span><span><i class="k-m50"></i>50일선</span><span><i class="k-m200"></i>200일선</span><span><i class="k-hl"></i>52주 고·저</span></div>`;
    d.append(bigChart(p));
    d.insertAdjacentHTML("beforeend", rocBox(p));
    d.insertAdjacentHTML("beforeend", `<p class="pr-chg">비율 변화: 5일 <b class="ret ${cls(p.chg5)}">${sgn(p.chg5)}</b> · 20일 <b class="ret ${cls(p.chg20)}">${sgn(p.chg20)}</b> · 60일 <b class="ret ${cls(p.chg60)}">${sgn(p.chg60)}</b> · 100일 <b class="ret ${cls(p.roc100)}">${sgn(p.roc100)}</b></p>`);
    $$(".pr-days button", d).forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); st.days = +b.dataset.d; render(); }));
    return d;
  }

  // ---------- 두 종목 설명 · 100일 ROC 자세히 (2026-11-11 추가)
  function aboutBox(p) {
    const T = st.data?.tickers || {};
    const one = (t, nm) => { const i = T[t]; return i ? `<div><h4>${esc(tk(t))} · ${esc(i.name)}</h4><p>${esc(i.about)}</p></div>` : ""; };
    const body = one(p.a, p.a_name) + one(p.b, p.b_name);
    return body ? `<div class="pr-ex"><b class="pr-ex-t">두 종목은 무엇인가</b><div class="pr-ab">${body}</div>
      <p class="pr-ex-n">비율 = <b>${esc(tk(p.a))} 가격 ÷ ${esc(tk(p.b))} 가격</b>이에요. 비율이 오르면 ${esc(p.a_name)}가 ${esc(p.b_name)}보다 잘 간 것이고, 내리면 못 간 것이에요. 둘 다 떨어져도 ${esc(p.a_name)}가 덜 떨어지면 비율은 올라요.</p></div>` : "";
  }

  function epTable(list, label) {
    if (!list || !list.length) return `<p class="pr-ex-n">지난 기간에 ${label}에 새로 들어간 적이 없어요.</p>`;
    const rows = list.slice().reverse().map((e) => `<tr><td>${e.date}</td><td>${sgn(e.roc)}</td><td class="ret ${cls(e.after20)}">${e.after20 == null ? "진행 중" : sgn(e.after20)}</td><td class="ret ${cls(e.after60)}">${e.after60 == null ? "진행 중" : sgn(e.after60)}</td></tr>`).join("");
    return `<div class="pr-ept-wrap"><table class="pr-ept"><thead><tr><th>${label} 진입일</th><th>그날 ROC</th><th>20거래일 뒤 비율 변화</th><th>60거래일 뒤 비율 변화</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  function epVerdict(stt, up, p) {
    if (!stt) return "아직 60거래일 뒤 결과가 나온 사례가 없어요.";
    const who = up ? p.a_name : p.b_name, rate = stt.hit / stt.n;
    const head = `60거래일 뒤 결과가 나온 <b>${stt.n}번 중 ${stt.hit}번</b> ${esc(who)} 쪽으로 되돌았고, 비율은 평균 <b class="ret ${cls(stt.avg60)}">${sgn(stt.avg60)}</b> 움직였어요.`;
    const tail = stt.n < 3 ? " 사례가 3번이 안 돼 참고만 하세요."
      : rate >= 2 / 3 ? " 이 페어에서는 이 신호가 <b>잘 맞은 편</b>이에요."
      : rate <= 1 / 3 ? " 이 페어에서는 신호가 <b>잘 맞지 않았어요</b>. 오히려 같은 방향 추세가 더 이어진 경우가 많았어요."
      : " 맞은 때와 틀린 때가 반반이라 이 신호만으로 판단하기 어려워요.";
    return head + tail;
  }
  function rocBox(p) {
    if (p.roc100 == null) return "";
    const yrs = p.roc_years ? `지난 ${p.roc_years}년` : "받아 둔 기간";
    const calc = p.roc_back != null
      ? `오늘 비율 <b>${fmtR(p.ratio)}</b>(${p.basis_date}) ÷ 100거래일 전 비율 <b>${fmtR(p.roc_back)}</b>(${p.roc_back_date}) − 1 = <b class="ret ${cls(p.roc100)}">${sgn(p.roc100, 2)}</b>`
      : `100일 ROC = ${sgn(p.roc100, 2)}`;
    const now = p.roc_pct == null ? "과거 자료가 2년이 안 돼 바닥권·천장권 판정은 아직 하지 않아요."
      : `이 값은 ${yrs} 동안 매일 계산한 100일 ROC 중 <b>${p.roc_pct.toFixed(1)}%</b>보다 높고 나머지보다 낮은 자리예요(0%에 가까울수록 ${esc(p.a_name)}가 역사적으로 가장 많이 뒤처진 상태, 100%에 가까울수록 가장 많이 앞선 상태).`;
    const fl = (p.flags || []).map((f) => f[0]);
    const on = (t) => fl.includes(t) ? ' class="on"' : "";
    const e = p.roc_ep || {};
    return `<div class="pr-ex"><b class="pr-ex-t">100일 ROC 자세히</b>
      <h4>무엇을 재나</h4>
      <p>ROC는 Rate of Change, 곧 '변화율'이에요. 여기서는 <b>비율이 100거래일(약 5개월) 전보다 몇 % 달라졌는지</b>를 재요. 비율 자체가 높고 낮은지가 아니라, 최근 5개월 동안 어느 쪽이 얼마나 더 잘했는지를 보여 줘요.</p>
      <p class="pr-calc">${calc}</p>
      <p>${sgn(p.roc100)}는 5개월 동안 ${p.roc100 < 0 ? `${esc(p.a_name)}가 ${esc(p.b_name)}보다 그만큼 덜 올랐다(또는 더 빠졌다)` : `${esc(p.a_name)}가 ${esc(p.b_name)}보다 그만큼 더 올랐다(또는 덜 빠졌다)`}는 뜻이에요.</p>
      <h4>지금 어디쯤인가</h4>
      <p>${now}</p>
      ${p.roc_lo == null ? "" : `<p>${yrs} 기준 <b>바닥선(하위 5%)은 ${sgn(p.roc_lo)}</b>, <b>천장선(상위 5%)은 ${sgn(p.roc_hi)}</b>이에요. 페어마다 출렁이는 폭이 달라서 선도 페어마다 따로 정해요. 큰 차트 맨 아래 판의 파란 구간이 바닥권, 붉은 구간이 천장권이에요.</p>`}
      <h4>신호 3가지</h4>
      <ul class="pr-sig">
        <li${on("100일 ROC 바닥권")}><b>100일 ROC 바닥권</b> ROC가 바닥선 아래예요. ${esc(p.a_name)}가 5개월 동안 역사적으로 드물 만큼 많이 뒤처졌다는 뜻이에요. 너무 많이 밀린 쪽은 되돌아오는 경우가 많지만, 처음 닿은 날이 정확한 바닥은 아니에요.</li>
        <li${on("ROC 바닥권 벗어남")}><b>ROC 바닥권 벗어남</b> 최근 10거래일 안에 바닥권에 있다가 바닥선 위로 올라왔어요. 뒤처지는 속도가 줄었다는 첫 확인이라, 바닥권 신호보다 한 걸음 늦지만 더 안전한 신호예요.</li>
        <li${on("100일 ROC 천장권")}><b>100일 ROC 천장권</b> ROC가 천장선 위예요. ${esc(p.a_name)}가 5개월 동안 역사적으로 드물 만큼 많이 앞서갔다는 뜻이에요. 쏠림이 지나쳐 쉬어 갈 수 있는 자리지만, 강한 추세 초입에서는 더 이어지기도 해요.</li>
      </ul>
      <h4>과거에 바닥권에 들어간 뒤 어떻게 됐나</h4>
      <p>${epVerdict(e.low_stat, true, p)}</p>
      ${epTable(e.low, "바닥권")}
      <h4>과거에 천장권에 들어간 뒤 어떻게 됐나</h4>
      <p>${epVerdict(e.high_stat, false, p)}</p>
      ${epTable(e.high, "천장권")}
      <h4>쓰는 법과 주의</h4>
      <p>먼저 위 사례로 <b>이 페어에서 신호가 통했는지</b> 보세요. 잘 맞은 페어라면 바닥권은 '관심 시작', 바닥권 벗어남은 '확인', 비율이 50일선을 다시 넘으면 '추세 회복'으로 단계를 나눠 보는 게 좋아요.</p>
      <p class="pr-warn">바닥선·천장선은 지금까지의 전체 자료로 정한 값이라, 과거 그 시점에는 알 수 없던 기준이에요. 사례도 몇 번뿐이라 통계라기보다 참고 기록이에요. 진입일은 바닥권에 새로 들어간 날(직전 20거래일은 밖)이고, 20·60거래일 뒤 비율 변화는 그날 종가 비율과 비교한 값이에요.</p>
    </div>`;
  }

  function openPair(id) { st.open = st.open === id ? null : id; render(); if (st.open) requestAnimationFrame(() => $(".pr-detail")?.scrollIntoView({ behavior: "smooth", block: "nearest" })); }

  function render() {
    const d = st.data; if (!d) return;
    const all = d.groups.flatMap((g) => g.pairs), basis = all.map((p) => p.basis_date).filter(Boolean).sort().at(-1);
    $("#pairsMeta").textContent = `기준 ${basis || "–"} 종가 · 갱신 ${d.updated_at} · 페어 ${all.length}개${d.errors && d.errors.length ? ` · 확인 필요 ${d.errors.length}건` : ""}`;
    const box = $("#pairsBody");
    // 오늘 눈여겨볼 페어: 신호가 있는 페어를 먼저, 극단(Z·RSI)이 큰 순
    const hot = all.filter((p) => (p.flags || []).length).sort((a, b) => Math.abs(b.z ?? 0) - Math.abs(a.z ?? 0));
    const sum = `<section class="card pr-today"><div class="card-head"><h2>오늘 눈여겨볼 페어 <span class="sub">신호가 켜진 ${hot.length}개 · 누르면 큰 차트</span></h2></div>
      ${hot.length ? `<div class="pr-hot">${hot.map((p) => `<button class="pr-hotrow t-${verdict(p).tone}" type="button" data-id="${p.id}"><b>${esc(tk(p.a))} / ${esc(tk(p.b))}</b><span class="pr-hotv">${esc(verdict(p).head)}</span><span class="pr-hotc">${p.flags.map(chip).join("")}</span></button>`).join("")}</div>`
        : `<p class="pr-none">오늘은 추세 전환·과열·침체 신호가 켜진 페어가 없어요.</p>`}</section>`;
    box.innerHTML = sum + `<details class="card pr-help"><summary>이 탭 보는 법 <span class="sub">비율 · 추세 · RSI · Z점수 · 100일 ROC · 활용 예</span></summary>
      <div class="pr-help-grid">
        <div><h3>비율 읽기</h3><p><b>비율 = A ÷ B</b>예요. 두 종목이 같이 떨어져도 A가 덜 떨어지면 비율은 올라요. 그래서 <b>시장 방향과 상관없이 누가 더 센지</b>만 보여 줘요. 차트 왼쪽 위·아래의 ↑·↓ 표시가 각각 어느 쪽 강세인지 알려 줘요.</p></div>
        <div><h3>추세 (가장 먼저 볼 것)</h3><p>비율이 <b>50일선·200일선 위</b>에 차례로 있으면 A 우위가 굳은 상태, <b>아래</b>면 B 우위예요. 비율이 <b>200일선을 뚫거나 깨는 순간</b>이 상대 흐름이 바뀌는 첫 신호로 많이 쓰여요.</p></div>
        <div><h3>RSI (단기 과열·침체)</h3><p>최근 14거래일 동안 비율이 얼마나 한쪽으로 쏠렸는지예요. <b>70 위</b>는 A가 너무 빨리 앞서간 것, <b>30 아래</b>는 너무 빨리 밀린 것이에요. 되돌림이 자주 나오지만, 강한 추세 중엔 극단이 오래가기도 해요.</p></div>
        <div><h3>Z점수 (평소 범위)</h3><p>비율이 최근 60일 평균에서 표준편차 몇 개만큼 떨어졌는지예요. 보통 <b>±2 안</b>에서 움직이고, 넘으면 드문 자리라 평균으로 돌아올지 살펴볼 만해요. 페어 트레이딩에서 진입·청산 기준으로 많이 써요.</p></div>
        <div><h3>100일 ROC (중기 바닥·천장)</h3><p>비율이 <b>100거래일(약 5개월) 전보다 몇 % 달라졌는지</b>예요. 카드 게이지의 점은 그 값이 지난 최대 10년 중 어디쯤인지 보여 줘요. <b>하위 5%</b>면 "바닥권", 다시 그 위로 올라오면 "바닥권 벗어남", <b>상위 5%</b>면 "천장권"이에요. 다만 이 신호가 잘 맞는 페어와 안 맞는 페어가 있어요. 카드를 눌러 큰 차트 아래 <b>'100일 ROC 자세히'</b>에서 그 페어의 과거 사례(바닥권에 들어간 뒤 20·60거래일 결과)를 꼭 확인하세요. 바닥권에 처음 닿은 날이 정확한 바닥은 아니어서, "벗어남"을 함께 보는 게 안전해요.</p></div>
        <div><h3>활용 예</h3><p>SMH/IGV가 200일선 아래로 내려가고 RSI가 30 아래면 → "소프트웨어 쪽으로 돈이 옮겨 가는 중인데, 단기로는 반도체가 너무 많이 밀렸다". 추세를 따를지, 되돌림을 노릴지는 <b>추세(50·200일선)를 먼저</b> 보고 정해요.</p></div>
        <div><h3>주의</h3><p class="pr-warn">상대강도를 보는 화면이지 매매 신호가 아니에요. 실제 페어 트레이딩에는 헤지 비율(얼마씩 사고팔지)과 두 가격이 다시 붙는 경향인지도 확인해야 해요. 종가끼리 나눈 선이라 캔들은 그리지 않아요.</p></div>
      </div></details>`;
    for (const g of d.groups) {
      const sec = document.createElement("section"); sec.className = "card pr-group";
      sec.innerHTML = `<div class="card-head"><h2>${esc(g.name)} <span class="sub">${g.pairs.length}개 · 카드를 누르면 큰 차트와 해설</span></h2></div><div class="pr-grid">${g.pairs.map(card).join("")}</div>`;
      $$(".pr-card[data-id]", sec).forEach((b) => {
        const p = g.pairs.find((x) => x.id === b.dataset.id);
        if (p && p.series) b.querySelector(".pr-spwrap").append(spark(p));
        b.addEventListener("click", () => openPair(p.id));
      });
      const op = g.pairs.find((x) => x.id === st.open && x.series);
      if (op) $(`.pr-card[data-id="${op.id}"]`, sec).after(detail(op));
      box.append(sec);
    }
    $$(".pr-hotrow", box).forEach((b) => b.addEventListener("click", () => { st.open = null; openPair(b.dataset.id); }));
  }

  let resizeT; addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (st.open && !$("#viewPairs").hidden) render(); }, 200); });
  window.__pairs = { show: () => load(false), reload: () => { if (!$("#viewPairs").hidden) load(true); else st.data = null; } };
})();
